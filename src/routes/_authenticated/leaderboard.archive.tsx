import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import { listArchive, getSnapshotEntries, listTiers } from "@/lib/leaderboard.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const Search = z.object({
  tier: z.string().optional(),
  scope: z.enum(["global", "language", "creator", "category"]).optional(),
  scopeValue: z.string().optional(),
  date: z.string().optional(),
  snapshot: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/leaderboard/archive")({
  validateSearch: Search,
  component: ArchivePage,
});

function ArchivePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tier = search.tier ?? "top10";
  const scopeType = (search.scope ?? "global") as
    | "global"
    | "language"
    | "creator"
    | "category";
  const scopeValue = search.scopeValue ?? null;
  const date = search.date ? new Date(search.date) : undefined;

  const tiersQ = useQuery({ queryKey: ["lb-tiers"], queryFn: () => listTiers() });

  const range = React.useMemo(() => {
    if (!date) return { from: undefined, to: undefined };
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [date]);

  const archiveQ = useQuery({
    queryKey: ["lb-archive", tier, scopeType, scopeValue, range.from, range.to],
    queryFn: () =>
      listArchive({
        data: {
          tierSlug: tier,
          scopeType,
          scopeValue,
          from: range.from,
          to: range.to,
          limit: 30,
        },
      }),
  });

  const selectedSnap = search.snapshot ?? archiveQ.data?.snapshots[0]?.id;
  const entriesQ = useQuery({
    queryKey: ["lb-snapshot", selectedSnap],
    queryFn: () =>
      selectedSnap
        ? getSnapshotEntries({ data: { snapshotId: selectedSnap } })
        : Promise.resolve({ entries: [] }),
    enabled: !!selectedSnap,
  });

  const update = (patch: Partial<z.infer<typeof Search>>) =>
    navigate({ search: (s: z.infer<typeof Search>) => ({ ...s, ...patch }) });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost">
          <Link to="/leaderboard">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard archive</h1>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tier</label>
          <Select value={tier} onValueChange={(v) => update({ tier: v, snapshot: undefined })}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(tiersQ.data?.tiers ?? []).map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Scope</label>
          <Select
            value={scopeType}
            onValueChange={(v) =>
              update({ scope: v as typeof scopeType, scopeValue: undefined, snapshot: undefined })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global</SelectItem>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="language">Language</SelectItem>
              <SelectItem value="creator">Creator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scopeType !== "global" ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Filter value</label>
            <Input
              defaultValue={scopeValue ?? ""}
              onBlur={(e) => update({ scopeValue: e.currentTarget.value.trim() || undefined, snapshot: undefined })}
              className="w-[220px]"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start font-normal">
                <CalendarIcon className="mr-2 size-4" />
                {date ? date.toLocaleDateString() : "Any date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) =>
                  update({ date: d ? d.toISOString() : undefined, snapshot: undefined })
                }
              />
              {date ? (
                <div className="p-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update({ date: undefined, snapshot: undefined })}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="space-y-1 rounded-lg border bg-card p-2">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Snapshots ({archiveQ.data?.snapshots.length ?? 0})
          </p>
          {archiveQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="space-y-1">
              {(archiveQ.data?.snapshots ?? []).map((s) => {
                const active = s.id === selectedSnap;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => update({ snapshot: s.id })}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                        active ? "bg-accent font-medium" : ""
                      }`}
                    >
                      {new Date(s.created_at).toLocaleString()}
                    </button>
                  </li>
                );
              })}
              {(archiveQ.data?.snapshots.length ?? 0) === 0 ? (
                <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No snapshots in this range.
                </li>
              ) : null}
            </ul>
          )}
        </aside>

        <div className="rounded-lg border bg-card">
          {!selectedSnap ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Select a snapshot to view entries.
            </div>
          ) : entriesQ.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <ol className="divide-y">
              {(entriesQ.data?.entries ?? []).map((e) => (
                <li key={e.rank} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 text-right font-mono text-sm tabular-nums">
                    {e.rank}
                  </div>
                  {e.video?.thumbnail_url ? (
                    <img
                      src={e.video.thumbnail_url}
                      alt=""
                      className="aspect-video w-20 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="aspect-video w-20 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    {e.video ? (
                      <Link
                        to="/v/$id"
                        params={{ id: e.video.id }}
                        className="line-clamp-1 text-sm hover:underline"
                      >
                        {e.video.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">[removed]</span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {e.video?.creator?.title}
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {e.score.toFixed(1)}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
