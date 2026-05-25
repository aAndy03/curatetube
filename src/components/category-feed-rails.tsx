import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, GitBranch, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import {
  getCategoryFeed,
  unpinCategory,
  type CategoryFeedRail,
} from "@/lib/category-feed.functions";
import { VideoCard } from "@/components/video-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function CategoryFeedRails() {
  const fetchFeed = useServerFn(getCategoryFeed);
  const unpinFn = useServerFn(unpinCategory);
  const qc = useQueryClient();
  const [pinnedScope, setPinnedScope] = React.useState<"all" | "direct">(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("ct.feed.pinnedScope");
    return stored === "direct" ? "direct" : "all";
  });

  const updatePinnedScope = (next: "all" | "direct") => {
    setPinnedScope(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("ct.feed.pinnedScope", next);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["category-feed", pinnedScope],
    queryFn: () => fetchFeed({ data: { pinnedScope } }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const unpin = useMutation({
    mutationFn: (categoryId: string) => unpinFn({ data: { categoryId } }),
    onSuccess: () => {
      toast.success("Unpinned");
      qc.invalidateQueries({ queryKey: ["category-feed"] });
      qc.invalidateQueries({ queryKey: ["pinned-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, j) => (
            <Skeleton key={j} className="aspect-video" />
          ))}
        </div>
      </div>
    );
  }

  const rails = data?.rails ?? [];
  if (rails.length === 0) return null;

  return (
    <div className="space-y-10">
      {rails.map((rail) => (
        <CategoryRail
          key={`${rail.category.id}-${rail.scope}`}
          rail={rail}
          onUnpin={() => unpin.mutate(rail.category.id)}
          pinnedScope={pinnedScope}
          onPinnedScopeChange={updatePinnedScope}
        />
      ))}
    </div>
  );
}

function CategoryRail({
  rail,
  onUnpin,
  pinnedScope,
  onPinnedScopeChange,
}: {
  rail: CategoryFeedRail;
  onUnpin: () => void;
  pinnedScope: "all" | "direct";
  onPinnedScopeChange: (next: "all" | "direct") => void;
}) {
  const underfilled = rail.videos.length < 4 && rail.total_in_category > rail.videos.length;

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{rail.category.name}</h2>
          {rail.pinned ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Pin className="h-3 w-3" /> Pinned
            </Badge>
          ) : null}
          {rail.pinned ? (
            <span className="text-xs text-muted-foreground">
              {rail.total_in_category} {rail.total_in_category === 1 ? "video" : "videos"}
              {rail.total_in_category !== rail.direct_total ? ` (${rail.direct_total} direct)` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {rail.pinned ? (
            <ToggleGroup
              type="single"
              size="sm"
              value={pinnedScope}
              onValueChange={(value) => value && onPinnedScopeChange(value as "all" | "direct")}
            >
              <ToggleGroupItem value="all" aria-label="Show all child category videos">
                <GitBranch className="mr-1 h-3.5 w-3.5" /> All
              </ToggleGroupItem>
              <ToggleGroupItem value="direct" aria-label="Show only direct videos">
                Direct
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {rail.pinned ? (
            <Button variant="ghost" size="sm" onClick={onUnpin}>
              <PinOff className="mr-1 h-3.5 w-3.5" /> Unpin
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/categories/$slug" params={{ slug: rail.category.slug }}>
              See all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {rail.videos.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          {rail.total_in_category === 0
            ? `No approved videos in ${rail.category.name} yet.`
            : rail.pinned && rail.scope === "direct" && rail.direct_total === 0
              ? `No direct videos in ${rail.category.name} yet. Switch to All to include child categories.`
              : `Nothing new in ${rail.category.name} right now.`}{" "}
          <Link
            to="/categories/$slug"
            params={{ slug: rail.category.slug }}
            className="underline-offset-2 hover:underline"
          >
            Browse the category
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rail.videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
          {underfilled ? (
            <p className="text-xs text-muted-foreground">
              Showing what's left in this cycle.{" "}
              <Link
                to="/categories/$slug"
                params={{ slug: rail.category.slug }}
                className="underline-offset-2 hover:underline"
              >
                See all in {rail.category.name}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
