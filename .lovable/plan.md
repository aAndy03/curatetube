# Plan 6 — Phase 6: Per-page optimisation audit

Sweeping audit + fixes across every route. Items are grouped as **verify** (read code, confirm already done — no change unless missing) or **apply** (implement now). Where a fix has a dedicated phase in plan 6 (e.g. realtime monitor = Phase 1, AI feedback = Phase 2, /feed algo = Phase 3, /suggest = Phase 4, /leaderboard delta = Phase 5), this phase only confirms the per-page wiring; it does not re-implement that phase.

Work is split into **8 steps**: Step 0 is everything already shipped, Step 1 is the shared foundation, and Steps 2–5 cover the remaining surface area. Steps 3 and 5 are large enough that they ship as `3a/3b` and `5a/5b` so each step stays reviewable.

---

## Step 0 — Already implemented ✅

Shipped in earlier turns of Phase 6. Nothing to do here; listed so the remaining steps don't re-touch them.

**DB**
- Migration: GIN index `videos_primary_tag_ids_gin` on `videos.primary_tag_ids` (the `secondary_tag_ids` column does not exist in schema — skipped).
- Verified: closure-table indexes `(ancestor_id)` + `(descendant_id)`.
- Verified: partial index on `video_tags(video_id) WHERE rank ≤ 3`.
- Verified: composite indexes on `user_video_status(user_id, status, created_at)` and `(video_id, status)`.
- Verified: `mv_refresh_log` already records `view_name`, `triggered_at`, `ok`, `duration_ms` — admin health monitor can read directly; no `last_refreshed_at` MV column needed.

**Landing — `src/routes/index.tsx`**
- Only the top 2 video-wall iframes autoplay; cards 3–6 render as static `<img>` thumbnails with `object-cover`.
- Verified: `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` on landing data response.
- Verified: SSR-side redirect to `/feed` when an authenticated session is present.

**Notifications — `src/lib/lists.functions.ts`**
- Replaced `select('*')` with explicit column list (`id, title, body, link, read_at, created_at, type, data`); unread count uses `select("id", { count: "exact", head: true })`.

**VideoCard — `src/components/video-card.tsx`**
- Verified: `React.memo`, tag cache, `content-visibility: auto`, `contain-intrinsic-size`, `fetchpriority="high"` on priority cards, lazy thumbnails.

**Notifications Sheet — `src/components/notifications-sheet.tsx`**
- Verified: already virtualised with `@tanstack/react-virtual`.

**Tags page — `src/routes/_authenticated/tags.$slug.tsx`**
- Verified: filters by `status='approved'` server-side with explicit column list.

---

## Step 1 — Shared infra (foundation for steps 2–5) ✅

Shipped. Touches code that every later step depends on. Each helper is the canonical entry point — steps 2–5 must consume these instead of rolling their own equivalent.

**Session bootstrap consolidation**
- shipped: `src/lib/session-bootstrap.functions.ts` — one round-trip returning `{ profile, roleNames, isOwner, permissions, unreadCount, recommendationWeights, appSettingsPublic }`. Owner-bypass logic baked in; `app_settings` filtered through a `PUBLIC_APP_SETTING_KEYS` allow-list so secrets stay admin-only.
- shipped: `src/hooks/use-session-bootstrap.ts` — `useSessionBootstrap()` (5 min stale, 30 min gc, query key `['session-bootstrap', userId]`). Exposes `.has(key)` + `.isOwner` so consumers can drop `usePermissions` calls. Mutations that change a slice MUST invalidate this key.
- next-turn migration: swap `usePermissions` call sites + per-page profile/weights/unread queries over to `useSessionBootstrap`; delete `usePermissions` once empty.
- verify: `onAuthStateChange` — `TOKEN_REFRESHED` silent; `SIGNED_OUT` clears IndexedDB queue + redirects. (Auth-context untouched this step; behaviour confirmed unchanged.)

**Shared caches**
- shipped: `src/hooks/use-category-tree.ts` — `useCategoryTree()` with `staleTime: Infinity`, exposes `nodes / byId / bySlug / childrenOf`. Single source for submit sheet, moderation, admin/videos editor, suggest, `/categories`.
- in place: `src/hooks/use-tags-cache.ts` already provides `useTagsCache()` (10 min stale, `byId` Map). VideoCard + tag chips should read from it directly.

