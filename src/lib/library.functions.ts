import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractYouTubeId, fetchVideos, fetchChannels } from "./youtube.server";
import { writeAudit } from "./audit.server";

const PUBLIC_BROWSE_CACHE = new Headers({
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
});

// ============ SUBMIT ============

const SubmitInput = z.object({
  urls: z.array(z.string().min(1).max(500)).min(1).max(20),
  note: z.string().max(2000).optional(),
  contentWarnings: z.array(z.string().max(40)).max(8).optional(),
  suggestedCategories: z.array(z.string().max(60)).max(10).optional(),
  suggestedTags: z.array(z.string().max(40)).max(20).optional(),
  anonymous: z.boolean().optional(),
});

export type SubmitResultItem = {
  url: string;
  status: "pending" | "duplicate" | "invalid";
  videoId?: string;
  youtubeId?: string;
  title?: string;
  reason?: string;
  submissionCount?: number;
};

export const submitVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Permission check: submission.create
    const { data: canSubmit } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: "submission.create",
    });
    if (!canSubmit) {
      throw new Error("You do not have permission to submit videos.");
    }

    // Rate limit: max 30 submissions / hour / user
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "submission.create")
      .gte("created_at", oneHourAgo);
    if ((recent ?? 0) + data.urls.length > 30) {
      throw new Error("Submission rate limit exceeded (30/hour). Please try again later.");
    }

    // Parse URLs → ids
    const parsed = data.urls.map((url) => ({
      url,
      youtubeId: extractYouTubeId(url),
    }));

    const validIds = Array.from(
      new Set(parsed.map((p) => p.youtubeId).filter((x): x is string => !!x)),
    );

    // Fetch metadata for all valid ids
    const ytVideos = await fetchVideos(validIds);
    const ytById = new Map(ytVideos.map((v) => [v.youtubeId, v]));

    // Fetch channels
    const channelIds = Array.from(new Set(ytVideos.map((v) => v.channelId)));
    const ytChannels = await fetchChannels(channelIds);
    const chById = new Map(ytChannels.map((c) => [c.channelId, c]));

    // Upsert creators (admin client; RLS bypassed)
    const creatorIdMap = new Map<string, string>();
    for (const ch of ytChannels) {
      const { data: existing } = await supabaseAdmin
        .from("creators")
        .select("id")
        .eq("youtube_channel_id", ch.channelId)
        .maybeSingle();
      if (existing) {
        creatorIdMap.set(ch.channelId, existing.id);
        await supabaseAdmin
          .from("creators")
          .update({
            title: ch.title,
            handle: ch.handle,
            thumbnail_url: ch.thumbnailUrl,
            description: ch.description,
            country: ch.country,
            subscriber_count: ch.subscriberCount,
            video_count: ch.videoCount,
            channel_url: ch.channelUrl,
            fetched_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const { data: created, error } = await supabaseAdmin
          .from("creators")
          .insert({
            youtube_channel_id: ch.channelId,
            title: ch.title,
            handle: ch.handle,
            thumbnail_url: ch.thumbnailUrl,
            description: ch.description,
            country: ch.country,
            subscriber_count: ch.subscriberCount,
            video_count: ch.videoCount,
            channel_url: ch.channelUrl,
            fetched_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw new Error(`Creator insert failed: ${error.message}`);
        creatorIdMap.set(ch.channelId, created.id);
      }
    }

    const results: SubmitResultItem[] = [];

    for (const p of parsed) {
      if (!p.youtubeId) {
        // Log invalid submission
        await supabaseAdmin.from("submissions").insert({
          submitter_id: userId,
          youtube_url: p.url,
          youtube_id: null,
          status: "invalid",
          anonymous: !!data.anonymous,
          note: data.note ?? null,
          content_warnings: data.contentWarnings ?? [],
          suggested_categories: data.suggestedCategories ?? [],
          suggested_tags: data.suggestedTags ?? [],
        });
        results.push({ url: p.url, status: "invalid", reason: "Could not parse a YouTube video ID from URL." });
        continue;
      }
      const yt = ytById.get(p.youtubeId);
      if (!yt) {
        await supabaseAdmin.from("submissions").insert({
          submitter_id: userId,
          youtube_url: p.url,
          youtube_id: p.youtubeId,
          status: "invalid",
          anonymous: !!data.anonymous,
          note: data.note ?? null,
          content_warnings: data.contentWarnings ?? [],
          suggested_categories: data.suggestedCategories ?? [],
          suggested_tags: data.suggestedTags ?? [],
        });
        results.push({ url: p.url, status: "invalid", reason: "Video not found on YouTube (may be private or removed)." });
        continue;
      }

      // Check existing video
      const { data: existingVideo } = await supabaseAdmin
        .from("videos")
        .select("id, status, submission_count")
        .eq("youtube_id", yt.youtubeId)
        .maybeSingle();

      let videoId: string;
      let isDuplicate = false;
      if (existingVideo) {
        videoId = existingVideo.id;
        isDuplicate = true;
      } else {
        const { data: createdVideo, error } = await supabaseAdmin
          .from("videos")
          .insert({
            youtube_id: yt.youtubeId,
            creator_id: creatorIdMap.get(yt.channelId) ?? null,
            title: yt.title,
            description: yt.description,
            thumbnail_url: yt.thumbnailUrl,
            duration_seconds: yt.durationSeconds,
            published_at: yt.publishedAt,
            view_count: yt.viewCount,
            like_count: yt.likeCount,
            language: yt.language,
            status: "pending",
            content_warnings: data.contentWarnings ?? [],
            last_metadata_fetch: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw new Error(`Video insert failed: ${error.message}`);
        videoId = createdVideo.id;
      }

      // Insert submission row
      await supabaseAdmin.from("submissions").insert({
        submitter_id: userId,
        youtube_url: p.url,
        youtube_id: yt.youtubeId,
        video_id: videoId,
        status: isDuplicate ? "duplicate" : "pending",
        anonymous: !!data.anonymous,
        note: data.note ?? null,
        content_warnings: data.contentWarnings ?? [],
        suggested_categories: data.suggestedCategories ?? [],
        suggested_tags: data.suggestedTags ?? [],
      });

      // Track unique submitter; bump submission_count if newly inserted
      const { data: existingVS } = await supabaseAdmin
        .from("video_submitters")
        .select("video_id")
        .eq("video_id", videoId)
        .eq("user_id", userId)
        .maybeSingle();
      let newSubmissionCount = existingVideo?.submission_count ?? 0;
      if (!existingVS) {
        await supabaseAdmin.from("video_submitters").insert({
          video_id: videoId,
          user_id: userId,
          anonymous: !!data.anonymous,
        });
        // Increment submission_count
        const { data: updated } = await supabaseAdmin
          .from("videos")
          .update({
            submission_count: (existingVideo?.submission_count ?? 0) + 1,
          })
          .eq("id", videoId)
          .select("submission_count")
          .single();
        newSubmissionCount = updated?.submission_count ?? newSubmissionCount + 1;
      } else {
        newSubmissionCount = existingVideo?.submission_count ?? 1;
      }

      // Rate limit event
      await supabaseAdmin.from("rate_limit_events").insert({
        user_id: userId,
        action: "submission.create",
      });

      // Audit
      await writeAudit(supabaseAdmin, {
        actorId: userId,
        action: isDuplicate ? "submission.duplicate" : "submission.create",
        targetType: "video",
        targetId: videoId,
        after: { youtube_id: yt.youtubeId, title: yt.title },
        forceAnonymous: !!data.anonymous,
      });

      results.push({
        url: p.url,
        status: isDuplicate ? "duplicate" : "pending",
        videoId,
        youtubeId: yt.youtubeId,
        title: yt.title,
        submissionCount: newSubmissionCount,
      });
    }

    return { results };
  });

// ============ MODERATION QUEUE ============

export const listSubmissionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: canView } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: "submission.view_queue",
    });
    if (!canView) throw new Error("Forbidden");

    const status = data.status ?? "pending";
    const { data: rows, error } = await supabase
      .from("submissions")
      .select(
        "id, status, anonymous, note, content_warnings, created_at, submitter_id, video_id, youtube_id, youtube_url, video:videos(id, title, thumbnail_url, status, submission_count, suggest_count, duration_seconds, published_at, creator:creators(id, title, handle, thumbnail_url))",
      )
      .eq("status", status as never)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { submissions: rows ?? [] };
  });

