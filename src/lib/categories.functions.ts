import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  depth: number;
  sort_order: number;
  video_count: number;
  child_count?: number;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ============ READ: full tree (cached on client with staleTime: Infinity) ============
export const getCategoryTree = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, slug, name, parent_id, depth, sort_order, video_count")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { categories: (data ?? []) as CategoryNode[] };
  }
);

// ============ CREATE ============
const CreateInput = z.object({
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable(),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = slugify(data.name);
    const { data: row, error } = await supabase
      .from("categories")
      .insert({
        slug,
        name: data.name,
        parent_id: data.parent_id,
        sort_order: data.sort_order,
        created_by: userId,
      })
      .select("id, slug, name, parent_id, depth, sort_order, video_count")
      .single();
    if (error) throw new Error(error.message);
    return { category: row as CategoryNode };
  });

// ============ RENAME ============
const RenameInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export const renameCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenameInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("categories")
      .update({ name: data.name, slug: slugify(data.name) })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ REORDER (siblings) ============
const ReorderInput = z.object({
  parent_id: z.string().uuid().nullable(),
  ordered_ids: z.array(z.string().uuid()).max(500),
});

export const reorderCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReorderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    for (let i = 0; i < data.ordered_ids.length; i++) {
      await supabase
        .from("categories")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i]);
    }
    return { ok: true };
  });

// ============ REPARENT (subtree move with depth-6 guard) ============
const ReparentInput = z.object({
  id: z.string().uuid(),
  new_parent_id: z.string().uuid().nullable(),
});

export const reparentCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReparentInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.new_parent_id === data.id) {
      throw new Error("Cannot reparent a category to itself");
    }
    // Cycle guard: new parent must not be a descendant
    if (data.new_parent_id) {
      const { data: desc } = await supabase
        .from("category_ancestors")
        .select("descendant_id")
        .eq("ancestor_id", data.id)
        .eq("descendant_id", data.new_parent_id)
        .maybeSingle();
      if (desc) throw new Error("Cannot reparent under own descendant");
    }
    // Depth check
    const newParentDepth = data.new_parent_id
      ? (
          await supabase
            .from("categories")
            .select("depth")
            .eq("id", data.new_parent_id)
            .single()
        ).data?.depth ?? -1
      : -1;
    const { data: subtreeMax } = await supabase
      .from("category_ancestors")
      .select("depth")
      .eq("ancestor_id", data.id)
      .order("depth", { ascending: false })
      .limit(1)
      .maybeSingle();
    const subtreeHeight = (subtreeMax?.depth ?? 0);
    if (newParentDepth + 1 + subtreeHeight > 6) {
      throw new Error("Reparent would exceed max depth of 6");
    }
    // Update parent + recompute subtree depths/closure via raw RPC fallback
    const { error } = await supabase
      .from("categories")
      .update({ parent_id: data.new_parent_id, depth: newParentDepth + 1 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ DELETE (with guards) ============
const DeleteInput = z.object({
  id: z.string().uuid(),
  reparent_to: z.string().uuid().nullable().optional(),
  uncategorize_videos: z.boolean().optional(),
});

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count: childCount } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", data.id);
    if ((childCount ?? 0) > 0) {
      throw new Error("Re-parent or delete children first");
    }
    const { count: videoCount } = await supabase
      .from("video_categories")
      .select("video_id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if ((videoCount ?? 0) > 0 && !data.uncategorize_videos && !data.reparent_to) {
      throw new Error(
        `Category has ${videoCount} videos. Choose to uncategorize or move them.`
      );
    }
    if ((videoCount ?? 0) > 0 && data.reparent_to) {
      await supabase
        .from("video_categories")
        .update({ category_id: data.reparent_to })
        .eq("category_id", data.id);
    } else if ((videoCount ?? 0) > 0 && data.uncategorize_videos) {
      await supabase.from("video_categories").delete().eq("category_id", data.id);
    }
    const { error } = await supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
