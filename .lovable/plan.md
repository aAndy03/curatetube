# CurateTube — Plan 3 (builds on `.lovable/plan.md` + Plan 2)

Plan 1 shipped the surface. Plan 2 added missing routes, a client action queue, server caching, and admin sync visibility. Plan 3 closes the trust + reliability gaps the user keeps hitting (state vanishing on refresh, login loops, blank creator pages) and lays a moderation/notifications spine on top.

Versions: alpha **0.3.1 → 0.3.8** (one phase per minor bump, P7 = 0.3.7, refactor-map sync = 0.3.8). Mirror this file to `.lovable/plan3.md` once approved.

This plan **assumes** Plan 2's `action-queue.ts`, `actions.functions.ts`, `batch_flush_log`, `mv_*` views, and refactor-map are in place.

---

## Phase 1 — Hydration merge (queue ⊕ server) — alpha 0.3.1

**Problem.** On refresh, components only read Supabase. Pending writes in IndexedDB are invisible until the next flush, so optimistic suggest/like state appears to vanish.

**Approach: merged source of truth.**
- `useHydratedStatus(videoId)` and `useHydratedSuggestCount(videoId)` hooks merge `["video-state", videoId]` (TanStack Query) with `getPendingForVideo(videoId)` from IndexedDB. Pending wins for status booleans; suggest_count is `server + (pending_on - pending_off)`.
- Use **React 19 `use(promise)`** for the IDB read inside the hook so we suspend instead of flashing the server-only value through `useEffect`.
- **Acknowledgement, not deletion.** On batch success, mark queue entries `acknowledged: true` (don't drop). Purge acknowledged entries only after the next successful server refetch confirms the value matches — avoids double-count between flush and refetch.

**Refactor-map row 2 (user_video_status touch-set):**
- `src/lib/action-queue.ts` — add `acknowledged` field, `getPendingForVideo(videoId)`, `markAcknowledged(ids[])`, `purgeConfirmed(videoId, serverState)`.
- `src/lib/actions.functions.ts` — return `acknowledged_ids` in batch result; client calls `markAcknowledged`.
- `src/hooks/use-hydrated-status.ts` (new), `src/hooks/use-hydrated-suggest-count.ts` (new).
- Swap reads in: `video-actions.tsx`, `video-card.tsx`, `routes/_authenticated/v.$id.tsx`, `routes/_authenticated/me.$tab.tsx`.

---

## Phase 2 — Persistent 10-day session — alpha 0.3.2

**Problem to confirm first (audit step).** Likely cause: Supabase browser client without `persistSession: true`, or refresh token TTL too short. Confirm before changing config.

**Fix.**
- Browser client (`src/integrations/supabase/client.ts` is auto-generated — do not edit; verify it already enables `persistSession: true` + `storageKey: "ct_session"`. If not, file a follow-up; do not hand-edit). Server client must keep `persistSession: false`.
- Auth settings via `configure_auth`: JWT 3600s, refresh token 864000s (10 d). Works uniformly for email+password, magic link, and Google OAuth (TTL applies to the Supabase session, not Google's token).
- **Inline disclosure** under the login form: "Your session stays active for 10 days. After that you'll be asked to sign in again." Mirror in privacy page.
- **D-1 expiry notification** via existing notifications system: scheduled by a daily cron (`/api/public/cron/session-expiry-warn`, HMAC-shared with leaderboard cron) that finds users whose refresh token expires within 24 h and inserts one notification. Any authenticated request silently rotates the refresh token.
- **Single root listener**: `_authenticated.tsx` subscribes once to `onAuthStateChange`. `TOKEN_REFRESHED` → no-op (Query auth context already reads from session). `SIGNED_OUT` → clear IDB queue, `router.navigate({ to: "/login" })`. Replaces ad-hoc polling.

---

## Phase 3 — Creator detail page — alpha 0.3.3

**Problem.** `/creators/<uuid>` is blank — the dynamic route file is missing or empty.

**Build.**
- `src/routes/_authenticated/creators.$creatorId.tsx` with a server-fn loader: `getCreator(creatorId)` + `getVideosByCreator(creatorId, { page, sort })`.
- Header: name, channel link, thumbnail, video count, avg suggest_count. Body: paginated `VideoCard` grid with full action row (uses Phase 1 hydrated hooks).
- **Contributors block** (gated by `app_settings.show_contributors_on_creator_page`, seeded in Plan 1): joins `video_submitters` → `profiles`, filters `audit_privacy_mode = 'public'` **at render time** (so contributors who later go anonymous disappear). Chips with display name + count, paginated above 10.
- Hover prefetch (50 ms, Plan 2 D pattern) on creator badges in `VideoCard`.

**Refactor-map row 4 (new sidebar/route item) + row 8 (app_settings):**
- New route file, breadcrumb crumb "Creators › [name]", Cmd-K dynamic action "Go to creator: [name]".
- Add `getCreator`, `getVideosByCreator` to `src/lib/library.functions.ts`.
- Verify `show_contributors_on_creator_page` toggle exists in `admin.settings.tsx`.

---

## Phase 4 — Report button + admin reports panel — alpha 0.3.4

**Schema.** Verify Plan 1's `reports` table; if missing, migration:
- `id, video_id, reporter_id, reason_text (≤1500 chars), status enum('open','reviewed','dismissed'), created_at, reviewed_by, reviewed_at, review_note`
- UNIQUE `(reporter_id, video_id)`
- RLS: reporter insert/select own; staff (`reports.view`) read all; staff (`reports.act`) update status/note. Audit on insert + status change.

**User-facing button.**
- Flag icon in `VideoCard` action row. Logged-in only. Disabled with tooltip "Already reported" when a report exists.
- Click opens a **Popover** (not Sheet — scoped action). Single Textarea with live word count (cap ~300 words / 1500 chars). Submit is **immediate** (`createServerFn`, not queued — moderation signal must be authoritative).
- "Already reported" check is a TanStack query, `staleTime: 30m`.

**Admin reports panel.** New permissions `reports.view`, `reports.act`. New sidebar item under Moderation.
- `src/routes/_authenticated/admin.reports.tsx` — Resizable split (mirrors moderation queue).
- Left: list of reported videos sorted by open count desc. Toolbar: Status (All/Open/Reviewed/Dismissed), date range Calendar, sort, all URL-searchParam-synced.
- Right (selected video): all reports chronologically, reporter name (privacy-aware), inline-editable review note, status badge, inline reason search (client-filter, cap 200/video before paginating).
- Batch column: Mark reviewed / Dismiss / Export CSV — immediate server actions, audit per row.

**Refactor-map adds:** row 3 (perms `reports.view`, `reports.act`), row 4 (sidebar), row 6 (new immediate batch action — no coalescing).

---

## Phase 5 — Notifications panel redesign — alpha 0.3.5

**Bug.** "Mark all as read" doesn't persist because the bell badge re-reads from server on next mount and the mark-all path is queued/local-only.

**Fix.** Promote mark-all to an **immediate** server action (not queued): `UPDATE notifications SET read_at = now() WHERE user_id = me AND read_at IS NULL` plus inserts into `user_broadcast_reads` for every active broadcast. Optimistically set bell `count = 0`, then invalidate `["notifications"]` so badge confirms from server. Sonner: "All caught up."

**Panel structure.**
- (a) **My notifications** — scrollable. Time groups: Today / Yesterday / Last 3 days as flat lists, then a `<Collapsible>` "Past" grouped by week. Unread = subtle left-border accent. Per-row mark-as-read + inline action (e.g. "View video").
- (b) **Broadcasts** — sticky footer inside the same Sheet. Horizontal carousel if >1 active, prev/next arrows, category badge + message + timestamp + "View all broadcasts" link. Non-dismissible per-item.
- **Broadcast history** opens as a nested panel that widens the existing Sheet leftward (not a stacked Sheet). Category Select + text search above a reverse-chronological list.

**Optimizations.**
- Bell badge: TanStack Query `staleTime 2m`, `refetchOnWindowFocus: true`. No WebSocket yet (defer to a future plan).
- List: virtualized via `@tanstack/react-virtual` for section (a). Past loads lazily on expand. Page size 20, IO sentinel pagination (Plan 2 D).

---

## Phase 6 — Broadcast archive (admin) — alpha 0.3.6

**Schema additions** to `broadcast_notifications`: `category text`, `expires_at timestamptz null`, `archived_at timestamptz null`, `archived_by uuid null`. Add `user_broadcast_reads(user_id, broadcast_id, read_at)` if absent.

**Admin → Broadcasts page** gets a second `Tabs` panel: **Archive**.
- DataTable: category, title (inline-editable), sent date, expires_at (Calendar Popover inline edit), status (active/archived/expired), read count / total recipients, actions.
- Filters (URL-synced): date range, category multi-select Combobox, status Select, text search.
- Batch (checkbox column): Archive / Restore / Delete (AlertDialog — counts toward the ≤5 dialog budget) / Export CSV. All immediate, all audited.
- **Categories** stored as JSON array in `app_settings['broadcast_categories']`, edited inline in the Archive toolbar.

**Refactor-map adds:** row 8 (`broadcast_categories`), row 3 (perms `broadcasts.archive`, `broadcasts.delete`). Read counts computed via `count(user_broadcast_reads)` per row — no MV until table exceeds ~100k rows.

---

## Phase 7 — Cross-cutting performance pass — alpha 0.3.7

**React 19.**
- Replace `useEffect + setState` async-fetch patterns with `use(promise)` under existing Suspense/Skeleton boundaries — applies to IDB hydration, query reads, and direct server-fn calls.
- Wrap route navigations in `startTransition` so the current page stays interactive while the next loader runs.

**Server actions.** Standardize immediate writes (moderation, auth, report submit, mark-all-read) on `createServerFn` so they share the SSR process when triggered server-side.

**Component-level.**
- `content-visibility: auto` + `contain-intrinsic-size` on every card-grid container (feed, library, suggest, trending, creator detail, profile tabs).
- `React.memo` on `VideoCard`; lift action callbacks to `useCallback` at the feed/grid level so refs are stable.
- Virtualize the notification list (Phase 5 already lands this; mentioned here for completeness).

**Server queries.**
- Audit `src/lib/library.functions.ts` and `lists.functions.ts`: replace every `select('*')` with explicit column lists. Feed/grid endpoints drop `description`, `tags`, `submission_count`.
- Fold the bell unread count into the session bootstrap query so root layout makes one round-trip on mount, not two.

**IndexedDB queue.**
- Cap at 500 entries; on overflow flush immediately regardless of interval.
- On every flush cycle, evict `acknowledged` entries older than 24 h.

---

## Phase 8 — Refactor-map sync — alpha 0.3.8

Append rows to `.lovable/refactor-map.md`:
- **(9) `reports` column change** → touch-set: `admin.reports.tsx`, `video-actions.tsx`, GDPR export, `audit_log` action enum.
- **(10) `broadcast_notifications` category enum** → touch-set: `broadcast_categories` app_setting, user notification category filter, admin archive filter, seed migration.
- **(11) Hydrated hooks** → any new status-bearing component must read via `useHydratedStatus` / `useHydratedSuggestCount`, not raw queries.

Then a sweep: grep for direct `["video-state", ...]` reads outside the hooks and refactor.

---

## Build order (one phase per version)

| Version | Phase | Scope |
|---------|-------|-------|
| 0.3.1 | 1 | Hydration merge + ack flag |
| 0.3.2 | 2 | Persistent session + D-1 warn |
| 0.3.3 | 3 | Creator detail route |
| 0.3.4 | 4 | Reports (button + admin panel) |
| 0.3.5 | 5 | Notifications redesign + mark-all fix |
| 0.3.6 | 6 | Broadcast archive |
| 0.3.7 | 7 | Performance pass (React 19, MV-free) |
| 0.3.8 | 8 | Refactor-map sync + sweep |

## Open questions

1. **Reports unique constraint** — one report per `(user, video)` ever, or per video per 30 days (allowing repeat reports if a video reappears after being approved)? Default: ever (simpler, matches "already reported" UX).
2. **Session D-1 warning** — in-app notification only, or also email? Default: in-app only (no email infra wired yet).
3. **Broadcast `expires_at`** — when expired, should it auto-archive on read, or stay visible-but-greyed until an admin archives it? Default: auto-flag as `expired` status (computed), archive remains an explicit admin action.
