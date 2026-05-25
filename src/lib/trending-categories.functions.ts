// Phase 8 — Trending category rails (v0.4.7)
// Phase 11 — Uses shared dedup helper + Postgres-side RPC.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchCategoryFeedVideos,
  loadOrResetDedup,
  persistDedup,
  type FeedRailVideo,
} from "./feed-dedup.server";

const MAX_RAILS = 4;
const MIN_RAILS = 2;
const VIDEOS_PER_RAIL = 6;

export type TrendingRailVideo = FeedRailVideo;

export type TrendingCategoryRail = {
  category: { id: string; slug: string; name: string };
  score: number;
  active_creators: number;
  new_videos_7d: number;
  videos: TrendingRailVideo[];
};

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

    const candidates = ((scored ?? []) as unknown as Array<{
      category_id: string;
      slug: string;
      name: string;
      score: number;
      active_creators: number;
      new_videos_7d: number;
    }>)
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
      const { videos } = await fetchCategoryFeedVideos(c.id, excludeIds, VIDEOS_PER_RAIL);
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