const ModerateInput = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
});

export const moderateSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ModerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const permKey =
      data.decision === "approve" ? "submission.approve" : "submission.reject";
    const { data: canDo } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: permKey,
    });
    if (!canDo) throw new Error("Forbidden");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("id, video_id, status, youtube_id, submitter_id")
      .eq("id", data.submissionId)
      .single();
    if (subErr || !sub) throw new Error("Submission not found");

    const newStatus = data.decision === "approve" ? "approved" : "rejected";
    await supabaseAdmin
      .from("submissions")
      .update({
        status: newStatus,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        decision_reason: data.reason ?? null,
      })
      .eq("id", sub.id);

    if (sub.video_id) {
      const videoStatus = data.decision === "approve" ? "approved" : "rejected";
      const { data: vid } = await supabaseAdmin
        .from("videos")
        .update({ status: videoStatus })
        .eq("id", sub.video_id)
        .select("title")
        .single();

      await writeAudit(supabaseAdmin, {
        actorId: userId,
        action: `video.${data.decision}`,
        targetType: "video",
        targetId: sub.video_id,
        after: { reason: data.reason ?? null },
        visibility: "staff",
      });

      // Notify submitter
      await supabaseAdmin.from("notifications").insert({
        user_id: sub.submitter_id,
        type:
          data.decision === "approve"
            ? "submission_approved"
            : "submission_rejected",
        title:
          data.decision === "approve"
            ? `Approved: ${vid?.title ?? "your submission"}`
            : `Rejected: ${vid?.title ?? "your submission"}`,
        body: data.reason ?? null,
        link: `/v/${sub.video_id}`,
        data: { video_id: sub.video_id },
      });
    }

    return { ok: true };
  });

