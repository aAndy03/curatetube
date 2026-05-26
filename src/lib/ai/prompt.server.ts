// Server-only: prompt builders for the four AI job types.
// Output schemas are strict JSON; gateway validates with try/catch.
import type { TaxonomySnapshot } from "./taxonomy-snapshot.server";

export type AiJobType = "categorise" | "tag_primary" | "tag_secondary" | "tag_rest";

export type VideoContext = {
  video_id: string;
  title: string;
  description: string | null;
  channel_name: string | null;
  youtube_tags: string[];
  duration_seconds: number | null;
  published_at: string | null;
  existing_categories: string[];
  existing_primary_tags: string[];
};

const BASE_SYSTEM = `You are CurateTube's metadata curator. You assign categories and tags to YouTube videos from a fixed taxonomy.

Rules:
- ONLY output results for the supplied video_id. Never invent extra videos.
- ONLY use slugs that appear verbatim in the provided taxonomy lists. Never invent new slugs.
- Output STRICT JSON matching the schema. No prose, no markdown, no commentary.
- If you are uncertain, return fewer results rather than guessing. Confidence is a float 0-1.`;

function taskSuffix(jobType: AiJobType, opts: { maxCategories: number; minSecondary: number }) {
  switch (jobType) {
    case "categorise":
      return `Task: assign up to ${opts.maxCategories} CATEGORIES.

Categories (TSV slug|name|parent_slug|depth):
{{CATEGORIES}}

Output JSON: {"video_id":"<uuid>","results":[{"slug":"<category-slug>","confidence":0.0}]}`;
    case "tag_primary":
      return `Task: assign up to 3 PRIMARY (platform) tags ranked by relevance.

Platform tags (TSV slug|name):
{{PLATFORM_TAGS}}

Output JSON: {"video_id":"<uuid>","results":[{"slug":"<tag-slug>","confidence":0.0,"rank":1}]}`;
    case "tag_secondary":
      return `Task: assign at least ${opts.minSecondary} SECONDARY tags. Prefer specific, descriptive tags.

Secondary tags (TSV slug|name):
{{SECONDARY_TAGS}}

Output JSON: {"video_id":"<uuid>","results":[{"slug":"<tag-slug>","confidence":0.0}]}`;
    case "tag_rest":
      return `Task: assign any remaining relevant SECONDARY tags not already assigned.

Secondary tags (TSV slug|name):
{{SECONDARY_TAGS}}

Output JSON: {"video_id":"<uuid>","results":[{"slug":"<tag-slug>","confidence":0.0}]}`;
  }
}

export function buildSystemPrompt(
  jobType: AiJobType,
  snapshot: TaxonomySnapshot,
  opts: { maxCategories: number; minSecondary: number },
): string {
  const suffix = taskSuffix(jobType, opts)
    .replace("{{CATEGORIES}}", snapshot.categories_compact)
    .replace("{{PLATFORM_TAGS}}", snapshot.platform_tags_compact)
    .replace("{{SECONDARY_TAGS}}", snapshot.secondary_tags_compact);
  return `${BASE_SYSTEM}\n\n${suffix}`;
}

export function buildUserMessage(ctx: VideoContext): string {
  const payload = {
    video_id: ctx.video_id,
    title: ctx.title,
    description: (ctx.description ?? "").slice(0, 500),
    channel_name: ctx.channel_name,
    youtube_tags: (ctx.youtube_tags ?? []).slice(0, 20),
    duration_seconds: ctx.duration_seconds,
    published_at: ctx.published_at,
    existing_categories: ctx.existing_categories,
    existing_primary_tags: ctx.existing_primary_tags,
  };
  return JSON.stringify(payload);
}
