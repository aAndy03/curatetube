// Server-only: builds and persists compact taxonomy snapshots for AI prompts.
// TSV columns: categories -> slug|name|parent_slug|depth; tags -> slug|name
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TaxonomySnapshot = {
  id: string;
  snapshot_at: string;
  categories_compact: string;
  platform_tags_compact: string;
  secondary_tags_compact: string;
  total_categories: number;
  total_tags: number;
  category_slugs: Set<string>;
  tag_slugs: Set<string>;
};

let cached: TaxonomySnapshot | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

function tsvCategories(rows: Array<{ slug: string; name: string; depth: number; parent_slug: string | null }>) {
  return rows
    .map((r) => `${r.slug}|${r.name.replace(/\|/g, "/")}|${r.parent_slug ?? ""}|${r.depth}`)
    .join("\n");
}

function tsvTags(rows: Array<{ slug: string; name: string }>) {
  return rows.map((r) => `${r.slug}|${r.name.replace(/\|/g, "/")}`).join("\n");
}

export async function buildTaxonomySnapshot(): Promise<TaxonomySnapshot> {
  const [{ data: cats }, { data: tags }] = await Promise.all([
    supabaseAdmin
      .from("categories")
      .select("id, slug, name, depth, parent_id")
      .order("depth", { ascending: true })
      .order("slug", { ascending: true }),
    supabaseAdmin
      .from("tags")
      .select("slug, name, is_platform_tag, approved")
      .eq("approved", true)
      .order("slug", { ascending: true }),
  ]);

  const catRows = cats ?? [];
  const idToSlug = new Map(catRows.map((c) => [c.id, c.slug]));
  const compactCats = catRows.map((c) => ({
    slug: c.slug,
    name: c.name,
    depth: c.depth,
    parent_slug: c.parent_id ? idToSlug.get(c.parent_id) ?? null : null,
  }));

  const tagRows = tags ?? [];
  const platform = tagRows.filter((t) => t.is_platform_tag);
  const secondary = tagRows.filter((t) => !t.is_platform_tag);

  const categories_compact = tsvCategories(compactCats);
  const platform_tags_compact = tsvTags(platform);
  const secondary_tags_compact = tsvTags(secondary);

  // Mark prior current = false, insert new current row
  await supabaseAdmin.from("ai_taxonomy_snapshot").update({ is_current: false }).eq("is_current", true);
  const { data: inserted, error } = await supabaseAdmin
    .from("ai_taxonomy_snapshot")
    .insert({
      categories_compact,
      platform_tags_compact,
      secondary_tags_compact,
      total_categories: compactCats.length,
      total_tags: tagRows.length,
      is_current: true,
    })
    .select("id, snapshot_at")
    .single();
  if (error || !inserted) throw new Error(`snapshot insert failed: ${error?.message ?? "unknown"}`);

  const snap: TaxonomySnapshot = {
    id: inserted.id,
    snapshot_at: inserted.snapshot_at,
    categories_compact,
    platform_tags_compact,
    secondary_tags_compact,
    total_categories: compactCats.length,
    total_tags: tagRows.length,
    category_slugs: new Set(compactCats.map((c) => c.slug)),
    tag_slugs: new Set(tagRows.map((t) => t.slug)),
  };
  cached = snap;
  cachedAt = Date.now();
  return snap;
}

export async function getCurrentSnapshot(force = false): Promise<TaxonomySnapshot> {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const { data: row } = await supabaseAdmin
    .from("ai_taxonomy_snapshot")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();

  if (!row) return buildTaxonomySnapshot();

  // Reconstruct slug sets from the compact TSV (first column is slug).
  const catSlugs = new Set(
    row.categories_compact.split("\n").map((l) => l.split("|")[0]).filter(Boolean),
  );
  const platSlugs = row.platform_tags_compact.split("\n").map((l) => l.split("|")[0]).filter(Boolean);
  const secSlugs = row.secondary_tags_compact.split("\n").map((l) => l.split("|")[0]).filter(Boolean);

  cached = {
    id: row.id,
    snapshot_at: row.snapshot_at,
    categories_compact: row.categories_compact,
    platform_tags_compact: row.platform_tags_compact,
    secondary_tags_compact: row.secondary_tags_compact,
    total_categories: row.total_categories,
    total_tags: row.total_tags,
    category_slugs: catSlugs,
    tag_slugs: new Set([...platSlugs, ...secSlugs]),
  };
  cachedAt = Date.now();
  return cached;
}

export function invalidateSnapshotCache() {
  cached = null;
  cachedAt = 0;
}
