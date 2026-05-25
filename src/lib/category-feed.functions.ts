// Phase 6 — Category-aware feed rails for /feed (v0.4.5).
// Phase 11 — Postgres-side dedup via fetch_category_feed_videos RPC.
// Plan-4 buffer: pin/unpin also seeds a matching feed_section (source=recent_in_category)
// tagged with filters.pin_category_id so /feed can edit it like any other section.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchCategoryFeedVideos,
  loadOrResetDedup,
  persistDedup,
  type FeedRailVideo,
} from "./feed-dedup.server";

const MAX_AUTO_CATEGORIES = 3;
const VIDEOS_PER_SECTION = 8;

export type CategoryFeedVideo = FeedRailVideo;

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
      .select("category_id, sort_order, pinned_at, category:categories(id, slug, name, video_count, depth, parent_id)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      pinned: (data ?? []).map((r) => ({
        category: r.category as unknown as {
          id: string;
          slug: string;
          name: string;
          video_count: number;
          depth: number;
          parent_id: string | null;
        },
        sort_order: r.sort_order,
        pinned_at: r.pinned_at as string,
      })),
    };
  });

async function ensurePinSection(
  userId: string,
  category: { id: string; slug: string; name: string },
): Promise<void> {
  // Check existing pin-linked section
  const { data: existing } = await supabaseAdmin
    .from("feed_sections")
    .select("id")
    .eq("owner_id", userId)
    .eq("is_template", false)
    .filter("filters->>pin_category_id", "eq", category.id)
    .maybeSingle();
  if (existing) return;

  const { count } = await supabaseAdmin
    .from("feed_sections")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  await supabaseAdmin.from("feed_sections").insert({
    owner_id: userId,
    template_id: null,
    name: category.name,
    source: "recent_in_category",
    filters: { categorySlug: category.slug, pin_category_id: category.id } as never,
    sort: "recent",
    layout: "grid",
    size: 8,
    refresh_minutes: 30,
    position: count ?? 0,
    is_template: false,
  });
}

async function removePinSection(userId: string, categoryId: string): Promise<void> {
  await supabaseAdmin
    .from("feed_sections")
    .delete()
    .eq("owner_id", userId)
    .filter("filters->>pin_category_id", "eq", categoryId);
}

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

    // Also seed a matching feed section
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id, slug, name")
      .eq("id", data.categoryId)
      .maybeSingle();
    if (cat) await ensurePinSection(userId, cat);

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
    await removePinSection(userId, data.categoryId);
    return { ok: true };
  });

// Batch unpin (used by /categories pinned tracker)
export const unpinCategoriesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ categoryIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_category_pins")
      .delete()
      .eq("user_id", userId)
      .in("category_id", data.categoryIds);
    if (error) throw new Error(error.message);
    for (const id of data.categoryIds) {
      await removePinSection(userId, id);
    }
    return { ok: true, removed: data.categoryIds.length };
  });

export const getCategoryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const seen = await loadOrResetDedup(userId);

    const { data: pinRows } = await supabaseAdmin
      .from("user_category_pins")
      .select("category_id, sort_order, category:categories(id, slug, name)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    const pinned = (pinRows ?? [])
      .map((r) => r.category as unknown as { id: string; slug: string; name: string } | null)
      .filter((c): c is { id: string; slug: string; name: string } => Boolean(c));
    const pinnedIds = new Set(pinned.map((c) => c.id));

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
      const { videos, total } = await fetchCategoryFeedVideos(c.id, excludeIds, VIDEOS_PER_SECTION);
      // Always render pinned rails, even when empty — users want to see their pin.
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({ category: c, pinned: true, videos, total_in_category: total });
    }
    for (const c of autos) {
      const { videos, total } = await fetchCategoryFeedVideos(c.id, excludeIds, VIDEOS_PER_SECTION);
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
