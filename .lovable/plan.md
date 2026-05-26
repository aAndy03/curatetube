# CurateTube — Plan 5 (v0.5.0)

AI categorisation & tagging orchestration, background monitor, submit‑sheet and moderation queue AI integration, public landing page, and admin users management.

This plan reconciles the original draft to the existing codebase. Key terminology / architecture corrections vs the draft are listed at the bottom.

> Single minor bump: **v0.5.0**, broken into 10 phases. Each phase is one migration + code batch.

---

## Stack reconciliation (read first)

The draft assumed OpenRouter + Supabase Edge Functions. The actual stack is:

- **AI provider** → **Lovable AI Gateway** (env `LOVABLE_API_KEY`, already present). Default models drawn from the supported list:
  - `ai_user_submit_model` → `google/gemini-2.5-flash-lite` (fast, cheap)
  - `ai_admin_model` → `openai/gpt-5-mini`
  - `ai_batch_model` → `google/gemini-2.5-flash`
  - `ai_fallback_model_order` → `["google/gemini-2.5-flash-lite","google/gemini-2.5-flash","openai/gpt-5-nano"]`
  - No OpenRouter key, no per-model concurrency lock — Gateway handles fan-out. The "all models throttled" path becomes "gateway 429/5xx" backoff.
- **Orchestrator runtime** → TanStack server functions (`createServerFn`) + a `/api/public/cron/ai-orchestrator.ts` HMAC-protected route, polled every 30 s (same pattern as `src/routes/api/public/cron/leaderboard.ts` + `account-deletions.ts`). No new Supabase Edge Function.
- **Settings storage** → existing `app_settings(key,value jsonb)` table; one row per AI key (consistent with `submit_limit_default`, `trending_min_video_count` from plan 4). No new columns on `app_settings`.
- **Audit** → `audit_log.action TEXT` already free-form; just add new action strings via `writeAudit()` in `src/lib/audit.server.ts`. No enum migration.
- **Admin video manager** already exists at `src/routes/_authenticated/admin.videos.tsx` (plan 4 phase 3). Phase 4 below **extends** it and adds a per-id detail route; it does not recreate it.
- **Submissions** already carries `proposed_category_ids` / `proposed_tag_ids` (plan 4) — AI writes into these at submit time, not into new columns.
- **MV refresh** → reuse `public.refresh_mv(_name)` pattern; AI doesn't add an MV in this plan.
- **Profile suspension** → add `suspended_at` to existing `profiles` (which already has `deleted_at`, `audit_privacy_mode`).
- **Per-account quotas / rate limit** → existing `rate_limit_events` table is reused for AI job rate caps per user.

---

## Phase 1 — Schema: AI job queue, sessions, taxonomy snapshot, video AI metadata (0.5.0)

Single migration. Tables follow public-schema GRANT rules.

