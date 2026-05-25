# CurateTube — Plan 4 (v0.4.0 → v0.4.11)

Builds on Plans 1–3. Introduces a deep category tree, a three-tier tag system, a video manager, submit quotas, and category-aware feed/suggest/trending/creators surfaces. Versions: **0.4.0 → 0.4.11**, one phase per minor bump.

> **Note on uploaded files**: `sciencedirect_tags_grouped.json` and `video_platform_tags.json` will be checked into `src/data/seeds/` and seeded into Supabase via Phase 1 migration. `cateogries.json` came up empty — categories will be admin-built from scratch unless you re-upload. Files remain the source of truth in the repo; Supabase rows are the editable runtime copy, kept in sync by a one-way `import-seeds` admin action.

---

## Phase 1 — Schema foundation (categories + tags + quotas) — 0.4.0

- `categories` (UUID, slug, name, `parent_id` self-FK, generated `depth`, `sort_order`, `video_count`, audit cols) + `category_ancestors(ancestor_id, descendant_id, depth)` closure table maintained by trigger. Depth-cap trigger ≤ 6 levels.
- `video_categories(video_id, category_id, assigned_by, assigned_at)` + trigger for `video_count` and "≤5 categories per video".
- `tags` extended: `source enum('platform','sciencedirect','youtube_api','user')`, `tier enum('primary','secondary','internal')`, `is_platform_tag`, `usage_count`.
- `video_tags` extended: `rank int`, `assigned_by enum('system','user','admin')` + count triggers.
- `videos.primary_tag_ids uuid[3]` (denorm for card render).
- `submissions.proposed_category_ids uuid[]`, `proposed_tag_ids uuid[]`.
- `user_category_pins(user_id, category_id, sort_order)`.
- `app_settings` seeds: `submit_limit_default` (`{default:3, per_role:{curator:10, admin:0}}`), `max_tags_per_video` (1000), `trending_min_video_count` (3), `trending_viral_cap_pct` (0.4).
- Permissions: `taxonomy.manage`, `library.manage` (seed + owner/admin grants).
- Seed migration imports `src/data/seeds/*.json` into `tags`. Reparent / delete-with-children logic lives in server fns (not DB triggers), wrapped in a single transaction with depth recheck.

## Phase 2 — `/categories` public browse + inline admin editor — 0.4.1

- Public `src/routes/categories.tsx` (tree-cards from `mv_category_stats`, client-side name search, lazy expand).
- Public `src/routes/categories.$slug.tsx` — closure-join videos in slug + descendants, dedup, full action row.
- Edit-mode toggle gated by `taxonomy.manage` on the same routes: inline rename, "+" add child, drag reorder/reparent (depth-6 guard, red drop on violation), trash-with-guard delete. First-time dismissible banner. Optimistic insert with spinner badge.
- Refactor-map rows updated: sidebar entry "Categories", Cmd-K "Browse / Edit categories", `mv_category_stats` gains `depth`, `parent_id`, `child_count`.

## Phase 3 — `/admin/videos` video manager — 0.4.2

- New route `_authenticated/admin.videos.tsx`, gated `library.manage`, sidebar under Admin.
- DataTable (sticky header, resizable, sortable, 50/page + IO infinite scroll): thumb, title, creator, categories chips, primary tag chips, total tag count, submission_count, suggest_count, approved_at.
- Inline category Combobox (Command + Popover, ≤5, full indented tree, immediate write, "uncategorized" warning).
- Inline tag Combobox (grouped Platform → ScienceDirect → YouTube API → User, search, auto-rank; expand-row drag for rank reorder).
- Checkbox column + batch toolbar (Add/Remove category, Add tag) — server-capped at 50/batch, Sonner reports skipped.
- Filter panel (category tree-picker w/ "Uncategorized", tag, creator, date range, has/lacks primary tags) — URL-synced.

## Phase 4 — Tag display surfaces — 0.4.3

- `VideoCard` gets a 2nd metadata row: up to 3 chip links from `primary_tag_ids` (resolved from in-memory tag cache, no join, no row if empty — no layout shift).
- `v.$id.tsx` adds grouped tag block ("Key tags" = rank 1–9; internal hidden from users).
- New public route `src/routes/tags.$slug.tsx` (filtered library by tag, suggest_count sort).
- Search server fn joins `tags` (incl. internal) so admin-seeded scientific tags remain findable even if not displayed.

## Phase 5 — Submit Sheet upgrade (quota + suggestions) — 0.4.4

- Sheet header: "X of Y submits used this week · resets &nbsp;" — immediate server read on open; admins/unlimited see nothing; quota=0 disables submit with reset-date message.
- Multi-URL: each URL costs 1; pre-submit warning if N > remaining; partial-submit fallback option.
- Per-URL: server-side keyword-match against video title/description suggests top-3 categories + top-3 platform tags as chips; user can toggle / Combobox-override (≤3 each). Written into `submissions.proposed_*_ids`.
- Moderation queue panel adds "Proposed categories" + "Proposed primary tags" checkbox sections; approval is one transaction (video + checked categories + checked tags).
- Duplicate detection (Plan 1): new proposals on an existing video appear as "Category/Tag suggestion from &nbsp;" section, not a new video.
- Rate-limit server fn: 7-day rolling window, 429 with `{remaining, resets_at}`.

## Phase 6 — Feed category sections — 0.4.5 ✅

