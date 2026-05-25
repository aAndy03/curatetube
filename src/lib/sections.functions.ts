import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export type FeedSection = {
  id: string;
  owner_id: string | null;
  template_id: string | null;
  name: string;
  source: string;
  filters: Json;
  sort: string;
  layout: "grid" | "row" | "compact";
  size: number;
  refresh_minutes: number;
  position: number;
  is_template: boolean;
  enabled: boolean;
};

export type SectionVideo = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  creator: { id: string; title: string; handle: string | null; thumbnail_url: string | null } | null;
};

const SectionPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  source: z
    .enum([
      "latest_approved",
      "top_suggested",
      "top_submitted",
      "recent_in_category",
      "by_creator",
      "leaderboard_tier",
      "random_pick",
    ])
    .optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort: z.enum(["recent", "suggest", "submission", "random", "rank"]).optional(),
  layout: z.enum(["grid", "row", "compact"]).optional(),
  size: z.number().int().min(1).max(60).optional(),
  refresh_minutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
});

// ------ list sections ------

export const listMySections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [own, templates] = await Promise.all([
      supabase
        .from("feed_sections")
        .select("*")
        .eq("owner_id", userId)
        .order("position", { ascending: true }),
      supabase
        .from("feed_sections")
        .select("*")
        .eq("is_template", true)
        .order("position", { ascending: true }),
    ]);
    if (own.error) throw new Error(own.error.message);
    if (templates.error) throw new Error(templates.error.message);
    return {
      sections: (own.data ?? []) as unknown as FeedSection[],
      templates: (templates.data ?? []) as unknown as FeedSection[],
    };
  });

// ------ adopt template ------

export const adoptTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ templateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl, error } = await supabase
      .from("feed_sections")
      .select("*")
      .eq("id", data.templateId)
      .eq("is_template", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Template not found");

    const { count } = await supabase
      .from("feed_sections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);

    const { data: created, error: insErr } = await supabase
      .from("feed_sections")
      .insert({
        owner_id: userId,
        template_id: tpl.id,
        name: tpl.name,
        source: tpl.source,
        filters: tpl.filters as never,
        sort: tpl.sort,
        layout: tpl.layout,
        size: tpl.size,
        refresh_minutes: tpl.refresh_minutes,
        cycle: tpl.cycle as never,
        position: count ?? 0,
        is_template: false,
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { section: created as unknown as FeedSection };
  });

// ------ update / reorder / delete ------

// Plan-4 buffer: keep user_category_pins in sync with sections that were
// seeded by pinning. If the user changes source away from recent_in_category,
// or repoints categorySlug to a different category, the old pin is removed
// and (when applicable) the new one is created.
async function syncPinFromSection(
  userId: string,
  before: { source: string; filters: Record<string, unknown> | null },
  after: { source: string; filters: Record<string, unknown> | null },
): Promise<void> {
  const beforePinId = (before.filters?.pin_category_id as string | undefined) ?? null;
  const afterCategorySlug =
    after.source === "recent_in_category"
      ? ((after.filters?.categorySlug as string | undefined) ?? null)
      : null;

  let afterCatId: string | null = null;
  if (afterCategorySlug) {
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("slug", afterCategorySlug)
      .maybeSingle();
    if (cat) afterCatId = cat.id as string;
  }

  if (beforePinId && beforePinId !== afterCatId) {
    await supabaseAdmin
      .from("user_category_pins")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", beforePinId);
  }

  if (afterCatId && afterCatId !== beforePinId) {
    const { count } = await supabaseAdmin
      .from("user_category_pins")
      .select("category_id", { count: "exact", head: true })
      .eq("user_id", userId);
    await supabaseAdmin
      .from("user_category_pins")
      .upsert(
        { user_id: userId, category_id: afterCatId, sort_order: count ?? 0 },
        { onConflict: "user_id,category_id" },
      );
  }
}

export const updateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: SectionPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabaseAdmin
      .from("feed_sections")
      .select("source, filters")
      .eq("id", data.id)
      .maybeSingle();

    const patch: Record<string, unknown> = { ...data.patch };
    if (patch.filters || patch.source) {
      const beforeFilters = (before?.filters as Record<string, unknown> | null) ?? {};
      const patchFilters = (patch.filters as Record<string, unknown> | undefined) ?? {};
      const mergedFilters: Record<string, unknown> = { ...beforeFilters, ...patchFilters };
      const nextSource = (patch.source as string | undefined) ?? (before?.source as string);
      if (nextSource !== "recent_in_category") {
        delete mergedFilters.pin_category_id;
        delete mergedFilters.categorySlug;
      } else {
        const beforeSlug = beforeFilters.categorySlug;
        if (mergedFilters.categorySlug !== beforeSlug) {
          delete mergedFilters.pin_category_id;
        }
      }
      patch.filters = mergedFilters;
    }

    const { error } = await supabase
      .from("feed_sections")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (before) {
      await syncPinFromSection(
        userId,
        {
          source: before.source as string,
          filters: (before.filters as Record<string, unknown> | null) ?? null,
        },
        {
          source: (patch.source as string | undefined) ?? (before.source as string),
          filters: (patch.filters as Record<string, unknown> | undefined) ?? null,
        },
      );
    }
    return { ok: true };
  });

