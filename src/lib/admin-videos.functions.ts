import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

async function requirePerm(userId: string, key: string) {
  const { data } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: key,
  });
  if (!data) throw new Error(`Missing permission: ${key}`);
}

// ============ LIST (filters + pagination) ============
const ListInput = z.object({
  q: z.string().max(200).optional(),
  category_id: z.string().uuid().nullable().optional(),
  uncategorized: z.boolean().optional(),
  tag_id: z.string().uuid().nullable().optional(),
  creator_id: z.string().uuid().nullable().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  has_primary_tags: z.boolean().optional(),
  page: z.number().int().min(0).max(2000).default(0),
  page_size: z.number().int().min(1).max(100).default(50),
});

export type AdminVideoRow = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  approved_at: string | null;
  status: string;
  submission_count: number;
  suggest_count: number;
  primary_tag_ids: string[];
  creator: { id: string; title: string } | null;
  category_ids: string[];
  tag_total: number;
};

export const listAdminVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const from = data.page * data.page_size;
    const to = from + data.page_size - 1;

    let q = supabaseAdmin
      .from("videos")
      .select(
        "id, title, thumbnail_url, published_at, status, submission_count, suggest_count, primary_tag_ids, creator:creators(id, title)",
        { count: "exact" },
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.creator_id) q = q.eq("creator_id", data.creator_id);
    if (data.date_from) q = q.gte("published_at", data.date_from);
    if (data.date_to) q = q.lte("published_at", data.date_to);
    if (data.has_primary_tags === true) {
      q = q.not("primary_tag_ids", "eq", [] as unknown as string[]);
    } else if (data.has_primary_tags === false) {
      q = q.eq("primary_tag_ids", [] as unknown as string[]);
    }

    // Category filter via descendants
    if (data.category_id) {
      const { data: descs } = await supabaseAdmin
        .from("category_ancestors")
        .select("descendant_id")
        .eq("ancestor_id", data.category_id);
      const ids = (descs ?? []).map((d) => d.descendant_id);
      if (ids.length === 0) return { rows: [], total: 0 };
      const { data: vcs } = await supabaseAdmin
        .from("video_categories")
        .select("video_id")
        .in("category_id", ids);
      const videoIds = Array.from(new Set((vcs ?? []).map((v) => v.video_id)));
      if (videoIds.length === 0) return { rows: [], total: 0 };
      q = q.in("id", videoIds);
    } else if (data.uncategorized) {
      const { data: assigned } = await supabaseAdmin
        .from("video_categories")
        .select("video_id");
      const assignedIds = Array.from(
        new Set((assigned ?? []).map((v) => v.video_id)),
      );
      if (assignedIds.length) q = q.not("id", "in", `(${assignedIds.join(",")})`);
    }
    if (data.tag_id) {
      const { data: vts } = await supabaseAdmin
        .from("video_tags")
        .select("video_id")
        .eq("tag_id", data.tag_id);
      const tagVideoIds = Array.from(new Set((vts ?? []).map((v) => v.video_id)));
      if (tagVideoIds.length === 0) return { rows: [], total: 0 };
      q = q.in("id", tagVideoIds);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let catMap = new Map<string, string[]>();
    let tagCounts = new Map<string, number>();
    if (ids.length) {
      const [{ data: cats }, { data: tags }] = await Promise.all([
        supabaseAdmin
          .from("video_categories")
          .select("video_id, category_id")
          .in("video_id", ids),
        supabaseAdmin
          .from("video_tags")
          .select("video_id")
          .in("video_id", ids),
      ]);
      for (const c of cats ?? []) {
        const list = catMap.get(c.video_id) ?? [];
        list.push(c.category_id);
        catMap.set(c.video_id, list);
      }
      for (const t of tags ?? []) {
        tagCounts.set(t.video_id, (tagCounts.get(t.video_id) ?? 0) + 1);
      }
    }

    return {
      rows: (rows ?? []).map<AdminVideoRow>((r) => ({
        id: r.id,
        title: r.title,
        thumbnail_url: r.thumbnail_url,
        approved_at: r.published_at,
        status: r.status,
        submission_count: r.submission_count,
        suggest_count: r.suggest_count,
        primary_tag_ids: r.primary_tag_ids ?? [],
        creator: r.creator
          ? { id: r.creator.id, title: r.creator.title }
          : null,
        category_ids: catMap.get(r.id) ?? [],
        tag_total: tagCounts.get(r.id) ?? 0,
      })),
      total: count ?? 0,
    };
  });

