// Plan 3 Phase 4 — video reports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

async function requirePerm(userId: string, key: string) {
  const { data: ok } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: key,
  });
  if (!ok) throw new Error("Forbidden");
}

// ---------- USER ----------

export const hasReportedVideo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("reports")
      .select("id, status, created_at")
      .eq("reporter_id", context.userId)
      .eq("video_id", data.videoId)
      .maybeSingle();
    return { reported: !!row, report: row ?? null };
  });

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        reasonText: z.string().trim().min(5).max(1500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Rate limit: 10/h/user
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("action", "report.submit")
      .gte("created_at", oneHourAgo);
    if ((recent ?? 0) >= 10) {
      throw new Error("Report rate limit exceeded (10/hour). Please try again later.");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("reports")
      .insert({
        video_id: data.videoId,
        reporter_id: context.userId,
        reason_text: data.reasonText,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("You already reported this video.");
      throw new Error(error.message);
    }

    await supabaseAdmin
      .from("rate_limit_events")
      .insert({ user_id: context.userId, action: "report.submit" });

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "report.create",
      targetType: "video",
      targetId: data.videoId,
      after: { report_id: inserted.id },
      visibility: "staff",
    });
    return { ok: true, id: inserted.id };
  });

// ---------- ADMIN ----------

export type ReportRow = {
  id: string;
  video_id: string;
  reporter_id: string;
  reason_text: string;
  status: "open" | "reviewed" | "dismissed";
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  reporter: { display_name: string | null; username: string | null; audit_privacy_mode: string } | null;
};

export type ReportedVideoSummary = {
  video: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    youtube_id: string;
    status: string;
  };
  total: number;
  open: number;
  last_report_at: string;
};

export const listReportedVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "open", "reviewed", "dismissed"]).default("open"),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "report.view");
    let q = supabaseAdmin
      .from("reports")
      .select("id, video_id, status, created_at");
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);

    const videoIds = Array.from(new Set((rows ?? []).map((r) => r.video_id)));
    const videosById = new Map<string, ReportedVideoSummary["video"]>();
    if (videoIds.length) {
      const { data: vids } = await supabaseAdmin
        .from("videos")
        .select("id, title, thumbnail_url, youtube_id, status")
        .in("id", videoIds);
      for (const v of vids ?? [])
        videosById.set(v.id, {
          id: v.id,
          title: v.title,
          thumbnail_url: v.thumbnail_url,
          youtube_id: v.youtube_id,
          status: v.status as string,
        });
    }

    const byVideo = new Map<string, ReportedVideoSummary>();
    for (const r of rows ?? []) {
      const v = videosById.get(r.video_id);
      if (!v) continue;
      const existing = byVideo.get(v.id);
      if (existing) {
        existing.total += 1;
        if (r.status === "open") existing.open += 1;
        if (r.created_at > existing.last_report_at) existing.last_report_at = r.created_at;
      } else {
        byVideo.set(v.id, {
          video: v,
          total: 1,
          open: r.status === "open" ? 1 : 0,
          last_report_at: r.created_at,
        });
      }
    }
    const summaries = Array.from(byVideo.values())
      .sort((a, b) => b.open - a.open || (b.last_report_at > a.last_report_at ? 1 : -1))
      .slice(0, data.limit);
    return { videos: summaries };
  });

export const listReportsForVideo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "report.view");
    const { data: rows, error } = await supabaseAdmin
      .from("reports")
      .select(
        "id, video_id, reporter_id, reason_text, status, review_note, reviewed_at, reviewed_by, created_at",
      )
      .eq("video_id", data.videoId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const reporterIds = Array.from(new Set((rows ?? []).map((r) => r.reporter_id)));
    const profilesById = new Map<
      string,
      { display_name: string | null; username: string | null; audit_privacy_mode: string }
    >();
    if (reporterIds.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, username, audit_privacy_mode")
        .in("id", reporterIds);
      for (const p of ps ?? [])
        profilesById.set(p.id, {
          display_name: p.display_name,
          username: p.username,
          audit_privacy_mode: p.audit_privacy_mode,
        });
    }

    const reports: ReportRow[] = (rows ?? []).map((r) => ({
      ...r,
      reporter: profilesById.get(r.reporter_id) ?? null,
    }));
    return { reports };
  });

export const updateReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        status: z.enum(["open", "reviewed", "dismissed"]),
        reviewNote: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "report.review");
    const patch: Record<string, unknown> = {
      status: data.status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.reviewNote !== undefined) patch.review_note = data.reviewNote;
    const { error } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: `report.${data.status}`,
      targetType: "report",
      targetId: data.ids.join(","),
      after: { count: data.ids.length, note: data.reviewNote ?? null },
      visibility: "staff",
    });
    return { ok: true, count: data.ids.length };
  });
