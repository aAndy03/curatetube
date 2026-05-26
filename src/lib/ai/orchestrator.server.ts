// Server-only: AI job orchestrator (dispatch + run + sweep).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCurrentSnapshot, type TaxonomySnapshot } from "./taxonomy-snapshot.server";
import type { AiJobType, VideoContext } from "./prompt.server";
import { callGateway } from "./gateway.server";

type AiSettings = {
  maxParallel: number;
  userSubmitModel: string;
  adminModel: string;
  batchModel: string;
  fallbackOrder: string[];
  maxCategories: number;
  minSecondary: number;
  sessionMaxJobs: number;
  heartbeatTimeoutS: number;
  userSubmitAuto: boolean;
};

const DEFAULTS: AiSettings = {
  maxParallel: 2,
  userSubmitModel: "google/gemini-2.5-flash-lite",
  adminModel: "openai/gpt-5-mini",
  batchModel: "google/gemini-2.5-flash",
  fallbackOrder: ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash", "openai/gpt-5-nano"],
  maxCategories: 30,
  minSecondary: 50,
  sessionMaxJobs: 20,
  heartbeatTimeoutS: 90,
  userSubmitAuto: true,
};

export async function loadAiSettings(): Promise<AiSettings> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .like("key", "ai_%");
  const map = new Map<string, unknown>((data ?? []).map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => {
    const v = map.get(k);
    return typeof v === "number" ? v : d;
  };
  const str = (k: string, d: string) => {
    const v = map.get(k);
    return typeof v === "string" ? v : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = map.get(k);
    return typeof v === "boolean" ? v : d;
  };
  const arr = (k: string, d: string[]) => {
    const v = map.get(k);
    return Array.isArray(v) ? (v as string[]) : d;
  };
  return {
    maxParallel: num("ai_max_parallel_agents", DEFAULTS.maxParallel),
    userSubmitModel: str("ai_user_submit_model", DEFAULTS.userSubmitModel),
    adminModel: str("ai_admin_model", DEFAULTS.adminModel),
    batchModel: str("ai_batch_model", DEFAULTS.batchModel),
    fallbackOrder: arr("ai_fallback_model_order", DEFAULTS.fallbackOrder),
    maxCategories: num("ai_max_categories_per_video", DEFAULTS.maxCategories),
    minSecondary: num("ai_min_tags_secondary", DEFAULTS.minSecondary),
    sessionMaxJobs: num("ai_session_max_jobs", DEFAULTS.sessionMaxJobs),
    heartbeatTimeoutS: num("ai_heartbeat_timeout_s", DEFAULTS.heartbeatTimeoutS),
    userSubmitAuto: bool("ai_user_submit_auto", DEFAULTS.userSubmitAuto),
  };
}

function modelForScope(scope: string, s: AiSettings): string {
  if (scope === "user_submit") return s.userSubmitModel;
  if (scope === "admin_batch") return s.batchModel;
  return s.adminModel;
}

async function setThrottled(value: boolean) {
  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "ai_all_models_throttled", value }, { onConflict: "key" });
}

type AiJobRow = {
  id: string;
  job_type: AiJobType;
  scope: string;
  video_id: string;
  assigned_session_id: string | null;
  taxonomy_snapshot_id: string | null;
  retry_count: number;
  max_retries: number;
  created_by: string | null;
};

async function claimNextJob(scope: string | null, sessionId: string | null): Promise<AiJobRow | null> {
  const { data, error } = await supabaseAdmin.rpc("claim_ai_job", {
    _scope: scope,
    _session_id: sessionId,
  } as never);
  if (error) {
    console.error("[ai/claimNextJob]", error.message);
    return null;
  }
  return (data as unknown as AiJobRow) ?? null;
}

