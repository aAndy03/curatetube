# CurateTube — Community-Curated YouTube Database

A desktop-first, monochromatic web app where contributors submit YouTube videos, moderators curate them, and the public browses a clean, organized library — with a community **Suggest** signal, time-anchored leaderboards, a privacy-aware internal audit trail, and an inline, surface-driven UI.

## 1. Foundations

- **Stack**: TanStack Start + Lovable Cloud (Postgres + Auth + Storage), shadcn/ui, Tailwind v4, TanStack Query.
- **Auth**: Email+password, Email magic link, Google sign-in.
- **GDPR**: consent banner, data export, account+data deletion, audit log of personal-data access, EU region, legal pages.
- **YouTube Data API v3**: `YOUTUBE_API_KEY` server secret; all calls in server functions.
- **First-user-becomes-Owner**: server fn atomically promotes the first authenticated user.

## 2. Roles & Permissions (dynamic)

`roles`, `permissions`, `role_permissions`, `user_roles`. `has_permission(user, key)` security-definer used in RLS. Owner has all; Admin defaults are editable; Owner can create custom roles; last Owner cannot be demoted. Permission catalog spans submissions, library, taxonomy, sections, suggest/leaderboard, users, rules, reports, audit visibility, system settings.

## 3. Submissions + duplicate counting

Submit 1–N URLs → server validates → YouTube API → metadata auto-filled → user adds categories/tags/note/warnings. Duplicates still recorded in `submissions`; `videos.submission_count` counts unique submitters via `video_submitters`. Hover tooltip: **"Submitted by N users"**. Moderation queue with side-by-side preview, approve/reject/edit, bulk actions, edge-case handling.

## 4. Suggest system

Distinct community signal from Like. `video_suggestions`, denormalized `videos.suggest_count`, hover tooltip **"Suggested by N users"**. `suggest.cast` default for logged-in users; rate-limited.

## 5. Leaderboards

Configurable tiers (Top 10/30/100/500), per-tier refresh cadence. Immutable snapshots via `/api/public/cron/leaderboard` (HMAC). Scopes: global, category, language, creator. Pages: `/leaderboard` (current + countdown), `/leaderboard/archive` (date+tier+scope picker).

## 6. Public browsing UI (YouTube-style, monochromatic)

