import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cycle window: after this many minutes, the seen_ids set is reset so users
// can see content again. Keeps dedup from starving the feed indefinitely.
const CYCLE_MINUTES = 60;
const MAX_AUTO_CATEGORIES = 3;
const VIDEOS_PER_SECTION = 8;
const SEEN_CAP = 500;

const VIDEO_FIELDS =
  "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title, handle, thumbnail_url)";

export type CategoryFeedVideo = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  primary_tag_ids: string[] | null;
  creator: { id: string; title: string; handle: string | null; thumbnail_url: string | null } | null;
};

export type CategoryFeedRail = {
  category: { id: string; slug: string; name: string };
  pinned: boolean;
  videos: CategoryFeedVideo[];
  total_in_category: number;
};

// --- pin / unpin ---

export const listPinnedCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_category_pins")
      .select("category_id, sort_order, category:categories(id, slug, name)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      pinned: (data ?? []).map((r) => ({
        category: r.category as unknown as { id: string; slug: string; name: string },
        sort_order: r.sort_order,
      })),
    };
  });

export const pinCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ categoryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("user_category_pins")
      .select("category_id", { count: "exact", head: true })
      .eq("user_id", userId);
    const { error } = await supabase
      .from("user_category_pins")
      .upsert(
        { user_id: userId, category_id: data.categoryId, sort_order: count ?? 0 },
        { onConflict: "user_id,category_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unpinCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ categoryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_category_pins")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", data.categoryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- category feed assembly with cross-section dedup ---

async function loadOrResetDedup(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("user_feed_dedup")
    .select("seen_ids, cycle_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabaseAdmin
      .from("user_feed_dedup")
      .insert({ user_id: userId, seen_ids: [] });
    return new Set();
  }
  const ageMs = Date.now() - new Date(data.cycle_started_at).getTime();
  if (ageMs > CYCLE_MINUTES * 60_000) {
    await supabaseAdmin
      .from("user_feed_dedup")
      .update({ seen_ids: [], cycle_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return new Set();
  }
  return new Set(data.seen_ids ?? []);
}

async function persistDedup(userId: string, seen: Set<string>): Promise<void> {
  const arr = Array.from(seen).slice(-SEEN_CAP);
  await supabaseAdmin
    .from("user_feed_dedup")
    .upsert(
      { user_id: userId, seen_ids: arr, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

async function fetchCategoryVideos(
  categoryId: string,
  excludeIds: string[],
  limit: number,
): Promise<{ videos: CategoryFeedVideo[]; total: number }> {
  // Resolve all descendants via closure table so a parent category surfaces
  // videos from its full subtree.
  const { data: descs } = await supabaseAdmin
    .from("category_ancestors")
    .select("descendant_id")
    .eq("ancestor_id", categoryId);
  const catIds = (descs ?? []).map((r) => r.descendant_id);
  if (catIds.length === 0) return { videos: [], total: 0 };

  const { data: vcRows } = await supabaseAdmin
    .from("video_categories")
    .select("video_id")
    .in("category_id", catIds);
  const videoIds = Array.from(new Set((vcRows ?? []).map((r) => r.video_id)));
  if (videoIds.length === 0) return { videos: [], total: 0 };

  const allowed = excludeIds.length > 0 ? videoIds.filter((id) => !excludeIds.includes(id)) : videoIds;
  if (allowed.length === 0) return { videos: [], total: videoIds.length };

  const { data: rows, error } = await supabaseAdmin
    .from("videos")
    .select(VIDEO_FIELDS)
    .eq("status", "approved")
    .in("id", allowed)
    .order("suggest_count", { ascending: false })
    .order("first_submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return {
    videos: (rows ?? []) as unknown as CategoryFeedVideo[],
    total: videoIds.length,
  };
}

export const getCategoryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const seen = await loadOrResetDedup(userId);

    // 1. Pinned categories (ranked above autos, in user sort order).
    const { data: pinRows } = await supabaseAdmin
      .from("user_category_pins")
      .select("category_id, sort_order, category:categories(id, slug, name)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    const pinned = (pinRows ?? [])
      .map((r) => r.category as unknown as { id: string; slug: string; name: string } | null)
      .filter((c): c is { id: string; slug: string; name: string } => Boolean(c));
    const pinnedIds = new Set(pinned.map((c) => c.id));

    // 2. Auto categories: top by video_count, skipping pinned ones.
    const { data: autoRows } = await supabaseAdmin
      .from("categories")
      .select("id, slug, name, video_count")
      .gt("video_count", 0)
      .order("video_count", { ascending: false })
      .limit(MAX_AUTO_CATEGORIES + pinned.length + 2);

    const autos = (autoRows ?? [])
      .filter((c) => !pinnedIds.has(c.id))
      .slice(0, MAX_AUTO_CATEGORIES)
      .map((c) => ({ id: c.id, slug: c.slug, name: c.name }));

    const rails: CategoryFeedRail[] = [];
    const excludeIds = Array.from(seen);

    for (const c of pinned) {
      const { videos, total } = await fetchCategoryVideos(c.id, excludeIds, VIDEOS_PER_SECTION);
      if (videos.length === 0 && total === 0) continue;
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({ category: c, pinned: true, videos, total_in_category: total });
    }
    for (const c of autos) {
      const { videos, total } = await fetchCategoryVideos(c.id, excludeIds, VIDEOS_PER_SECTION);
      if (videos.length === 0) continue;
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({ category: c, pinned: false, videos, total_in_category: total });
    }

    await persistDedup(userId, seen);

    return { rails };
  });
