// Phase 6 — Submit-sheet auto AI + moderation queue AI re-runs and review.
// All functions gated by either `submission.approve` or `library.manage`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "../audit.server";
import { tick as runOrchestratorTick } from "./orchestrator.server";

async function kickOrchestrator(): Promise<void> {
  try {
    await runOrchestratorTick();
  } catch (e) {
    console.error("[kickOrchestrator]", e instanceof Error ? e.message : e);
  }
}


async function requireAnyPerm(userId: string, keys: string[]) {
  for (const k of keys) {
    const { data } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: k,
    });
    if (data) return;
  }
  throw new Error(`Missing one of permissions: ${keys.join(", ")}`);
}

const USER_SUBMIT_TASKS = ["categorise", "tag_primary", "tag_secondary"] as const;

// ============ dispatchUserSubmitAi ============
// Called by the submit sheet right after submitVideos returns. Creates
// `user_submit` jobs (categorise + primary/secondary tags) for any video the
// submitter just queued. Respects `ai_user_submit_auto` app_setting; never
// throws — failures are logged silently to keep the submit UX unblocked.
const DispatchUserInput = z.object({
  video_ids: z.array(z.string().uuid()).min(1).max(20),
});

export const dispatchUserSubmitAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DispatchUserInput.parse(d))
  .handler(async ({ data, context }) => {
    // Hot-load the toggle each call.
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_user_submit_auto")
      .maybeSingle();
    const enabled =
      setting?.value === true ||
      (setting?.value as { enabled?: boolean } | null)?.enabled === true;
    if (!enabled) return { ok: true, dispatched: 0, skipped: "disabled" };

    // Dedup against any pending/running user_submit job for the same
    // (video, task) so refreshes don't pile up.
    const { data: existing } = await supabaseAdmin
      .from("ai_jobs")
      .select("video_id, job_type")
      .in("video_id", data.video_ids)
      .eq("scope", "user_submit" as never)
      .in("status", ["pending", "claimed", "running"] as never);
    const blocked = new Set(
      (existing ?? []).map(
        (r) => `${r.video_id as string}:${r.job_type as string}`,
      ),
    );

    const rows: Array<Record<string, unknown>> = [];
    for (const vid of data.video_ids) {
      for (const t of USER_SUBMIT_TASKS) {
        if (blocked.has(`${vid}:${t}`)) continue;
        rows.push({
          job_type: t,
          scope: "user_submit",
          video_id: vid,
          status: "pending",
          priority: 4,
          created_by: context.userId,
        });
      }
    }
    if (rows.length === 0) return { ok: true, dispatched: 0 };

    const { error } = await supabaseAdmin.from("ai_jobs").insert(rows as never);
    if (error) {
      // Don't surface to the submitter — log only.
      console.error("[dispatchUserSubmitAi] insert error", error.message);
      return { ok: false, dispatched: 0 };
    }
    return { ok: true, dispatched: rows.length };
  });

// ============ getAiResultsForModeration ============
// Lighter-weight version of admin getAiResultsForVideo for moderators.
const VideoIdInput = z.object({ video_id: z.string().uuid() });

export const getAiResultsForModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, ["submission.approve", "library.manage"]);

    const { data: results, error } = await supabaseAdmin
      .from("ai_job_results")
      .select(
        "id, result_type, entity_id, entity_name, confidence, was_accepted, accepted_at, run_version, entity_deleted, created_at",
      )
      .eq("video_id", data.video_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: activeJobs } = await supabaseAdmin
      .from("ai_jobs")
      .select("id, job_type, scope, status, started_at, created_at")
      .eq("video_id", data.video_id)
      .in("status", ["pending", "claimed", "running"] as never);

    const { data: v } = await supabaseAdmin
      .from("videos")
      .select("ai_categorised_at, ai_tagged_at, ai_review_status, ai_confidence_avg")
      .eq("id", data.video_id)
      .maybeSingle();

    const { data: staleSetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_stale_threshold_days")
      .maybeSingle();
    const staleDays =
      typeof staleSetting?.value === "number"
        ? (staleSetting.value as number)
        : 365;

    return {
      results: results ?? [],
      activeJobs: activeJobs ?? [],
      ai_meta: v
        ? {
            categorised_at: (v.ai_categorised_at as string | null) ?? null,
            tagged_at: (v.ai_tagged_at as string | null) ?? null,
            review_status: (v.ai_review_status as string | null) ?? null,
            confidence_avg: (v.ai_confidence_avg as number | null) ?? null,
            stale_threshold_days: staleDays,
          }
        : null,
    };
  });

