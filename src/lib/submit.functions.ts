// Phase 5 — Submit quota + per-URL suggestion server fns (v0.4.4)
// Reads `app_settings.submit_limit_default`, enforces a 7-day rolling window,
// and provides keyword-based category/primary-tag suggestions for each URL
// so the SubmitSheet can prefill chips before the user hits Submit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractYouTubeId, fetchVideos } from "./youtube.server";

// ============ QUOTA ============

type SubmitLimitConfig = {
  default: number;
  per_role?: Record<string, number>;
};

export type SubmitQuota = {
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** ISO; null when unlimited or no recent submissions. */
  resets_at: string | null;
  window_days: number;
};

const WINDOW_MS = 7 * 24 * 3600 * 1000;

export const getSubmitQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubmitQuota> => {
    const { userId } = context;

    const [{ data: setting }, { data: rolesRows }] = await Promise.all([
      supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "submit_limit_default")
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role:roles(name)")
        .eq("user_id", userId),
    ]);

    const cfg = (setting?.value ?? { default: 3 }) as SubmitLimitConfig;
    const roleNames = (rolesRows ?? [])
      .map((r) => (r.role as { name: string } | null)?.name)
      .filter(Boolean) as string[];

    // 0 anywhere = unlimited. Otherwise take the most generous limit across roles.
    let unlimited = false;
    let limit = cfg.default ?? 3;
    if (roleNames.includes("owner") || roleNames.includes("admin")) {
      unlimited = true;
    }
    for (const r of roleNames) {
      const v = cfg.per_role?.[r];
      if (v === 0) { unlimited = true; break; }
      if (typeof v === "number" && v > limit) limit = v;
    }

    if (unlimited) {
      return { unlimited: true, limit: 0, used: 0, remaining: Infinity as unknown as number, resets_at: null, window_days: 7 };
    }

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: events } = await supabaseAdmin
      .from("rate_limit_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "submission.create")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    const used = events?.length ?? 0;
    const earliest = events?.[0]?.created_at ?? null;
    const resets_at = earliest
      ? new Date(new Date(earliest).getTime() + WINDOW_MS).toISOString()
      : null;

    return {
      unlimited: false,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resets_at,
      window_days: 7,
    };
  });

// ============ PER-URL PREVIEW + SUGGESTIONS ============

const PreviewInput = z.object({ url: z.string().min(1).max(500) });

export type SuggestionChip = { id: string; name: string; slug: string };

export type PreviewResult = {
  url: string;
  youtubeId: string | null;
  status: "ok" | "invalid" | "not_found";
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  existingVideoId?: string | null;
  suggestedCategories: SuggestionChip[];
  suggestedTags: SuggestionChip[];
};

// Tokenise to lowercase alnum-only words ≥3 chars.
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of (s ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 3) out.add(w);
  }
  return out;
}

function scoreCandidate(
  candidateName: string,
  candidateSlug: string,
  haystackTokens: Set<string>,
  haystackText: string,
): number {
  const nameLower = candidateName.toLowerCase();
  let score = 0;
  // Exact full-phrase match in title/description = strong boost.
  if (haystackText.includes(nameLower)) score += 5;
  for (const tok of tokenize(`${candidateName} ${candidateSlug}`)) {
    if (haystackTokens.has(tok)) score += 1;
  }
  return score;
}

export const previewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data }): Promise<PreviewResult> => {
    const youtubeId = extractYouTubeId(data.url);
    if (!youtubeId) {
      return {
        url: data.url,
        youtubeId: null,
        status: "invalid",
        suggestedCategories: [],
        suggestedTags: [],
      };
    }

    const [meta] = await fetchVideos([youtubeId]);
    if (!meta) {
      return {
        url: data.url,
        youtubeId,
        status: "not_found",
        suggestedCategories: [],
        suggestedTags: [],
      };
    }

    const { data: existingVideo } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("youtube_id", youtubeId)
      .maybeSingle();

    const haystackText = `${meta.title} ${meta.description ?? ""}`.toLowerCase();
    const haystackTokens = tokenize(haystackText);

    const [{ data: cats }, { data: tags }] = await Promise.all([
      supabaseAdmin.from("categories").select("id, name, slug"),
      supabaseAdmin
        .from("tags")
        .select("id, name, slug")
        .eq("source", "platform")
        .neq("tier", "internal"),
    ]);

    const rank = <T extends { id: string; name: string; slug: string }>(rows: T[]) =>
      rows
        .map((r) => ({ r, s: scoreCandidate(r.name, r.slug, haystackTokens, haystackText) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => ({ id: x.r.id, name: x.r.name, slug: x.r.slug }));

    return {
      url: data.url,
      youtubeId,
      status: "ok",
      title: meta.title,
      description: meta.description,
      thumbnailUrl: meta.thumbnailUrl,
      durationSeconds: meta.durationSeconds,
      existingVideoId: existingVideo?.id ?? null,
      suggestedCategories: rank((cats ?? []) as Array<{ id: string; name: string; slug: string }>),
      suggestedTags: rank((tags ?? []) as Array<{ id: string; name: string; slug: string }>),
    };
  });
