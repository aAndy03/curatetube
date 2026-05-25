import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

const ListStatus = z.enum(["wishlist", "liked", "disliked", "watched"]);
type ListStatus = z.infer<typeof ListStatus>;

// ============ TOGGLE LIST ============

const ToggleListInput = z.object({
  videoId: z.string().uuid(),
  status: ListStatus,
  on: z.boolean(),
});

export const toggleVideoListStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToggleListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    if (data.on) {
      // Mutually exclusive: liked vs disliked
      if (data.status === "liked" || data.status === "disliked") {
        const opposite = data.status === "liked" ? "disliked" : "liked";
        await supabase
          .from("user_video_status")
          .delete()
          .eq("user_id", userId)
          .eq("video_id", data.videoId)
          .eq("status", opposite);
      }
      const { error } = await supabase.from("user_video_status").insert({
        user_id: userId,
        video_id: data.videoId,
        status: data.status,
      });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("user_video_status")
        .delete()
        .eq("user_id", userId)
        .eq("video_id", data.videoId)
        .eq("status", data.status);
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: data.on ? `list.add.${data.status}` : `list.remove.${data.status}`,
      targetType: "video",
      targetId: data.videoId,
    });

    return { ok: true };
  });

// ============ SUGGEST ============

const SuggestInput = z.object({
  videoId: z.string().uuid(),
  on: z.boolean(),
  anonymous: z.boolean().optional(),
});

export const toggleSuggest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuggestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: canSuggest } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: "suggest.cast",
    });
    if (!canSuggest) throw new Error("You do not have permission to suggest videos.");

    // Rate limit 60/hour
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "suggest.cast")
      .gte("created_at", oneHourAgo);
    if ((recent ?? 0) >= 60) throw new Error("Suggestion rate limit (60/hour) reached.");

    if (data.on) {
      const { error } = await supabase.from("video_suggestions").insert({
        user_id: userId,
        video_id: data.videoId,
        anonymous: !!data.anonymous,
      });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);

      // Mark also in user_video_status as 'suggested-like' equivalent: store separately under list 'liked'? No — use separate suggested view via video_suggestions table. Skip mirroring.

      await supabaseAdmin.from("rate_limit_events").insert({
        user_id: userId,
        action: "suggest.cast",
      });
      await writeAudit(supabaseAdmin, {
        actorId: userId,
        action: "suggest.cast",
        targetType: "video",
        targetId: data.videoId,
        forceAnonymous: !!data.anonymous,
      });
    } else {
      const { error } = await supabase
        .from("video_suggestions")
        .delete()
        .eq("user_id", userId)
        .eq("video_id", data.videoId);
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actorId: userId,
        action: "suggest.uncast",
        targetType: "video",
        targetId: data.videoId,
      });
    }

    return { ok: true };
  });

// ============ READ: per-video user state (for action bar) ============

export const getMyVideoState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string }) =>
    z.object({ videoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const [{ data: rows }, { data: sug }] = await Promise.all([
      supabase
        .from("user_video_status")
        .select("status")
        .eq("user_id", userId)
        .eq("video_id", data.videoId),
      supabase
        .from("video_suggestions")
        .select("user_id")
        .eq("user_id", userId)
        .eq("video_id", data.videoId)
        .maybeSingle(),
    ]);
    return {
      statuses: (rows ?? []).map((r) => r.status as ListStatus),
      suggested: !!sug,
    };
  });

// ============ READ: my list (videos in given status) ============

export const getMyList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status: ListStatus }) =>
    z.object({ status: ListStatus }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: rows, error } = await supabase
      .from("user_video_status")
      .select(
        "created_at, video:videos(id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, status, creator:creators(id, title, handle, thumbnail_url))",
      )
      .eq("user_id", userId)
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);
    return {
      videos: (rows ?? [])
        .map((r) => r.video)
        .filter((v): v is NonNullable<typeof v> => !!v && v.status === "approved"),
    };
  });

