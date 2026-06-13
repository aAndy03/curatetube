# Plan 6 — Phase 6: Per-page optimisation audit

Sweeping audit + fixes across every route. Each card below maps 1:1 to the uploaded checklist. Items are grouped as **verify** (read code, confirm already done — no change unless missing) or **apply** (implement now). Where a fix has a dedicated phase in plan 6 (e.g. realtime monitor = Phase 1, AI feedback = Phase 2, /feed algo = Phase 3, /suggest = Phase 4, /leaderboard delta = Phase 5), this phase only confirms the per-page wiring; it does not re-implement that phase.

No new migrations in this phase. Two small migrations only if a verify uncovers a missing index or trigger (see "DB / Postgres" group). Audit-log partitioning is **deferred** (row count nowhere near 1M).

---

## Scope — what gets touched

### Public / unauthenticated

**`/` (landing)** — `src/routes/index.tsx`, `src/lib/landing.functions.ts`
- verify: `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` on landing data response
- apply: lazy-load below-fold iframes (`loading="lazy"`, defer `src` until in viewport); cap autoplay to top 2 cards
- verify: live stats read from `app_settings.landing_stats` (daily cron), no per-request aggregation
- verify: feature-card animations use IntersectionObserver + CSS only
- apply: SSR-side redirect to `/feed` when an authenticated session cookie is present (skip the public hero render entirely for logged-in users)

**`/categories`** — `src/routes/_authenticated/categories.index.tsx`, `src/lib/categories.functions.ts`
- apply: introduce a single shared category tree query (`['categories','tree']`, `staleTime: Infinity`) consumed by all Comboboxes (submit sheet, moderation, admin/videos editor, suggest)
- verify: `category_ancestors(ancestor_id)` and `(descendant_id)` indexes exist; add if missing
- verify: `video_categories` insert/delete trigger bumps `categories.video_count` via closure table (not direct only)
- apply: edit mode — optimistic insert with spinner state until server confirms
- apply: drag reorder — batch a single `sort_order` upsert array on drop, not per item

**`/categories/[slug]`** — `src/routes/_authenticated/categories.$slug.tsx`, `src/lib/category-feed.functions.ts`
- verify: descendant fetch uses closure-table join in one query
- verify: infinite scroll (IntersectionObserver) — replace any button pagination if found
- verify: breadcrumb resolved from closure table at loader time (not client-side recursion)
- apply: set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on public-shaped category feed response
- apply: direct/indirect toggle goes through a DB-side `WHERE` (server fn param), not a client filter on a fetched list

**`/tags/[slug]`** — `src/routes/_authenticated/tags.$slug.tsx`, `src/lib/tags.functions.ts`
- verify: GIN index on `videos.primary_tag_ids` / `videos.secondary_tag_ids` used for slug lookup; add if missing
- apply: reuse the VideoCard grid + infinite scroll component from `/categories/[slug]`
- apply: tag name resolved from `useTagsCache()` (no extra fetch on render)

### Core browsing

**`/feed`** — `src/routes/_authenticated/feed.tsx`, `src/lib/sections.functions.ts`, `src/lib/feed-dedup.server.ts`
- verify (Phase 3 owner): session seed read from `user_feed_state`, not regenerated per request
- verify (Phase 3 owner): single CTE for all sections
- verify: `seen_ids` dedup is in the DB (`WHERE NOT IN (...)`), not a JS `.filter()`
- apply: add `content-visibility: auto; contain-intrinsic-size: <h>` to card rows
- apply: `React.memo` VideoCard; convert inline handlers to stable `useCallback` refs on the section list
- apply: recommendation weights read from the session bootstrap payload, not a separate query per feed load

**`/suggest`** — `src/routes/_authenticated/suggest.tsx`, `src/lib/suggest-categories.functions.ts`
- verify (Phase 4 owner): server-side exclusion of `user_video_status` videos
- apply: infinite scroll replacing the fixed 30-video limit (20/page, sentinel)
- apply: category sections share the dedup helper with `/feed`
- verify: reads from `mv_suggested_feed` (pre-ranked); zero per-request scoring

