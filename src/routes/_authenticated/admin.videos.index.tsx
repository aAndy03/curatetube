import * as React from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import { getCategoryTree, type CategoryNode } from "@/lib/categories.functions";
import {
  listAdminVideos,
  listAllTags,
  addVideoCategory,
  removeVideoCategory,
  addVideoTag,
  removeVideoTag,
  batchUpdateVideos,
  queueAllStaleAi,
  getAiCoverage,
  type AdminVideoRow,
} from "@/lib/admin-videos.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BatchAiPopover, AiMonitorSheet } from "@/components/admin-ai-controls";

export const Route = createFileRoute("/_authenticated/admin/videos/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Videos — CurateTube Admin" }] }),
  component: AdminVideosPage,
});

type Tag = {
  id: string;
  name: string;
  slug: string;
  source: "platform" | "sciencedirect" | "youtube_api" | "user";
  tier: "primary" | "secondary" | "internal";
  is_platform_tag: boolean;
  usage_count: number;
};

const SOURCE_ORDER: Tag["source"][] = [
  "platform",
  "sciencedirect",
  "youtube_api",
  "user",
];
const SOURCE_LABEL: Record<Tag["source"], string> = {
  platform: "Platform",
  sciencedirect: "ScienceDirect",
  youtube_api: "YouTube API",
  user: "User",
};

