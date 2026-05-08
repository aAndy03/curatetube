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

export const updateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: SectionPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("feed_sections")
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Update each row's position
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
    const { supabase } = context;
    const { error } = await supabase.from("feed_sections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------ resolve videos for one section ------

const VIDEO_FIELDS =
  "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count, creator:creators(id, title, handle, thumbnail_url)";

export const getSectionVideos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ sectionId: z.string().uuid(), offset: z.number().int().min(0).max(500).default(0) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: section, error: sErr } = await supabaseAdmin
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
      // Fetch ids that match the category, then in()
      const { data: vc } = await supabaseAdmin
        .from("video_categories")
        .select("video_id, category:categories!inner(slug)")
        .eq("category.slug", filters.categorySlug);
      const ids = (vc ?? []).map((r) => r.video_id);
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
