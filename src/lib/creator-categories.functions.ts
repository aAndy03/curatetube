// Phase 9 — Creators-by-category view (v0.4.8).
// Reads mv_creator_categories (daily refresh) and returns one group per
// top-level category. Creators repeat across categories — by design.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE = new Headers({
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
});

export type CreatorInCategory = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  videos_in_category: number;
};

export type CreatorCategoryGroup = {
  category: { id: string; slug: string; name: string };
  creators: CreatorInCategory[];
};

export const listCreatorsByCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { perCategory?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    setResponseHeaders(CACHE);
    const perCategory = Math.min(data.perCategory ?? 24, 60);

    const { data: rows, error } = await supabaseAdmin
      .from("mv_creator_categories" as never)
      .select(
        "category_id, category_slug, category_name, category_sort_order, creator_id, creator_title, creator_handle, creator_thumbnail_url, subscriber_count, videos_in_category",
      )
      .order("category_sort_order", { ascending: true })
      .order("category_name", { ascending: true })
      .order("videos_in_category", { ascending: false });
    if (error) throw new Error(error.message);

    type Row = {
      category_id: string;
      category_slug: string;
      category_name: string;
      creator_id: string;
      creator_title: string;
      creator_handle: string | null;
      creator_thumbnail_url: string | null;
      subscriber_count: number | null;
      videos_in_category: number;
    };

    const groups = new Map<string, CreatorCategoryGroup>();
    for (const r of (rows ?? []) as unknown as Row[]) {
      let g = groups.get(r.category_id);
      if (!g) {
        g = {
          category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
          creators: [],
        };
        groups.set(r.category_id, g);
      }
      if (g.creators.length < perCategory) {
        g.creators.push({
          id: r.creator_id,
          title: r.creator_title,
          handle: r.creator_handle,
          thumbnail_url: r.creator_thumbnail_url,
          subscriber_count: r.subscriber_count,
          videos_in_category: Number(r.videos_in_category ?? 0),
        });
      }
    }
    return { groups: Array.from(groups.values()) };
  });