function AdminVideosPage() {
  const { data: perms } = usePermissions();
  const qc = useQueryClient();

  const canManage = perms?.isOwner || perms?.has("library.manage");

  const fetchVideos = useServerFn(listAdminVideos);
  const fetchTags = useServerFn(listAllTags);
  const fetchTree = useServerFn(getCategoryTree);

  // Filters
  const [q, setQ] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [uncategorized, setUncategorized] = React.useState(false);
  const [tagId, setTagId] = React.useState<string | null>(null);
  const [hasPrimary, setHasPrimary] = React.useState<
    "any" | "yes" | "no"
  >("any");
  const [pendingReviewOnly, setPendingReviewOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<
    "published_at" | "ai_confidence_avg"
  >("published_at");
  const [showAiCols, setShowAiCols] = React.useState(true);
  const [page, setPage] = React.useState(0);
  const pageSize = 50;

  React.useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  React.useEffect(
    () => setPage(0),
    [qDebounced, categoryId, uncategorized, tagId, hasPrimary, pendingReviewOnly, sortBy],
  );

  const tagsQ = useQuery({
    queryKey: ["admin-all-tags"],
    enabled: !!canManage,
    staleTime: 10 * 60_000,
    queryFn: () => fetchTags(),
  });
  const treeQ = useQuery({
    queryKey: ["category-tree"],
    enabled: !!canManage,
    staleTime: Infinity,
    queryFn: () => fetchTree(),
  });

  const videosQ = useQuery({
    queryKey: [
      "admin-videos",
      qDebounced,
      categoryId,
      uncategorized,
      tagId,
      hasPrimary,
      pendingReviewOnly,
      sortBy,
      page,
    ],
    enabled: !!canManage,
    queryFn: () =>
      fetchVideos({
        data: {
          q: qDebounced || undefined,
          category_id: categoryId,
          uncategorized: uncategorized && !categoryId,
          tag_id: tagId,
          has_primary_tags:
            hasPrimary === "any" ? undefined : hasPrimary === "yes",
          ai_pending_review_only: pendingReviewOnly || undefined,
          sort_by: sortBy,
          sort_dir: sortBy === "ai_confidence_avg" ? "desc" : "desc",
          page,
          page_size: pageSize,
        },
      }),
  });

  const fetchCoverage = useServerFn(getAiCoverage);
  const queueStaleFn = useServerFn(queueAllStaleAi);
  const coverageQ = useQuery({
    queryKey: ["ai-coverage"],
    enabled: !!canManage,
    queryFn: () => fetchCoverage(),
    staleTime: 60_000,
  });
  const queueStale = useMutation({
    mutationFn: () => queueStaleFn(),
    onSuccess: (r) => {
      if (r.jobs_created === 0) {
        toast.success("No stale videos to re-categorise");
      } else {
        toast.success(
          `Queued ${r.jobs_created} AI jobs across ${r.videos} videos${r.total_stale && r.total_stale > r.videos ? ` (of ${r.total_stale} stale)` : ""}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["ai-coverage"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const tags = (tagsQ.data?.tags ?? []) as Tag[];
  const tagsById = React.useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);
  const cats = treeQ.data?.categories ?? [];
  const catsById = React.useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of cats) m.set(c.id, c);
    return m;
  }, [cats]);

  const flatTree = React.useMemo(() => buildIndentedList(cats), [cats]);

  // Mutations
  const addCat = useMutation({
    mutationFn: (v: { video_id: string; category_id: string }) =>
      addVideoCategory({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rmCat = useMutation({
    mutationFn: (v: { video_id: string; category_id: string }) =>
      removeVideoCategory({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const addTag = useMutation({
    mutationFn: (v: { video_id: string; tag_id: string }) =>
      addVideoTag({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rmTag = useMutation({
    mutationFn: (v: { video_id: string; tag_id: string }) =>
      removeVideoTag({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Selection
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSelected(new Set()), [page, qDebounced, categoryId, tagId]);

  const batch = useMutation({
    mutationFn: (v: {
      op: "add_category" | "remove_category" | "add_tag";
      category_id?: string;
      tag_id?: string;
    }) =>
      batchUpdateVideos({
        data: { ...v, video_ids: Array.from(selected) },
      }),
    onSuccess: (r) => {
      toast.success(`${r.ok} updated${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (perms && !canManage) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-medium">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You need <code>library.manage</code> to manage videos.
        </p>
      </div>
    );
  }

  const rows = videosQ.data?.rows ?? [];
  const total = videosQ.data?.total ?? 0;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} total · inline category & tag editing
          </p>
        </div>
        <AiMonitorSheet />
      </header>

      {/* AI coverage widget */}
      {coverageQ.data ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              AI coverage
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {coverageQ.data.coverage_pct}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {coverageQ.data.ai_fresh.toLocaleString()} fresh ·{" "}
            <span className="text-amber-600 dark:text-amber-400">
              {coverageQ.data.ai_stale_or_missing.toLocaleString()} stale/missing
            </span>{" "}
            · {coverageQ.data.pending_review.toLocaleString()} pending review ·
            threshold {coverageQ.data.stale_threshold_days}d
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={pendingReviewOnly ? "default" : "outline"}
              onClick={() => setPendingReviewOnly((v) => !v)}
            >
              {pendingReviewOnly ? "✓ " : ""}Pending review only
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                queueStale.isPending ||
                coverageQ.data.ai_stale_or_missing === 0
              }
              onClick={() => queueStale.mutate()}
            >
              {queueStale.isPending ? "Queueing…" : "Queue all stale"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Input
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <CategoryPicker
          flatTree={flatTree}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            if (id) setUncategorized(false);
          }}
          placeholder="Filter by category"
          allowClear
        />
        <TagPicker
          tags={tags}
          value={tagId}
          onChange={setTagId}
          placeholder="Filter by tag"
          allowClear
        />
        <Select
          value={hasPrimary}
          onValueChange={(v) => setHasPrimary(v as typeof hasPrimary)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Primary tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any primary tags</SelectItem>
            <SelectItem value="yes">Has primary tags</SelectItem>
            <SelectItem value="no">Missing primary tags</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={uncategorized}
              disabled={!!categoryId}
              onCheckedChange={(v) => setUncategorized(!!v)}
            />
            Show only uncategorized videos
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={showAiCols}
              onCheckedChange={(v) => setShowAiCols(!!v)}
            />
            Show AI columns
          </label>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort:</span>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as typeof sortBy)}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published_at">Newest published</SelectItem>
                <SelectItem value="ai_confidence_avg">
                  AI confidence (high → low)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>


      {/* Batch toolbar */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">(max 50/batch)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <CategoryPicker
              flatTree={flatTree}
              value={null}
              onChange={(id) =>
                id && batch.mutate({ op: "add_category", category_id: id })
              }
              placeholder="+ Add category"
            />
            <CategoryPicker
              flatTree={flatTree}
              value={null}
              onChange={(id) =>
                id && batch.mutate({ op: "remove_category", category_id: id })
              }
              placeholder="− Remove category"
            />
            <TagPicker
              tags={tags}
              value={null}
              onChange={(id) =>
                id && batch.mutate({ op: "add_tag", tag_id: id })
              }
              placeholder="+ Add tag"
            />
            <BatchAiPopover
              selectedIds={Array.from(selected)}
              onDispatched={() => setSelected(new Set())}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10 bg-card text-left">
            <tr className="border-b">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    if (v) {
                      const next = new Set(selected);
                      for (const r of rows) {
                        if (next.size >= 50) break;
                        next.add(r.id);
                      }
                      setSelected(next);
                    } else {
                      const next = new Set(selected);
                      for (const r of rows) next.delete(r.id);
                      setSelected(next);
                    }
                  }}
                />
              </th>
              <th className="w-32 px-3 py-2 font-medium">Thumb</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="w-48 px-3 py-2 font-medium">Creator</th>
              <th className="w-72 px-3 py-2 font-medium">Categories</th>
              <th className="w-[28rem] px-3 py-2 font-medium">Tags</th>
              <th className="w-16 px-3 py-2 text-right font-medium">#</th>
              <th className="w-16 px-3 py-2 text-right font-medium">Subm</th>
              <th className="w-16 px-3 py-2 text-right font-medium">Sugg</th>
              <th className="w-32 px-3 py-2 font-medium">Approved</th>
              {showAiCols ? (
                <>
                  <th className="w-28 px-3 py-2 font-medium">AI review</th>
                  <th className="w-20 px-3 py-2 text-right font-medium">
                    AI conf.
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {videosQ.isLoading ? (
              <tr>
                <td colSpan={showAiCols ? 12 : 10} className="p-4">
                  <Skeleton className="h-72 w-full" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showAiCols ? 12 : 10}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  No videos match these filters.
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  catsById={catsById}
                  tagsById={tagsById}
                  flatTree={flatTree}
                  allTags={tags}
                  selected={selected.has(v.id)}
                  showAiCols={showAiCols}
                  staleThresholdDays={
                    coverageQ.data?.stale_threshold_days ?? 365
                  }
                  onToggle={(checked) => {
                    const next = new Set(selected);
                    if (checked) {
                      if (next.size >= 50) {
                        toast.error("Batch limit 50");
                        return;
                      }
                      next.add(v.id);
                    } else next.delete(v.id);
                    setSelected(next);
                  }}
                  onAddCat={(cid) =>
                    addCat.mutate({ video_id: v.id, category_id: cid })
                  }
                  onRmCat={(cid) =>
                    rmCat.mutate({ video_id: v.id, category_id: cid })
                  }
                  onAddTag={(tid) =>
                    addTag.mutate({ video_id: v.id, tag_id: tid })
                  }
                  onRmTag={(tid) =>
                    rmTag.mutate({ video_id: v.id, tag_id: tid })
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page + 1} of{" "}
          {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============ Row ============
function VideoRow({
  video,
  catsById,
  tagsById,
  flatTree,
  allTags,
  selected,
  showAiCols,
  staleThresholdDays,
  onToggle,
  onAddCat,
  onRmCat,
  onAddTag,
  onRmTag,
}: {
  video: AdminVideoRow;
  catsById: Map<string, CategoryNode>;
  tagsById: Map<string, Tag>;
  flatTree: Array<{ id: string; label: string; depth: number }>;
  allTags: Tag[];
  selected: boolean;
  showAiCols: boolean;
  staleThresholdDays: number;
  onToggle: (v: boolean) => void;
  onAddCat: (id: string) => void;
  onRmCat: (id: string) => void;
  onAddTag: (id: string) => void;
  onRmTag: (id: string) => void;
}) {
  const atCatCap = video.category_ids.length >= 5;
  const staleMs = staleThresholdDays * 24 * 3600 * 1000;
  const aiStale =
    !video.ai_categorised_at ||
    Date.now() - new Date(video.ai_categorised_at).getTime() > staleMs;
  const conf = video.ai_confidence_avg;
  const confTone =
    conf == null
      ? "text-muted-foreground"
      : conf >= 0.8
        ? "text-emerald-600 dark:text-emerald-400"
        : conf >= 0.5
          ? "text-amber-600 dark:text-amber-400"
          : "text-destructive";
  return (
    <tr className="border-b align-top last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2">
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(!!v)} />
      </td>
      <td className="px-3 py-2">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-14 w-24 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-14 w-24 rounded bg-muted" />
        )}
      </td>
      <td className="px-3 py-2">
        <Link
          to="/admin/videos/$videoId"
          params={{ videoId: video.id }}
          className="line-clamp-2 font-medium hover:underline"
        >
          {video.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <Link
            to="/v/$id"
            params={{ id: video.id }}
            className="text-muted-foreground hover:underline"
          >
            View public ↗
          </Link>
          {video.category_ids.length === 0 ? (
            <span className="text-amber-600">Uncategorized</span>
          ) : null}
          {aiStale ? (
            <span className="rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              AI stale
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {video.creator?.title ?? "—"}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {video.category_ids.map((cid) => {
            const c = catsById.get(cid);
            return (
              <Badge key={cid} variant="secondary" className="gap-1">
                {c?.name ?? cid.slice(0, 8)}
                <button
                  onClick={() => onRmCat(cid)}
                  className="hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {!atCatCap ? (
            <CategoryPicker
              flatTree={flatTree}
              value={null}
              onChange={(id) => id && onAddCat(id)}
              placeholder="+"
              compact
              exclude={video.category_ids}
            />
          ) : (
            <span className="text-xs text-muted-foreground">5/5</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {video.tag_ids.length === 0 ? (
            <span className="text-xs text-muted-foreground">No tags</span>
          ) : (
            video.tag_ids.map((tid) => {
              const t = tagsById.get(tid);
              const isPrimary = video.primary_tag_ids.includes(tid);
              return (
                <Badge
                  key={tid}
                  variant={isPrimary ? "default" : "outline"}
                  className="gap-1"
                  title={t ? `${t.source} · ${t.tier}` : tid}
                >
                  {t?.name ?? tid.slice(0, 8)}
                  <button
                    onClick={() => onRmTag(tid)}
                    className="hover:text-destructive"
                    aria-label={`Remove tag ${t?.name ?? ""}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })
          )}
          <TagPicker
            tags={allTags}
            value={null}
            onChange={(id) => id && onAddTag(id)}
            placeholder="+"
            compact
            exclude={video.tag_ids}
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{video.tag_total}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {video.submission_count}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {video.suggest_count}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {video.approved_at
          ? new Date(video.approved_at).toLocaleDateString()
          : "—"}
      </td>
      {showAiCols ? (
        <>
          <td className="px-3 py-2 text-xs">
            {video.ai_review_status && video.ai_review_status !== "none" ? (
              <Badge variant="outline" className="text-[10px]">
                {video.ai_review_status.replace(/_/g, " ")}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
          <td className={`px-3 py-2 text-right text-xs tabular-nums ${confTone}`}>
            {conf != null ? `${Math.round(conf * 100)}%` : "—"}
          </td>
        </>
      ) : null}
    </tr>
  );
}

// ============ Pickers ============
function buildIndentedList(
  cats: CategoryNode[],
): Array<{ id: string; label: string; depth: number }> {
  const byParent = new Map<string | null, CategoryNode[]>();
  for (const c of cats) {
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  const out: Array<{ id: string; label: string; depth: number }> = [];
  function walk(parent: string | null, depth: number) {
    for (const c of byParent.get(parent) ?? []) {
      out.push({ id: c.id, label: c.name, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

function CategoryPicker({
  flatTree,
  value,
  onChange,
  placeholder,
  compact,
  allowClear,
  exclude,
}: {
  flatTree: Array<{ id: string; label: string; depth: number }>;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  compact?: boolean;
  allowClear?: boolean;
  exclude?: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const selected = flatTree.find((c) => c.id === value);
  const excludeSet = new Set(exclude ?? []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(
            "justify-between",
            compact ? "h-6 gap-1 px-2 text-xs" : "w-full",
          )}
        >
          {compact ? (
            <Plus className="h-3 w-3" />
          ) : (
            <span className="truncate">{selected?.label ?? placeholder}</span>
          )}
          {!compact ? <ChevronsUpDown className="h-4 w-4 opacity-50" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            {allowClear ? (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear filter
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              {flatTree.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.label}
                  disabled={excludeSet.has(c.id)}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span style={{ paddingLeft: c.depth * 12 }}>{c.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagPicker({
  tags,
  value,
  onChange,
  placeholder,
  compact,
  allowClear,
  exclude,
}: {
  tags: Tag[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  compact?: boolean;
  allowClear?: boolean;
  exclude?: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const selected = tags.find((t) => t.id === value);
  const excludeSet = new Set(exclude ?? []);
  const grouped = React.useMemo(() => {
    const g: Record<Tag["source"], Tag[]> = {
      platform: [],
      sciencedirect: [],
      youtube_api: [],
      user: [],
    };
    for (const t of tags) g[t.source].push(t);
    return g;
  }, [tags]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(
            "justify-between",
            compact ? "h-6 gap-1 px-2 text-xs" : "w-full",
          )}
        >
          {compact ? (
            <Plus className="h-3 w-3" />
          ) : (
            <span className="truncate">{selected?.name ?? placeholder}</span>
          )}
          {!compact ? <ChevronsUpDown className="h-4 w-4 opacity-50" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search tags…" />
          <CommandList>
            <CommandEmpty>No tag found.</CommandEmpty>
            {allowClear ? (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear filter
                </CommandItem>
              </CommandGroup>
            ) : null}
            {SOURCE_ORDER.map((src) =>
              grouped[src].length ? (
                <CommandGroup key={src} heading={SOURCE_LABEL[src]}>
                  {grouped[src].slice(0, 500).map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      disabled={excludeSet.has(t.id)}
                      onSelect={() => {
                        onChange(t.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === t.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.tier}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