- `**ai_jobs**` — `id uuid pk`, `job_type ai_job_type` enum(`categorise`,`tag_primary`,`tag_secondary`,`tag_rest`), `scope ai_job_scope` enum(`user_submit`,`admin_single`,`admin_batch`,`admin_queue`), `video_id uuid`, `batch_id uuid null`, `assigned_session_id uuid null`, `taxonomy_snapshot_id uuid null`, `status ai_job_status` enum(`pending`,`claimed`,`running`,`paused`,`completed`,`failed`,`cancelled`), `model_used text`, `prompt_tokens int`, `completion_tokens int`, `retry_count int default 0`, `max_retries int default 3`, `max_duration_s int`, `max_results int`, `priority int default 5`, `created_by uuid null`, `error_text text`, `started_at/paused_at/resumed_at/completed_at/failed_at timestamptz`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`. RLS: select staff (`has_permission audit.view`) OR `created_by = auth.uid()` when `scope='user_submit'`; insert/update via service role only (server fn).
- `**ai_job_results**` — `id`, `job_id`, `video_id`, `result_type` (same enum as `job_type`), `entity_id uuid`, `entity_name text`, `confidence float`, `was_accepted bool null`, `accepted_by uuid null`, `accepted_at timestamptz`, `rejection_reason text`, `run_version int default 1`, `entity_deleted bool default false`, `deleted_at timestamptz null` (soft delete for re-runs). RLS: read for `has_permission video.edit_metadata` OR job owner.
- `**ai_agent_sessions**` — `id`, `agent_index int`, `model text`, `scope`, `context_snapshot_id uuid` (FK → `ai_taxonomy_snapshot`), `last_heartbeat timestamptz`, `current_job_id`, `total_jobs_completed`, `total_prompt_tokens`, `total_completion_tokens`, `session_started_at`, `session_ended_at`, `end_reason text`. RLS: staff read.
- `**ai_taxonomy_snapshot**` — `id`, `snapshot_at timestamptz`, `categories_compact text` (TSV `slug|name|parent_slug|depth`), `platform_tags_compact text`, `secondary_tags_compact text`, `total_categories int`, `total_tags int`, `is_current bool`. Refreshed by `refresh_ai_taxonomy_snapshot()` server fn, invoked from triggers on `categories` and `tags` AFTER INSERT/UPDATE/DELETE (debounced via `pg_notify` consumed by the orchestrator cron — avoid synchronous heavy rebuild inside DDL triggers).
- `**videos` additions** — `ai_categorised_at`, `ai_tagged_at`, `ai_categorisation_model`, `ai_tagging_model`, `ai_confidence_avg float`, `ai_review_status` enum(`none`,`pending_review`,`accepted`,`partially_accepted`,`rejected`) default `none`.
- `**profiles.suspended_at timestamptz null**` (used by phase 10).
- `**app_settings` seeds**: `ai_max_parallel_agents=2`, `ai_user_submit_model`, `ai_admin_model`, `ai_batch_model`, `ai_fallback_model_order`, `ai_max_categories_per_video=30`, `ai_min_tags_secondary=50`, `ai_session_max_jobs=20`, `ai_heartbeat_timeout_s=90`, `ai_user_submit_auto=true`, `ai_stale_threshold_days=365`, `ai_max_batch_size=500`, `show_ai_attribution_on_videos=false`.
- **Permission keys (`permissions` seed)**: `ai.dispatch`, `ai.review`, `ai.manage`, `users.view`, `users.manage`. Granted to `owner` + `admin` roles via `role_permissions`. Refactor-map row 3 (new permission key) applies — update `admin.roles.tsx` matrix.

GRANTs for every new table: `select` to `authenticated` (staff-filtered by RLS), `all` to `service_role`.

---

## Phase 2 — Prompt builder + Lovable AI Gateway client (0.5.0)

`src/lib/ai/` server-only:

- `taxonomy-snapshot.server.ts` — builds the compact TSV taxonomy + platform/secondary tag tables; persists as the current snapshot; exposes `getCurrentSnapshot()` cached in-process for the cron tick.
- `prompt.server.ts` — shared base system prompt (identity + idempotency rule "only output results for the supplied video_id") + four task suffixes, each with a strict JSON output schema. The per-job user message is `{video_id,title,description(≤500c),channel_name,youtube_tags(top 20),duration_seconds,published_at,existing_categories,existing_primary_tags}`.
- `gateway.server.ts` — POSTs to Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`, bearer `LOVABLE_API_KEY`), structured JSON output, parses with try/catch, validates every returned slug against the snapshot. Unknown slugs dropped; >50 % unknown → `error="taxonomy_mismatch"`, job failed (sweeper reissues).
- Session reuse: the conversation array (system + taxonomy injected once, then appended user messages per job) is rebuilt server-side from the session's `id` + `context_snapshot_id` on each tick — no in-memory state needed across cron invocations.

Edge cases retained from draft: malformed JSON → `error="malformed_output"`, retryable up to `max_retries`; context-length 400 → end session with `end_reason='context_exceeded'`, start fresh; over-classification check after each batch (single slug >80 % of batch → monitor warning).

---