**`/trending`** — `src/routes/_authenticated/trending.tsx`, `src/lib/trending-categories.functions.ts`
- verify: reads only `mv_trending` + `mv_category_trending_score`; no per-request aggregation
- apply: `Cache-Control: public, s-maxage=60` for public-shaped responses; React Query `staleTime: 5 * 60_000`
- verify: scores pre-normalised 0–100 at MV refresh
- apply: reuse the `/feed` dedup pattern for category sections

**`/leaderboard`** — `src/routes/_authenticated/leaderboard.tsx`, `src/lib/leaderboard.functions.ts`
- verify (Phase 5 owner): ETag conditional GET; delta-only payload
- verify: `leaderboard_current` pre-computed at snapshot time (no rank computation at read)
- apply: 60 s live-score poll using `refetchInterval`, paused via `document.visibilityState !== 'visible'` and on `visibilitychange`
- apply: rank-change animations via the View Transitions API where supported (graceful fallback: CSS transition on `transform`)

**`/leaderboard/archive`** — `src/routes/_authenticated/leaderboard.archive.tsx`
- apply: `Cache-Control: public, max-age=31536000, immutable` on archived snapshot responses
- verify: calendar in Popover + tier/scope Select all sync via URL search params
- apply: `staleTime: Infinity` client-side for archived snapshots

**`/creators`** — `src/routes/_authenticated/creators.index.tsx`, `src/lib/creator-categories.functions.ts`
- verify: "By category" view reads `mv_creator_categories` (no join at request time); add MV if missing — flagged as a follow-up if not present
- apply: creator-badge hover prefetch with a 50 ms delay (match plan 2 pattern)
- apply: `staleTime: 10 * 60_000` on creator list

**`/creators/[id]`** — `src/routes/_authenticated/creators.$id.tsx`
- apply: badge-hover prefetch fires both `getCreator` + `getVideosByCreator`
- verify: contributors list filtered by `audit_privacy_mode='public'` server-side
- apply: infinite scroll on the video grid

**`/v/[id]`** — `src/routes/_authenticated/v.$id.tsx`
- verify: `useHydratedStatus` merges IndexedDB queue state
- verify: primary tag chips render from `videos.primary_tag_ids` (no extra join)
- verify: category breadcrumb pre-computed in the loader from the closure table
- verify (security): non-approved videos hidden from non-staff (plan 5 patch) — confirm RLS + server-fn check
- apply: hover prefetch from any VideoCard linking here

### Authenticated personal

**`/me` (profile Sheet)** — `src/routes/_authenticated/me.$tab.tsx`, `src/components/profile-settings-sheet.tsx`
- apply: lazy-load each tab's data on first activation only (Wishlist / Liked / Disliked / Watched / Suggested)
- verify: `useHydratedStatus` on all list items
- apply: `staleTime: 2 * 60_000` per tab
- apply: virtualise long lists with `@tanstack/react-virtual` (threshold: >50 rows)

**Submit Sheet** — `src/components/submit-sheet.tsx`, `src/lib/submit.functions.ts`
- apply: quota counter — server read on Sheet open with `staleTime: 0`
- apply (Phase 1 owner): wire AI submit-job auto-start via DB webhook trigger (this phase only confirms the Submit Sheet calls the right server fn)
- apply: switch category + tag inputs to the shared `staleTime: Infinity` caches; remove any per-open re-fetch
- verify: multi-URL YouTube metadata fetched via `Promise.all`

**Notification Sheet** — `src/components/notifications-sheet.tsx`
- apply: virtual list (`@tanstack/react-virtual`) for the notification rows
- apply: "Past" section data only fetched when the section is expanded
- verify: bell-badge count comes from session bootstrap (no extra query at mount)
- verify: "Mark all read" — immediate server write + optimistic badge reset

### Admin

**Admin / Dashboard** — admin landing
- verify: all metric cards read from pre-computed `app_settings` keys (daily cron)
- apply (Phase 2 owner): mount the AI accuracy + coverage % card
- apply: `staleTime: 5 * 60_000` on Recharts data queries

