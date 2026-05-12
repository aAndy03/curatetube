import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, ThumbsDown, Eye, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { enqueue } from "@/lib/action-queue";
import { useHydratedStatus, type ListStatus } from "@/hooks/use-hydrated-status";

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
  const { statuses, suggested } = useHydratedStatus(videoId);
  const has = (s: ListStatus) => statuses.includes(s);

  const optimisticStatus = (status: ListStatus, on: boolean) => {
    qc.setQueryData<VideoState>(["video-state", videoId], (prev) => {
      const base = prev ?? { statuses: [], suggested: false };
      let next = base.statuses.filter((s) => s !== status);
      if (on) {
        next.push(status);
        if (status === "liked") next = next.filter((s) => s !== "disliked");
        if (status === "disliked") next = next.filter((s) => s !== "liked");
      }
      return { ...base, statuses: next };
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
