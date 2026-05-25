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
  direct_total: number;
  scope: "all" | "direct";
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

    const categories = (data ?? []).map((r) =>
      r.category as unknown as {
        id: string;
        slug: string;
        name: string;
        video_count: number;
        depth: number;
        parent_id: string | null;
      },
    );

    const ids = categories.map((category) => category.id);
    const { data: descendants } = ids.length
      ? await supabaseAdmin
          .from("category_ancestors")
          .select("ancestor_id, descendant_id")
          .in("ancestor_id", ids)
      : { data: [] as Array<{ ancestor_id: string; descendant_id: string }> };

    const descendantIds = Array.from(
      new Set((descendants ?? []).map((row) => row.descendant_id as string)),
    );

    const { data: descendantCats } = descendantIds.length
      ? await supabaseAdmin
          .from("categories")
          .select("id, video_count")
          .in("id", descendantIds)
      : { data: [] as Array<{ id: string; video_count: number }> };

    const directById = new Map(
      (descendantCats ?? []).map((row) => [row.id as string, Number(row.video_count ?? 0)]),
    );
    const totalByAncestor = new Map<string, number>();
    for (const row of descendants ?? []) {
      const ancestorId = row.ancestor_id as string;
      totalByAncestor.set(
        ancestorId,
        (totalByAncestor.get(ancestorId) ?? 0) + (directById.get(row.descendant_id as string) ?? 0),
      );
    }

    return {
      pinned: (data ?? []).map((r) => ({
        category: {
          ...(r.category as unknown as {
            id: string;
            slug: string;
            name: string;
            video_count: number;
            depth: number;
            parent_id: string | null;
          }),
          rollup_video_count: totalByAncestor.get((r.category as { id: string }).id) ?? 0,
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
// Reorder all pins for the current user (used by /categories pinned tracker)
export const reorderPinnedCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabase
        .from("user_category_pins")
        .update({ sort_order: i })
        .eq("user_id", userId)
        .eq("category_id", data.orderedIds[i]);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Return the parent→…→leaf chains for every category this video belongs to.
// Used by the video detail breadcrumb.
export const getVideoCategoryPaths = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: vc } = await supabaseAdmin
      .from("video_categories")
      .select("category_id")
      .eq("video_id", data.videoId);
    const leafIds = (vc ?? []).map((r) => r.category_id as string);
    if (leafIds.length === 0) return { paths: [] as Array<Array<{ id: string; slug: string; name: string }>> };

    const { data: anc } = await supabaseAdmin
      .from("category_ancestors")
      .select("ancestor_id, descendant_id, depth")
      .in("descendant_id", leafIds);

    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, slug, name")
      .in(
        "id",
        Array.from(new Set((anc ?? []).map((r) => r.ancestor_id as string))),
      );
    const catMap = new Map(
      (cats ?? []).map((c) => [c.id as string, { id: c.id as string, slug: c.slug as string, name: c.name as string }]),
    );

    const byLeaf = new Map<string, Array<{ depth: number; cat: { id: string; slug: string; name: string } }>>();
    for (const r of anc ?? []) {
      const leaf = r.descendant_id as string;
      const cat = catMap.get(r.ancestor_id as string);
      if (!cat) continue;
      const arr = byLeaf.get(leaf) ?? [];
      arr.push({ depth: r.depth as number, cat });
      byLeaf.set(leaf, arr);
    }
    const paths = leafIds.map((leaf) => {
      const arr = byLeaf.get(leaf) ?? [];
      // depth = distance from ancestor to descendant; root has highest depth.
      arr.sort((a, b) => b.depth - a.depth);
      return arr.map((x) => x.cat);
    });
    return { paths };
  });


export const getCategoryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: unknown) =>
      z
        .object({
          pinnedScope: z.enum(["all", "direct"]).optional(),
        })
        .optional()
        .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const seen = await loadOrResetDedup(userId);
    const pinnedScope = data?.pinnedScope ?? "all";

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
      const [scoped, direct] = await Promise.all([
        fetchCategoryFeedVideos(c.id, excludeIds, VIDEOS_PER_SECTION, pinnedScope === "all"),
        fetchCategoryFeedVideos(c.id, [], 0, false),
      ]);
      // Always render pinned rails, even when empty — users want to see their pin.
      for (const v of scoped.videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({
        category: c,
        pinned: true,
        videos: scoped.videos,
        total_in_category: scoped.total,
        direct_total: direct.total,
        scope: pinnedScope,
      });
    }
    for (const c of autos) {
      const { videos, total } = await fetchCategoryFeedVideos(c.id, excludeIds, VIDEOS_PER_SECTION);
      if (videos.length === 0) continue;
      for (const v of videos) {
        seen.add(v.id);
        excludeIds.push(v.id);
      }
      rails.push({
        category: c,
        pinned: false,
        videos,
        total_in_category: total,
        direct_total: total,
        scope: "all",
      });
    }

    await persistDedup(userId, seen);
    return { rails };
  });
