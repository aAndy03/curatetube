// Phase 7 — Suggested category rails (v0.4.6)
// Phase 11 — Uses shared dedup helper + Postgres-side RPC for one round trip.
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

export type SuggestRailVideo = FeedRailVideo;

export type SuggestCategoryRail = {
  category: { id: string; slug: string; name: string };
  score: number;
  videos: SuggestRailVideo[];
  is_cold_start: boolean;
};

export const getSuggestCategoryRails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const seen = await loadOrResetDedup(userId);
    const excludeIds = Array.from(seen);

    const { data: scored } = await supabaseAdmin
      .from("mv_category_suggest_score" as never)
      .select("category_id, slug, name, score")
      .order("score", { ascending: false })
      .limit(MAX_RAILS * 3);

    const scoredRows = (scored ?? []) as unknown as Array<{
      category_id: string;
      slug: string;
      name: string;
      score: number;
    }>;

    let candidates = scoredRows.filter((r) => Number(r.score) > 0);
    let isColdStart = false;

    if (candidates.length === 0) {
      isColdStart = true;
      const { data: fallback } = await supabaseAdmin
        .from("categories")
        .select("id, slug, name, video_count")
        .gt("video_count", 0)
        .order("video_count", { ascending: false })
        .limit(MAX_RAILS * 3);
      candidates = (fallback ?? []).map((c) => ({
        category_id: c.id,
        slug: c.slug,
        name: c.name,
        score: 0,
      }));
    }

    const rails: SuggestCategoryRail[] = [];
    for (const c of candidates) {
      if (rails.length >= MAX_RAILS) break;
      const { videos } = await fetchCategoryFeedVideos(c.category_id, excludeIds, VIDEOS_PER_RAIL);
      if (videos.length === 0) continue;
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({
        category: { id: c.category_id, slug: c.slug, name: c.name },
        score: Number(c.score),
        videos,
        is_cold_start: isColdStart,
      });
    }

    const finalRails = rails.length >= MIN_RAILS ? rails : [];
    if (finalRails.length > 0) await persistDedup(userId, seen);
    return { rails: finalRails, is_cold_start: isColdStart };
  });
