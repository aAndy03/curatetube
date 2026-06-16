// Phase 6 Step 1 — Thin convenience wrapper around the existing
// `feed-dedup.server` helpers. Server-side only.
//
// Usage from a server fn:
//   const { kept, seen } = await dedupSeenIds(candidateIds, userId);
//   // …query videos using `kept`, then persist `seen` once at the end.
//
// Keeps the call sites in /feed, /suggest, /trending uniform and avoids
// per-call ad-hoc Set manipulation.
import { loadOrResetDedup, persistDedup } from "./feed-dedup.server";

export async function dedupSeenIds(
  candidateIds: string[],
  userId: string,
): Promise<{ kept: string[]; seen: Set<string> }> {
  const seen = await loadOrResetDedup(userId);
  const kept = candidateIds.filter((id) => !seen.has(id));
  return { kept, seen };
}

export async function commitSeenIds(
  userId: string,
  seen: Set<string>,
  newlyShownIds: string[],
): Promise<void> {
  for (const id of newlyShownIds) seen.add(id);
  await persistDedup(userId, seen);
}