## Phase 3 — Orchestrator: dispatcher, runner, heartbeat & retry sweepers (0.5.0)

- `src/lib/ai/orchestrator.server.ts`:
  - `dispatchNextJob(scope)` — `SELECT ... FOR UPDATE SKIP LOCKED` on `ai_jobs`, claim atomically.
  - `runJob(job, session)` — invokes gateway, writes `ai_job_results` (was_accepted=true for `scope='user_submit'` auto-accept; null otherwise for human review), bumps session counters, updates `videos.ai_*`.
  - `pauseBatch(batch_id)` / `resumeBatch(batch_id)` / `cancelBatch(batch_id)` — set status transitions; in-flight jobs check pause flag between jobs.
  - `sweepStaleSessions()` (90 s heartbeat default) — re-queue running jobs whose session heartbeat is stale.
  - `sweepRetries()` — re-queue `failed` jobs with `retry_count < max_retries` and non-permanent errors.
- HMAC cron route `src/routes/api/public/cron/ai-orchestrator.ts` — same `LEADERBOARD_CRON_SECRET`-style bearer pattern as existing cron routes. Every 30 s: refresh in-process taxonomy if `is_current` changed, fill up to `ai_max_parallel_agents` sessions across the model pool, dispatch + run one job per session per tick, run sweepers every Nth tick.
- pg_cron schedules (via `supabase--insert`, not migration): orchestrator every 30 s, retry sweep every 2 min, heartbeat sweep every 60 s.

---

## Phase 4 — `/admin/videos/$videoId` single-video detail with AI panel (0.5.0)

New route `src/routes/_authenticated/admin.videos.$videoId.tsx`, gated `library.manage`. Three-column desktop layout, stacked on mobile.

- Left: embedded YouTube player + read-only stats (title, channel, duration, submission_count, suggest_count, category breadcrumb, tag chips).
- Centre: inline-save metadata editor (categories ≤5, tag rank reorder, curator note, content warnings, AI metadata block with stale-warning chip when `ai_*_at < now() - ai_stale_threshold_days`).
- Right: AI panel with tabs (Categories / Primary tags / Secondary tags / All tags). Each tab shows current assignments + "Request AI suggestion" button (dispatches `admin_single` priority=3 job) + result chips with confidence colour (>0.8 green, 0.5–0.8 amber, <0.5 red) + per-result accept/reject toggle. TanStack Query `refetchInterval: jobActive ? 5000 : false`.
- Hover-prefetch from the admin/videos DataTable row (`getVideoDetail` + `getAiJobResults`).

---

## Phase 5 — `/admin/videos` batch AI + background monitor Sheet (0.5.0)

- Extend existing `admin.videos.tsx` DataTable batch toolbar with **"Run AI on selected"** popover (task checkboxes, max categories slider, min secondary tags slider, max duration select). Single `INSERT INTO ai_jobs VALUES (...),(...),...` transaction, server-capped at `ai_max_batch_size` (500); excess returns a sonner warning.
- New header icon button (brain) opens a right-side **Background Monitor Sheet** (640 px). Sections:
  - **Active sessions** card list: model, scope, jobs completed, prompt/completion tokens, elapsed, current job title, heartbeat (relative), health colour.
  - **Batch queue** DataTable: batch_id (short), scope, task type chips, totals (pending/running/paused/completed/failed), success %, avg confidence, elapsed/ETA (client-derived), created_by, actions (pause/resume/cancel(AlertDialog)/view).
  - Adaptive polling: 5 s when active jobs exist, 30 s when idle, paused when sheet closed.
- `max_duration_s` reached mid-batch → pause remaining jobs + notification to `created_by`.

---

## Phase 6 — Submit sheet + moderation queue AI integration (0.5.0)

