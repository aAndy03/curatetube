import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAppSettings,
  setAppSetting,
  listMvRefreshLog,
  forceRefreshMv,
} from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";
import { formatDistanceToNow } from "date-fns";

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
    mutationFn: (input: { key: string; value: boolean }) =>
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
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold">App settings</h1>
        <p className="text-sm text-muted-foreground">
          Site-wide toggles for public attribution and other surfaces.
        </p>
      </header>

      <section className="space-y-1 rounded-md border bg-card">
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

      <MvRefreshSection canEdit={!!canEdit} />
    </div>
  );
}

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
    mutationFn: (view: "mv_trending" | "mv_suggested_feed" | "mv_category_stats") =>
      flushFn({ data: { view } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Refreshed (${r.rows ?? 0} rows)`);
      else toast.error(r.error ?? "Refresh failed");
      qc.invalidateQueries({ queryKey: ["mv-refresh-log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const VIEWS = [
    { key: "mv_trending" as const, label: "Trending" },
    { key: "mv_suggested_feed" as const, label: "Suggested feed" },
    { key: "mv_category_stats" as const, label: "Category stats" },
  ];

  const lastByView = new Map<string, { triggered_at: string; ok: boolean; duration_ms: number }>();
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
          return (
            <div key={v.key} className="flex items-center justify-between gap-3 rounded border p-3">
              <div className="text-sm">
                <p className="font-medium">{v.label}</p>
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
    </section>
  );
}
