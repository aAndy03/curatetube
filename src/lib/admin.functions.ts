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

// ============ APP SETTINGS ============

export const listAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value");
    if (error) throw new Error(error.message);
    const map: Record<string, unknown> = {};
    for (const r of data ?? []) map[r.key] = r.value;
    return { settings: map as Record<string, boolean | string | number | null> };
  });


const SettingInput = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const setAppSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "settings.edit");
    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: data.key,
      value: data.value as never,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "settings.update",
      targetType: "app_setting",
      targetId: data.key,
      after: { value: data.value },
      visibility: "staff",
    });
    return { ok: true };
  });

// ============ RECOMMENDATION WEIGHTS ============

export const getRecommendationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("recommendation_settings")
      .select("weights, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { weights: (data?.weights ?? {}) as Record<string, number> };
  });


const WeightsInput = z.object({
  weights: z.record(z.string(), z.number().min(0).max(5)),
});

export const setRecommendationWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WeightsInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "settings.edit");
    const { error } = await supabaseAdmin
      .from("recommendation_settings")
      .upsert({
        id: true,
        weights: data.weights as never,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "recommendation.weights_update",
      targetType: "recommendation_settings",
      after: data.weights,
      visibility: "staff",
    });
    return { ok: true };
  });

// ============ AUDIT LOG VIEWER ============

const AuditQuery = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  visibility: z.enum(["internal", "staff", "public"]).optional(),
  actorId: z.string().uuid().optional(),
});

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AuditQuery.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "audit.view");
    let q = supabaseAdmin
      .from("audit_log")
      .select(
        "id, created_at, actor_id, actor_display_snapshot, action, target_type, target_id, before, after, visibility",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.before) q = q.lt("created_at", data.before);
    if (data.action) q = q.eq("action", data.action);
    if (data.targetType) q = q.eq("target_type", data.targetType);
    if (data.visibility) q = q.eq("visibility", data.visibility);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

// Reveal actor identity (forensic) — gated by audit.view_identity
export const revealAuditActor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { actorId: string }) =>
    z.object({ actorId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "audit.view_identity");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username")
      .eq("id", data.actorId)
      .maybeSingle();
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "audit.identity_reveal",
      targetType: "user",
      targetId: data.actorId,
      visibility: "staff",
    });
    return { profile: prof };
  });

// ============ BROADCAST NOTIFICATIONS ============

const BroadcastInput = z.object({
  title: z.string().min(1).max(140),
  body: z.string().max(1000).optional(),
  link: z.string().max(500).optional(),
});

export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BroadcastInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "notification.broadcast");
    const { data: users, error: uerr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .is("deleted_at", null);
    if (uerr) throw new Error(uerr.message);
    const rows = (users ?? []).map((u) => ({
      user_id: u.id,
      type: "admin_broadcast" as const,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      data: { broadcast: true } as never,
    }));
    if (rows.length) {
      // Insert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin
          .from("notifications")
          .insert(slice);
        if (error) throw new Error(error.message);
      }
    }
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "notification.broadcast",
      after: { title: data.title, recipients: rows.length },
      visibility: "staff",
    });
    return { sent: rows.length };
  });

// ============ ATTRIBUTION (public chip on video detail) ============

export const getVideoAttribution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string }) =>
    z.object({ videoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "attribution.video_detail_chip")
      .maybeSingle();
    const enabled = setting?.value === true;
    if (!enabled) return { enabled: false, contributors: [] };

    const { data: rows } = await supabaseAdmin
      .from("video_submitters")
      .select("user_id, anonymous, first_submitted_at")
      .eq("video_id", data.videoId)
      .order("first_submitted_at", { ascending: true })
      .limit(20);

    const userIds = (rows ?? [])
      .filter((r) => !r.anonymous)
      .map((r) => r.user_id);
    let profiles: Record<
      string,
      { display_name: string | null; username: string | null; mode: string }
    > = {};
    if (userIds.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, username, audit_privacy_mode")
        .in("id", userIds);
      for (const p of ps ?? []) {
        profiles[p.id] = {
          display_name: p.display_name,
          username: p.username,
          mode: p.audit_privacy_mode,
        };
      }
    }
    const contributors = (rows ?? []).map((r) => {
      const p = profiles[r.user_id];
      const isPublic = !r.anonymous && p?.mode === "public";
      return {
        anonymous: !isPublic,
        name: isPublic ? (p?.display_name ?? p?.username ?? "Unknown") : null,
        first_submitted_at: r.first_submitted_at,
      };
    });
    return { enabled: true, contributors };
  });

// ============ MV REFRESH LOG / FORCE FLUSH ============

export const listMvRefreshLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "settings.edit");
    const { data, error } = await supabaseAdmin
      .from("mv_refresh_log" as never)
      .select("id, view_name, duration_ms, rows_affected, triggered_at, ok, error")
      .order("triggered_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []) as Array<{
      id: number; view_name: string; duration_ms: number;
      rows_affected: number | null; triggered_at: string; ok: boolean; error: string | null;
    }> };
  });

const ForceFlushInput = z.object({
  view: z.enum([
    "mv_trending",
    "mv_suggested_feed",
    "mv_category_stats",
    "mv_category_suggest_score",
    "mv_category_trending_score",
    "mv_creator_categories",
  ]),
});

export const forceRefreshMv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ForceFlushInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "settings.edit");
    const { data: result, error } = await supabaseAdmin.rpc(
      "refresh_mv" as never,
      { _name: data.view } as never,
    );
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "mv.force_refresh",
      targetType: "materialized_view",
      targetId: data.view,
    });
    return result as { ok: boolean; rows?: number; error?: string };
  });

// ============ SYNC HEALTH (action queue batch flushes) ============

export const getSyncHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "settings.edit");
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("batch_flush_log" as never)
      .select("action_count, success_count, fail_count, duration_ms, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      action_count: number;
      success_count: number;
      fail_count: number;
      duration_ms: number;
      created_at: string;
    }>;

    const flushes = list.length;
    const totalActions = list.reduce((a, r) => a + r.action_count, 0);
    const totalFailed = list.reduce((a, r) => a + r.fail_count, 0);
    const avgLatency =
      flushes > 0
        ? Math.round(list.reduce((a, r) => a + r.duration_ms, 0) / flushes)
        : 0;
    const lastFlush = list[0]?.created_at ?? null;

    return {
      flushes,
      totalActions,
      totalFailed,
      avgLatencyMs: avgLatency,
      lastFlush,
      recent: list.slice(0, 20),
    };
  });
