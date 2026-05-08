import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAppSettings, setAppSetting } from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";

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
    </div>
  );
}
