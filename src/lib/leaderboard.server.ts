// Snapshot engine: builds an immutable leaderboard snapshot for a tier+scope.
// Score formula (desktop-first, transparent):
//   score = suggest_count * 3 + submission_count * 1 + recency_boost
// where recency_boost = max(0, 14 - days_since_first_submitted) * 0.5
// Only approved videos count.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RebuildResult = {
  tierSlug: string;
  scopeType: string;
  scopeValue: string | null;
  snapshotId: string;
  size: number;
};

type Scope = {
  scopeType: "global" | "category" | "language" | "creator";
  scopeValue: string | null;
};

async function getPrevRanks(
  tierId: string,
  scope: Scope,
): Promise<Map<string, number>> {
  let q = supabaseAdmin
    .from("leaderboard_snapshots")
    .select("id")
    .eq("tier_id", tierId)
    .eq("scope_type", scope.scopeType);
  q = scope.scopeValue ? q.eq("scope_value", scope.scopeValue) : q.is("scope_value", null);
  const { data: prev } = await q
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return new Map();
  const { data: rows } = await supabaseAdmin
    .from("leaderboard_entries")
    .select("rank, video_id")
    .eq("snapshot_id", prev.id);
  return new Map((rows ?? []).map((r) => [r.video_id, r.rank]));
}

export async function rebuildSnapshot(
  tierSlug: string,
  scope: Scope = { scopeType: "global", scopeValue: null },
): Promise<RebuildResult | null> {
  const { data: tier } = await supabaseAdmin
    .from("leaderboard_tiers")
    .select("id, slug, size, refresh_minutes, enabled")
    .eq("slug", tierSlug)
    .maybeSingle();
  if (!tier || !tier.enabled) return null;

  // Fetch candidate videos (approved). For category/language/creator, filter.
  let videoQ = supabaseAdmin
    .from("videos")
    .select(
      "id, suggest_count, submission_count, first_submitted_at, language, creator_id",
    )
    .eq("status", "approved");
  if (scope.scopeType === "language" && scope.scopeValue) {
    videoQ = videoQ.eq("language", scope.scopeValue);
  }
  if (scope.scopeType === "creator" && scope.scopeValue) {
    videoQ = videoQ.eq("creator_id", scope.scopeValue);
  }
  // Pull a reasonable working set, then trim to tier size after scoring.
  const workingSize = Math.max(tier.size * 4, 200);
  const { data: vids, error: vErr } = await videoQ
    .order("suggest_count", { ascending: false })
    .limit(workingSize);
  if (vErr) throw new Error(vErr.message);

  let candidates = vids ?? [];

  // Category filter (uses join table)
  if (scope.scopeType === "category" && scope.scopeValue && candidates.length) {
    const ids = candidates.map((v) => v.id);
    const { data: vc } = await supabaseAdmin
      .from("video_categories")
      .select("video_id, category:categories(slug)")
      .in("video_id", ids);
    const allow = new Set(
      (vc ?? [])
        .filter((r) => (r.category as { slug?: string } | null)?.slug === scope.scopeValue)
        .map((r) => r.video_id),
    );
    candidates = candidates.filter((v) => allow.has(v.id));
  }

  const now = Date.now();
  const scored = candidates.map((v) => {
    const days =
      (now - new Date(v.first_submitted_at).getTime()) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 14 - days) * 0.5;
    const score =
      (v.suggest_count ?? 0) * 3 + (v.submission_count ?? 0) * 1 + recency;
    return { id: v.id, score, suggest: v.suggest_count ?? 0, sub: v.submission_count ?? 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, tier.size);

  const prevRanks = await getPrevRanks(tier.id, scope);

  // Create snapshot
  const nextRefresh = new Date(now + tier.refresh_minutes * 60_000).toISOString();
  const { data: snap, error: sErr } = await supabaseAdmin
    .from("leaderboard_snapshots")
    .insert({
      tier_id: tier.id,
      scope_type: scope.scopeType,
      scope_value: scope.scopeValue,
      next_refresh_at: nextRefresh,
    })
    .select("id")
    .single();
  if (sErr) throw new Error(sErr.message);

  if (top.length) {
    const rows = top.map((t, i) => ({
      snapshot_id: snap.id,
      rank: i + 1,
      video_id: t.id,
      score: t.score,
      suggest_count: t.suggest,
      submission_count: t.sub,
      prev_rank: prevRanks.get(t.id) ?? null,
    }));
    const { error: eErr } = await supabaseAdmin.from("leaderboard_entries").insert(rows);
    if (eErr) throw new Error(eErr.message);
  }

  return {
    tierSlug: tier.slug,
    scopeType: scope.scopeType,
    scopeValue: scope.scopeValue,
    snapshotId: snap.id,
    size: top.length,
  };
}

export async function rebuildAllDueGlobal(): Promise<RebuildResult[]> {
  const { data: tiers } = await supabaseAdmin
    .from("leaderboard_tiers")
    .select("slug, refresh_minutes, enabled")
    .eq("enabled", true);
  const results: RebuildResult[] = [];
  for (const t of tiers ?? []) {
    // Check the latest global snapshot freshness
    const { data: latest } = await supabaseAdmin
      .from("leaderboard_snapshots")
      .select("next_refresh_at, tier:leaderboard_tiers!inner(slug)")
      .eq("tier.slug", t.slug)
      .eq("scope_type", "global")
      .is("scope_value", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const due = !latest || new Date(latest.next_refresh_at).getTime() <= Date.now();
    if (due) {
      const r = await rebuildSnapshot(t.slug, { scopeType: "global", scopeValue: null });
      if (r) results.push(r);
    }
  }
  return results;
}
