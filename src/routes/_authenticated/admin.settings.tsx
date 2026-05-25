import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAppSettings,
  setAppSetting,
  listMvRefreshLog,
  forceRefreshMv,
  getSyncHealth,
} from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "App settings — CurateTube" }] }),
  component: SettingsPage,
});

const TOGGLES: { key: string; label: string; help: string }[] = [
  {
    key: "attribution.video_detail_chip",
    label: "Show contributor chip on video pages",
    help: "Displays 'Originally submitted by …' on the video detail page (only for users in Public privacy mode).",
  },
  {
    key: "attribution.creator_contributors",
    label: "Show contributors list on creator pages",
    help: "Lists Public-mode contributors on each creator page.",
  },
  {
    key: "attribution.leaderboard_facet",
    label: "Show 'suggested early by' facet on leaderboards",
    help: "Reveals early Public-mode suggesters next to leaderboard entries.",
  },
];

function SettingsPage() {
  const { data: perms } = usePermissions();
  const fetchFn = useServerFn(listAppSettings);
  const saveFn = useServerFn(setAppSetting);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => fetchFn(),
  });
  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canEdit = perms?.has("settings.edit");
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  const settings = q.data?.settings ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">App settings</h1>
        <p className="text-sm text-muted-foreground">
          Site-wide toggles, sync queue, and background cache controls.
        </p>
      </header>

      <section className="space-y-1 rounded-md border bg-card">
        <h2 className="px-4 pt-4 text-sm font-semibold">Public attribution</h2>
        {TOGGLES.map((t) => {
          const value = settings[t.key] === true;
          return (
            <div
              key={t.key}
              className="flex items-start justify-between gap-4 border-b p-4 last:border-b-0"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.help}</p>
              </div>
              <Switch
                checked={value}
                disabled={!canEdit || save.isPending}
                onCheckedChange={(on) =>
                  save.mutate({ key: t.key, value: on })
                }
              />
            </div>
          );
        })}
      </section>

      <FlushIntervalSection
        canEdit={!!canEdit}
        currentMs={
          typeof settings["action_flush_interval_ms"] === "number"
            ? (settings["action_flush_interval_ms"] as number)
            : 600_000
        }
        onSave={(ms) => save.mutate({ key: "action_flush_interval_ms", value: ms })}
        saving={save.isPending}
      />

      <SyncHealthSection canEdit={!!canEdit} />

      <MvRefreshSection canEdit={!!canEdit} />
    </div>
  );
}

function FlushIntervalSection({
  canEdit,
  currentMs,
  onSave,
  saving,
}: {
  canEdit: boolean;
  currentMs: number;
  onSave: (ms: number) => void;
  saving: boolean;
}) {
  const [minutes, setMinutes] = React.useState(Math.round(currentMs / 60_000));
  React.useEffect(() => {
    setMinutes(Math.round(currentMs / 60_000));
  }, [currentMs]);

  const dirty = minutes * 60_000 !== currentMs;

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <header>
        <h2 className="text-base font-semibold">Action queue flush interval</h2>
        <p className="text-xs text-muted-foreground">
          How often each user's browser flushes deferred actions (likes, suggestions, list updates) to the server. Lower = fresher data, more requests.
        </p>
      </header>
      <div className="flex items-center gap-4">
        <Slider
          min={1}
          max={60}
          step={1}
          value={[minutes]}
          onValueChange={(v) => setMinutes(v[0] ?? 10)}
          disabled={!canEdit}
          className="flex-1"
        />
        <span className="w-20 text-right text-sm tabular-nums">
          {minutes} min
        </span>
        <Button
          size="sm"
          disabled={!canEdit || !dirty || saving}
          onClick={() => onSave(minutes * 60_000)}
        >
          Save
        </Button>
      </div>
    </section>
  );
}