- **Submit sheet** (`src/components/submit-sheet.tsx`): after YouTube metadata loads per URL, immediately create `user_submit` jobs (`categorise`, `tag_primary`, `tag_secondary` only — never `tag_rest`). Inline "Categorising with AI…" indicator per URL. Returned suggestions pre-fill the category/tag pickers (still capped by plan 4 limits). Submitting before AI completes is allowed; AI results land in `ai_job_results` for the moderator to consult. AI is gated by `ai_user_submit_auto` and never blocks the submit button.
- **Moderation queue** (`src/routes/_authenticated/moderation.tsx`): below the existing proposed category/tag checkbox sections add an **AI suggestions** panel reading the latest non-soft-deleted `ai_job_results` for the candidate video, with confidence chips + accept/reject. "Re-run AI" button creates `admin_queue` priority=7 jobs and soft-deletes prior results (`deleted_at`), bumping `run_version`. Audit actions: `ai.rerun_requested`.

---

## Phase 7 — AI observability: stale chips, dashboard widget, audit, admin settings (0.5.0)

- Stale chips in `admin/videos` DataTable, `admin/videos/$id`, and moderation when `ai_*_at` exceeds `ai_stale_threshold_days`.
- New toggleable columns in the admin/videos DataTable: `ai_review_status`, `ai_confidence_avg` (colour-coded, sortable). Filter "Pending AI review only".
- Audit actions (new strings, no enum migration): `ai.job_dispatched`, `ai.job_completed`, `ai.result_accepted`, `ai.result_rejected`, `ai.batch_paused`, `ai.batch_resumed`, `ai.batch_cancelled`, `ai.rerun_requested`.
- **Admin Settings → AI section** (`admin.settings.tsx`): selects for each model slot (sourced from the supported-models list), sliders for parallel agents (1–6), session max jobs (5–50), heartbeat timeout (30–180 s), max categories (1–30), min secondary tags (10–200), stale threshold days, auto-categorise switch. Hot-reloaded by the orchestrator on each tick.
- `LOVABLE_API_KEY` is already a managed secret — no UI rotation in this plan; if rotation is needed it goes through `lovable_api_key--rotate_lovable_api_key`.
- **Dashboard widget** (extend admin landing): "AI coverage" = `count(videos where ai_categorised_at > now()-stale)/count(approved)`. Stored daily into `app_settings.ai_coverage_metric` by a small pg_cron job — no per-request aggregation.
- "Queue all stale AI videos" button (owner/admin only) → dispatch `admin_batch` for `ai_categorised_at IS NULL OR < now()-stale`.
- Optional public attribution chip on `/v/$id` gated by `show_ai_attribution_on_videos`, respecting `audit_privacy_mode` of the accepting curator.

---

## Phase 8 — Edge cases (0.5.0)

- Account hard-delete (plan 1): `ai_jobs.created_by = NULL` for any in-flight `user_submit` jobs; results retained on the video. Add to `src/lib/account-deletion.server.ts`.
- Taxonomy renamed/deleted mid-batch: snapshot is immutable per batch; post-batch validator marks `ai_job_results.entity_deleted=true` so the monitor surfaces "review affected results".
- Gateway 429/5xx across all models: pause all running jobs, set `app_settings.ai_all_models_throttled=true`, broadcast notification to admins; retry sweep clears it on next success.
- Concurrent `user_submit` + `admin_single` for same video: keyed by `(video_id, job_type, run_version)` — no overwrite; UI shows latest run_version per `job_type`.

---

## Phase 9 — Public landing page `/` (0.5.0)

Replace current authenticated-only index behaviour: public landing, redirect to `/feed` when authenticated.

