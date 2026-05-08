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
      return "notif_read"; // single coalesced bucket
    case "feed_reorder":
      return "feed_reorder";
  }
}

function notify() {
  const state = { pending: memQueue.length, lastError };
  listeners.forEach((l) => l(state));
}

export function subscribeQueue(
  fn: (state: { pending: number; lastError: string | null }) => void,
): () => void {
  listeners.add(fn);
  fn({ pending: memQueue.length, lastError });
  return () => listeners.delete(fn);
}

export async function enqueue(action: QueuedActionPayload): Promise<void> {
  await ensureInit();
  const key = coalesceKey(action);

  // Coalesce: replace existing same-key entry
  const existingIdx = memQueue.findIndex((q) => coalesceKey(q) === key);
  let merged: QueuedAction;

  if (action.type === "notif_read" && existingIdx >= 0) {
    const prev = memQueue[existingIdx] as Extract<QueuedAction, { type: "notif_read" }>;
    const prevIds = prev.ids ?? null;
    const nextIds = action.ids ?? null;
    // null = mark-all; null wins
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

// ---------- Flush ----------
const MAX_ATTEMPTS = 3;

export async function flushNow(): Promise<void> {
  if (!isBrowser()) return;
  if (flushing) return flushing;
  await ensureInit();
  if (memQueue.length === 0) return;

  flushing = (async () => {
    const batch = memQueue.slice(0, 100);
    const actions: BatchAction[] = batch.map((a) => {
      const { id, attempts, created_at, ...payload } = a;
      void attempts;
      void created_at;
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
      // Drop successful
      memQueue = memQueue.filter((q) => !okIds.includes(q.id));
      await idbDelete(okIds);

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
      // Bump attempts on transport failure
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

  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => void flushNow(), flushIntervalMs);

  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushNow();
  };
  const onPageHide = () => void flushNow();
  const onIdle = () => {
    if (memQueue.length > 0) void flushNow();
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
  return memQueue.length;
}
