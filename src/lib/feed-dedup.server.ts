// Phase 11 — Shared per-user dedup helpers + Postgres-side category video fetch.
// Used by feed/suggest/trending rails so a single cycle of `seen_ids` keeps
// rails non-overlapping for 60 minutes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CYCLE_MINUTES = 60;
export const SEEN_CAP = 500;

export type FeedRailVideo = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  primary_tag_ids: string[] | null;
  creator:
    | { id: string; title: string; handle: string | null; thumbnail_url: string | null }
    | null;
};

type DirectRow = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  primary_tag_ids: string[] | null;
  creator:
    | { id: string; title: string; handle: string | null; thumbnail_url: string | null }
    | { id: string; title: string; handle: string | null; thumbnail_url: string | null }[]
    | null;
};

export async function loadOrResetDedup(userId: string): Promise<Set<string>> {
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
      .update({
        seen_ids: [],
        cycle_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return new Set();
  }
  return new Set((data.seen_ids ?? []) as string[]);
}

export async function persistDedup(userId: string, seen: Set<string>): Promise<void> {
  const arr = Array.from(seen).slice(-SEEN_CAP);
  await supabaseAdmin
    .from("user_feed_dedup")
    .upsert(
      { user_id: userId, seen_ids: arr, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

type RpcRow = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  primary_tag_ids: string[] | null;
  creator_id: string | null;
  creator_title: string | null;
  creator_handle: string | null;
  creator_thumbnail_url: string | null;
  total_in_category: number;
};

/**
 * Single round-trip: resolves descendants, joins video_categories, applies
 * the `_exclude` dedup list, returns trimmed videos + total count.
 */
export async function fetchCategoryFeedVideos(
  categoryId: string,
  excludeIds: string[],
  limit: number,
  includeDescendants = true,
): Promise<{ videos: FeedRailVideo[]; total: number }> {
  if (!includeDescendants) {
    const { data: vcRows, error: vcError } = await supabaseAdmin
      .from("video_categories")
      .select("video_id")
      .eq("category_id", categoryId);
    if (vcError) throw new Error(vcError.message);

    const ids = Array.from(new Set((vcRows ?? []).map((row) => row.video_id as string)));
    if (ids.length === 0) return { videos: [], total: 0 };

    const { data: videoRows, error: videosError } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title, handle, thumbnail_url)",
      )
      .eq("status", "approved")
      .in("id", ids)
      .order("suggest_count", { ascending: false })
      .order("first_submitted_at", { ascending: false });
    if (videosError) throw new Error(videosError.message);

    const allRows = (videoRows ?? []) as unknown as DirectRow[];
    const exclude = new Set(excludeIds);
    const rows = allRows.filter((row) => !exclude.has(row.id)).slice(0, Math.max(limit, 0));

    const videos: FeedRailVideo[] = rows.map((row) => ({
      id: row.id,
      youtube_id: row.youtube_id,
      title: row.title,
      thumbnail_url: row.thumbnail_url,
      duration_seconds: row.duration_seconds,
      published_at: row.published_at,
      submission_count: row.submission_count,
      suggest_count: row.suggest_count,
      primary_tag_ids: row.primary_tag_ids,
      creator: Array.isArray(row.creator) ? (row.creator[0] ?? null) : row.creator,
    }));

    return { videos, total: allRows.length };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "fetch_category_feed_videos" as never,
    {
      _category_id: categoryId,
      _exclude: excludeIds,
      _limit: limit,
    } as never,
  );
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as RpcRow[];
  const videos: FeedRailVideo[] = rows.map((r) => ({
    id: r.id,
    youtube_id: r.youtube_id,
    title: r.title,
    thumbnail_url: r.thumbnail_url,
    duration_seconds: r.duration_seconds,
    published_at: r.published_at,
    submission_count: r.submission_count,
    suggest_count: r.suggest_count,
    primary_tag_ids: r.primary_tag_ids,
    creator: r.creator_id
      ? {
          id: r.creator_id,
          title: r.creator_title ?? "",
          handle: r.creator_handle,
          thumbnail_url: r.creator_thumbnail_url,
        }
      : null,
  }));
  const total = Number(rows[0]?.total_in_category ?? 0);
  return { videos, total };
}
