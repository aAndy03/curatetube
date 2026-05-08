# CurateTube — Plan 2 (builds on `.lovable/plan.md`)

Plan 1 shipped the product surface. Plan 2 closes the missing browse routes, makes the app feel instant via a client-side action queue, pre-computes server data so public pages read flat tables, and gives admins visibility into sync health.

A new file `.lovable/plan2.md` will mirror this document.

---

## A. Missing routes

Goal: every sidebar link resolves, browse pages are SSR + cached, no bare 404s.

1. **`/suggested`** — Suggested Feed. Reads `mv_suggested_feed` (see C). Grid of cards sorted by `suggest_count` over rolling window. SSR with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
2. **`/trending`** — Trending. Reads `mv_trending`. Tabs for 24h / 72h windows. Same caching as above.
3. **`/categories`** — Category browser. Reads `mv_category_stats`. Card per category with thumbnails strip + counts. Click → existing `/categories/$id` filtered library.
4. **Sidebar guard + 404 boundary.** Audit `app-sidebar.tsx` so every link points to an existing route. Add a shared `notFoundComponent` on `__root.tsx` and on `_authenticated.tsx` so missing routes render a branded NotFound (with sidebar still intact under auth) instead of a blank page.

## B. Client-side action queue + sync engine

Goal: only truly server-authoritative actions interrupt the user; everything else feels instant and flushes in batches.

### Immediate (always server round-trip)
Submit video, moderation approve/reject, auth events, role/permission changes, leaderboard snapshot trigger.

### Deferred (queued + coalesced)
Suggest toggle, list status (like/dislike/wishlist/watched), watch progress %, feed section reorder/show-hide, notification mark-as-read, bulk audit re-anonymize.

### Implementation
- **`src/lib/action-queue.ts`** — IndexedDB-backed queue (via `idb-keyval` if needed, otherwise a tiny wrapper). Entry shape: `{ id, type, payload, created_at, attempts }`.
- **Coalescing rules** keyed by action type:
  - `suggest`: dedup by `video_id` (only one pending toggle per video, latest wins).
  - `status`: replace older entry with same `(video_id, status_type)`.
  - `progress`: replace by `video_id` with latest `%`.
  - `notif_read`: dedup by `notification_id`.
  - `feed_reorder`: replace by `section_id`.
- **Flush triggers**: `requestIdleCallback`, `visibilitychange === 'hidden'`, `pagehide`, and a configurable interval (default 10 min, read from `app_settings.action_flush_interval_ms`).
- **`POST /api/actions/batch`** server route. Body: `{ actions: QueuedAction[] }`. Server handler dispatches per `type` to existing functions (`toggleSuggest`, `toggleVideoListStatus`, etc.) inside one transaction per type, returns `{ results: [{ id, ok, error? }] }`. Exponential backoff client-side, max 3 attempts.
- **Optimistic UI**: every deferred action mutates the matching TanStack Query cache immediately; on flush failure, roll back and surface a subtle "Sync issue — retrying" chip (Sonner).
- Refactor `video-actions.tsx`, notifications sheet, and feed reorder to enqueue instead of calling server fns directly. Existing server fns stay — they are reused by the batch handler.

## C. Server-side caching + idle computation

### Materialized views (new migration)
- **`mv_trending`** — `trending_score = suggest_delta_24h*3 + like_delta_24h*2 + watch_delta_24h*1`. Refresh `*/15 * * * *`.
- **`mv_category_stats`** — `category_id, video_count, top_thumbnails[5], avg_suggest_count`. Refresh `0 3 * * *`.
- **`mv_suggested_feed`** — pre-ranked video ids by `suggest_count` over rolling window. Refresh on the same cadence as the global leaderboard tier.
- Extend `videos` with denormalized `like_count`, `dislike_count`, `watch_count`. Add insert/delete triggers on `user_video_status` to keep counters in sync (separate from queue flush — flush writes the row, trigger updates the counter).