// ============ acceptAiResultMod / rejectAiResultMod ============
const ResultIdInput = z.object({ result_id: z.string().uuid() });
const RejectInput = z.object({
  result_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const acceptAiResultMod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResultIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, ["submission.approve", "library.manage"]);

    const { data: r, error } = await supabaseAdmin
      .from("ai_job_results")
      .select("id, video_id, result_type, entity_id")
      .eq("id", data.result_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Result not found");

    if (r.result_type === "categorise") {
      await supabaseAdmin
        .from("video_categories")
        .upsert(
          {
            video_id: r.video_id,
            category_id: r.entity_id,
            assigned_by: context.userId,
          },
          { onConflict: "video_id,category_id" },
        );
    } else {
      const rank = r.result_type === "tag_primary" ? 1 : 100;
      await supabaseAdmin
        .from("video_tags")
        .upsert(
          {
            video_id: r.video_id,
            tag_id: r.entity_id,
            rank,
            assigned_by: "ai" as never,
          },
          { onConflict: "video_id,tag_id" },
        );
    }

    await supabaseAdmin
      .from("ai_job_results")
      .update({
        was_accepted: true,
        accepted_by: context.userId,
        accepted_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", data.result_id);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.result_accepted",
      targetType: "ai_job_result",
      targetId: data.result_id,
      visibility: "staff",
    });
    return { ok: true };
  });

export const rejectAiResultMod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RejectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, ["submission.approve", "library.manage"]);

    await supabaseAdmin
      .from("ai_job_results")
      .update({
        was_accepted: false,
        accepted_by: context.userId,
        accepted_at: new Date().toISOString(),
        rejection_reason: data.reason ?? null,
      })
      .eq("id", data.result_id);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.result_rejected",
      targetType: "ai_job_result",
      targetId: data.result_id,
      after: { reason: data.reason ?? null },
      visibility: "staff",
    });
    return { ok: true };
  });

// ============ rerunVideoAi ============
// Soft-deletes prior results for the video, bumps run_version on the next
// batch, and creates fresh admin_queue jobs at priority 7.
const RerunInput = z.object({
  video_id: z.string().uuid(),
  task_types: z
    .array(z.enum(["categorise", "tag_primary", "tag_secondary", "tag_rest"]))
    .min(1)
    .default(["categorise", "tag_primary", "tag_secondary"] as const),
});

export const rerunVideoAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RerunInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, ["submission.approve", "library.manage"]);

    // Soft-delete previous results so the UI only shows the new run.
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("ai_job_results")
      .update({ deleted_at: nowIso })
      .eq("video_id", data.video_id)
      .is("deleted_at", null);

    // Find current max run_version for this video and bump.
    const { data: prev } = await supabaseAdmin
      .from("ai_job_results")
      .select("run_version")
      .eq("video_id", data.video_id)
      .order("run_version", { ascending: false })
      .limit(1);
    const nextVersion = ((prev?.[0]?.run_version as number | undefined) ?? 0) + 1;

    // Skip if active jobs of same type already pending.
    const { data: existing } = await supabaseAdmin
      .from("ai_jobs")
      .select("job_type")
      .eq("video_id", data.video_id)
      .in("status", ["pending", "claimed", "running"] as never);
    const blocked = new Set((existing ?? []).map((r) => r.job_type as string));

    const rows: Array<Record<string, unknown>> = [];
    for (const t of data.task_types) {
      if (blocked.has(t)) continue;
      rows.push({
        job_type: t,
        scope: "admin_queue",
        video_id: data.video_id,
        status: "pending",
        priority: 7,
        created_by: context.userId,
      });
    }
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("ai_jobs")
        .insert(rows as never);
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.rerun_requested",
      targetType: "video",
      targetId: data.video_id,
      after: {
        tasks: data.task_types,
        run_version: nextVersion,
        jobs_created: rows.length,
      },
      visibility: "staff",
    });

    return {
      ok: true,
      jobs_created: rows.length,
      run_version: nextVersion,
    };
  });
