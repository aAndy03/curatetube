import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  const q = useQuery({
    queryKey: ["my-list", active],
    queryFn: () =>
      active === "suggested"
        ? fetchSuggested()
        : fetchList({
            data: { status: active as "wishlist" | "liked" | "disliked" | "watched" },
          }),
  });

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
      ) : (q.data?.videos.length ?? 0) === 0 ? (
        <div className="grid place-items-center rounded-md border border-dashed py-16 text-sm text-muted-foreground">
          Nothing here yet. Use the actions on a video card to add to this list.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {q.data!.videos.map((v) => (
            <VideoCard key={v.id} video={v as VideoCardData} />
          ))}
        </div>
      )}
    </div>
  );
}