### HTTP caching
- Public browse pages: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` set via `setResponseHeaders` in the route loader's server fn.
- Authenticated feed/profile: `private, no-store`; rely on TanStack Query `staleTime: 5min`.
- Leaderboard archive snapshots: `public, max-age=31536000, immutable`.
- TanStack Query: `staleTime` 5min for feed, 30min for taxonomy, `Infinity` for leaderboard archive; `gcTime` 15min everywhere.

### Cron endpoints (HMAC-authenticated, mirror existing leaderboard cron)
- `/api/public/cron/refresh-trending`
- `/api/public/cron/refresh-categories`
- `/api/public/cron/refresh-suggested`
- All scheduled via `pg_cron` + `pg_net` using the existing `LEADERBOARD_CRON_SECRET` pattern (or one shared `CRON_SECRET`). Each run writes a row to a new `mv_refresh_log` table (`view_name, duration_ms, rows_affected, triggered_at`).

### Heavy jobs
Audit re-anonymize bulk rewrite returns `{ job_id }` immediately; a `pg_cron` worker drains a `background_jobs` table.

## D. Client rendering polish

- **Hover prefetch** with 50ms debounce on `<Link>` for video / creator / category routes (`prefetchQuery` cancellation on `mouseleave`).
- **Intersection Observer pagination** — sentinel div at 200px root margin replaces the "Load more" button on feed and library.
- **Optimistic UI** for every deferred action (already covered in B).
- **Skeleton calibration** — exact card/line counts per surface; `content-visibility: auto` on off-screen rows.
- **Image pipeline** — YouTube thumbnails via `<img loading="lazy" decoding="async">`; first 4 above-fold cards get `fetchpriority="high"`. (Lovable Storage transform if/when migrated; YouTube CDN URLs in the meantime.)

## E. Refactor relational map

Add `.lovable/refactor-map.md` (a checklist agents must consult) describing the touch-set for each schema change:
- `videos` column change → card, detail page, moderation preview, leaderboard entry display, recommendation scorer, audit before/after, search.
- `user_video_status` enum change → ActionQueue type map, batch handler, profile tabs, sidebar counts, optimistic rollback, GDPR export.
- New permission key → seeds, every `has_permission` call, Roles matrix, HoverCard, audit action enum.
- New sidebar item → sidebar nav, route, breadcrumb, Cmd-K, mobile nav.
- `audit_log` visibility change → viewer filters, write-helper default, privacy policy, attribution renderer.
- New batch action type → ActionQueue union, coalescing map, server switch, retry config, rollback handler.

## F. Admin: queue config + sync health

- **`app_settings.action_flush_interval_ms`** — admin-editable slider (1–60 min) under `/admin/settings`. Client reads at session start.
- **Sync health widget** on a new `/admin/dashboard` (or extend `admin.settings`):
  - Pending queue depth (estimated from last-flush timestamps logged on `POST /api/actions/batch`).
  - Failed flush count (last 24h).
  - Average flush latency.
- **Materialized view refresh log viewer** — `/admin/jobs` reads `mv_refresh_log`; flags any view whose last refresh is older than `2×` expected cadence.
- **Force-flush button** per view — calls the same HMAC cron endpoint with an admin bearer token.

---

## Build phases

1. **Routes + 404** (A) — unblocks navigation immediately.
2. **Materialized views + cron** (C) — gives those routes data.
3. **Action queue + batch endpoint** (B) — wire suggest/list/notif to it.
4. **Caching headers + Query tuning + hover prefetch + IO pagination** (C/D).
5. **Admin dashboard + flush config + refresh log + force-flush** (F).
6. **Refactor map document + audit existing surfaces** (E).

## Open question

Should the deferred flush interval be **per-user overridable** (Profile → Settings → Sync) on top of the admin default, or admin-only as written above? Defaulting to admin-only keeps the surface simple — flag if you want the per-user knob.