**Shared helpers**
- shipped: `src/lib/dedup-seen-ids.server.ts` — `dedupSeenIds(candidateIds, userId)` + `commitSeenIds(userId, seen, newlyShownIds)` wrapping the existing `feed-dedup.server` primitives. `/feed`, `/suggest`, `/trending` should use this pair instead of touching `loadOrResetDedup` / `persistDedup` directly.
- shipped: `src/lib/prefetch-on-hover.ts` — `usePrefetchOnHover(to, params, 50)` returning `{ onMouseEnter, onMouseLeave, onFocus, onBlur }`. Drop-in for VideoCard, creator badges, admin row links.

**DB tidy (only if missing)**
- verify (and add if missing in one small migration): any remaining missing index uncovered while writing the codemod in step 5b.

---

## Step 2 — Public pages

Smallest blast radius. Uses helpers from step 1.

**`/categories` — `src/routes/_authenticated/categories.index.tsx`, `src/lib/categories.functions.ts`**
- apply: swap all Comboboxes to `useCategoryTree()` from step 1.
- verify: `video_categories` insert/delete trigger bumps `categories.video_count` via closure table.
- apply: edit mode — optimistic insert with spinner state until server confirms.
- apply: drag reorder — batch a single `sort_order` upsert array on drop, not per item.

**`/categories/[slug]` — `src/routes/_authenticated/categories.$slug.tsx`, `src/lib/category-feed.functions.ts`**
- verify: descendant fetch uses closure-table join in one query.
- verify: infinite scroll (IntersectionObserver) — replace any button pagination if found.
- verify: breadcrumb resolved from closure table at loader time (not client-side recursion).
- apply: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on public-shaped responses.
- apply: direct/indirect toggle goes through a DB-side `WHERE` (server-fn param), not a client filter.

**`/tags/[slug]` — `src/routes/_authenticated/tags.$slug.tsx`, `src/lib/tags.functions.ts`**
- verify: GIN index used for slug lookup (step 0 confirmed `primary_tag_ids_gin`).
- apply: reuse the VideoCard grid + infinite scroll component from `/categories/[slug]`.
- apply: tag name resolved from `useTagsCache()` (no extra fetch on render).

---

## Step 3a — Core browsing: feeds (`/feed`, `/suggest`, `/trending`)

Shared-shape rails. All three consume the step-1 dedup helper and bootstrap weights; ship together so the dedup cycle stays consistent.

**`/feed` — `src/routes/_authenticated/feed.tsx`, `src/lib/sections.functions.ts`, `src/lib/feed-dedup.server.ts`**
- verify (Phase 3 owner): session seed read from `user_feed_state`, not regenerated per request.
- verify (Phase 3 owner): single CTE for all sections.
- verify: dedup uses the step-1 server-side helper.
- apply: add `content-visibility: auto; contain-intrinsic-size: <h>` to card rows.
- apply: `React.memo` VideoCard; convert inline handlers to stable `useCallback` refs.
- apply: recommendation weights read from the session bootstrap (step 1), not a per-load query.

**`/suggest` — `src/routes/_authenticated/suggest.tsx`, `src/lib/suggest-categories.functions.ts`**
- verify (Phase 4 owner): server-side exclusion of `user_video_status` videos.
- apply: infinite scroll replacing the fixed 30-video limit (20/page, sentinel).
- apply: category sections share the dedup helper.
- verify: reads from `mv_suggested_feed` (pre-ranked); zero per-request scoring.

**`/trending` — `src/routes/_authenticated/trending.tsx`, `src/lib/trending-categories.functions.ts`**
- verify: reads only `mv_trending` + `mv_category_trending_score`.
- apply: `Cache-Control: public, s-maxage=60`; React Query `staleTime: 5 * 60_000`.
- verify: scores pre-normalised 0–100 at MV refresh.
- apply: reuse the `/feed` dedup pattern for category sections.

---

## Step 3b — Core browsing: discovery + detail (`/leaderboard`, `/creators`, `/v/[id]`)

Different data shape (ranked snapshots, creator joins, single-video detail). Ship after 3a so the dedup helper and hover-prefetch are battle-tested.

**`/leaderboard` — `src/routes/_authenticated/leaderboard.tsx`, `src/lib/leaderboard.functions.ts`**
- verify (Phase 5 owner): ETag conditional GET; delta-only payload.
- verify: `leaderboard_current` pre-computed at snapshot time.
- apply: 60 s live-score poll via `refetchInterval`, paused on `document.visibilityState !== 'visible'` + `visibilitychange`.
- apply: rank-change animations via View Transitions API (fallback: CSS transition on `transform`).