- **Section 1** — Full-viewport ambient video wall: 3×2 grid of muted/looping YouTube iframe previews from the top 6 of `mv_suggested_feed` (no auth needed). Overlaid monochrome wordmark + tagline + CTAs (Browse → `/categories`, Sign in → `/login`). Vignette via inset radial box-shadow on a pseudo-element. `prefers-reduced-motion` → static thumbnails.
- **Section 2** — Three feature cards animated in via IntersectionObserver + CSS (Suggest counter, Leaderboard rank, Community curation flow). Monochrome.
- **Section 3** — Three live stat cards: approved videos, total categories, public contributors (only profiles with `audit_privacy_mode='public'`). Read from denormalised `app_settings.landing_stats` refreshed daily by pg_cron.
- **Section 4** — Minimal footer: wordmark, tagline, sign-in, links (Categories, Leaderboard, Privacy, Terms).
- Cache `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. If `mv_suggested_feed` has <6 rows: fill with monochrome wordmark placeholders.
- SEO (per existing pattern in `index.tsx`): keep `WebSite` + `Organization` JSON-LD, add `ItemList` of the 6 featured videos.

---

## Phase 10 — `/admin/users` with role hierarchy + suspension (0.5.0)

New route `src/routes/_authenticated/admin.users.tsx`, gated `users.view`. New sidebar item "Users" under Admin.

- DataTable: avatar, display name, masked email (server-side mask unless actor has `audit.view`), roles (chips), joined, last active (from `auth.users.last_sign_in_at` via server fn), submission count, AI pending-review count. Server-side search (debounced 300 ms), 50/page Intersection Observer infinite scroll.
- **Role assignment server fn** with hierarchy rules:
  1. Only `owner` can grant `owner`; capped at **2 concurrent owners** (`max_owners_reached` error).
  2. `admin` can grant any non-admin, non-owner role.
  3. Other roles cannot grant.
  4. Last owner cannot be demoted (existing plan 1 rule preserved).
  Combobox options are filtered **server-side** based on the actor's level — never just hidden in the client.
- Remove role: `X` chip → AlertDialog (within the 5-dialog budget).
- **User detail Sheet** (right side): profile info, roles + timestamps, last 20 audit entries (`target_id=user.id OR actor_id=user.id`), submission count, AI jobs created. Email shown fully only when actor has `audit.view`.
- **Suspend / unsuspend** — uses new `profiles.suspended_at`. Auth middleware (`src/integrations/supabase/auth-middleware.ts`) rejects suspended users with a clear error. Suspended users' submissions hidden from moderation queue; their approved videos remain visible. Audit actions `user.suspended` / `user.unsuspended` + in-app notification to the user.
- Edge cases: assigning role ≥ actor's level → `insufficient_role_level` (server-enforced + filtered from combobox).

---

## Refactor-map additions

Append to `.lovable/refactor-map.md`:


| Row | Change                                                                                    | Touch-set                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 17  | `ai_jobs` status change                                                                   | background monitor, admin/videos AI column, admin/videos/$id AI panel, audit (`ai.*`), notifications (admin batches), submit sheet inline indicator, moderation AI panel |
| 18  | `ai_taxonomy_snapshot` rebuild                                                            | triggers on `categories`+`tags`, `refresh_ai_taxonomy_snapshot()` server fn, gateway prompt builder, all active sessions (next tick)                                     |
| 19  | AI `app_settings` keys                                                                    | `admin.settings.tsx` AI section, orchestrator tick (hot reload), monitor defaults, dashboard "AI coverage" widget                                                        |
| 20  | `profiles.suspended_at`                                                                   | `auth-middleware.ts`, moderation queue filter, `admin/users` DataTable, notifications, audit (`user.suspended/unsuspended`)                                              |
| 21  | New permission keys `ai.dispatch`, `ai.review`, `ai.manage`, `users.view`, `users.manage` | `role_permissions` seed, `admin.roles.tsx` matrix, every `has_permission()` call in `admin.users`, `admin.videos`, orchestrator routes                                   |


---

## Open questions

1. Public landing replaces the current `/` — anything you want kept from the existing index (logged-out shell, partner logos, etc.)? Answer: Not really. But the new landing has to not scroll. Just the viewport. 
2. Auto-accept policy for `user_submit` AI results: draft says auto-accept at submit time. Keep, or require explicit user click on the suggested chips before they count as accepted?
3. Owner cap of 2: hard cap, or a configurable `app_settings.max_owners`? Asnwer: Configurable. 
4. AI attribution chip on public video pages: default off in plan — leave off until you opt in per-instance?