// ============ LIBRARY ============

export const listApprovedVideos = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number; offset?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const limit = Math.min(data.limit ?? 24, 60);
    const offset = data.offset ?? 0;
    const { data: rows, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, view_count, submission_count, suggest_count, creator:creators(id, title, handle, thumbnail_url)",
      )
      .eq("status", "approved")
      .order("first_submitted_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { videos: rows ?? [] };
  });

export const getVideoDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: video, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, description, thumbnail_url, duration_seconds, published_at, view_count, like_count, language, status, submission_count, suggest_count, content_warnings, curator_note, is_featured, creator:creators(id, title, handle, thumbnail_url, description, channel_url, subscriber_count)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { video };
  });

export const listCreators = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const limit = Math.min(data.limit ?? 60, 120);
    const { data: rows, error } = await supabaseAdmin
      .from("creators")
      .select("id, title, handle, thumbnail_url, subscriber_count, video_count, channel_url")
      .order("title", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { creators: rows ?? [] };
  });

export const getCreatorDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: creator, error } = await supabaseAdmin
      .from("creators")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!creator) return { creator: null, videos: [] };
    const { data: videos } = await supabaseAdmin
      .from("videos")
      .select("id, youtube_id, title, thumbnail_url, duration_seconds, published_at, submission_count, suggest_count")
      .eq("creator_id", creator.id)
      .eq("status", "approved")
      .order("published_at", { ascending: false })
      .limit(60);
    return { creator, videos: videos ?? [] };
  });

// ============ BROWSE: SUGGESTED / TRENDING / CATEGORIES ============

