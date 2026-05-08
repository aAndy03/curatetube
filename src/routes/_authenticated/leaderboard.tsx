import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Trophy,
  Users,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  getCurrentLeaderboard,
  listTiers,
  rebuildSnapshotNow,
} from "@/lib/leaderboard.functions";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/lib/use-permissions";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Search = z.object({
  tier: z.string().optional(),
  scope: z.enum(["global", "language", "creator", "category"]).optional(),
  scopeValue: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/leaderboard")({
  validateSearch: Search,
  component: LeaderboardPage,
});

function rankDelta(rank: number, prev: number | null) {
  if (prev == null) return { kind: "new" as const };
  const diff = prev - rank;
  if (diff === 0) return { kind: "same" as const };
  return diff > 0
    ? { kind: "up" as const, n: diff }
    : { kind: "down" as const, n: -diff };
}

function LeaderboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tier = search.tier ?? "top10";
  const scopeType = (search.scope ?? "global") as
    | "global"
    | "language"
    | "creator"
    | "category";
  const scopeValue = search.scopeValue ?? null;

  const tiersQ = useQuery({
    queryKey: ["lb-tiers"],
    queryFn: () => listTiers(),
  });
  const lbQ = useQuery({
    queryKey: ["lb-current", tier, scopeType, scopeValue],
    queryFn: () =>
      getCurrentLeaderboard({
        data: { tierSlug: tier, scopeType, scopeValue },
      }),
    refetchInterval: 60_000,
  });

  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = lbQ.data?.snapshot?.next_refresh_at
    ? new Date(lbQ.data.snapshot.next_refresh_at).getTime()
    : null;
  const remainingMs = next ? Math.max(0, next - now) : null;
  const countdown = remainingMs == null ? "" : formatCountdown(remainingMs);

  const setTier = (t: string) =>
    navigate({ search: (s: z.infer<typeof Search>) => ({ ...s, tier: t }) });
  const setScope = (s: string) =>
    navigate({
      search: (q: z.infer<typeof Search>) => ({
        ...q,
        scope: s as typeof scopeType,
        scopeValue: undefined,
      }),
    });
  const setScopeValue = (v: string) =>
    navigate({ search: (q: z.infer<typeof Search>) => ({ ...q, scopeValue: v || undefined }) });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Trophy className="size-6" />
          Leaderboard
        </div>
        <p className="text-sm text-muted-foreground">
          Community-curated rankings, snapshotted on a schedule. Snapshots are immutable.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tier</label>
          <Select value={tier} onValueChange={setTier}>
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
          <Select value={scopeType} onValueChange={setScope}>
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
            <label className="text-xs text-muted-foreground">
              {scopeType === "language"
                ? "Language code (e.g. en)"
                : scopeType === "category"
                ? "Category slug"
                : "Creator id (uuid)"}
            </label>
            <Input
              defaultValue={scopeValue ?? ""}
              onBlur={(e) => setScopeValue(e.currentTarget.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") setScopeValue(e.currentTarget.value.trim());
              }}
              className="w-[240px]"
              placeholder="filter value…"
            />
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          {lbQ.data?.snapshot ? (
            <>
              <span>
                Snapshot{" "}
                {new Date(lbQ.data.snapshot.created_at).toLocaleString()}
              </span>
              {countdown ? (
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-mono text-xs">
                  <RefreshCw className="size-3" />
                  next in {countdown}
                </span>
              ) : null}
            </>
          ) : (
            <span>No snapshot yet for this scope.</span>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/leaderboard/archive" search={{ tier, scope: scopeType, scopeValue: scopeValue ?? undefined }}>
              Archive
            </Link>
          </Button>
        </div>
      </div>

      {lbQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !lbQ.data?.snapshot ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No snapshot available yet for this tier and scope.
        </div>
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {lbQ.data.entries.map((e) => {
            const delta = rankDelta(e.rank, e.prev_rank);
            return (
              <li
                key={e.rank}
                className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40"
              >
                <div className="w-10 text-right font-mono text-lg font-semibold tabular-nums">
                  {e.rank}
                </div>
                <RankDelta delta={delta} />
                {e.video?.thumbnail_url ? (
                  <img
                    src={e.video.thumbnail_url}
                    alt=""
                    className="aspect-video w-28 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-video w-28 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  {e.video ? (
                    <Link
                      to="/v/$id"
                      params={{ id: e.video.id }}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {e.video.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">[removed]</span>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {e.video?.creator ? (
                      <Link
                        to="/creators/$id"
                        params={{ id: e.video.creator.id }}
                        className="hover:underline"
                      >
                        {e.video.creator.title}
                      </Link>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="size-3" />
                          {e.suggest_count}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Suggested by {e.suggest_count} users</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          {e.submission_count}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Submitted by {e.submission_count} users</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono tabular-nums">
                  {e.score.toFixed(1)}
                </Badge>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RankDelta({
  delta,
}: {
  delta: { kind: "up" | "down" | "same" | "new"; n?: number };
}) {
  if (delta.kind === "new")
    return (
      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
        NEW
      </Badge>
    );
  if (delta.kind === "same")
    return <Minus className="size-4 text-muted-foreground" />;
  if (delta.kind === "up")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-500">
        <ArrowUp className="size-3" />
        {delta.n}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-rose-500">
      <ArrowDown className="size-3" />
      {delta.n}
    </span>
  );
}

function formatCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