export const getMySuggestedList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data: rows, error } = await supabase
      .from("video_suggestions")
      .select(
        "created_at, video:videos(id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, status, creator:creators(id, title, handle, thumbnail_url))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);
    return {
      videos: (rows ?? [])
        .map((r) => r.video)
        .filter((v): v is NonNullable<typeof v> => !!v && v.status === "approved"),
    };
  });

// ============ NOTIFICATIONS ============

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const [{ data: rows }, { count: unread }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
    ]);
    return { notifications: rows ?? [], unread: unread ?? 0 };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids?: string[] } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const q = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (data.ids && data.ids.length) q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ AUDIT IDENTITY BULK REWRITE ============

const RewriteInput = z.object({
  mode: z.enum(["anonymize", "attribute"]),
});

export const rewriteAuditIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RewriteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    let snapshot = "Anonymous contributor";
    if (data.mode === "attribute") {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("display_name, username")
        .eq("id", userId)
        .single();
      snapshot = prof?.display_name ?? prof?.username ?? "Unknown";
    }
    const { error, count } = await supabaseAdmin
      .from("audit_log")
      .update({ actor_display_snapshot: snapshot }, { count: "exact" })
      .eq("actor_id", userId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: data.mode === "anonymize" ? "audit.bulk_anonymize" : "audit.bulk_attribute",
      targetType: "user",
      targetId: userId,
      after: { rewritten: count ?? 0 },
    });
    return { rewritten: count ?? 0 };
  });

// ============ ACCOUNT DELETION ============

export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const cancelToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    const scheduledFor = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .upsert({
        user_id: userId,
        requested_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        reason: data.reason ?? null,
        cancel_token: cancelToken,
        cancelled_at: null,
        finalized_at: null,
      });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: "account.delete_requested",
      targetType: "user",
      targetId: userId,
      after: { scheduled_for: scheduledFor },
      visibility: "staff",
    });
    return { ok: true, scheduledFor, cancelToken };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("cancelled_at", null)
      .is("finalized_at", null);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: "account.delete_cancelled",
      targetType: "user",
      targetId: userId,
      visibility: "staff",
    });
    return { ok: true };
  });

export const getMyDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data } = await supabase
      .from("account_deletion_requests")
      .select("requested_at, scheduled_for, cancelled_at, finalized_at")
      .eq("user_id", userId)
      .maybeSingle();
    return { request: data ?? null };
  });

// Returns auth identity providers so the deletion wizard can require the right re-auth.
export const getMyAuthIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) throw new Error(error.message);
    const providers = (data.user?.identities ?? []).map((i) => i.provider);
    return {
      providers,
      hasPassword: providers.includes("email"),
      hasGoogle: providers.includes("google"),
    };
  });

// Instant, immediate hard-delete. Keeps audit_log rows but anonymizes them so
// staff can still see "someone once did X" without any link back to a person.
export const instantDeleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Audit BEFORE wiping anything. Force anonymous so we don't snapshot the name.
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: "account.delete_instant",
      targetType: "user",
      targetId: userId,
      after: { reason: data.reason ?? null },
      visibility: "staff",
      forceAnonymous: true,
    });

    // Anonymize every past audit row from this actor.
    await supabaseAdmin
      .from("audit_log")
      .update({ actor_display_snapshot: "Deleted user" })
      .eq("actor_id", userId);

    // Best-effort clean of per-user rows that may not cascade.
    const userTables = [
      "user_category_pins",
      "user_feed_dedup",
      "user_feed_state",
      "user_broadcast_reads",
      "user_video_status",
      "user_roles",
      "video_suggestions",
      "video_submitters",
      "rate_limit_events",
      "batch_flush_log",
      "notifications",
      "account_deletion_requests",
    ] as const;
    for (const t of userTables) {
      await supabaseAdmin.from(t).delete().eq("user_id", userId);
    }

    // Drop profile, then the auth user itself.
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