export const listSuggestedVideos = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    setResponseHeaders(PUBLIC_BROWSE_CACHE);
    const limit = Math.min(data.limit ?? 36, 60);
    // Read pre-ranked ids from materialized view
    const { data: ranked, error: rErr } = await supabaseAdmin
      .from("mv_suggested_feed" as never)
      .select("video_id, suggest_count, first_submitted_at")
      .order("suggest_count", { ascending: false })
      .order("first_submitted_at", { ascending: false })
      .limit(limit);
    if (rErr) throw new Error(rErr.message);
    const ids = ((ranked ?? []) as Array<{ video_id: string }>).map((r) => r.video_id);
    if (ids.length === 0) return { videos: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, view_count, submission_count, suggest_count, creator:creators(id, title, handle, thumbnail_url)",
      )
      .in("id", ids);
    if (error) throw new Error(error.message);
    const byId = new Map((rows ?? []).map((v) => [v.id as string, v]));
    return { videos: ids.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => Boolean(v)) };
  });

export const listTrendingVideos = createServerFn({ method: "GET" })
  .inputValidator((d: { windowHours?: number; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    setResponseHeaders(PUBLIC_BROWSE_CACHE);
    const limit = Math.min(data.limit ?? 36, 60);
    const windowHours = data.windowHours === 72 ? 72 : 24;
    const orderCol = windowHours === 72 ? "trending_score_72h" : "trending_score_24h";

    const { data: ranked, error: rErr } = await supabaseAdmin
      .from("mv_trending" as never)
      .select(`video_id, ${orderCol}`)
      .gt(orderCol, 0)
      .order(orderCol, { ascending: false })
      .limit(limit);
    if (rErr) throw new Error(rErr.message);
    const ids = ((ranked ?? []) as Array<{ video_id: string }>).map((r) => r.video_id);
    if (ids.length === 0) return { videos: [], windowHours };

    const { data: rows, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, view_count, submission_count, suggest_count, creator:creators(id, title, handle, thumbnail_url)",
      )
      .in("id", ids)
      .eq("status", "approved");
    if (error) throw new Error(error.message);
    const byId = new Map((rows ?? []).map((v) => [v.id as string, v]));
    return { videos: ids.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => Boolean(v)), windowHours };
  });

export const listCategoriesWithStats = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeaders(PUBLIC_BROWSE_CACHE);
    const { data: stats, error } = await supabaseAdmin
      .from("mv_category_stats" as never)
      .select("category_id, slug, name, video_count, top_thumbnails")
      .order("video_count", { ascending: false });
    if (error) throw new Error(error.message);

    const out = ((stats ?? []) as Array<{
      category_id: string;
      slug: string;
      name: string;
      video_count: number;
      top_thumbnails: string[] | null;
    }>).map((s) => ({
      id: s.category_id,
      slug: s.slug,
      name: s.name,
      description: null,
      video_count: Number(s.video_count ?? 0),
      thumbnails: (s.top_thumbnails ?? []).slice(0, 4),
    }));
    return { categories: out };
  });

export const listVideosByCategorySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string; limit?: number }) =>
    z.object({ slug: z.string().min(1).max(80), limit: z.number().min(1).max(60).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const limit = Math.min(data.limit ?? 36, 60);
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id, name, description, slug")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!cat) return { category: null, videos: [] };

    const { data: links } = await supabaseAdmin
      .from("video_categories")
      .select("video_id")
      .eq("category_id", cat.id as string);
    const ids = (links ?? []).map((l) => l.video_id as string);
    if (ids.length === 0) return { category: cat, videos: [] };

    const { data: vids, error } = await supabaseAdmin
      .from("videos")
      .select(
        "id, youtube_id, title, thumbnail_url, duration_seconds, published_at, view_count, submission_count, suggest_count, creator:creators(id, title, handle, thumbnail_url)",
      )
      .in("id", ids)
      .eq("status", "approved")
      .order("suggest_count", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { category: cat, videos: vids ?? [] };
  });