Left sidebar (Home, Suggest Feed, Leaderboard, Trending, Categories, Creators, Wishlist, Liked, Watched, Moderation if permitted), top bar (search, submit, notifications, profile). Card icons: wishlist/like/dislike/watched/**suggest** + the two tooltips. Video detail with embedded player. Profile tabs: Wishlist / Liked / Disliked / Watched / Suggested.

## 7. Configurable feed

Stack of **sections**: `source`, `filters`, `sort`, `layout`, `size`, `refresh_policy`, `cycle_policy` (keep_seen_ratio + inject_new_ratio + cycle_window + per-session seed). Admin templates; users add/remove/reorder/override. State in `user_feed_state`.

## 8. Personal lists

`user_video_status (user_id, video_id, status)` ∈ {wishlist, liked, disliked, watched, suggested}. RLS-locked.

## 9. Recommendations

Weighted scorer (Owner/Admin sliders). Signals: recency, approval freshness, editorial boost, suggest_count, leaderboard presence, in-app trending, diversity penalty, and (personal only) user affinity. Personal runs only when `recommendation_opt_in = true`.

## 10. Internal audit + per-user privacy mode

Every category writes to `audit_log (id, actor_id, actor_display_snapshot, action, target_type, target_id, before, after, ip_hash, created_at, visibility)` with `visibility ∈ {internal, staff, public}`, default `internal`. `actor_display_snapshot` resolved at write time using actor's then-current privacy mode.

**Per-user privacy mode** (Profile → Settings → "Audit identity"):

- **Public**: actions attributed to display name; can be surfaced publicly (e.g., "Originally submitted by {username}" plain-text chip under the player).
- **Anonymous** (default on signup): stored `actor_id` for accountability; rendered as "Anonymous contributor". Owner-level forensic resolution gated by `audit.view_identity`, disclosed in the privacy policy.
- Mode change is forward-only by default; one-click "Re-anonymize my past attributions" / "Attribute my past actions" rewrites `actor_display_snapshot` for the user's prior entries (themselves audited).
- Per-action override: "Submit anonymously this time" checkbox on the submission form.

Public-attribution surfaces (Owner/Admin toggleable): video detail chip, creator-page contributors list, leaderboard "suggested early by" facet — each respects the contributor's mode at render time.

## 11. Account deletion (tailored to original signup method)

- **Email+password**: re-enter password.
- **Magic link**: fresh confirmation link emailed.
- **Google**: Google re-auth + revoke OAuth refresh token.
- Multi-method users must satisfy the strongest available.
- 7-day soft-delete grace window, one-click cancel link.
- After expiry: hard-delete cascades personal data; submissions/approvals retained with `actor_id = NULL`, `actor_display_snapshot = "Deleted user"`, `actor_deleted = true`. GDPR ZIP export offered before deletion. Deletion event itself logged (PII-scrubbed).

## 12. Notifications

Submission outcomes, role changes, new videos for wishlisted creators, "your video entered Top N", "your suggestion reached a tier", admin broadcasts, audit-mode acknowledgements, deletion grace reminders.

## 13. Admin areas

Dashboard, Roles & Permissions matrix, Users, Rules, Taxonomy, Feed templates & sections, Leaderboard tiers/cadence, Recommendation weights, Audit log viewer (filter+visibility toggle), Public-attribution surface toggles, Settings.

## 14. UI Guidelines (CRITICAL — applies to every screen)

**Philosophy: surface over overlay.** Do work where the user is looking. Modals interrupt; inline editors don't. Default to inline; reach for an overlay only when the action genuinely needs a separate context.

### Component-selection ladder (pick the lowest level that fits)

1. **Inline editing in place** — click a field/chip/badge, it becomes editable in-row. Confirm with Enter / blur / explicit save chip. Use for: rename, retag, change category, edit curator note, toggle role permission cell, edit section filter, rename role, change leaderboard tier name.
2. **Inline expand / collapsible row** (`Collapsible`, `Accordion`) — for "show more" details, audit entry diffs, moderation reasons, advanced filters. Never open a modal for "more info".
3. **Dropdown menu** (`DropdownMenu`, `Select`, `Combobox` via `Command` + `Popover`) — for picking from a list (roles, categories, tags, languages, scopes, refresh cadence, layout type, sort).
4. **Hover card / tooltip** (`HoverCard`, `Tooltip`) — for passive info on hover. The "Submitted by N users" / "Suggested by N users" chips are `Tooltip`. Author preview, creator preview, permission description = `HoverCard`.
5. **Popover** (`Popover`) — small focused editors anchored to their trigger: date picker, color picker, weight slider, share menu, notification preferences quick-toggle. Used sparingly.
6. **Floating menu / Command palette** (`Command`, `CommandDialog`) — global search (`Cmd/Ctrl+K`) and admin quick-actions. Single global instance.
7. **Sheet** (`Sheet`, side drawer) — for **configuration surfaces** that need real estate but should keep the underlying screen visible. **Profile Settings opens as a right-side `Sheet`**, not a modal. Other Sheet uses: section editor, role-permissions editor, submission detail in moderation queue, audit-entry inspector, account-deletion flow, notification center.
8. **Dialog** (`Dialog`, `AlertDialog`) — only for truly modal, blocking decisions: destructive confirmations (delete account final step, revoke Owner, hard-delete video), legal acceptance (consent, ToS update), the very first signup welcome step. Target: ≤ 5 dialogs in the entire app.

> Hard rule: if a screen is opening more than one dialog in a flow, redesign with a Sheet or inline.

### Concrete component map

- **Layout shell**: `SidebarProvider` + `Sidebar` (collapsible="icon" — never offcanvas on desktop), `SidebarTrigger` in header, `Breadcrumb` under header, `ScrollArea` for main content, `Resizable` panels for moderation queue and admin tables.
- **Navigation**: `NavigationMenu` for top bar, `Tabs` for profile sections and admin sub-areas, `Breadcrumb` everywhere deeper than 1 level.
- **Data display**: `Table` + `DataTable` patterns with column-header `DropdownMenu` for sort/filter, sticky headers via `ScrollArea`, `Pagination`. Inline-editable cells (no row-detail modals).
- **Forms**: `Form` + `react-hook-form` + Zod. Multi-step flows use `Tabs` or vertical `Stepper` (built from `Separator` + `Badge`), not multiple dialogs.
- **Pickers**: `Combobox` (`Command` in `Popover`) for tags/categories/creators with multi-select chips; `Calendar` in `Popover` for the leaderboard archive date picker.
- **Status & feedback**: `Sonner` toasts for non-blocking confirmations (saved, copied, suggestion recorded). Never use a dialog for "Saved!". `Progress` for uploads/exports. `Skeleton` for loading.
- **Density**: `Toggle`/`ToggleGroup` for grid/list/compact density on the feed.
- **Keyboard**: `Cmd/Ctrl+K` opens the global `CommandDialog` (the only acceptable always-on dialog); `?` opens shortcut overlay (a Sheet).
- **Charts**: `Chart` (Recharts wrapper) for leaderboard deltas and admin dashboard.

### Specific surface choices (mandates)

- **Profile Settings** → right `Sheet`, sectioned with `Tabs` (Account, Audit identity, Notifications, Privacy & data, Sessions, Delete account). Each setting edits inline with auto-save + `Sonner` confirmation. Audit-identity toggle is a `Switch` with a `HoverCard` explaining implications.
- **Submit a video** → top-bar trigger opens a right `Sheet` with the multi-URL form; tag/category pickers are `Combobox`s; "submit anonymously this time" is an inline `Switch`.
- **Moderation queue** → split view via `Resizable`: list left, detail right (no modal). Approve/reject inline; reasons via `Combobox` of templates plus inline `Textarea`.
- **Roles & permissions** → matrix `Table` with checkbox cells; click a permission column header → `HoverCard` describing it; per-role rename inline.
- **Leaderboard archive** → `Calendar` in `Popover` next to tier `Select` and scope `Select`; results stream into a `Table` below — no dialog hop.
- **Notifications** → bell button opens a `Sheet` from the right (notification center), not a popover, so users can act on items without losing context.
- **Account deletion** → sequence is a Sheet wizard (re-auth → export offer → reason → schedule). Only the _final_ irreversible confirm uses `AlertDialog`.
- **Section editor (feed)** → click a section's gear → inline `Popover` for quick edits; "Advanced" link opens a right `Sheet` with the full editor.
- **Audit log viewer** → `Table` with row-expand (`Collapsible`) showing diff; inspect detail in a right `Sheet` only when cross-referencing other entries.

### Visual & interaction system

- Pure monochrome `oklch` palette; one neutral accent. Light + dark via design tokens (no hard-coded colors in components).
- Fluid type with `clamp()`, base `16px`. Density-aware spacing tokens (`--space-1…6`) and a compact mode for power users.
- Container queries for cards; cards keep aspect ratio via `AspectRatio`.
- DPI/scaling: rem + clamp; min hit area 32px desktop, 40px touch.
- Breakpoints: ≥1280 primary, 1024 fallback, mobile graceful (sidebar becomes offcanvas only below `md`).
- Motion: 120–180ms ease-out for inline edits; Sheets slide in 220ms; respect `prefers-reduced-motion`.
- Focus: visible focus ring on every interactive surface; full keyboard navigation; ARIA correct on all custom widgets (shadcn handles most).

## 15. Data model (high level)

`profiles (…, audit_privacy_mode, deleted_at, actor_deleted)`, `roles, permissions, role_permissions, user_roles, creators, videos, submissions, video_submitters, submission_videos, categories, video_categories, tags, video_tags, tag_suggestions, user_video_status, video_suggestions, leaderboard_tiers, leaderboard_snapshots, leaderboard_entries, sections, section_items, feed_templates, user_feed_layouts, user_feed_state, recommendation_settings, rate_limit_rules, notifications, audit_log, reports, app_settings, account_deletion_requests`. All RLS-enabled; `audit_log` append-only.

## 16. Build phases

1. **Foundation** — Cloud, 3 auth methods, profiles (incl. `audit_privacy_mode = anonymous` default), roles/permissions matrix, first-user-Owner, design tokens + UI primitives wired to the guidelines above, layout shell (sidebar + header + Cmd-K), GDPR pages, `audit_log` table + write helper.
2. **Submissions & Library** — YouTube integration, submit `Sheet`, duplicate counting + tooltip, moderation `Resizable` queue, video & creator pages, taxonomy, rate limits, audit on every action.
3. **Personal lists, Suggest, Notifications** — lists, suggest action + counter + tooltip, profile `Sheet` + tabs, notification `Sheet`, audit-identity toggle + bulk rewrite, tailored deletion wizard.
4. **Leaderboards** — tiers, snapshot engine, current + archive pages.
5. **Configurable feed** — sections, templates, layouts, cycle policy.
6. **Recommendations & polish** — weighted recommender, audit log viewer, public-attribution chips + admin toggles, broadcast notifications, edge-case hardening.

## What I need from you

- Confirm this revised scope (or tell me what to cut/defer).
- I'll prompt for `YOUTUBE_API_KEY` when Phase 2 starts.
