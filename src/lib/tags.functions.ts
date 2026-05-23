// Phase 4 — Tag display surfaces (v0.4.3)
// Public tag lookups, per-video tag fetch, and by-tag library listing.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TAG_CACHE_HEADERS = new Headers({
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
});
const BROWSE_CACHE_HEADERS = new Headers({
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
});

export type PublicTag = {
  id: string;
  name: string;
  slug: string;
  source: "platform" | "sciencedirect" | "youtube_api" | "user";
  tier: "primary" | "secondary" | "internal";
};

/**
 * Returns every non-internal tag (id, name, slug, source, tier). Used as the
 * in-memory cache that VideoCard reads to render `primary_tag_ids` chips
 * without any per-card join. Internal tags are excluded — they are kept in DB
 * for admin/search purposes and never shown on cards.
 */
export const listPublicTags = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeaders(TAG_CACHE_HEADERS);
    const { data, error } = await supabaseAdmin
      .from("tags")
      .select("id, name, slug, source, tier")
      .neq("tier", "internal")
      .order("name")
      .limit(50000);
    if (error) throw new Error(error.message);
    return { tags: (data ?? []) as PublicTag[] };
  });

/**
 * All tags for a single video, sorted by rank ASC. Internal tags are excluded.
 * Used on the video detail page.
 */
export const getVideoTags = createServerFn({ method: "GET" })
  .inputValidator((d: { videoId: string }) =>
    z.object({ videoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("video_tags")
      .select("rank, assigned_by, tag:tags(id, name, slug, source, tier)")
      .eq("video_id", data.videoId)
      .order("rank", { ascending: true });
    if (error) throw new Error(error.message);
    const tags = (rows ?? [])
      .map((r) => ({
        rank: r.rank,
        assigned_by: r.assigned_by,
        ...((r.tag ?? {}) as PublicTag),
      }))
      .filter((t) => t.id && t.tier !== "internal");
    return { tags };
  });

/**
 * Filtered library by tag slug, ordered by suggest_count DESC then recency.
 * Powers `/tags/$slug`.
 */
export const listVideosByTagSlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string; limit?: number }) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        limit: z.number().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    setResponseHeaders(BROWSE_CACHE_HEADERS);
    const limit = Math.min(data.limit ?? 36, 60);
    const { data: tag } = await supabaseAdmin
      .from("tags")
      .select("id, name, slug, source, tier")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tag) return { tag: null, videos: [] };

    const { data: links } = await supabaseAdmin
      .from("video_tags")
      .select("video_id")
      .eq("tag_id", tag.id as string);
    const ids = Array.from(new Set((links ?? []).map((l) => l.video_id as string)));
    if (ids.length === 0) return { tag, videos: [] };

    const { data: vids, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, view_count, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title, handle, thumbnail_url)",
      )
      .in("id", ids)
      .eq("status", "approved")
      .order("suggest_count", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { tag, videos: vids ?? [] };
  });
