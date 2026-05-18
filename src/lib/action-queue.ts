// Client-side action queue (IndexedDB-backed) with coalescing + batch flush.
// Deferred actions never block the user. Optimistic UI lives at call sites.
import { processBatchActions, type BatchAction } from "./actions.functions";

const DB_NAME = "ct-action-queue";
const STORE = "queue";
const DB_VERSION = 1;

// ---------- Action types ----------
export type QueuedActionPayload =
  | { type: "suggest"; videoId: string; on: boolean }
  | { type: "status"; videoId: string; status: "wishlist" | "liked" | "disliked" | "watched"; on: boolean }
  | { type: "progress"; videoId: string; percent: number }
  | { type: "notif_read"; ids?: string[] | null }
  | { type: "feed_reorder"; orderedIds: string[] };

export type QueuedAction = QueuedActionPayload & {
  id: string;
  created_at: number;
  attempts: number;
  /** Plan 3 Phase 1: server confirmed the write; entry kept until next refetch confirms it. */
  acknowledged?: boolean;
};

// ---------- IndexedDB helpers ----------
function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAll(): Promise<QueuedAction[]> {
  if (!isBrowser()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedAction[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(a: QueuedAction): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(a);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(ids: string[]): Promise<void> {
  if (!isBrowser() || ids.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- In-memory state + coalescing ----------
let memQueue: QueuedAction[] = [];
let initialized = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushIntervalMs = 10 * 60 * 1000;
let flushing: Promise<void> | null = null;
const listeners = new Set<(state: { pending: number; lastError: string | null }) => void>();
let lastError: string | null = null;

function coalesceKey(a: QueuedActionPayload): string {
  switch (a.type) {
    case "suggest":
    case "progress":
      return `${a.type}:${a.videoId}`;
    case "status":
      return `status:${a.videoId}:${a.status}`;
    case "notif_read":
      return "notif_read";
    case "feed_reorder":
      return "feed_reorder";
  }
}

function notify() {
  const pending = memQueue.filter((q) => !q.acknowledged).length;
  const state = { pending, lastError };
  listeners.forEach((l) => l(state));
}

export function subscribeQueue(
  fn: (state: { pending: number; lastError: string | null }) => void,
): () => void {
  listeners.add(fn);
  fn({ pending: memQueue.filter((q) => !q.acknowledged).length, lastError });
  return () => {
    listeners.delete(fn);
  };
}

/** Plan 3 Phase 7: cap queue size to bound IndexedDB growth. */
const MAX_QUEUE_SIZE = 500;
const ACK_TTL_MS = 24 * 60 * 60 * 1000;

export async function enqueue(action: QueuedActionPayload): Promise<void> {
  await ensureInit();
  const key = coalesceKey(action);

  // Coalesce: replace existing same-key (un-acknowledged) entry
  const existingIdx = memQueue.findIndex((q) => !q.acknowledged && coalesceKey(q) === key);
  let merged: QueuedAction;

  if (action.type === "notif_read" && existingIdx >= 0) {
    const prev = memQueue[existingIdx] as Extract<QueuedAction, { type: "notif_read" }>;
    const prevIds = prev.ids ?? null;
    const nextIds = action.ids ?? null;
    const ids = prevIds === null || nextIds === null ? null : Array.from(new Set([...prevIds, ...nextIds]));
    merged = { ...prev, ids, created_at: Date.now() };
  } else {
    merged = {
      ...action,
      id: existingIdx >= 0 ? memQueue[existingIdx].id : crypto.randomUUID(),
      created_at: Date.now(),
      attempts: 0,
    };
  }

  if (existingIdx >= 0) memQueue[existingIdx] = merged;
  else memQueue.push(merged);

  await idbPut(merged);
  notify();

  // Plan 3 Phase 7: if we overflow the cap, flush immediately regardless of interval.
  if (memQueue.length > MAX_QUEUE_SIZE) {
    void flushNow();
  }
}

/** Plan 3 Phase 7: evict acknowledged entries older than 24h on each flush cycle. */
function evictStaleAcknowledged() {
  const cutoff = Date.now() - ACK_TTL_MS;
  const drop: string[] = [];
  for (const a of memQueue) {
    if (a.acknowledged && a.created_at < cutoff) drop.push(a.id);
  }
  if (drop.length) {
    memQueue = memQueue.filter((a) => !drop.includes(a.id));
    void idbDelete(drop);
  }
}

async function ensureInit() {
  if (initialized || !isBrowser()) {
    initialized = true;
    return;
  }
  initialized = true;
  try {
    memQueue = await idbAll();
  } catch {
    memQueue = [];
  }
  notify();
}

// ---------- Phase 1: hydration helpers ----------
function getVideoId(a: QueuedAction): string | null {
  if (a.type === "suggest" || a.type === "status" || a.type === "progress") return a.videoId;
  return null;
}

/** Live (un-acknowledged) actions targeting this video. Read from in-memory cache. */
export function getPendingForVideo(videoId: string): QueuedAction[] {
  return memQueue.filter((a) => !a.acknowledged && getVideoId(a) === videoId);
}

/** Mark queue entries as confirmed by the server; they linger until purgeConfirmed. */
export function markAcknowledged(ids: string[]) {
  if (!ids.length) return;
  let touched = false;
  for (const id of ids) {
    const m = memQueue.find((q) => q.id === id);
    if (m && !m.acknowledged) {
      m.acknowledged = true;
      void idbPut(m);
      touched = true;
    }
  }
  if (touched) notify();
}

/** After a fresh server refetch confirms state, drop the acknowledged entries for that video. */
export function purgeConfirmed(videoId: string) {
  const drop: string[] = [];
  for (const a of memQueue) {
    if (a.acknowledged && getVideoId(a) === videoId) drop.push(a.id);
  }
  if (drop.length) {
    memQueue = memQueue.filter((a) => !drop.includes(a.id));
    void idbDelete(drop);
    notify();
  }
}

/** SIGNED_OUT cleanup. */
export async function clearQueue() {
  memQueue = [];
  await idbClear();
  notify();
}

// ---------- Flush ----------
const MAX_ATTEMPTS = 3;

export async function flushNow(): Promise<void> {
  if (!isBrowser()) return;
  if (flushing) return flushing;
  await ensureInit();
  evictStaleAcknowledged();
  const live = memQueue.filter((q) => !q.acknowledged);
  if (live.length === 0) return;

  flushing = (async () => {
    const batch = live.slice(0, 100);
    const actions: BatchAction[] = batch.map((a) => {
      const { id, attempts, created_at, acknowledged, ...payload } = a;
      void attempts;
      void created_at;
      void acknowledged;
      return { id, ...payload } as BatchAction;
    });
    try {
      const res = await processBatchActions({ data: { actions } });
      const okIds: string[] = [];
      const failedIds: string[] = [];
      for (const r of res.results) {
        if (r.ok) okIds.push(r.id);
        else failedIds.push(r.id);
      }
      // Plan 3 Phase 1: mark acknowledged (don't delete) so consumers can still
      // see the in-flight value until a fresh server refetch confirms it.
      markAcknowledged(okIds);

      // Bump attempts on failed; drop after MAX_ATTEMPTS
      const drop: string[] = [];
      for (const q of memQueue) {
        if (failedIds.includes(q.id)) {
          q.attempts += 1;
          if (q.attempts >= MAX_ATTEMPTS) drop.push(q.id);
          else await idbPut(q);
        }
      }
      if (drop.length) {
        memQueue = memQueue.filter((q) => !drop.includes(q.id));
        await idbDelete(drop);
        lastError = "Some changes failed to sync after retries";
      } else {
        lastError = null;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Sync failed";
      const drop: string[] = [];
      for (const q of batch) {
        const m = memQueue.find((x) => x.id === q.id);
        if (m) {
          m.attempts += 1;
          if (m.attempts >= MAX_ATTEMPTS) drop.push(m.id);
          else await idbPut(m);
        }
      }
      if (drop.length) {
        memQueue = memQueue.filter((q) => !drop.includes(q.id));
        await idbDelete(drop);
      }
    } finally {
      notify();
    }
  })();

  try {
    await flushing;
  } finally {
    flushing = null;
  }
}

// ---------- Lifecycle ----------
export function initActionQueue(intervalMs?: number) {
  if (!isBrowser()) return () => {};
  if (intervalMs && intervalMs > 0) flushIntervalMs = intervalMs;
  void ensureInit();

  // Pull configured interval from app_settings (best-effort)
  void (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "action_flush_interval_ms")
        .maybeSingle();
      const ms = typeof data?.value === "number" ? data.value : null;
      if (ms && ms >= 60_000 && ms <= 60 * 60_000) setFlushInterval(ms);
    } catch {
      /* ignore */
    }
  })();

  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => void flushNow(), flushIntervalMs);

  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushNow();
  };
  const onPageHide = () => void flushNow();
  const onIdle = () => {
    if (memQueue.some((q) => !q.acknowledged)) void flushNow();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const w = window as IdleWindow;
  let idleHandle: number | null = null;
  if (typeof w.requestIdleCallback === "function") {
    idleHandle = w.requestIdleCallback(onIdle, { timeout: 5000 });
  }

  return () => {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    void idleHandle;
  };
}

export function setFlushInterval(ms: number) {
  if (ms <= 0) return;
  flushIntervalMs = ms;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = setInterval(() => void flushNow(), flushIntervalMs);
  }
}

export function getPending() {
  return memQueue.filter((q) => !q.acknowledged).length;
}
