// Plan 3 Phase 1 — merged hydration hook.
// Combines TanStack Query server state with the client-side action queue
// so optimistic writes survive a page refresh.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyVideoState } from "@/lib/lists.functions";
import {
  getPendingForVideo,
  purgeConfirmed,
  subscribeQueue,
  type QueuedAction,
} from "@/lib/action-queue";

export type ListStatus = "wishlist" | "liked" | "disliked" | "watched";

export type HydratedVideoState = {
  statuses: ListStatus[];
  suggested: boolean;
  /** +1 / 0 / -1 — pending suggest delta vs. server `suggest_count`. */
  suggestDelta: number;
  isLoading: boolean;
};

type ServerState = { statuses: ListStatus[]; suggested: boolean };

export function useHydratedStatus(videoId: string): HydratedVideoState {
  const fetchState = useServerFn(getMyVideoState);
  const q = useQuery<ServerState>({
    queryKey: ["video-state", videoId],
    queryFn: () => fetchState({ data: { videoId } }),
  });

  // Re-render whenever the queue changes anywhere — coarse but cheap.
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => subscribeQueue(() => force()), []);

  // Once the server confirms, drop acknowledged queue entries for this video.
  React.useEffect(() => {
    if (q.data && !q.isFetching) purgeConfirmed(videoId);
  }, [q.data, q.isFetching, videoId]);

  const merged = React.useMemo<Omit<HydratedVideoState, "isLoading">>(() => {
    const base: ServerState = q.data ?? { statuses: [], suggested: false };
    let statuses: ListStatus[] = [...base.statuses];
    let suggested = base.suggested;
    let suggestDelta = 0;

    const pending: QueuedAction[] = getPendingForVideo(videoId);
    for (const p of pending) {
      if (p.type === "status") {
        statuses = statuses.filter((s) => s !== p.status);
        if (p.on) {
          statuses.push(p.status);
          if (p.status === "liked") statuses = statuses.filter((s) => s !== "disliked");
          if (p.status === "disliked") statuses = statuses.filter((s) => s !== "liked");
        }
      } else if (p.type === "suggest") {
        if (p.on !== suggested) suggestDelta = p.on ? 1 : -1;
        suggested = p.on;
      }
    }
    return { statuses, suggested, suggestDelta };
  }, [q.data, videoId, q.isFetching]);

  return { ...merged, isLoading: q.isLoading };
}

/**
 * Server `suggest_count` adjusted by any pending suggest toggle from this user.
 * Use this anywhere a card displays the public suggest count.
 */
export function useHydratedSuggestCount(videoId: string, baseCount: number): number {
  const { suggestDelta } = useHydratedStatus(videoId);
  return Math.max(0, baseCount + suggestDelta);
}
