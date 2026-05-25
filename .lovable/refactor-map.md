# CurateTube — Refactor Map

When you change one of the surfaces in the left column, you MUST audit (and usually update) every file/area in the right column **in the same change**. Each row is the canonical "touch-set" for that change. Treat this as a checklist.

> Convention: paths are repo-relative. `*` means "all files matching".

---

## 1. `videos` table — column added / removed / renamed

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/components/video-card.tsx`                    | Card render fields                             |
| `src/components/video-actions.tsx`                 | Optimistic counter updates                     |
| `src/routes/_authenticated/v.$id.tsx`              | Detail page                                    |
| `src/routes/_authenticated/moderation.tsx`         | Moderation preview                             |
| `src/routes/_authenticated/leaderboard*.tsx`       | Leaderboard entry display                      |
| `src/lib/leaderboard.server.ts`                    | Recommendation / scoring projections           |
| `src/lib/library.functions.ts`                     | All `.select(...)` strings on `videos`         |
| `src/lib/audit.server.ts`                          | `before` / `after` snapshots                   |
| MV definitions in `supabase/migrations/*phase2*`   | `mv_trending`, `mv_suggested_feed`, `mv_category_stats` may need rebuild |
| Search index (when added)                          | Re-index                                       |

## 2. `user_video_status` enum — value added / removed

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/lib/action-queue.ts` (`QueuedActionPayload`)  | Client-side type union                         |
| `src/lib/actions.functions.ts` (`StatusA` schema)  | Server batch validator                         |
| `src/components/video-actions.tsx` (`ACTIONS`)     | Visible buttons                                |
| `src/routes/_authenticated/me.$tab.tsx`            | Profile tabs                                   |
| `src/components/app-sidebar.tsx` (`personal`)      | Sidebar counts / links                         |
| `public.user_video_status_counters_sync` trigger   | Counter math (`app_*_count` columns)           |
| `src/lib/lists.functions.ts`                       | `getMyList`, `getMyVideoState`                 |
| GDPR export script (when added)                    | Include new value                              |

## 3. New permission key

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `supabase/migrations/*permissions*.sql` seed       | Insert new key                                 |
| Default role grants                                | `role_permissions` seed for owner / curator    |
| Every `has_permission(_, '<key>')` call            | RLS policies + server fns                      |
| `src/routes/_authenticated/admin.roles.tsx`        | Permission matrix UI                           |
| Permission HoverCards (where shown)                | Tooltip copy                                   |
| `audit_log.action` enum (if a new action implies)  | Add audit action                               |

## 4. New sidebar item

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/components/app-sidebar.tsx`                   | Nav entry                                      |
| `src/routes/_authenticated/<route>.tsx`            | Create the route file                          |
| Breadcrumb component (when added)                  | Crumb mapping                                  |
| `src/components/cookie-consent.tsx` / `submit-sheet.tsx` Cmd-K (when added) | Command palette entry |
| Mobile nav (when added)                            | Mirror entry                                   |

## 5. `audit_log` visibility change (`internal` ↔ `staff` ↔ `public`)

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/lib/audit.server.ts` `writeAudit` defaults    | Default visibility per action                  |
| `src/routes/_authenticated/admin.audit.tsx` filters | Visibility selector defaults                  |
| `src/routes/privacy.tsx`                           | User-facing privacy disclosure                 |
| Public attribution renderer                        | What is shown on video / creator pages         |

## 6. New batch action type

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/lib/action-queue.ts` `QueuedActionPayload`    | Union member                                   |
| `src/lib/action-queue.ts` `coalesceKey`            | Coalescing rule                                |
| `src/lib/actions.functions.ts` schema + switch     | Validator + dispatcher                         |
| Optimistic mutation site (component calling enqueue) | Cache update + rollback                      |
| `MAX_ATTEMPTS` retry semantics                     | Confirm retries are safe (idempotency)         |

## 7. New materialized view / cron-refreshed cache

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| Migration adding the MV + index                    | Schema                                         |
| `public.refresh_mv` function                       | Add new branch (`ELSIF _name = '<view>'`)      |
| `pg_cron` schedule entry                           | Refresh cadence                                |
| `EXPECTED_CADENCE_MS` in `admin.settings.tsx`      | Stale detection                                |
| `forceRefreshMv` view enum (`admin.functions.ts`)  | Allow manual flush                             |
| `MvRefreshSection.VIEWS` in `admin.settings.tsx`   | Show in admin                                  |
| Server fn that reads the view                      | Wire into `library.functions.ts`               |

## 8. New `app_settings` key

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| Seed migration (`INSERT … ON CONFLICT DO NOTHING`) | Default value                                  |
| `admin.settings.tsx`                               | UI control (toggle / slider / input)           |
| Reader on the affected surface                     | Pull setting at the right boundary             |
| If client-only: `subscribeQueue` / `initActionQueue` style hot-reload | Apply without restart            |

---

## Workflow

1. Identify which row(s) above the change matches.
2. Open every file in the right column and confirm whether it needs a real edit or just verification.
3. Bundle related migrations + code edits in the same change so the schema and the code never diverge.
4. Update this file when you discover a touch-set that wasn't captured.

## 9. `reports` column change

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/routes/_authenticated/admin.reports.tsx`      | Admin list + detail columns                    |
| `src/components/report-button.tsx`                 | Submit popover fields                          |
| `src/lib/reports.functions.ts`                     | Server fn `select(...)`, validators            |
| GDPR export script (when added)                    | Include report fields                          |
| `audit_log.action` enum                            | Add audit actions if a new status / decision   |

## 10. `broadcast_notifications` category enum

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `app_settings['broadcast_categories']` seed        | Default category list                          |
| `src/routes/_authenticated/admin.broadcast.tsx`    | Compose + Archive category select / filter     |
| `src/components/notifications-sheet.tsx`           | User-side category filter, badge color         |
| `src/lib/broadcasts.functions.ts`                  | Validators, `select(...)`                      |
| Seed migration                                     | Insert new value                               |

## 11. Hydrated hooks (status + suggest_count)

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| Any new status-bearing component                   | Read via `useHydratedStatus` /                 |
|                                                    | `useHydratedSuggestCount` — NEVER read         |
|                                                    | `["video-state", videoId]` directly            |
| `src/hooks/use-hydrated-status.ts`                 | Only place that subscribes to the raw query    |
| `src/lib/action-queue.ts` `getPendingForVideo`     | The pending-merge source for the hooks         |


## 12. Categories tree change (add/remove/rename/reparent)

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/lib/categories.functions.ts`                  | Tree fetch, reparent / delete-with-children    |
| `src/lib/category-feed.functions.ts`               | Pinned + auto rails consumer                   |
| `src/lib/suggest-categories.functions.ts`          | Suggested category rails                       |
| `src/lib/trending-categories.functions.ts`         | Trending category rails                        |
| `src/lib/creator-categories.functions.ts`          | `mv_creator_categories` rollup                 |
| `src/lib/feed-dedup.server.ts` (`fetch_category_feed_videos` RPC) | Closure-table descendants lookup |
| `category_ancestors` closure trigger               | Maintains depth + lineage on parent change     |
| `src/routes/_authenticated/categories*.tsx`        | Browse + edit-mode UIs                         |
| `mv_category_stats`, `mv_category_suggest_score`, `mv_category_trending_score` | Re-aggregate on next refresh |
| Client `["category-tree"]` query (`staleTime: Infinity`) | Invalidate on `taxonomy.manage` writes    |

## 13. Tags table change (tier / source / is_platform_tag)

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `src/lib/tags.functions.ts` (`listPublicTags`, `getVideoTags`) | Filter / projection                |
| `src/hooks/use-tags-cache.ts`                      | In-memory chip cache (`staleTime: 10m`)        |
| `src/components/video-card.tsx`                    | Primary-tag chip render                        |
| `src/routes/_authenticated/v.$id.tsx`              | Grouped key-tags block                         |
| `src/routes/_authenticated/admin.videos.tsx`       | Tag Combobox grouping                          |
| `src/routes/_authenticated/tags.$slug.tsx`         | Public per-tag library                         |
| `videos.primary_tag_ids` sync trigger              | Top-3 ranked tags denormalization              |

## 14. Submit rate limit config (`submit_limit_default` / per-role)

| Touch                                              | Why                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `app_settings['submit_limit_default']` seed        | Default + per-role override JSON               |
| `src/lib/submit.functions.ts`                      | 7-day rolling window check                     |
| `src/components/submit-sheet.tsx`                  | Header "X of Y" + warning banner               |
| `src/routes/_authenticated/admin.settings.tsx`     | Inline auto-save editor (future)               |