async function ensureSession(snapshot: TaxonomySnapshot, model: string, scope: string): Promise<string> {
  // Find a live session for this scope+model with capacity.
  const { data: existing } = await supabaseAdmin
    .from("ai_agent_sessions")
    .select("id, total_jobs_completed")
    .is("session_ended_at", null)
    .eq("scope", scope as never)
    .eq("model", model)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("ai_agent_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("ai_agent_sessions")
    .insert({
      agent_index: 0,
      model,
      scope: scope as never,
      context_snapshot_id: snapshot.id,
      last_heartbeat: new Date().toISOString(),
      session_started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(`session create failed: ${error?.message}`);
  return created.id;
}

async function loadVideoContext(videoId: string): Promise<VideoContext | null> {
  const { data: v } = await supabaseAdmin
    .from("videos")
    .select("id, title, description, duration_seconds, published_at, creator_id, primary_tag_ids")
    .eq("id", videoId)
    .maybeSingle();
  if (!v) return null;

  const [{ data: creator }, { data: cats }, { data: primaryTags }] = await Promise.all([
    v.creator_id
      ? supabaseAdmin.from("creators").select("title").eq("id", v.creator_id).maybeSingle()
      : Promise.resolve({ data: null as { title: string } | null }),
    supabaseAdmin
      .from("video_categories")
      .select("category_id, categories(slug)")
      .eq("video_id", videoId),
    v.primary_tag_ids?.length
      ? supabaseAdmin.from("tags").select("slug").in("id", v.primary_tag_ids)
      : Promise.resolve({ data: [] as { slug: string }[] }),
  ]);

  const existing_categories = (cats ?? [])
    .map((r) => (r as { categories: { slug: string } | null }).categories?.slug)
    .filter((s): s is string => !!s);
  const existing_primary_tags = (primaryTags ?? []).map((t) => t.slug);

  return {
    video_id: v.id,
    title: v.title ?? "",
    description: v.description,
    channel_name: creator?.title ?? null,
    youtube_tags: [],
    duration_seconds: v.duration_seconds,
    published_at: v.published_at,
    existing_categories,
    existing_primary_tags,
  };
}

async function resolveSlugsToIds(jobType: AiJobType, slugs: string[]): Promise<Map<string, { id: string; name: string }>> {
  if (slugs.length === 0) return new Map();
  const table = jobType === "categorise" ? "categories" : "tags";
  const { data } = await supabaseAdmin.from(table).select("id, slug, name").in("slug", slugs);
  return new Map((data ?? []).map((r) => [r.slug, { id: r.id, name: r.name }]));
}

async function failJob(jobId: string, errorText: string) {
  await supabaseAdmin
    .from("ai_jobs")
    .update({
      status: "failed",
      error_text: errorText,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function completeJob(jobId: string, args: { model: string; prompt_tokens: number; completion_tokens: number }) {
  await supabaseAdmin
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      model_used: args.model,
      prompt_tokens: args.prompt_tokens,
      completion_tokens: args.completion_tokens,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function stampVideoAi(videoId: string, jobType: AiJobType, model: string, avgConfidence: number) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (jobType === "categorise") {
    patch.ai_categorised_at = now;
    patch.ai_categorisation_model = model;
  } else {
    patch.ai_tagged_at = now;
    patch.ai_tagging_model = model;
  }
  if (Number.isFinite(avgConfidence)) patch.ai_confidence_avg = avgConfidence;
  await supabaseAdmin.from("videos").update(patch).eq("id", videoId);
}

async function runJob(job: AiJobRow, settings: AiSettings, snapshot: TaxonomySnapshot): Promise<{ throttled: boolean }> {
  const ctx = await loadVideoContext(job.video_id);
  if (!ctx) {
    await failJob(job.id, "video_not_found");
    return { throttled: false };
  }

  const primaryModel = modelForScope(job.scope, settings);
  const tryModels = [primaryModel, ...settings.fallbackOrder.filter((m) => m !== primaryModel)];

  let lastError = "no_attempt";
  for (const model of tryModels) {
    const result = await callGateway({
      jobType: job.job_type,
      model,
      snapshot,
      videoContext: ctx,
      maxCategories: settings.maxCategories,
      minSecondary: settings.minSecondary,
    });

    if (result.ok) {
      // Persist results
      const slugs = result.results.map((r) => r.slug);
      const idMap = await resolveSlugsToIds(job.job_type, slugs);
      const autoAccept = job.scope === "user_submit" && settings.userSubmitAuto;
      const rows = result.results
        .map((r) => {
          const entity = idMap.get(r.slug);
          if (!entity) return null;
          return {
            job_id: job.id,
            video_id: job.video_id,
            result_type: job.job_type,
            entity_id: entity.id,
            entity_name: entity.name,
            confidence: r.confidence,
            was_accepted: autoAccept ? true : null,
            accepted_at: autoAccept ? new Date().toISOString() : null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        await supabaseAdmin.from("ai_job_results").insert(rows);
      }

      const avg = rows.length > 0 ? rows.reduce((a, r) => a + r.confidence, 0) / rows.length : 0;
      await stampVideoAi(job.video_id, job.job_type, model, avg);

      await completeJob(job.id, {
        model,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
      });

      if (job.assigned_session_id) {
        await supabaseAdmin.rpc("set_updated_at" as never).select(); // no-op safety
        await supabaseAdmin
          .from("ai_agent_sessions")
          .update({
            last_heartbeat: new Date().toISOString(),
            total_jobs_completed: (await getSessionCompleted(job.assigned_session_id)) + 1,
            total_prompt_tokens: (await getSessionTokens(job.assigned_session_id, "prompt")) + result.prompt_tokens,
            total_completion_tokens:
              (await getSessionTokens(job.assigned_session_id, "completion")) + result.completion_tokens,
          })
          .eq("id", job.assigned_session_id);
      }
      return { throttled: false };
    }

    lastError = `${result.error}:${result.message ?? ""}`;
    if (result.error === "credits_exhausted") {
      await failJob(job.id, "credits_exhausted");
      return { throttled: true };
    }
    if (result.error === "rate_limited") {
      // try next model
      continue;
    }
    if (result.error === "context_exceeded") {
      // End session, fail this attempt — sweeper will retry.
      if (job.assigned_session_id) {
        await supabaseAdmin
          .from("ai_agent_sessions")
          .update({ session_ended_at: new Date().toISOString(), end_reason: "context_exceeded" })
          .eq("id", job.assigned_session_id);
      }
      await failJob(job.id, "context_exceeded");
      return { throttled: false };
    }
    if (result.error === "taxonomy_mismatch") {
      await failJob(job.id, "taxonomy_mismatch");
      return { throttled: false };
    }
    // malformed_output / gateway_error -> try next model
  }

  await failJob(job.id, lastError);
  // If all models rate-limited, mark throttled
  if (lastError.startsWith("rate_limited")) {
    await setThrottled(true);
    return { throttled: true };
  }
  return { throttled: false };
}

async function getSessionCompleted(sessionId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("ai_agent_sessions")
    .select("total_jobs_completed")
    .eq("id", sessionId)
    .maybeSingle();
  return data?.total_jobs_completed ?? 0;
}
async function getSessionTokens(sessionId: string, kind: "prompt" | "completion"): Promise<number> {
  const col = kind === "prompt" ? "total_prompt_tokens" : "total_completion_tokens";
  const { data } = await supabaseAdmin
    .from("ai_agent_sessions")
    .select(col)
    .eq("id", sessionId)
    .maybeSingle();
  return (data as Record<string, number> | null)?.[col] ?? 0;
}

export async function tick(): Promise<{
  ranJobs: number;
  reissued: number;
  retried: number;
  throttled: boolean;
}> {
  const settings = await loadAiSettings();
  const snapshot = await getCurrentSnapshot();

  // Sweepers
  const { data: reissuedCount } = await supabaseAdmin.rpc("sweep_stale_ai_sessions", {
    _timeout_s: settings.heartbeatTimeoutS,
  } as never);
  const { data: retriedCount } = await supabaseAdmin.rpc("sweep_ai_retries" as never);

  // Dispatch up to N jobs per tick (one per session slot).
  let ranJobs = 0;
  let throttled = false;
  for (let i = 0; i < settings.maxParallel; i++) {
    const job = await claimNextJob(null, null);
    if (!job) break;

    const model = modelForScope(job.scope, settings);
    const sessionId = await ensureSession(snapshot, model, job.scope);
    await supabaseAdmin
      .from("ai_jobs")
      .update({ assigned_session_id: sessionId, taxonomy_snapshot_id: snapshot.id })
      .eq("id", job.id);

    const r = await runJob({ ...job, assigned_session_id: sessionId }, settings, snapshot);
    ranJobs++;
    if (r.throttled) {
      throttled = true;
      break;
    }
  }

  if (!throttled) {
    // Clear throttle flag opportunistically on success.
    const { data: flag } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_all_models_throttled")
      .maybeSingle();
    if (flag?.value === true && ranJobs > 0) await setThrottled(false);
  }

  return {
    ranJobs,
    reissued: typeof reissuedCount === "number" ? reissuedCount : 0,
    retried: typeof retriedCount === "number" ? retriedCount : 0,
    throttled,
  };
}
