import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rebuildSnapshot } from "./leaderboard.server";

export const rebuildSnapshotNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tierSlug: z.string().min(1).max(40),
        scopeType: z.enum(["global", "category", "language", "creator"]).default("global"),
        scopeValue: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await supabaseAdmin.rpc("has_permission", {
      _user_id: context.userId,
      _key: "leaderboard.manage",
    });
    if (!ok) throw new Error("Forbidden");
    const r = await rebuildSnapshot(data.tierSlug, {
      scopeType: data.scopeType,
      scopeValue: data.scopeValue ?? null,
    });
    return { result: r };
  });

export type LeaderboardEntry = {
  rank: number;
  prev_rank: number | null;
  score: number;
  suggest_count: number;
  submission_count: number;
  video: {
    id: string;
    youtube_id: string;
    title: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    creator: { id: string; title: string; handle: string | null } | null;
  } | null;
};

const ScopeSchema = z.object({
  tierSlug: z.string().min(1).max(40).default("top10"),
  scopeType: z.enum(["global", "category", "language", "creator"]).default("global"),
  scopeValue: z.string().max(200).optional().nullable(),
});

export const listTiers = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("leaderboard_tiers")
    .select("id, slug, name, size, refresh_minutes, sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { tiers: data ?? [] };
});

export const getCurrentLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ScopeSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { data: tier } = await supabaseAdmin
      .from("leaderboard_tiers")
      .select("id, slug, name, size, refresh_minutes")
      .eq("slug", data.tierSlug)
      .maybeSingle();
    if (!tier) return { tier: null, snapshot: null, entries: [] as LeaderboardEntry[] };

    let snapQ = supabaseAdmin
      .from("leaderboard_snapshots")
      .select("id, created_at, next_refresh_at, scope_type, scope_value")
      .eq("tier_id", tier.id)
      .eq("scope_type", data.scopeType);
    snapQ = data.scopeValue ? snapQ.eq("scope_value", data.scopeValue) : snapQ.is("scope_value", null);
    const { data: snap } = await snapQ
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snap) return { tier, snapshot: null, entries: [] as LeaderboardEntry[] };

    const { data: entries } = await supabaseAdmin
      .from("leaderboard_entries")
      .select(
        "rank, prev_rank, score, suggest_count, submission_count, video:videos(id, youtube_id, title, thumbnail_url, duration_seconds, primary_tag_ids, creator:creators(id, title, handle))",
      )
      .eq("snapshot_id", snap.id)
      .order("rank", { ascending: true });

    return { tier, snapshot: snap, entries: (entries ?? []) as unknown as LeaderboardEntry[] };
  });

export const listArchive = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tierSlug: z.string().min(1).max(40),
        scopeType: z.enum(["global", "category", "language", "creator"]).default("global"),
        scopeValue: z.string().max(200).optional().nullable(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(60).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: tier } = await supabaseAdmin
      .from("leaderboard_tiers")
      .select("id, slug, name, size")
      .eq("slug", data.tierSlug)
      .maybeSingle();
    if (!tier) return { tier: null, snapshots: [] };

    let q = supabaseAdmin
      .from("leaderboard_snapshots")
      .select("id, created_at, next_refresh_at, scope_type, scope_value")
      .eq("tier_id", tier.id)
      .eq("scope_type", data.scopeType);
    q = data.scopeValue ? q.eq("scope_value", data.scopeValue) : q.is("scope_value", null);
    q = q.order("created_at", { ascending: false }).limit(data.limit);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: snaps, error } = await q;
    if (error) throw new Error(error.message);
    return { tier, snapshots: snaps ?? [] };
  });

export const getSnapshotEntries = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: entries, error } = await supabaseAdmin
      .from("leaderboard_entries")
      .select(
        "rank, prev_rank, score, suggest_count, submission_count, video:videos(id, youtube_id, title, thumbnail_url, duration_seconds, primary_tag_ids, creator:creators(id, title, handle))",
      )
      .eq("snapshot_id", data.snapshotId)
      .order("rank", { ascending: true });
    if (error) throw new Error(error.message);
    return { entries: (entries ?? []) as unknown as LeaderboardEntry[] };
  });
