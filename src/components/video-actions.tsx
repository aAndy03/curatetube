import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart, ThumbsDown, Eye, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getMyVideoState } from "@/lib/lists.functions";
import { enqueue } from "@/lib/action-queue";

type ListStatus = "wishlist" | "liked" | "disliked" | "watched";

const ACTIONS: { key: ListStatus; icon: typeof Bookmark; label: string }[] = [
  { key: "wishlist", icon: Bookmark, label: "Wishlist" },
  { key: "liked", icon: Heart, label: "Like" },
  { key: "disliked", icon: ThumbsDown, label: "Dislike" },
  { key: "watched", icon: Eye, label: "Mark watched" },
];

type VideoState = { statuses: ListStatus[]; suggested: boolean };

export function VideoActions({
  videoId,
  size = "sm",
  className,
}: {
  videoId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getMyVideoState);

  const stateQ = useQuery({
    queryKey: ["video-state", videoId],
    queryFn: () => fetchState({ data: { videoId } }),
  });

  const data: VideoState = stateQ.data ?? { statuses: [], suggested: false };
  const has = (s: ListStatus) => data.statuses.includes(s);
  const suggested = data.suggested;

  const optimisticStatus = (status: ListStatus, on: boolean) => {
    qc.setQueryData<VideoState>(["video-state", videoId], (prev) => {
      const base = prev ?? { statuses: [], suggested: false };
      let statuses = base.statuses.filter((s) => s !== status);
      if (on) {
        statuses.push(status);
        // Mutually exclusive like/dislike
        if (status === "liked") statuses = statuses.filter((s) => s !== "disliked");
        if (status === "disliked") statuses = statuses.filter((s) => s !== "liked");
      }
      return { ...base, statuses };
    });
  };

  const onStatusClick = (status: ListStatus, active: boolean) => {
    optimisticStatus(status, !active);
    void enqueue({ type: "status", videoId, status, on: !active });
  };

  const onSuggestClick = () => {
    qc.setQueryData<VideoState>(["video-state", videoId], (prev) => ({
      ...(prev ?? { statuses: [], suggested: false }),
      suggested: !suggested,
    }));
    // Also reflect in the cached video card suggest_count if present
    qc.setQueriesData<{ suggest_count?: number } | undefined>(
      { queryKey: ["video", videoId] },
      (prev) =>
        prev
          ? { ...prev, suggest_count: Math.max(0, (prev.suggest_count ?? 0) + (suggested ? -1 : 1)) }
          : prev,
    );
    void enqueue({ type: "suggest", videoId, on: !suggested });
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {ACTIONS.map(({ key, icon: Icon, label }) => {
        const active = has(key);
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={active ? "default" : "ghost"}
                className={cn(size === "sm" ? "h-7 w-7" : "h-9 w-9", "shrink-0")}
                onClick={(e) => {
                  stop(e);
                  onStatusClick(key, active);
                }}
                aria-pressed={active}
                aria-label={label}
              >
                <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{active ? `Remove from ${label.toLowerCase()}` : label}</TooltipContent>
          </Tooltip>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={suggested ? "default" : "outline"}
            className={cn("h-7 px-2", size === "md" && "h-9 px-3")}
            onClick={(e) => {
              stop(e);
              onSuggestClick();
            }}
            aria-pressed={suggested}
          >
            <Sparkles className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
            <span className="ml-1 text-xs">{suggested ? "Suggested" : "Suggest"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {suggested ? "Remove your suggestion" : "Suggest this video to the community"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
