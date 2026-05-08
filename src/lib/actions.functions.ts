// Batch action processor — drains the client-side action queue.
// Routes each action to its existing per-action logic, sharing the auth context.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

// ---------- Action schema ----------
const SuggestA = z.object({
  id: z.string(),
  type: z.literal("suggest"),
  videoId: z.string().uuid(),
  on: z.boolean(),
});
const StatusA = z.object({
  id: z.string(),
  type: z.literal("status"),
  videoId: z.string().uuid(),
  status: z.enum(["wishlist", "liked", "disliked", "watched"]),
  on: z.boolean(),
});
const ProgressA = z.object({
  id: z.string(),
  type: z.literal("progress"),
  videoId: z.string().uuid(),
  percent: z.number().min(0).max(100),
});
const NotifReadA = z.object({
  id: z.string(),
  type: z.literal("notif_read"),
  ids: z.array(z.string().uuid()).nullable().optional(),
});
const ReorderA = z.object({
  id: z.string(),
  type: z.literal("feed_reorder"),
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

const ActionSchema = z.discriminatedUnion("type", [
  SuggestA,
  StatusA,
  ProgressA,
  NotifReadA,
  ReorderA,
]);
const BatchSchema = z.object({ actions: z.array(ActionSchema).min(1).max(200) });

export type BatchAction = z.infer<typeof ActionSchema>;
export type BatchResult = { id: string; ok: boolean; error?: string };

// ---------- Per-type handlers ----------
type Ctx = {
  userId: string;
  supabase: ReturnType<typeof supabaseAdmin.from> extends never ? never : typeof supabaseAdmin;
};

async function handleStatus(
  userId: string,
  supabase: typeof supabaseAdmin,
  a: z.infer<typeof StatusA>,
) {
  if (a.on) {
    if (a.status === "liked" || a.status === "disliked") {
      const opposite = a.status === "liked" ? "disliked" : "liked";
      await supabase
        .from("user_video_status")
        .delete()
        .eq("user_id", userId)
        .eq("video_id", a.videoId)
        .eq("status", opposite);
    }
    const { error } = await supabase
      .from("user_video_status")
      .insert({ user_id: userId, video_id: a.videoId, status: a.status });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("user_video_status")
      .delete()
      .eq("user_id", userId)
      .eq("video_id", a.videoId)
      .eq("status", a.status);
    if (error) throw new Error(error.message);
  }
  await writeAudit(supabaseAdmin, {
    actorId: userId,
    action: a.on ? `list.add.${a.status}` : `list.remove.${a.status}`,
    targetType: "video",
    targetId: a.videoId,
  });
}

async function handleSuggest(
  userId: string,
  supabase: typeof supabaseAdmin,
  a: z.infer<typeof SuggestA>,
) {
  const { data: canSuggest } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: "suggest.cast",
  });
  if (!canSuggest) throw new Error("Missing suggest.cast permission");

  if (a.on) {
    const { error } = await supabase
      .from("video_suggestions")
      .insert({ user_id: userId, video_id: a.videoId, anonymous: false });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    await supabaseAdmin
      .from("rate_limit_events")
      .insert({ user_id: userId, action: "suggest.cast" });
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: "suggest.cast",
      targetType: "video",
      targetId: a.videoId,
    });
  } else {
    const { error } = await supabase
      .from("video_suggestions")
      .delete()
      .eq("user_id", userId)
      .eq("video_id", a.videoId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: userId,
      action: "suggest.uncast",
      targetType: "video",
      targetId: a.videoId,
    });
  }
}

async function handleProgress(
  userId: string,
  supabase: typeof supabaseAdmin,
  a: z.infer<typeof ProgressA>,
) {
  // Mark as 'watched' when over 90%; otherwise no-op (no progress column exists yet).
  if (a.percent < 90) return;
  const { error } = await supabase
    .from("user_video_status")
    .insert({ user_id: userId, video_id: a.videoId, status: "watched" });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
}

async function handleNotifRead(
  userId: string,
  supabase: typeof supabaseAdmin,
  a: z.infer<typeof NotifReadA>,
) {
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (a.ids && a.ids.length) q = q.in("id", a.ids);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

async function handleReorder(
  userId: string,
  supabase: typeof supabaseAdmin,
  a: z.infer<typeof ReorderA>,
) {
  for (let i = 0; i < a.orderedIds.length; i++) {
    const { error } = await supabase
      .from("feed_sections")
      .update({ position: i })
      .eq("id", a.orderedIds[i])
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
  }
}

// ---------- Server fn ----------
export const processBatchActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    void ({} as Ctx);

    // Group by type for fewer round-trips on hot paths (status, suggest)
    const results: BatchResult[] = [];

    for (const a of data.actions) {
      try {
        switch (a.type) {
          case "status":
            await handleStatus(userId, supabase as typeof supabaseAdmin, a);
            break;
          case "suggest":
            await handleSuggest(userId, supabase as typeof supabaseAdmin, a);
            break;
          case "progress":
            await handleProgress(userId, supabase as typeof supabaseAdmin, a);
            break;
          case "notif_read":
            await handleNotifRead(userId, supabase as typeof supabaseAdmin, a);
            break;
          case "feed_reorder":
            await handleReorder(userId, supabase as typeof supabaseAdmin, a);
            break;
        }
        results.push({ id: a.id, ok: true });
      } catch (e) {
        results.push({
          id: a.id,
          ok: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
    return { results };
  });
