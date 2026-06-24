import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SEARCH_CACHE = new Headers({
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
});

export type SearchVideoHit = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  creator_id: string | null;
  creator_title: string | null;
  suggest_count: number;
  sim: number;
};

export type SearchCreatorHit = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail_url: string | null;
  video_count: number;
  sim: number;
};

export type SearchTagHit = {
  id: string;
  slug: string;
  name: string;
  is_platform_tag: boolean;
  sim: number;
};

const Input = z.object({
  q: z.string().trim().min(2).max(80),
  videoLimit: z.number().int().min(1).max(48).optional(),
  creatorLimit: z.number().int().min(1).max(24).optional(),
  tagLimit: z.number().int().min(1).max(24).optional(),
});

/**
 * Fuzzy search across approved videos, creators and tags using
 * pg_trgm similarity ranking (see migration `search_videos` /
 * `search_creators` / `search_tags`). Public — no auth required.
 */
export const searchAll = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    setResponseHeaders(SEARCH_CACHE);
    const q = data.q;
    const videoLimit = data.videoLimit ?? 12;
    const creatorLimit = data.creatorLimit ?? 6;
    const tagLimit = data.tagLimit ?? 8;

    const [vRes, cRes, tRes] = await Promise.all([
      supabaseAdmin.rpc("search_videos" as never, { q, lim: videoLimit } as never),
      supabaseAdmin.rpc("search_creators" as never, { q, lim: creatorLimit } as never),
      supabaseAdmin.rpc("search_tags" as never, { q, lim: tagLimit } as never),
    ]);
    if (vRes.error) throw new Error(vRes.error.message);
    if (cRes.error) throw new Error(cRes.error.message);
    if (tRes.error) throw new Error(tRes.error.message);

    return {
      q,
      videos: (vRes.data ?? []) as SearchVideoHit[],
      creators: (cRes.data ?? []) as SearchCreatorHit[],
      tags: (tRes.data ?? []) as SearchTagHit[],
    };
  });
