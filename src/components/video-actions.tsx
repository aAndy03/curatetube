import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart, ThumbsDown, Eye, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  toggleVideoListStatus,
  toggleSuggest,
  getMyVideoState,
} from "@/lib/lists.functions";

type ListStatus = "wishlist" | "liked" | "disliked" | "watched";

const ACTIONS: { key: ListStatus; icon: typeof Bookmark; label: string }[] = [
  { key: "wishlist", icon: Bookmark, label: "Wishlist" },
  { key: "liked", icon: Heart, label: "Like" },
  { key: "disliked", icon: ThumbsDown, label: "Dislike" },
  { key: "watched", icon: Eye, label: "Mark watched" },
];

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
  const toggleList = useServerFn(toggleVideoListStatus);
  const toggleSug = useServerFn(toggleSuggest);

  const stateQ = useQuery({
    queryKey: ["video-state", videoId],
    queryFn: () => fetchState({ data: { videoId } }),
  });

  const setStatus = useMutation({
    mutationFn: (v: { status: ListStatus; on: boolean }) =>
      toggleList({ data: { videoId, status: v.status, on: v.on } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["video-state", videoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setSuggest = useMutation({
    mutationFn: (on: boolean) => toggleSug({ data: { videoId, on } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-state", videoId] });
      qc.invalidateQueries({ queryKey: ["video", videoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const has = (s: ListStatus) => stateQ.data?.statuses.includes(s) ?? false;
  const suggested = stateQ.data?.suggested ?? false;
  const busy = setStatus.isPending || setSuggest.isPending || stateQ.isLoading;
  const btnSize = size === "md" ? "default" : "sm";

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
                className={cn(
                  size === "sm" ? "h-7 w-7" : "h-9 w-9",
                  "shrink-0",
                )}
                disabled={busy}
                onClick={(e) => {
                  stop(e);
                  setStatus.mutate({ status: key, on: !active });
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
            size={btnSize === "default" ? "sm" : "sm"}
            variant={suggested ? "default" : "outline"}
            className={cn("h-7 px-2", size === "md" && "h-9 px-3")}
            disabled={busy}
            onClick={(e) => {
              stop(e);
              setSuggest.mutate(!suggested);
            }}
            aria-pressed={suggested}
          >
            {busy && setSuggest.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
            )}
            <span className="ml-1 text-xs">{suggested ? "Suggested" : "Suggest"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {suggested
            ? "Remove your suggestion"
            : "Suggest this video to the community"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
