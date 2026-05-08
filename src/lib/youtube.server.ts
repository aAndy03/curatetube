// Server-only YouTube Data API v3 helpers.
// Imported only by *.functions.ts files that already run server-side.

const YT_BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeVideoData = {
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  viewCount: number | null;
  likeCount: number | null;
  language: string | null;
  channelId: string;
  channelTitle: string;
};

export type YouTubeChannelData = {
  channelId: string;
  title: string;
  handle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  country: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  channelUrl: string;
};

// Accepts: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/shorts/ID, youtube.com/embed/ID,
// youtube.com/live/ID, raw 11-char id.
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // raw id
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) =>
        ["shorts", "embed", "live", "v"].includes(p)
      );
      if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ISO 8601 PT#H#M#S duration → seconds
export function parseDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(s ?? 0);
}

function getKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not configured");
  return k;
}

export async function fetchVideos(ids: string[]): Promise<YouTubeVideoData[]> {
  if (ids.length === 0) return [];
  const key = getKey();
  // YouTube allows up to 50 ids per call
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const out: YouTubeVideoData[] = [];
  for (const chunk of chunks) {
    const url = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${chunk.join(",")}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube videos.list failed [${res.status}]: ${await res.text()}`);
    }
    const json = await res.json() as {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          description: string;
          channelId: string;
          channelTitle: string;
          publishedAt: string;
          defaultAudioLanguage?: string;
          defaultLanguage?: string;
          thumbnails?: Record<string, { url: string }>;
        };
        contentDetails: { duration: string };
        statistics?: { viewCount?: string; likeCount?: string };
      }>;
    };
    for (const it of json.items) {
      const thumbs = it.snippet.thumbnails ?? {};
      const thumb =
        thumbs.maxres?.url ||
        thumbs.high?.url ||
        thumbs.medium?.url ||
        thumbs.default?.url ||
        null;
      out.push({
        youtubeId: it.id,
        title: it.snippet.title,
        description: it.snippet.description,
        thumbnailUrl: thumb,
        durationSeconds: parseDuration(it.contentDetails?.duration),
        publishedAt: it.snippet.publishedAt,
        viewCount: it.statistics?.viewCount ? Number(it.statistics.viewCount) : null,
        likeCount: it.statistics?.likeCount ? Number(it.statistics.likeCount) : null,
        language: it.snippet.defaultAudioLanguage ?? it.snippet.defaultLanguage ?? null,
        channelId: it.snippet.channelId,
        channelTitle: it.snippet.channelTitle,
      });
    }
  }
  return out;
}

export async function fetchChannels(ids: string[]): Promise<YouTubeChannelData[]> {
  if (ids.length === 0) return [];
  const key = getKey();
  const unique = Array.from(new Set(ids));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));
  const out: YouTubeChannelData[] = [];
  for (const chunk of chunks) {
    const url = `${YT_BASE}/channels?part=snippet,statistics&id=${chunk.join(",")}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube channels.list failed [${res.status}]: ${await res.text()}`);
    }
    const json = await res.json() as {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          description: string;
          country?: string;
          customUrl?: string;
          thumbnails?: Record<string, { url: string }>;
        };
        statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
      }>;
    };
    for (const it of json.items) {
      const thumbs = it.snippet.thumbnails ?? {};
      const thumb =
        thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;
      const handle = it.snippet.customUrl ?? null;
      out.push({
        channelId: it.id,
        title: it.snippet.title,
        handle,
        description: it.snippet.description,
        thumbnailUrl: thumb,
        country: it.snippet.country ?? null,
        subscriberCount:
          it.statistics?.hiddenSubscriberCount || !it.statistics?.subscriberCount
            ? null
            : Number(it.statistics.subscriberCount),
        videoCount: it.statistics?.videoCount ? Number(it.statistics.videoCount) : null,
        channelUrl: handle
          ? `https://www.youtube.com/${handle.startsWith("@") ? handle : "@" + handle}`
          : `https://www.youtube.com/channel/${it.id}`,
      });
    }
  }
  return out;
}
