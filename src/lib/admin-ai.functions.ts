import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

async function requirePerm(userId: string, key: string) {
  const { data } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: key,
  });
  if (!data) throw new Error(`Missing permission: ${key}`);
}

const TASK_TYPES = [
  "categorise",
  "tag_primary",
  "tag_secondary",
  "tag_rest",
] as const;

// ============ dispatchBatchAiJobs ============
const DispatchBatchInput = z.object({
  video_ids: z.array(z.string().uuid()).min(1).max(2000),
  task_types: z.array(z.enum(TASK_TYPES)).min(1),
  max_categories: z.number().int().min(1).max(30).optional(),
  min_secondary_tags: z.number().int().min(0).max(200).optional(),
  max_duration_s: z.number().int().min(30).max(7200).optional(),
});

export const dispatchBatchAiJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DispatchBatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");

    // Load batch cap
    const { data: cap } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_max_batch_size")
      .maybeSingle();
    const maxBatch =
      typeof cap?.value === "number" ? (cap.value as number) : 500;

    const totalPlanned = data.video_ids.length * data.task_types.length;
    let warning: string | null = null;
    let allowedVideos = data.video_ids;
    if (totalPlanned > maxBatch) {
      const maxVideos = Math.max(
        1,
        Math.floor(maxBatch / data.task_types.length),
      );
      allowedVideos = data.video_ids.slice(0, maxVideos);
      warning = `Batch capped at ${maxBatch} jobs (${allowedVideos.length} of ${data.video_ids.length} videos queued).`;
    }

    // Create batch_id by inserting first row then reusing.
    const batchId = crypto.randomUUID();
    const rows: Array<Record<string, unknown>> = [];
    for (const vid of allowedVideos) {
      for (const t of data.task_types) {
        rows.push({
          job_type: t,
          scope: "admin_batch",
          video_id: vid,
          batch_id: batchId,
          status: "pending",
          priority: 5,
          max_duration_s: data.max_duration_s ?? null,
          max_results:
            t === "categorise"
              ? data.max_categories ?? null
              : t === "tag_secondary"
                ? data.min_secondary_tags ?? null
                : null,
          created_by: context.userId,
        });
      }
    }

    const { error } = await supabaseAdmin.from("ai_jobs").insert(rows as never);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.batch_dispatched",
      targetType: "ai_batch",
      targetId: batchId,
      after: {
        batch_id: batchId,
        videos: allowedVideos.length,
        tasks: data.task_types,
        job_count: rows.length,
      },
      visibility: "staff",
    });

    return {
      ok: true,
      batch_id: batchId,
      jobs_created: rows.length,
      warning,
    };
  });

// ============ listAiSessions ============
export const listAiSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "library.manage");
    const { data, error } = await supabaseAdmin
      .from("ai_agent_sessions")
      .select(
        "id, model, scope, agent_index, total_jobs_completed, total_prompt_tokens, total_completion_tokens, session_started_at, last_heartbeat, current_job_id",
      )
      .is("session_ended_at", null)
      .order("session_started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    // Resolve current job titles
    const jobIds = (data ?? [])
      .map((s) => s.current_job_id)
      .filter((x): x is string => !!x);
    const jobTitleById = new Map<string, string>();
    if (jobIds.length > 0) {
      const { data: jobs } = await supabaseAdmin
        .from("ai_jobs")
        .select("id, video_id")
        .in("id", jobIds);
      const vids = (jobs ?? [])
        .map((j) => j.video_id as string)
        .filter(Boolean);
      const titleByVid = new Map<string, string>();
      if (vids.length > 0) {
        const { data: vrows } = await supabaseAdmin
          .from("videos")
          .select("id, title")
          .in("id", vids);
        for (const v of vrows ?? []) titleByVid.set(v.id, v.title);
      }
      for (const j of jobs ?? []) {
        const t = titleByVid.get(j.video_id as string);
        if (t) jobTitleById.set(j.id, t);
      }
    }

    return {
      sessions: (data ?? []).map((s) => ({
        ...s,
        current_job_title: s.current_job_id
          ? (jobTitleById.get(s.current_job_id) ?? null)
          : null,
      })),
    };
  });

