import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE = {
  "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
};

export const getLandingData = createServerFn({ method: "GET" }).handler(
  async () => {
    setResponseHeaders(CACHE);

    // Featured videos — top 6 from suggested feed.
    const { data: ranked } = await supabaseAdmin
      .from("mv_suggested_feed" as never)
      .select("video_id")
      .order("suggest_count", { ascending: false })
      .order("first_submitted_at", { ascending: false })
      .range(0, 5);

    const ids = ((ranked ?? []) as Array<{ video_id: string }>).map(
      (r) => r.video_id,
    );

    let videos: Array<{
      id: string;
      youtube_id: string;
      title: string;
      thumbnail_url: string | null;
    }> = [];
    if (ids.length) {
      const { data: rows } = await supabaseAdmin
        .from("videos")
        .select("id, youtube_id, title, thumbnail_url")
        .in("id", ids);
      const byId = new Map((rows ?? []).map((v) => [v.id as string, v]));
      videos = ids
        .map((id) => byId.get(id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .map((v) => ({
          id: v.id as string,
          youtube_id: v.youtube_id as string,
          title: v.title as string,
          thumbnail_url: (v.thumbnail_url as string | null) ?? null,
        }));
    }

    const [{ count: videoCount }, { count: categoryCount }, { count: contribCount }] =
      await Promise.all([
        supabaseAdmin
          .from("videos")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        supabaseAdmin
          .from("categories")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("audit_privacy_mode", "public")
          .is("deleted_at", null),
      ]);

    return {
      videos,
      stats: {
        videos: videoCount ?? 0,
        categories: categoryCount ?? 0,
        contributors: contribCount ?? 0,
      },
    };
  },
);