**Admin / Videos** — `src/routes/_authenticated/admin.videos.index.tsx`, `src/lib/admin-videos.functions.ts`
- apply: convert `select('*')` to explicit column lists matching the DataTable
- apply: hover prefetch to `/admin/videos/[id]`
- apply (Phase 1 owner): background monitor uses Supabase Realtime on `ai_jobs` + `ai_agent_sessions`
- verify: batch assign runs in a single transactional insert (plan 4)
- apply (Phase 2 owner): mount "AI Insights" tab — acceptance rates per slug

**Admin / Videos / [id]** — `src/routes/_authenticated/admin.videos.$videoId.tsx`
- verify: `refetchInterval: jobActive ? 5000 : false` on AI-results query
- apply (Phase 1 owner): streaming JSON parse so results appear progressively (this phase wires the UI to the streaming response)
- apply: lock three-column grid sizes so no layout shift while AI panel populates

**Moderation queue** — `src/routes/_authenticated/moderation.tsx`
- apply: virtualise the left list via `@tanstack/react-virtual`
- apply (out-of-band fix): join `tags` in the queue query so the UI shows tag names, not IDs
- verify: AI panel shows submit-time results immediately; "Re-run AI" is the only path that re-dispatches
- apply: bulk approve/reject is a single batch server-fn call

**Admin / Reports** — `src/routes/_authenticated/admin.reports.tsx`, `src/lib/reports.functions.ts`
- verify: left panel pre-sorted by open count server-side
- verify: right-panel search is a client filter over the loaded reports (cap ≤200/video)
- apply: filters URL-param synced

**Admin / Users** — `src/routes/_authenticated/admin.users.tsx`, `src/lib/admin-users.functions.ts`
- verify: email masking server-side (already implemented plan 5 Phase 10) — confirm
- verify: role Combobox options filtered server-side by actor level
- verify: 50/page infinite scroll
- apply: user-detail Sheet lazy-loads the last 20 audit entries only on Sheet open

**Admin / Broadcasts** — `src/routes/_authenticated/admin.broadcast.tsx`, `src/lib/broadcasts.functions.ts`
- apply: archive DataTable paginated, filters URL-param synced
- apply: read counts via `COUNT(user_broadcast_reads)` at query time (sufficient at current volume; promote to an MV only if >100k rows — out-of-scope here, just leave a TODO comment)
- apply: category list from `app_settings` in-memory (no separate fetch)

**Admin / Audit log** — `src/routes/_authenticated/admin.audit.tsx`
- defer: monthly partitioning (row count nowhere near 1M) — leave a TODO with the partitioning DDL sketch
- apply: row-expand uses `Collapsible` with no extra fetch (diff payload included in the initial row)
- verify: filter by actor / action / date all server-side with indexed columns; add indexes if `EXPLAIN` shows a seq scan

**Admin / Roles & Permissions** — `src/routes/_authenticated/admin.roles.tsx`
- apply: matrix loaded once, `staleTime: 30 * 60_000`
- verify: inline checkbox toggle writes immediately per cell
- verify: plan 5/6 permission keys (`ai.dispatch`, `ai.review`, `ai.manage`, `users.view`, `users.manage`) all render in the matrix

**Admin / Settings** — `src/routes/_authenticated/admin.settings.tsx`
- verify: all settings auto-save inline + Sonner confirmation (no submit button)
- apply (Phase 2 owner): AI section adds feedback-threshold sliders alongside existing model selectors and parallel-agent control
- verify: orchestrator hot-reloads `app_settings` each cron tick

**Recommendation weights**
- verify (Phase 3 owner): weights are wired into the feed assembly fn
- verify (Phase 4 owner): weights applied to `/suggest` personalised scoring
- apply: on weight save → invalidate `user_feed_state` cache row for the user so the next `/feed` load uses the new weights

### Global / cross-cutting

