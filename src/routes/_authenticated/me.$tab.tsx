import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, Heart, ThumbsDown, Eye, Sparkles } from "lucide-react";

import { getMyList, getMySuggestedList } from "@/lib/lists.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "wishlist", label: "Wishlist", icon: Bookmark },
  { key: "liked", label: "Liked", icon: Heart },
  { key: "disliked", label: "Disliked", icon: ThumbsDown },
  { key: "watched", label: "Watched", icon: Eye },
  { key: "suggested", label: "Suggested", icon: Sparkles },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as TabKey[];

// Threshold above which we switch from a plain grid to a virtualised one.
const VIRTUALISE_THRESHOLD = 50;

export const Route = createFileRoute("/_authenticated/me/$tab")({
  component: ProfileListsPage,
  notFoundComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Unknown list.
    </div>
  ),
});

function ProfileListsPage() {
  const { tab } = Route.useParams();
  if (!TAB_KEYS.includes(tab as TabKey)) throw notFound();
  const active = tab as TabKey;

  const fetchList = useServerFn(getMyList);
  const fetchSuggested = useServerFn(getMySuggestedList);

  // Per-tab key + 2 min stale: data loads on first activation, cached across
  // tab switches. Router-level code-splitting means inactive tabs don't even
  // render, so we don't manually gate the queryFn.
  const q = useQuery({
    queryKey: ["my-list", active],
    queryFn: () =>
      active === "suggested"
        ? fetchSuggested()
        : fetchList({
            data: { status: active as "wishlist" | "liked" | "disliked" | "watched" },
          }),
    staleTime: 2 * 60_000,
  });

  const videos = (q.data?.videos ?? []) as VideoCardData[];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Your library</h1>
        <p className="text-sm text-muted-foreground">
          Lists are private. Only you can see what you save here.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-md border bg-card p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/me/$tab"
            params={{ tab: t.key }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition",
              active === t.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        ))}
      </nav>

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="grid place-items-center rounded-md border border-dashed py-16 text-sm text-muted-foreground">
          Nothing here yet. Use the actions on a video card to add to this list.
        </div>
      ) : videos.length > VIRTUALISE_THRESHOLD ? (
        <VirtualVideoGrid videos={videos} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Windowed row-based grid for long library lists (>50 rows). We chunk the
 * flat video array into rows of 4 (matches the xl: breakpoint) and only
 * mount the rows visible in the viewport. Each row carries the same
 * responsive `grid-cols` rules so visuals match the non-virtual path.
 */
function VirtualVideoGrid({ videos }: { videos: VideoCardData[] }) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const ROW_SIZE = 4;
  const rows = React.useMemo(() => {
    const out: VideoCardData[][] = [];
    for (let i = 0; i < videos.length; i += ROW_SIZE) {
      out.push(videos.slice(i, i + ROW_SIZE));
    }
    return out;
  }, [videos]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () =>
      typeof window === "undefined" ? null : document.scrollingElement as HTMLElement,
    estimateSize: () => 260,
    overscan: 3,
  });

  return (
    <div ref={parentRef}>
      <div
        style={{ height: virt.getTotalSize(), width: "100%", position: "relative" }}
      >
        {virt.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={vi.key}
              ref={virt.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {row.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
