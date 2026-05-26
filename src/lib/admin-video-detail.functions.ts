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

export type AiJobType = "categorise" | "tag_primary" | "tag_secondary" | "tag_rest";

// ============ getVideoDetail ============
const VideoIdInput = z.object({ video_id: z.string().uuid() });

export const getVideoDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");

    const { data: video, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, description, thumbnail_url, duration_seconds, published_at, status, submission_count, suggest_count, app_like_count, app_dislike_count, app_watch_count, curator_note, content_warnings, primary_tag_ids, ai_categorised_at, ai_tagged_at, ai_categorisation_model, ai_tagging_model, ai_confidence_avg, ai_review_status, creator:creators(id, title, handle, thumbnail_url)",
      )
      .eq("id", data.video_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!video) throw new Error("Video not found");

    const [{ data: vcs }, { data: vts }] = await Promise.all([
      supabaseAdmin
        .from("video_categories")
        .select("category:categories(id, slug, name, depth, parent_id)")
        .eq("video_id", data.video_id),
      supabaseAdmin
        .from("video_tags")
        .select("rank, tag:tags(id, slug, name, is_platform_tag, tier)")
        .eq("video_id", data.video_id)
        .order("rank", { ascending: true }),
    ]);

    type CategoryRow = { id: string; slug: string; name: string; depth: number; parent_id: string | null };
    type TagRow = { id: string; slug: string; name: string; is_platform_tag: boolean; tier: string };
    const categories: CategoryRow[] = (vcs ?? [])
      .map((r) => (r as { category: CategoryRow | null }).category)
      .filter((c): c is CategoryRow => !!c);
    const tags = (vts ?? []).map((r) => {
      const row = r as { rank: number; tag: TagRow | null };
      return { rank: row.rank, tag: row.tag };
    });

    return { video, categories, tags };
  });

// ============ getAiResultsForVideo ============
export const getAiResultsForVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { data: results, error } = await supabaseAdmin
      .from("ai_job_results")
      .select(
        "id, job_id, result_type, entity_id, entity_name, confidence, was_accepted, accepted_by, accepted_at, rejection_reason, run_version, entity_deleted, created_at, job:ai_jobs(scope, status, model_used, created_at)",
      )
      .eq("video_id", data.video_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: activeJobs } = await supabaseAdmin
      .from("ai_jobs")
      .select("id, job_type, scope, status, started_at, created_at, priority, error_text")
      .eq("video_id", data.video_id)
      .in("status", ["pending", "claimed", "running"] as never)
      .order("created_at", { ascending: false });

    return { results: results ?? [], activeJobs: activeJobs ?? [] };
  });

// ============ dispatchAdminSingleAiJob ============
const DispatchInput = z.object({
  video_id: z.string().uuid(),
  job_type: z.enum(["categorise", "tag_primary", "tag_secondary", "tag_rest"]),
});

export const dispatchAdminSingleAiJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DispatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");

    // Prevent duplicate active jobs of same type for the same video.
    const { data: existing } = await supabaseAdmin
      .from("ai_jobs")
      .select("id")
      .eq("video_id", data.video_id)
      .eq("job_type", data.job_type as never)
      .in("status", ["pending", "claimed", "running"] as never)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: true, job_id: existing[0].id, deduped: true };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("ai_jobs")
      .insert({
        job_type: data.job_type as never,
        scope: "admin_single" as never,
        video_id: data.video_id,
        status: "pending" as never,
        priority: 3,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Failed to dispatch: ${error?.message}`);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "ai.job_dispatched",
      targetType: "video",
      targetId: data.video_id,
      after: { job_id: inserted.id, job_type: data.job_type, scope: "admin_single" },
      visibility: "staff",
    });

    return { ok: true, job_id: inserted.id, deduped: false };
  });

// ============ acceptAiResult / rejectAiResult ============
const ResultIdInput = z.object({ result_id: z.string().uuid() });
const RejectInput = z.object({
  result_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const acceptAiResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResultIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");

    const { data: r, error } = await supabaseAdmin
      .from("ai_job_results")
      .select("id, video_id, result_type, entity_id")
      .eq("id", data.result_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Result not found");

    // Apply to the video.
    if (r.result_type === "categorise") {
      // Respect 5-cap (trigger will enforce); ignore conflict.
      await supabaseAdmin
        .from("video_categories")
        .upsert(
          { video_id: r.video_id, category_id: r.entity_id, assigned_by: context.userId },
          { onConflict: "video_id,category_id" },
        );
    } else {
      // tag_* → video_tags
      const rank = r.result_type === "tag_primary" ? 1 : 100;
      await supabaseAdmin
        .from("video_tags")
        .upsert(
          { video_id: r.video_id, tag_id: r.entity_id, rank, assigned_by: "ai" as never },
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

export const rejectAiResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RejectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");

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