- User-pinned category sections (`user_category_pins`) rank above all auto sections — pinned via Pin/Unpin button on `/categories/:slug`.
- Auto category sections: top 3 by `video_count`, skipping pinned ones.
- Global dedup: `user_feed_dedup(user_id, seen_ids[], cycle_started_at)` keeps a single per-user set across all rails in a 60 min cycle; reset on cycle rollover.
- Underfilled category renders the available videos + "See all in &lt;cat&gt;" link, no padding.
- Rails render on `/feed` above stacked sections via `<CategoryFeedRails />`.

## Phase 7 — `/suggest` + `mv_category_suggest_score` — 0.4.6 ✅

- New MV `mv_category_suggest_score` (15-min refresh, same cadence as `mv_trending`):
`score = sum(suggest_delta_24h)*3 + sum(suggest_delta_72h)*1 + (videos_with_suggests/total_videos)*10`
- `/suggest` layout: existing "Suggested videos" rail on top + 2–4 "Suggested categories" rails below (top 6 by suggest_count per cat). Dedup via `seen_ids`.
- Cold-start: if all scores=0, order by `video_count` and flag `is_cold_start` so the page header reads "Most popular" vs "Based on recent activity".

## Phase 8 — `/trending` + `mv_category_trending_score` — 0.4.7 ✅

- New MV (15-min refresh):
`score = suggest_delta_24h*3 + like_delta_24h*2 + watch_delta_24h*1 + new_videos_7d*5 + submission_delta_7d*2 + leaderboard_entries*4 + diversity_bonus`
`diversity_bonus = +2` if >3 distinct creators contributing. Normalized 0–100 at refresh time.
- Per-video contribution clamped to **40 %** of its category score (viral-cap from `app_settings`).
- Categories with `video_count < trending_min_video_count` (default 3) excluded.
- `/trending` mirrors `/suggest` layout: existing trending rail + "Trending categories" rails, score badge + new-7d/creators badges, shared `user_feed_dedup` cycle.

## Phase 9 — `/creators` by-category view — 0.4.8 ✅

- ToggleGroup at top: "All creators" (unchanged) | "By category".
- New MV `mv_creator_categories` (daily refresh) — creator belongs to category if ≥1 of their videos sits in it (rolled up to top-level via `category_ancestors`).
- "By category" view: section per top-level category, creators repeated across categories (intentional, no dedup here).

## Phase 10 — Refactor-map sync + admin reshuffle — 0.4.9

- Append rows **9 (categories tree change)**, **10 (tags table change)**, **11 (submit rate limit config)** to `.lovable/refactor-map.md` with the touch-sets specified above.
- Update row 1 (`videos`) to add `primary_tag_ids` consumers; row 7 (new MV) to list the three new MVs.
- Admin → Taxonomy page: strip category UI (moved to `/categories` edit mode); keep tag-only management (tier toggle, `is_platform_tag` toggle, delete unused).
- Admin → Settings page: add "Submission limits" (per-role JSON DataTable), "Trending thresholds", "Tag limits" — all inline auto-save.
- Admin → Roles matrix: surface `taxonomy.manage`, `library.manage`.

## Phase 11 — Performance pass — 0.4.10

- DB indexes: `category_ancestors(ancestor_id)`, `(descendant_id)`; GIN on `tags(to_tsvector('english', name||' '||slug))`; `video_categories(category_id)`, `video_tags(tag_id)`, partial index `video_tags(video_id) WHERE rank<=3`.
- Client caches: full category tree `staleTime: Infinity` (invalidated only on `taxonomy.manage` writes); all tags `staleTime: 10m`; both shared by every Combobox + VideoCard.
- Dedup pushed to Postgres: `WHERE video_id != ALL($seen_ids::uuid[])` on every section query, `seen_ids` loaded once from `user_feed_state`.
- Trending normalization done at MV-refresh time (no per-request math).
- All new MVs expose `last_refreshed_at` for the existing Plan 2 admin health widget.

## v0.4.11 — Buffer / QA

Reserved for cross-phase bug-fixes surfaced during build (depth-cap edge cases, seed re-import idempotency, dedup interaction with cycle policy).

---

## Build order


| Version | Phase | Scope                                                         |
| ------- | ----- | ------------------------------------------------------------- |
| 0.4.0   | 1     | Schema + seeds + permissions + quotas                         |
| 0.4.1   | 2     | `/categories` browse + inline editor                          |
| 0.4.2   | 3     | `/admin/videos` manager                                       |
| 0.4.3   | 4     | Tag chips on cards + `/tags/:slug`                            |
| 0.4.4   | 5     | Submit Sheet quota + per-URL suggestions + mod-queue approval |
| 0.4.5   | 6     | Feed category sections + dedup                                |
| 0.4.6   | 7     | `/suggest` + `mv_category_suggest_score`                      |
| 0.4.7   | 8     | `/trending` + `mv_category_trending_score`                    |
| 0.4.8   | 9     | `/creators` by-category + `mv_creator_categories`             |
| 0.4.9   | 10    | Refactor-map sync + admin reshuffle                           |
| 0.4.10  | 11    | Indexes + caches + Postgres dedup                             |
| 0.4.11  | —     | QA buffer                                                     |


## Open questions

1. **Empty `cateogries.json**` — re-upload, or proceed with admin-built tree from scratch? (Plan currently assumes the latter.)
2. **Tag seeds at scale** — `sciencedirect_tags_grouped.json` is 350k lines. Import all (~22k+ per category) or cap per category (e.g. top 2000 by usage)? Default: import all, mark `tier=secondary`, rely on Phase 11 GIN index.
3. **Pinned categories vs feed templates** — if a user pins 10 categories, do we cap at top N or render all 10 above templates? Default: render all pinned, ordered by `user_category_pins.sort_order`.