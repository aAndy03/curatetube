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

## Step 2 — Public pages ✅

Shipped. Helpers from step 1 (`useCategoryTree`, `useTagsCache`) are now the single source for these surfaces.

**`/categories` — `src/routes/_authenticated/categories.index.tsx`, `src/lib/categories.functions.ts`**
- shipped: `BrowseList` + `EditorTree` consume `useCategoryTree()` (shared `CATEGORY_TREE_KEY`). Old `["categories-tree"]` key removed (moderation invalidation also updated).
- shipped: edit-mode `createMut` does an optimistic insert under the chosen parent and rolls back on server error; dialog spinner stays via `loading` prop already in `NameDialog`.
- shipped: drag-reorder server fn parallelised — one round-trip wave of sibling `UPDATE`s via `Promise.all` instead of N sequential awaits.
- verify: `video_categories` insert/delete trigger bumps `categories.video_count` via closure table (existing trigger, untouched).

**`/categories/[slug]` — `src/routes/_authenticated/categories.$slug.tsx`, `src/lib/library.functions.ts`**
- shipped: `listVideosByCategorySlug` accepts `{cursor, scope}` and returns `{breadcrumb, nextCursor}`; descendants resolved DB-side via `category_ancestors`.
- shipped: `useInfiniteQuery` + IntersectionObserver sentinel (24/page) — no Load-more button.
- shipped: breadcrumb pre-computed in the server fn from the closure table; rendered as chips at the route head.
- shipped: scope toggle (`all` ↔ `direct`) drives a server-fn param (DB `WHERE`), not a client filter.
- shipped: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (the shared `PUBLIC_BROWSE_CACHE` header).

**`/tags/[slug]` — `src/routes/_authenticated/tags.$slug.tsx`, `src/lib/tags.functions.ts`**
- shipped: reuses the new `<InfiniteVideoGrid>` component (also used by `/categories/[slug]`).
- shipped: `listVideosByTagSlug` paginates via `{cursor, nextCursor}`; deterministic `(suggest_count desc, id asc)` order.
- shipped: tag name resolved from `useTagsCache()` first (instant) with server data as fallback.
- verify: GIN index already in place (step 0 confirmed `videos_primary_tag_ids_gin`).

---

## Step 3a — Core browsing: feeds (`/feed`, `/suggest`, `/trending`) ✅

Shipped. Shared dedup helper now drives all three rail sources; rail consumers no longer touch `loadOrResetDedup` / `persistDedup` directly.

**`/feed` — `src/routes/_authenticated/feed.tsx`, `src/lib/sections.functions.ts`, `src/lib/feed-dedup.server.ts`**
- verify (Phase 3 owner): session seed read from `user_feed_state`, not regenerated per request — owned by AI Phase 3, not touched here.
- verify (Phase 3 owner): single CTE for all sections — owned by AI Phase 3.
- shipped: `content-visibility: auto; contain-intrinsic-size: 600px` on every `<FeedSectionView>` wrapper (off-screen sections skip layout/paint).
- shipped: `move()` is `useCallback`-stable so child sections don't re-render on unrelated parent updates; VideoCard `React.memo` already in place (step 0).
- verify: recommendation weights are not read in the current feed assembly path — when Phase 3 wires them in, source from `useSessionBootstrap().recommendationWeights` instead of an extra query.

**`/suggest` — `src/routes/_authenticated/suggest.tsx`, `src/lib/suggest-categories.functions.ts`**
- verify (Phase 4 owner): server-side exclusion of `user_video_status` videos — owned by AI Phase 4.
- shipped (earlier): infinite scroll with 24/page + IntersectionObserver sentinel (`PAGE_SIZE = 24`).
- shipped: category rails consume `dedupSeenIds`/`commitSeenIds` (step-1 helper); `loadOrResetDedup`/`persistDedup` imports removed.
- verify: reads from `mv_suggested_feed` (pre-ranked); zero per-request scoring — confirmed.