function SyncHealthSection({ canEdit }: { canEdit: boolean }) {
  const fetchFn = useServerFn(getSyncHealth);
  const q = useQuery({
    queryKey: ["sync-health"],
    queryFn: () => fetchFn(),
    refetchInterval: 30_000,
    enabled: canEdit,
  });

  if (!canEdit) return null;

  const failureRate =
    q.data && q.data.totalActions > 0
      ? Math.round((q.data.totalFailed / q.data.totalActions) * 100)
      : 0;

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Sync health (last 24h)</h2>
          <p className="text-xs text-muted-foreground">
            Aggregated from every browser's batch flush to <code>/actions/batch</code>.
          </p>
        </div>
        {failureRate >= 5 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" /> elevated failures
          </span>
        ) : null}
      </header>
      {q.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Flushes" value={q.data?.flushes ?? 0} />
          <Stat label="Actions synced" value={q.data?.totalActions ?? 0} />
          <Stat
            label="Failed"
            value={`${q.data?.totalFailed ?? 0} (${failureRate}%)`}
          />
          <Stat label="Avg latency" value={`${q.data?.avgLatencyMs ?? 0}ms`} />
        </div>
      )}
      {q.data?.lastFlush ? (
        <p className="text-xs text-muted-foreground">
          Last flush {formatDistanceToNow(new Date(q.data.lastFlush))} ago.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No flushes recorded yet.</p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const EXPECTED_CADENCE_MS: Record<string, number> = {
  mv_trending: 15 * 60_000,
  mv_suggested_feed: 15 * 60_000,
  mv_category_stats: 24 * 3600_000,
  mv_category_suggest_score: 15 * 60_000,
  mv_category_trending_score: 15 * 60_000,
  mv_creator_categories: 24 * 3600_000,
};

type MvKey =
  | "mv_trending"
  | "mv_suggested_feed"
  | "mv_category_stats"
  | "mv_category_suggest_score"
  | "mv_category_trending_score"
  | "mv_creator_categories";

function MvRefreshSection({ canEdit }: { canEdit: boolean }) {
  const fetchLog = useServerFn(listMvRefreshLog);
  const flushFn = useServerFn(forceRefreshMv);
  const qc = useQueryClient();
  const log = useQuery({
    queryKey: ["mv-refresh-log"],
    queryFn: () => fetchLog(),
    refetchInterval: 30_000,
  });
  const flush = useMutation({
    mutationFn: (view: MvKey) => flushFn({ data: { view } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Refreshed (${r.rows ?? 0} rows)`);
      else toast.error(r.error ?? "Refresh failed");
      qc.invalidateQueries({ queryKey: ["mv-refresh-log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const VIEWS: { key: MvKey; label: string }[] = [
    { key: "mv_trending", label: "Trending" },
    { key: "mv_suggested_feed", label: "Suggested feed" },
    { key: "mv_category_stats", label: "Category stats" },
    { key: "mv_category_suggest_score", label: "Category suggest score" },
    { key: "mv_category_trending_score", label: "Category trending score" },
    { key: "mv_creator_categories", label: "Creators by category" },
  ];

  const lastByView = new Map<
    string,
    { triggered_at: string; ok: boolean; duration_ms: number }
  >();
  for (const e of log.data?.entries ?? []) {
    if (!lastByView.has(e.view_name)) lastByView.set(e.view_name, e);
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <header>
        <h2 className="text-base font-semibold">Background caches</h2>
        <p className="text-xs text-muted-foreground">
          Pre-computed views for browse pages. Refreshed automatically; force a refresh below.
        </p>
      </header>
      <div className="space-y-2">
        {VIEWS.map((v) => {
          const last = lastByView.get(v.key);
          const expected = EXPECTED_CADENCE_MS[v.key] ?? 15 * 60_000;
          const stale =
            last && Date.now() - new Date(last.triggered_at).getTime() > expected * 2;
          return (
            <div
              key={v.key}
              className="flex items-center justify-between gap-3 rounded border p-3"
            >
              <div className="text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {v.label}
                  {stale ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> stale
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {last
                    ? `${last.ok ? "ok" : "failed"} · ${formatDistanceToNow(new Date(last.triggered_at))} ago · ${last.duration_ms}ms`
                    : "No refreshes yet"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || flush.isPending}
                onClick={() => flush.mutate(v.key)}
              >
                Force refresh
              </Button>
            </div>
          );
        })}
      </div>

      {log.data?.entries && log.data.entries.length > 0 ? (
        <details className="pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Recent refresh log ({log.data.entries.length})
          </summary>
          <ul className="mt-2 max-h-64 overflow-auto rounded border text-xs">
            {log.data.entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 border-b px-3 py-1.5 last:border-b-0"
              >
                <span className="font-mono">{e.view_name}</span>
                <span className="text-muted-foreground">
                  {e.ok ? "ok" : <span className="text-destructive">failed</span>} ·{" "}
                  {e.duration_ms}ms · {e.rows_affected ?? "?"} rows ·{" "}
                  {formatDistanceToNow(new Date(e.triggered_at))} ago
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