// ============ listAiBatches ============
export const listAiBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "library.manage");

    // Pull all jobs from batches active in last 7 days (or any non-terminal).
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: jobs, error } = await supabaseAdmin
      .from("ai_jobs")
      .select(
        "id, batch_id, scope, job_type, status, created_at, started_at, completed_at, created_by, max_duration_s",
      )
      .not("batch_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    type BatchAgg = {
      batch_id: string;
      scope: string;
      created_by: string | null;
      first_created_at: string;
      last_activity_at: string;
      task_types: Set<string>;
      counts: Record<string, number>;
      total: number;
      max_duration_s: number | null;
    };
    const map = new Map<string, BatchAgg>();
    for (const j of jobs ?? []) {
      const bid = j.batch_id as string;
      let agg = map.get(bid);
      if (!agg) {
        agg = {
          batch_id: bid,
          scope: j.scope as string,
          created_by: j.created_by as string | null,
          first_created_at: j.created_at as string,
          last_activity_at: (j.completed_at ?? j.started_at ?? j.created_at) as string,
          task_types: new Set(),
          counts: {
            pending: 0,
            claimed: 0,
            running: 0,
            paused: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
          total: 0,
          max_duration_s: (j.max_duration_s as number | null) ?? null,
        };
        map.set(bid, agg);
      }
      agg.task_types.add(j.job_type as string);
      agg.counts[j.status as string] =
        (agg.counts[j.status as string] ?? 0) + 1;
      agg.total += 1;
      const stamp = (j.completed_at ?? j.started_at ?? j.created_at) as string;
      if (stamp > agg.last_activity_at) agg.last_activity_at = stamp;
      if ((j.created_at as string) < agg.first_created_at)
        agg.first_created_at = j.created_at as string;
    }

    // Confidence averages from ai_job_results joined by job ids.
    const batchIds = Array.from(map.keys());
    const avgConfByBatch = new Map<string, { sum: number; n: number }>();
    if (batchIds.length > 0) {
      const { data: results } = await supabaseAdmin
        .from("ai_job_results")
        .select("confidence, job:ai_jobs!inner(batch_id)")
        .in("job.batch_id", batchIds as never);
      for (const r of results ?? []) {
        const bid = (r as { job: { batch_id: string } }).job?.batch_id;
        if (!bid) continue;
        const a = avgConfByBatch.get(bid) ?? { sum: 0, n: 0 };
        a.sum += (r.confidence as number) ?? 0;
        a.n += 1;
        avgConfByBatch.set(bid, a);
      }
    }

    const batches = Array.from(map.values()).map((b) => {
      const done = b.counts.completed + b.counts.failed + b.counts.cancelled;
      const successPct =
        done > 0 ? Math.round((b.counts.completed / done) * 100) : 0;
      const c = avgConfByBatch.get(b.batch_id);
      const avgConf = c && c.n > 0 ? c.sum / c.n : null;
      return {
        batch_id: b.batch_id,
        scope: b.scope,
        created_by: b.created_by,
        task_types: Array.from(b.task_types),
        counts: b.counts,
        total: b.total,
        success_pct: successPct,
        avg_confidence: avgConf,
        first_created_at: b.first_created_at,
        last_activity_at: b.last_activity_at,
      };
    });
    batches.sort((a, b) =>
      a.last_activity_at < b.last_activity_at ? 1 : -1,
    );
    return { batches };
  });

// ============ pause/resume/cancel batch ============
const BatchIdInput = z.object({ batch_id: z.string().uuid() });

export const pauseAiBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin
      .from("ai_jobs")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("batch_id", data.batch_id)
      .in("status", ["pending", "claimed", "running"] as never);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.batch_paused",
      targetType: "ai_batch",
      targetId: data.batch_id,
      visibility: "staff",
    });
    return { ok: true };
  });

export const resumeAiBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin
      .from("ai_jobs")
      .update({ status: "pending", resumed_at: new Date().toISOString() })
      .eq("batch_id", data.batch_id)
      .eq("status", "paused" as never);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.batch_resumed",
      targetType: "ai_batch",
      targetId: data.batch_id,
      visibility: "staff",
    });
    return { ok: true };
  });

export const cancelAiBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin
      .from("ai_jobs")
      .update({
        status: "cancelled",
        failed_at: new Date().toISOString(),
      })
      .eq("batch_id", data.batch_id)
      .in("status", ["pending", "claimed", "running", "paused"] as never);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.batch_cancelled",
      targetType: "ai_batch",
      targetId: data.batch_id,
      visibility: "staff",
    });
    return { ok: true };
  });