**Action queue (IndexedDB)** — `src/lib/action-queue.ts`
- verify: 500-entry cap with immediate flush on exceed
- verify: acknowledged entries evicted after 24 h on each flush
- verify: `useHydratedStatus` merges queue state for every status-bearing component

**Session bootstrap** — `src/lib/auth-context.tsx`
- apply: single bootstrap query returning `{ profile, roles, unreadCount, recommendation_settings, app_settings_public }`
- apply: category tree + tag list fetched once after bootstrap and exposed via context (replaces any per-component fetch)
- verify: `onAuthStateChange` — `TOKEN_REFRESHED` silent; `SIGNED_OUT` clears IndexedDB queue + redirects

**VideoCard (global)** — `src/components/video-card.tsx`
- verify: `React.memo` + stable `useCallback` props
- verify: `primary_tag_ids` resolved from in-memory tag cache
- apply: 50 ms hover-prefetch on every card link
- apply: serve thumbnails as AVIF/WebP via YouTube's `hqdefault.webp` URL when available; add `fetchpriority="high"` to the first 4 cards on `/feed`, `/suggest`, `/trending`, `/categories/[slug]`

**DB / Postgres** — migration only if a verify finds a missing piece
- apply: add `last_refreshed_at timestamptz` column to every MV (`mv_trending`, `mv_suggested_feed`, `mv_category_trending_score`, …) and have `refresh_mv()` write `now()` on success — for the admin health monitor
- defer: `audit_log` monthly partitioning
- apply: codemod pass — replace every `select('*')` in `src/lib/**/*.functions.ts` with explicit column lists
- verify: indexes — closure table `(ancestor_id)` + `(descendant_id)`, GIN on `videos.primary_tag_ids`/`secondary_tag_ids`, partial index on `video_tags(video_id) WHERE rank IS NOT NULL`, composite on `user_video_status(user_id, video_id)`; add any missing in a single small migration

---

## Execution order (single batch where safe)

1. **DB sweep first** — one migration adding any missing indexes + MV `last_refreshed_at` columns + the `refresh_mv()` update. Nothing else depends on it.
2. **Shared infra** — session bootstrap consolidation, shared category/tag caches, dedup helper extraction, hover-prefetch helper. Everything else uses these.
3. **Public pages** — landing, categories, tags (smallest blast radius).
4. **Core browsing** — `/feed`, `/suggest`, `/trending`, `/leaderboard(/archive)`, `/creators(/$id)`, `/v/$id`.
5. **Personal pages** — `/me`, Submit Sheet, Notification Sheet.
6. **Admin pages** — dashboard, videos (+ $id), moderation, reports, users, broadcasts, audit, roles, settings, recommendation weights.
7. **Global polish** — VideoCard thumbnail format + fetchpriority pass, `select('*')` codemod, final verify pass.

---

## Out of scope (explicit, won't touch)

- AI Phase 1 (auto-start + token budget) — only the per-page wiring (Submit Sheet, monitor) is touched here; the orchestrator/webhook lives in Phase 1.
- AI Phase 2 (feedback loop + `ai_feedback_log`) — only the UI mount points are added here.
- Feed algorithm (Phase 3), Suggest exclusion (Phase 4), Leaderboard delta/ETag (Phase 5) — verified, not re-implemented.
- `audit_log` partitioning — deferred, TODO comment only.
- Creator MV (`mv_creator_categories`) creation if missing — flagged as a follow-up, not built in this phase.

---

## Open questions

1. **AVIF/WebP thumbnails**: YouTube serves `…hqdefault.webp`; do you also want a tiny self-hosted AVIF resize pipeline (Worker + KV) for sharper thumbs at 2× DPR, or stick to YouTube's WebP for now?
2. **Virtualisation threshold** for `/me` lists and the moderation queue — keep my default of >50 rows, or always virtualise?
3. **Landing SSR redirect for authed users**: do via cookie sniff in the loader (fast, no JS flash) or client-side `<Navigate>` (simpler, brief flash)?
4. **`select('*')` codemod** — happy with a mechanical pass where I replace every `*` with an explicit list inferred from current usage, or do you want me to PR it as a separate review-only change?