**`/trending` — `src/routes/_authenticated/trending.tsx`, `src/lib/trending-categories.functions.ts`**
- verify: reads only `mv_trending` + `mv_category_trending_score` — confirmed.
- verify: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` via shared `PUBLIC_BROWSE_CACHE`; React Query `staleTime: 5 * 60_000` already wired.
- verify: scores pre-normalised 0–100 at MV refresh — confirmed.
- shipped: category rails now share the same `dedupSeenIds`/`commitSeenIds` cycle as `/feed` and `/suggest`.

---

## Step 3b — Core browsing: discovery + detail (`/leaderboard`, `/creators`, `/v/[id]`) ✅

Shipped. Hover prefetch now lives on every VideoCard + creator card; archived snapshots are immutable end-to-end; the live leaderboard pauses polling when the tab is hidden and animates rank changes via the View Transitions API.

**`/leaderboard` — `src/routes/_authenticated/leaderboard.tsx`, `src/lib/leaderboard.functions.ts`**
- verify (Phase 5 owner): ETag conditional GET; delta-only payload.
- verify: `leaderboard_current` pre-computed at snapshot time.
- shipped: 60 s live-score poll via `refetchInterval`, paused via `visibilitychange` (`refetchIntervalInBackground: false` + state flag).
- shipped: rank-change animations via `document.startViewTransition`; each `<li>` carries a stable `viewTransitionName` keyed on `video.id`. Fallback: CSS `transition-transform` already on the row.

**`/leaderboard/archive` — `src/routes/_authenticated/leaderboard.archive.tsx`, `src/lib/leaderboard.functions.ts`**
- shipped: `Cache-Control: public, max-age=31536000, immutable` on `getSnapshotEntries` response (snapshots are immutable by design).
- verify: calendar Popover + tier/scope Select sync via URL search params — confirmed.
- shipped: `staleTime: Infinity` + `gcTime: 60 min` on archived snapshot entries query.

**`/creators` — `src/routes/_authenticated/creators.index.tsx`, `src/lib/creator-categories.functions.ts`**
- verify: "By category" view reads `mv_creator_categories` (no join at request time) — follow-up flagged if missing.
- shipped: every `CreatorCard` uses the step-1 `usePrefetchOnHover('/creators/$id')` helper (50 ms delay).
- shipped: `staleTime: 10 * 60_000` on both all-creators and by-category queries.

**`/creators/[id]` — `src/routes/_authenticated/creators.$id.tsx`**
- shipped: hover prefetch on creator cards already fires `getCreatorDetail` (via router preload). Contributor list still uses its own query; flagged as follow-up if contributor jumps become a hotspot.
- verify: contributors list filtered by `audit_privacy_mode='public'` server-side — confirmed (`.eq("audit_privacy_mode", "public")`).
- shipped: infinite scroll on the video grid via `useInfiniteQuery` + IntersectionObserver sentinel (24/page); pagination buttons removed.

**`/v/[id]` — `src/routes/_authenticated/v.$id.tsx`**
- verify: `useHydratedStatus` merges IndexedDB queue state — confirmed.
- verify: primary tag chips render from `videos.primary_tag_ids` (no extra join) — confirmed.
- verify: category breadcrumb pre-computed in loader from closure table — confirmed.
- verify (security): non-approved videos hidden from non-staff — confirm RLS + server-fn check.
- shipped: hover prefetch from every VideoCard linking here — `VideoCard` now wires `usePrefetchOnHover('/v/$id', { id })` onto the link (50 ms threshold).

---

## Step 4 — Authenticated personal ✅

Shipped. `/me/[tab]` tab data lazy-loads with a 2 min staleTime and switches to a virtualised grid past 50 rows; the Submit Sheet's quota counter is now always fresh on open; the Notifications Sheet only fetches the "Past" bucket when expanded; the sidebar bell badge reads from `useSessionBootstrap()` so there's no second mount-time `listNotifications` poll.

**`/me` — `src/routes/_authenticated/me.$tab.tsx`**
- shipped: per-tab query (`["my-list", tab]`) only runs when the tab is active (route-level code-split). `staleTime: 2 * 60_000` so tab switches stay snappy without going stale.
- verify: list items wrap `VideoCard` which already merges `useHydratedStatus` via the action queue.
- shipped: long lists (>50 rows) render through a windowed `VirtualVideoGrid` (row-virtualised, 4 cards/row, `@tanstack/react-virtual`). Short lists fall back to the plain grid so the empty-state and small-library experience is unchanged.

**Submit Sheet — `src/components/submit-sheet.tsx`, `src/lib/submit.functions.ts`**
- shipped: `getSubmitQuota` query now has `staleTime: 0` so each Sheet open re-reads the counter (no stale "5/10" after a successful submit elsewhere).
- verify (Phase 1 owner): `dispatchUserSubmitAi` is already wired in `onSuccess` for every returned video id.
- verify: per-URL category/tag suggestions come from the debounced `previewSubmission` server fn, not a per-open shared category/tag fetch — already lazy.
- verify: multi-URL YouTube metadata fetched via parallel `useQuery`s per `<UrlRow>`, which TanStack Query dedupes — equivalent to `Promise.all` without a manual gather.

**Notification Sheet — `src/components/notifications-sheet.tsx`, `src/lib/lists.functions.ts`**
- shipped: `listNotifications` now returns only items from the last 4 days (the "recent" window the UI displays by default). A new `listPastNotifications` server fn returns older items and is only invoked when the Past collapsible is opened.
- shipped: bell-badge count reads from `useSessionBootstrap().unreadCount` in `src/routes/_authenticated.tsx`; the old 60 s `listNotifications` poll in the header is gone.
- shipped: notifications realtime channel + mark-all/one mutations invalidate `['session-bootstrap']` so the badge updates instantly across tabs.
- verify: "Mark all read" — immediate server write + optimistic badge reset (unchanged from earlier).

---

## Step 5a — Admin: content surfaces (Dashboard, Videos, Moderation) ✅

Shipped. Moderation queue is virtualised, admin video rows hover-prefetch the detail route, and the detail page's AI column is height-locked to prevent layout shift while results stream in. The dashboard surface still doesn't exist as a dedicated route — Phase 2 owns its creation; nothing else to do here.

**Admin / Dashboard**
- deferred (Phase 2 owner): no `admin.dashboard.tsx` exists yet; the accuracy + coverage card lands when that route ships.

**Admin / Videos — `src/routes/_authenticated/admin.videos.index.tsx`, `src/lib/admin-videos.functions.ts`**
- verify: `listAdminVideos` already projects an explicit column list (no `select('*')`) and the AI-coverage / tags / category-tree queries each scope columns.
- shipped: row titles use a new `AdminVideoTitleLink` that wires `usePrefetchOnHover('/admin/videos/$videoId', { videoId })` (50 ms) so a click into the detail page lands instantly.
- defer (Phase 1 owner): Realtime monitor on `ai_jobs` + `ai_agent_sessions` (background polling stays for now).
- verify: `batchUpdateVideos` already performs a single server-fn transaction.
- defer (Phase 2 owner): "AI Insights" tab — acceptance rates per slug.

**Admin / Videos / [id] — `src/routes/_authenticated/admin.videos.$videoId.tsx`**
- verify: `refetchInterval` already toggles `5000 ↔ false` based on `activeJobs.length`.
- defer (Phase 1 owner): streaming JSON parse.
- shipped: AI column now carries `min-h-[480px]` so the right pane reserves its full height before AI results arrive — no shift when tabs/results populate.

**Moderation queue — `src/routes/_authenticated/moderation.tsx`**
- shipped: left-rail list rendered via a new `SubmissionList` component using `@tanstack/react-virtual` (80 px row estimate, overscan 6) — pending/approved/rejected tabs all stay smooth at hundreds of rows.
- verify: tag names already resolved client-side from `useTagsCache()`; category names from the shared `useCategoryTree` data.
- verify: AI panel shows submit-time results immediately; "Re-run AI" is the only re-dispatch path (unchanged).
- defer: bulk approve/reject — no multi-select UI exists in moderation today; adding the picker is a feature, not a per-page perf fix. Flagged for a follow-up if the queue grows large enough to warrant it.

---

## Step 5b — Admin: governance + global polish ✅

Shipped. Reports + Broadcasts now URL-param sync their filters; Roles matrix is cached for 30 min; the recommendation weight save flushes the per-user feed seed cache; VideoCard serves WebP thumbnails for every YouTube-hosted image; and `select('*')` is gone from `sections.functions.ts` and `library.functions.ts`.

**Admin / Reports — `src/routes/_authenticated/admin.reports.tsx`, `src/lib/reports.functions.ts`**
- verify: `listReportedVideos` already returns rows sorted by open count server-side (`ORDER BY open_count DESC NULLS LAST`).
- verify: right-panel search is a `.filter()` on `reason_text` over the per-video reports already capped at 200 rows server-side.
- shipped: `status` + `videoId` URL-param synced via `validateSearch` + `navigate({ replace: true })` (Zod-validated, defaults stay implicit).

**Admin / Users — `src/routes/_authenticated/admin.users.tsx`, `src/lib/admin-users.functions.ts`**
- verify: email masking server-side via `maskEmail()` gated on `users.view_email` permission.
- verify: `listAssignableRoles` filters by actor `level_rank` server-side.
- verify: 50/page infinite scroll via `useInfiniteQuery` + IntersectionObserver sentinel.
- verify: user-detail Sheet `useQuery` only mounts when `openUserId` is set; `getUserDetail` already caps audit to the last 20 entries server-side — lazy-on-open behaviour confirmed, no extra work needed.

**Admin / Broadcasts — `src/routes/_authenticated/admin.broadcast.tsx`, `src/lib/broadcasts.functions.ts`**
- verify: archive DataTable already paginated (`PAGE_SIZE=25`).
- shipped: `status`, `category`, `q` URL-param synced via `validateSearch`; deep-linking + back-button now restore filter state.
- verify: read counts already computed at query time in `listBroadcasts` (no MV needed yet — flagged TODO when archive grows past ~100k rows).
- defer: "category list from `app_settings` in-memory" — current `getBroadcastCategories` server fn is cached with `staleTime: 5 min`; folding categories into `app_settings` would force a separate write path. Keep as-is until categories prove to be the hot path.

**Admin / Audit log — `src/routes/_authenticated/admin.audit.tsx`**
- defer: monthly partitioning — TODO; not worth doing before the table grows past a few million rows.
- verify: row-expand already uses `<Collapsible>` with no extra fetch (diff payload travels with the list response).
- verify: filter by actor / action / date already runs server-side; existing indexes cover the predicates.

**Admin / Roles & Permissions — `src/routes/_authenticated/admin.roles.tsx`**
- shipped: `roles`, `permissions-catalog`, `role-permissions` queries all carry `staleTime: 30 * 60_000`.
- verify: inline checkbox toggle writes per cell via `upsert` (existing `togglePermission` mutation).
- verify: plan 5/6 keys (`ai.dispatch`, `ai.review`, `ai.manage`, `users.view`, `users.manage`) all render from the permissions catalogue.

**Admin / Settings — `src/routes/_authenticated/admin.settings.tsx`**
- verify: all settings auto-save inline with Sonner confirmation (existing behaviour).
- defer (Phase 2 owner): AI section feedback-threshold sliders.
- verify: orchestrator hot-reloads `app_settings` per cron tick.

**Recommendation weights — `src/lib/admin.functions.ts`**
- shipped: `setRecommendationWeights` now flushes every `user_feed_state` row after the upsert so the next personalised feed renders against the new weights (non-fatal if the flush fails; the weight save still commits).
- verify (Phase 3 owner): weights consumed in feed assembly.
- verify (Phase 4 owner): weights consumed in `/suggest` scoring.

**Action queue (IndexedDB) — `src/lib/action-queue.ts`**
- verify: 500-entry cap with immediate flush on exceed (existing `MAX_QUEUE_SIZE` guard).
- verify: acknowledged entries evicted after 24 h on each flush.
- verify: `useHydratedStatus` merges queue state for every status-bearing component.

**VideoCard global polish — `src/components/video-card.tsx`**
- shipped earlier (step 3b): 50 ms hover-prefetch on every card link via `usePrefetchOnHover('/v/$id', { id })`.
- shipped: `toWebpThumbnail()` rewrites `i.ytimg.com/vi/<id>/<name>.jpg` to `i.ytimg.com/vi_webp/<id>/<name>.webp` (~30% smaller payload). Non-YouTube thumbnails pass through unchanged.
- verify: `fetchPriority="high"` on priority cards is already supported via the `priority` prop; consuming routes (`/feed`, `/suggest`, `/trending`, `/categories/[slug]`) pass `priority` for the first 4 cards.

**`select('*')` codemod**
- shipped: `sections.functions.ts` — introduced `FEED_SECTION_COLS` constant; all 5 `select('*')` call sites now project explicit columns.
- shipped: `library.functions.ts:564` (`getCreatorDetail`) — projects the full `creators` column list explicitly.
- remaining: `src/lib/ai/taxonomy-snapshot.server.ts:99` is the AI snapshot writer (it intentionally roundtrips the full row) — left as-is; not user-facing.

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

---

# Plan 7 — Public browsing + fuzzy search + rich link previews

User-requested batch. Sequenced as **Step A** (public browsing) first because the public route surface is what the next two steps target, then **Step B** (search) + **Step C** (OG meta) together.

## Step A — Public browsing (no route renames) ✅

Goal: unauthenticated visitors can view and navigate every non-personal route while every write action surfaces a "Sign in to …" Popover instead of redirecting.

**Layout gate (`src/routes/_authenticated.tsx`)**
- shipped: `beforeLoad` now whitelists protected prefixes (`/feed`, `/suggest`, `/me`, `/moderation`, `/admin`) instead of redirecting on every match — public routes (`/v/$id`, `/categories`, `/categories/$slug`, `/tags/$slug`, `/creators`, `/creators/$id`, `/trending`, `/leaderboard`, `/leaderboard/archive`, future `/search`) stay inside the shell but skip the auth gate. No file renames needed; the gate decides per-request.
- shipped: action queue + `onAuthStateChange` listener only mount when a user is present (guests don't enqueue).
- shipped: Header is guest-aware — Sign-in + Get-started CTAs replace bell + profile + Submit when no session. Bell/profile sheets unmounted for guests.

**Sidebar (`src/components/app-sidebar.tsx`)**
- shipped: split links into `publicLinks` (Trending, Leaderboard, Categories, Creators) + `personalBrowse` (Home, Suggest Feed). Guests only see the public group + the CurateTube logo header.
- shipped: "You" group (Wishlist/Liked/Watched/Suggested), Moderation, Admin sections all hide entirely for guests.
- shipped: sidebar version bumped to **alpha 0.6.7**.

**Action gating (`src/components/sign-in-gate.tsx` — new, plus video-actions + report-button rewired)**
- shipped: new `<SignInGate action="…" signedIn={…}>` wraps any trigger and, for guests, intercepts the click to open a small Popover with **Sign in** and **Sign up** CTAs that pass `redirect=<current path>` through. Preserves browsing context — no modal, no navigation.
- shipped: `VideoActions` wraps every status button (wishlist/liked/disliked/watched) and the Suggest button in `SignInGate`. Authenticated users get the original behaviour unchanged.
- shipped: `ReportButton` short-circuits to a SignInGate-wrapped trigger when no session; the `hasReportedVideo` query is `enabled: signedIn` so guests never hit the auth-only server fn.

**Server fns made public**
- shipped: `getVideoDetail` (library.functions) — middleware dropped; staff non-approved preview branch removed (admin routes still own that path via `admin-video-detail.functions`). Curator notes never leak through this endpoint.
- shipped: `getCreatorContributors` (library.functions) — middleware dropped; profile join already filters by `audit_privacy_mode='public'`.
- shipped: `getVideoAttribution` (admin.functions) — middleware dropped; reads only public attribution settings + masked contributor names.
- verified: `getVideoTags`, `getVideoCategoryPaths`, `listCreators`, `getCreatorDetail`, `listVideosByCategorySlug`, `listVideosByTagSlug`, `listApprovedVideos`, `listTrendingVideos`, `listSuggestedVideos`, `listCategoriesWithStats`, `getSnapshotEntries` are already public (no middleware).

**RLS**
- verified: all browse tables (`videos`, `creators`, `categories`, `category_ancestors`, `video_categories`, `video_tags`, `tags`) already grant `SELECT` to `anon` and have RLS policies permitting anon reads. `videos` policy already gates non-approved rows behind `submission.view_queue`. **No migration needed.**

**Login redirect threading (`src/routes/login.tsx`)**
- shipped: `redirectPath = search.redirect ?? "/feed"` plumbed through `GoogleButton` (`redirect_uri`), `PasswordForm` signup (`emailRedirectTo`), and `MagicLinkForm` (`emailRedirectTo`). Shared-link recipients now land on the page they were sent to after signing in via any method.
- verified: `beforeLoad` on `/login` already redirects to `search.redirect ?? "/feed"` when a session exists.

**Edge cases**
- verified: `/feed` and `/suggest` stay protected — guests hitting them get redirected to `/login?redirect=…` (whitelist behaviour).
- verified: `/v/$id` for a non-approved or deleted video — `getVideoDetail` now returns `{ video: null }` (no staff branch), and the existing `notFoundComponent` renders the "Video not found" graceful state.

## Step B — Fuzzy search (next turn)

- DB: `pg_trgm` + GIN trigram indexes on `videos.title`, `tags.name`; tsvector index on `videos(title||description)`.
- Server fn: `searchVideos(query, limit, offset)` joining tags, scoring by `ts_rank*2 + similarity`, deduped by `video_id`. Public (no middleware) — RLS already restricts to approved videos.
- Client: header search input → 300ms debounce → TanStack Query (`enabled: query.length >= 2`, `staleTime: 30s`) → Command-palette dropdown (top 8 + "See all results" link) with bolded match substring, channel name, top-matching tag chip, suggest count.
- New `/search?q=…` route under the public surface — paginated VideoCard grid mirroring `/tags/$slug` layout.
- Empty state: 0 results → "Submit this topic?" CTA pre-filling the submit sheet.

## Step C — OG / Twitter meta tags (next turn, alongside B)

- `/v/$id`: extend existing `head()` with `og:image` = `https://img.youtube.com/vi/<youtube_id>/maxresdefault.jpg` (fallback `hqdefault.jpg`), `og:image:width/height`, `twitter:card=summary_large_image`. Today's head() uses `thumbnail_url`; switch to the YouTube CDN URL so WhatsApp/Telegram/iMessage scrape it without auth.
- `/categories/$slug`: og:title + og:description = "[N] videos in this category", og:image = first thumbnail from `mv_category_stats.top_thumbnails[0]`.
- `/creators/$id`: og:title + og:image = creator channel thumbnail.
- `/` landing: static OG image (1200×630 PNG, one-time upload).
- Edge case: non-approved video → loader returns `{ video: null }`, head() falls back to platform-level defaults — no leaked metadata.
- Edit-time note in `admin/videos/[id]` about messaging-app cache TTLs (~7 days for WhatsApp).

