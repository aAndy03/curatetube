// Phase 8 — Trending category rails (v0.4.7).
// Reads mv_category_trending_score (15-min refresh). Assembles 2–4 rails
// of up to 6 videos each, ordered by suggest_count + recency, sharing the
// per-user user_feed_dedup cycle with /feed and /suggest.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_RAILS = 4;
const MIN_RAILS = 2;
const VIDEOS_PER_RAIL = 6;
const CYCLE_MINUTES = 60;
const SEEN_CAP = 500;

const VIDEO_FIELDS =
  "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title, handle, thumbnail_url)";

export type TrendingRailVideo = {
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

export type TrendingCategoryRail = {
  category: { id: string; slug: string; name: string };
  score: number;
  active_creators: number;
  new_videos_7d: number;
  videos: TrendingRailVideo[];
};

async function loadOrResetDedup(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("user_feed_dedup")
    .select("seen_ids, cycle_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabaseAdmin.from("user_feed_dedup").insert({ user_id: userId, seen_ids: [] });
    return new Set();
  }
  const ageMs = Date.now() - new Date(data.cycle_started_at).getTime();
  if (ageMs > CYCLE_MINUTES * 60_000) {
    await supabaseAdmin
      .from("user_feed_dedup")
      .update({
        seen_ids: [],
        cycle_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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
): Promise<TrendingRailVideo[]> {
  const { data: descs } = await supabaseAdmin
    .from("category_ancestors")
    .select("descendant_id")
    .eq("ancestor_id", categoryId);
  const catIds = (descs ?? []).map((r) => r.descendant_id);
  if (catIds.length === 0) return [];

  const { data: vcRows } = await supabaseAdmin
    .from("video_categories")
    .select("video_id")
    .in("category_id", catIds);
  const videoIds = Array.from(new Set((vcRows ?? []).map((r) => r.video_id)));
  if (videoIds.length === 0) return [];

  const allowed = excludeIds.length
    ? videoIds.filter((id) => !excludeIds.includes(id))
    : videoIds;
  if (allowed.length === 0) return [];

  const { data: rows, error } = await supabaseAdmin
    .from("videos")
    .select(VIDEO_FIELDS)
    .eq("status", "approved")
    .in("id", allowed)
    .order("suggest_count", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (rows ?? []) as unknown as TrendingRailVideo[];
}

/**
 * Returns 2–4 "Trending categories" rails for /trending.
 * Ranking: mv_category_trending_score.score DESC. Categories with
 * fewer than trending_min_video_count videos are already excluded
 * inside the MV.
 */
export const getTrendingCategoryRails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const seen = await loadOrResetDedup(userId);
    const excludeIds = Array.from(seen);

    const { data: scored } = await supabaseAdmin
      .from("mv_category_trending_score" as never)
      .select("category_id, slug, name, score, active_creators, new_videos_7d")
      .order("score", { ascending: false })
      .limit(MAX_RAILS * 3);

    const scoredRows = (scored ?? []) as unknown as Array<{
      category_id: string;
      slug: string;
      name: string;
      score: number;
      active_creators: number;
      new_videos_7d: number;
    }>;

    const candidates = scoredRows
      .filter((r) => Number(r.score) > 0)
      .map((r) => ({
        id: r.category_id,
        slug: r.slug,
        name: r.name,
        score: Number(r.score),
        active_creators: Number(r.active_creators ?? 0),
        new_videos_7d: Number(r.new_videos_7d ?? 0),
      }));

    const rails: TrendingCategoryRail[] = [];
    for (const c of candidates) {
      if (rails.length >= MAX_RAILS) break;
      const videos = await fetchCategoryVideos(c.id, excludeIds, VIDEOS_PER_RAIL);
      if (videos.length === 0) continue;
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({
        category: { id: c.id, slug: c.slug, name: c.name },
        score: c.score,
        active_creators: c.active_creators,
        new_videos_7d: c.new_videos_7d,
        videos,
      });
    }

    const finalRails = rails.length >= MIN_RAILS ? rails : [];
    if (finalRails.length > 0) await persistDedup(userId, seen);
    return { rails: finalRails };
  });