// ============ READ ALL TAGS (cached client-side) ============
export const listAllTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "library.manage");
    const { data, error } = await supabaseAdmin
      .from("tags")
      .select("id, name, slug, source, tier, is_platform_tag, usage_count")
      .order("source")
      .order("name")
      .limit(50000);
    if (error) throw new Error(error.message);
    return { tags: data ?? [] };
  });

// ============ TAGS FOR ONE VIDEO ============
export const listVideoTagAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { video_id: string }) =>
    z.object({ video_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { data: rows, error } = await supabaseAdmin
      .from("video_tags")
      .select("tag_id, rank, assigned_by")
      .eq("video_id", data.video_id)
      .order("rank");
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============ MUTATIONS: categories ============
const VideoCategoryInput = z.object({
  video_id: z.string().uuid(),
  category_id: z.string().uuid(),
});

export const addVideoCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin.from("video_categories").insert({
      video_id: data.video_id,
      category_id: data.category_id,
      assigned_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "video.category_add",
      targetType: "video",
      targetId: data.video_id,
      after: { category_id: data.category_id },
      visibility: "staff",
    });
    return { ok: true };
  });

export const removeVideoCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin
      .from("video_categories")
      .delete()
      .eq("video_id", data.video_id)
      .eq("category_id", data.category_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ MUTATIONS: tags ============
const VideoTagInput = z.object({
  video_id: z.string().uuid(),
  tag_id: z.string().uuid(),
});

export const addVideoTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoTagInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    // auto-rank = max + 1
    const { data: ranks } = await supabaseAdmin
      .from("video_tags")
      .select("rank")
      .eq("video_id", data.video_id)
      .order("rank", { ascending: false })
      .limit(1);
    const nextRank = ((ranks?.[0]?.rank as number | undefined) ?? 0) + 1;
    const { error } = await supabaseAdmin.from("video_tags").insert({
      video_id: data.video_id,
      tag_id: data.tag_id,
      rank: nextRank,
      assigned_by: "admin",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeVideoTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoTagInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    const { error } = await supabaseAdmin
      .from("video_tags")
      .delete()
      .eq("video_id", data.video_id)
      .eq("tag_id", data.tag_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ BATCH ============
const BatchInput = z.object({
  video_ids: z.array(z.string().uuid()).min(1).max(50),
  category_id: z.string().uuid().optional(),
  tag_id: z.string().uuid().optional(),
  op: z.enum(["add_category", "remove_category", "add_tag"]),
});

export const batchUpdateVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "library.manage");
    let ok = 0;
    let skipped = 0;
    for (const vid of data.video_ids) {
      try {
        if (data.op === "add_category" && data.category_id) {
          const { error } = await supabaseAdmin.from("video_categories").insert({
            video_id: vid,
            category_id: data.category_id,
            assigned_by: context.userId,
          });
          if (error) skipped++;
          else ok++;
        } else if (data.op === "remove_category" && data.category_id) {
          const { error } = await supabaseAdmin
            .from("video_categories")
            .delete()
            .eq("video_id", vid)
            .eq("category_id", data.category_id);
          if (error) skipped++;
          else ok++;
        } else if (data.op === "add_tag" && data.tag_id) {
          const { data: ranks } = await supabaseAdmin
            .from("video_tags")
            .select("rank")
            .eq("video_id", vid)
            .order("rank", { ascending: false })
            .limit(1);
          const nextRank = ((ranks?.[0]?.rank as number | undefined) ?? 0) + 1;
          const { error } = await supabaseAdmin.from("video_tags").insert({
            video_id: vid,
            tag_id: data.tag_id,
            rank: nextRank,
            assigned_by: "admin",
          });
          if (error) skipped++;
          else ok++;
        }
      } catch {
        skipped++;
      }
    }
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "video.batch_update",
      after: { op: data.op, count: data.video_ids.length, ok, skipped },
      visibility: "staff",
    });
    return { ok, skipped };
  });