**`/leaderboard/archive` — `src/routes/_authenticated/leaderboard.archive.tsx`**
- apply: `Cache-Control: public, max-age=31536000, immutable` on archived snapshot responses.
- verify: calendar Popover + tier/scope Select sync via URL search params.
- apply: `staleTime: Infinity` for archived snapshots.

**`/creators` — `src/routes/_authenticated/creators.index.tsx`, `src/lib/creator-categories.functions.ts`**
- verify: "By category" view reads `mv_creator_categories` (no join at request time); follow-up flagged if missing.
- apply: creator-badge hover prefetch via the step-1 helper (50 ms delay).
- apply: `staleTime: 10 * 60_000` on creator list.

**`/creators/[id]` — `src/routes/_authenticated/creators.$id.tsx`**
- apply: badge-hover prefetch fires both `getCreator` + `getVideosByCreator`.
- verify: contributors list filtered by `audit_privacy_mode='public'` server-side.
- apply: infinite scroll on the video grid.

**`/v/[id]` — `src/routes/_authenticated/v.$id.tsx`**
- verify: `useHydratedStatus` merges IndexedDB queue state.
- verify: primary tag chips render from `videos.primary_tag_ids` (no extra join).
- verify: category breadcrumb pre-computed in loader from closure table.
- verify (security): non-approved videos hidden from non-staff — confirm RLS + server-fn check.
- apply: hover prefetch from any VideoCard linking here (step-1 helper).

---

## Step 4 — Authenticated personal

**`/me` (profile Sheet) — `src/routes/_authenticated/me.$tab.tsx`, `src/components/profile-settings-sheet.tsx`**
- apply: lazy-load each tab's data on first activation only (Wishlist / Liked / Disliked / Watched / Suggested).
- verify: `useHydratedStatus` on all list items.
- apply: `staleTime: 2 * 60_000` per tab.
- apply: virtualise long lists with `@tanstack/react-virtual` (threshold >50 rows).

**Submit Sheet — `src/components/submit-sheet.tsx`, `src/lib/submit.functions.ts`**
- apply: quota counter — server read on Sheet open with `staleTime: 0`.
- apply (Phase 1 owner): confirm Submit Sheet calls the right server fn for AI submit-job auto-start.
- apply: category + tag inputs use the shared step-1 caches; remove any per-open re-fetch.
- verify: multi-URL YouTube metadata fetched via `Promise.all`.

**Notification Sheet — `src/components/notifications-sheet.tsx`**
- apply: "Past" section data only fetched when expanded.
- verify: bell-badge count from session bootstrap (no extra mount-time query).
- verify: "Mark all read" — immediate server write + optimistic badge reset.
- (virtualisation already shipped — see step 0.)

---

## Step 5a — Admin: content surfaces (Dashboard, Videos, Moderation)

The high-traffic admin views: read-heavy DataTables, AI panels, and the moderation queue. Ship before 5b so the codemod + recommendation-weight invalidation land against settled callers.

**Admin / Dashboard**
- verify: metric cards read from `app_settings` (daily cron).
- apply (Phase 2 owner): mount the AI accuracy + coverage % card.
- apply: `staleTime: 5 * 60_000` on Recharts data queries.

**Admin / Videos — `src/routes/_authenticated/admin.videos.index.tsx`, `src/lib/admin-videos.functions.ts`**
- apply: convert `select('*')` to explicit column lists matching the DataTable.
- apply: hover prefetch to `/admin/videos/[id]`.
- apply (Phase 1 owner): background monitor uses Supabase Realtime on `ai_jobs` + `ai_agent_sessions`.
- verify: batch assign runs in a single transactional insert.
- apply (Phase 2 owner): mount "AI Insights" tab — acceptance rates per slug.

**Admin / Videos / [id] — `src/routes/_authenticated/admin.videos.$videoId.tsx`**
- verify: `refetchInterval: jobActive ? 5000 : false` on AI-results query.
- apply (Phase 1 owner): streaming JSON parse so results appear progressively.
- apply: lock three-column grid sizes so no layout shift while AI panel populates.

**Moderation queue — `src/routes/_authenticated/moderation.tsx`**
- apply: virtualise the left list via `@tanstack/react-virtual`.
- apply (out-of-band fix): join `tags` in the queue query so the UI shows tag names, not IDs.
- verify: AI panel shows submit-time results immediately; "Re-run AI" is the only re-dispatch path.
- apply: bulk approve/reject is a single batch server-fn call.