export const reorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    for (let i = 0; i < data.orderedIds.length; i++) {
      const id = data.orderedIds[i];
      const { error } = await supabase
        .from("feed_sections")
        .update({ position: i })
        .eq("id", id)
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabaseAdmin
      .from("feed_sections")
      .select("filters")
      .eq("id", data.id)
      .maybeSingle();
    const pinId = (before?.filters as Record<string, unknown> | null)?.pin_category_id as
      | string
      | undefined;
    const { error } = await supabase.from("feed_sections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (pinId) {
      await supabaseAdmin
        .from("user_category_pins")
        .delete()
        .eq("user_id", userId)
        .eq("category_id", pinId);
    }
    return { ok: true };
  });

// ------ resolve videos for one section ------

const VIDEO_FIELDS =
  "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title, handle, thumbnail_url)";

export const getSectionVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sectionId: z.string().uuid(), offset: z.number().int().min(0).max(500).default(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Use the user-scoped client so RLS (fs_select_own_or_template) gates access
    // to private sections owned by other users.
    const { data: section, error: sErr } = await context.supabase
      .from("feed_sections")
      .select("*")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!section) return { videos: [] as SectionVideo[] };

    const filters = (section.filters ?? {}) as Record<string, unknown>;
    let q = supabaseAdmin.from("videos").select(VIDEO_FIELDS).eq("status", "approved");

    // Source-based filter
    if (section.source === "by_creator" && typeof filters.creatorId === "string") {
      q = q.eq("creator_id", filters.creatorId);
    }
    if (section.source === "recent_in_category" && typeof filters.categorySlug === "string") {
      const includeDescendants = filters.includeDescendants !== false;
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", filters.categorySlug)
        .maybeSingle();
      if (!cat) return { videos: [] as SectionVideo[] };

      const catIds = includeDescendants
        ? (
            (
              await supabaseAdmin
                .from("category_ancestors")
                .select("descendant_id")
                .eq("ancestor_id", cat.id as string)
            ).data ?? []
          ).map((r) => r.descendant_id as string)
        : [cat.id as string];
      if (catIds.length === 0) return { videos: [] as SectionVideo[] };

      const { data: vc } = await supabaseAdmin
        .from("video_categories")
        .select("video_id")
        .in("category_id", catIds);
      const ids = Array.from(new Set((vc ?? []).map((r) => r.video_id as string)));
      if (ids.length === 0) return { videos: [] as SectionVideo[] };
      q = q.in("id", ids);
    }
    if (typeof filters.language === "string") {
      q = q.eq("language", filters.language);
    }

    // Sort
    switch (section.sort) {
      case "suggest":
        q = q.order("suggest_count", { ascending: false }).order("first_submitted_at", { ascending: false });
        break;
      case "submission":
        q = q.order("submission_count", { ascending: false }).order("first_submitted_at", { ascending: false });
        break;
      case "recent":
      default:
        q = q.order("first_submitted_at", { ascending: false });
        break;
    }

    const start = data.offset;
    const end = start + section.size - 1;
    const { data: rows, error } = await q.range(start, end);
    if (error) throw new Error(error.message);

    let videos = (rows ?? []) as unknown as SectionVideo[];
    if (section.sort === "random") {
      videos = [...videos].sort(() => Math.random() - 0.5);
    }
    return { videos };
  });