---

## Step 5b — Admin: governance + global polish

Lower-traffic admin views (reports/users/broadcasts/audit/roles/settings) plus the cross-cutting polish that touches every page (VideoCard, action queue, recommendation invalidation, `select('*')` codemod). Ship last.

**Admin / Reports — `src/routes/_authenticated/admin.reports.tsx`, `src/lib/reports.functions.ts`**
- verify: left panel pre-sorted by open count server-side.
- verify: right-panel search is a client filter (cap ≤200/video).
- apply: filters URL-param synced.

**Admin / Users — `src/routes/_authenticated/admin.users.tsx`, `src/lib/admin-users.functions.ts`**
- verify: email masking server-side (plan 5 Phase 10).
- verify: role Combobox options filtered server-side by actor level.
- verify: 50/page infinite scroll.
- apply: user-detail Sheet lazy-loads the last 20 audit entries only on Sheet open.

**Admin / Broadcasts — `src/routes/_authenticated/admin.broadcast.tsx`, `src/lib/broadcasts.functions.ts`**
- apply: archive DataTable paginated, filters URL-param synced.
- apply: read counts via `COUNT(user_broadcast_reads)` at query time (TODO comment to promote to MV at >100k rows).
- apply: category list from `app_settings` in-memory (no separate fetch).

**Admin / Audit log — `src/routes/_authenticated/admin.audit.tsx`**
- defer: monthly partitioning — leave a TODO with partitioning DDL sketch.
- apply: row-expand uses `Collapsible` with no extra fetch (diff payload included).
- verify: filter by actor / action / date server-side with indexed columns; add indexes if `EXPLAIN` shows a seq scan.

**Admin / Roles & Permissions — `src/routes/_authenticated/admin.roles.tsx`**
- apply: matrix loaded once, `staleTime: 30 * 60_000`.
- verify: inline checkbox toggle writes immediately per cell.
- verify: plan 5/6 keys (`ai.dispatch`, `ai.review`, `ai.manage`, `users.view`, `users.manage`) all render.

**Admin / Settings — `src/routes/_authenticated/admin.settings.tsx`**
- verify: all settings auto-save inline + Sonner confirmation.
- apply (Phase 2 owner): AI section adds feedback-threshold sliders alongside existing model selectors + parallel-agent control.
- verify: orchestrator hot-reloads `app_settings` each cron tick.

**Recommendation weights**
- verify (Phase 3 owner): weights wired into feed assembly fn.
- verify (Phase 4 owner): weights applied to `/suggest` personalised scoring.
- apply: on weight save → invalidate `user_feed_state` cache row for the user.

**Action queue (IndexedDB) — `src/lib/action-queue.ts`**
- verify: 500-entry cap with immediate flush on exceed.
- verify: acknowledged entries evicted after 24 h on each flush.
- verify: `useHydratedStatus` merges queue state for every status-bearing component.

**VideoCard global polish — `src/components/video-card.tsx`**
- apply: 50 ms hover-prefetch on every card link (step-1 helper).
- apply: serve thumbnails as WebP via YouTube's `hqdefault.webp` URL when available; `fetchpriority="high"` on the first 4 cards on `/feed`, `/suggest`, `/trending`, `/categories/[slug]`.

**`select('*')` codemod**
- apply: replace every `select('*')` in `src/lib/**/*.functions.ts` with explicit column lists (known remaining: `sections.functions.ts` ×5, `library.functions.ts:564`).

---

## Out of scope (explicit, won't touch)

- AI Phase 1 (auto-start + token budget) — only per-page wiring is touched here.
- AI Phase 2 (feedback loop + `ai_feedback_log`) — only UI mount points added here.
- Feed algorithm (Phase 3), Suggest exclusion (Phase 4), Leaderboard delta/ETag (Phase 5) — verified, not re-implemented.
- `audit_log` partitioning — deferred, TODO only.
- Creator MV (`mv_creator_categories`) creation if missing — flagged as follow-up.

---

## Open questions

1. **AVIF/WebP thumbnails**: YouTube serves `…hqdefault.webp`; also want a self-hosted AVIF pipeline (Worker + KV) for 2× DPR, or stick to YouTube WebP?
2. **Virtualisation threshold** for `/me` lists + moderation queue — keep >50 rows, or always virtualise?
3. **`select('*')` codemod** — mechanical pass replacing `*` with inferred column lists, or PR as a separate review-only change?
