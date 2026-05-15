import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCheck,
  BellOff,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Megaphone,
  ArrowLeft,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { listNotifications, markNotificationsRead } from "@/lib/lists.functions";
import {
  listActiveBroadcasts,
  listBroadcasts,
  markBroadcastRead,
  getBroadcastCategories,
} from "@/lib/broadcasts.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type NotifData = { notifications: Notification[]; unread: number };

const DAY = 86_400_000;
type Bucket = "today" | "yesterday" | "last3" | "past";

function bucketOf(iso: string): Bucket {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < DAY) return "today";
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 4 * DAY) return "last3";
  return "past";
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  // ISO week-ish key: year + week-of-year
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - start.getTime()) / DAY + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchList = useServerFn(listNotifications);
  const markReadFn = useServerFn(markNotificationsRead);

  const q = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: () => fetchList(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Realtime — invalidate badge + list on any change
  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  // Immediate server-side mark-all-read (NOT queued — Plan 3 Phase 5 fix).
  const markAll = useMutation({
    mutationFn: () => markReadFn({ data: {} }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotifData>(["notifications"]);
      qc.setQueryData<NotifData | undefined>(["notifications"], (p) =>
        p
          ? {
              ...p,
              unread: 0,
              notifications: p.notifications.map((n) =>
                n.read_at ? n : { ...n, read_at: new Date().toISOString() },
              ),
            }
          : p,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
      toast.error("Couldn't mark all as read");
    },
    onSuccess: () => {
      toast.success("All caught up.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: (ids: string[]) => markReadFn({ data: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotifData>(["notifications"]);
      qc.setQueryData<NotifData | undefined>(["notifications"], (p) =>
        p
          ? {
              ...p,
              unread: Math.max(0, p.unread - ids.length),
              notifications: p.notifications.map((n) =>
                ids.includes(n.id) && !n.read_at
                  ? { ...n, read_at: new Date().toISOString() }
                  : n,
              ),
            }
          : p,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const grouped = React.useMemo(() => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const last3: Notification[] = [];
    const pastByWeek = new Map<string, Notification[]>();
    for (const n of q.data?.notifications ?? []) {
      const b = bucketOf(n.created_at);
      if (b === "today") today.push(n);
      else if (b === "yesterday") yesterday.push(n);
      else if (b === "last3") last3.push(n);
      else {
        const key = weekKey(n.created_at);
        const arr = pastByWeek.get(key) ?? [];
        arr.push(n);
        pastByWeek.set(key, arr);
      }
    }
    return { today, yesterday, last3, pastByWeek };
  }, [q.data?.notifications]);

  // History panel state
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Active broadcasts (footer carousel)
  const fetchActive = useServerFn(listActiveBroadcasts);
  const activeQ = useQuery({
    queryKey: ["broadcasts-active"],
    enabled: !!user,
    queryFn: () => fetchActive(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const markBroadcast = useServerFn(markBroadcastRead);
  const markBroadcastM = useMutation({
    mutationFn: (id: string) => markBroadcast({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["broadcasts-active"] });
      const prev = qc.getQueryData<{ broadcasts: ActiveBroadcast[] }>(["broadcasts-active"]);
      qc.setQueryData<{ broadcasts: ActiveBroadcast[] } | undefined>(
        ["broadcasts-active"],
        (p) => p ? { broadcasts: p.broadcasts.map((b) => b.id === id ? { ...b, read: true } : b) } : p,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["broadcasts-active"], ctx.prev);
    },
  });

  const broadcasts = activeQ.data?.broadcasts ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        {historyOpen ? (
          <BroadcastHistoryView onBack={() => setHistoryOpen(false)} />
        ) : (
          <>
            <SheetHeader className="px-6 pt-6">
              <SheetTitle className="flex items-center justify-between gap-2">
                <span>Notifications</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending || (q.data?.unread ?? 0) === 0}
                >
                  <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
                </Button>
              </SheetTitle>
              <SheetDescription>
                {q.data?.unread ? `${q.data.unread} unread` : "You're up to date"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-hidden px-2 pb-2">
              {q.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !q.data || q.data.notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <BellOff className="h-6 w-6" />
                  No notifications yet.
                </div>
              ) : (
                <NotifList
                  today={grouped.today}
                  yesterday={grouped.yesterday}
                  last3={grouped.last3}
                  pastByWeek={grouped.pastByWeek}
                  onMarkRead={(id) => markOne.mutate([id])}
                  onClose={() => onOpenChange(false)}
                />
              )}
            </div>

            {broadcasts.length > 0 ? (
              <BroadcastFooter
                broadcasts={broadcasts}
                onMarkRead={(id) => markBroadcastM.mutate(id)}
                onOpenHistory={() => setHistoryOpen(true)}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <div className="border-t px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  View all broadcasts →
                </button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type ActiveBroadcast = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: string;
  expires_at: string | null;
  created_at: string;
  read: boolean;
};

function BroadcastFooter({
  broadcasts,
  onMarkRead,
  onOpenHistory,
  onClose,
}: {
  broadcasts: ActiveBroadcast[];
  onMarkRead: (id: string) => void;
  onOpenHistory: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = React.useState(0);
  const safeIdx = Math.min(idx, broadcasts.length - 1);
  const b = broadcasts[safeIdx];
  const multi = broadcasts.length > 1;

  // Mark as read when surfaced
  React.useEffect(() => {
    if (b && !b.read) onMarkRead(b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id]);

  if (!b) return null;

  return (
    <div className="border-t bg-muted/30 px-4 py-3">
      <div className="flex items-start gap-2">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {b.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(b.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium">{b.title}</p>
          {b.body ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{b.body}</p>
          ) : null}
          <div className="mt-1.5 flex items-center justify-between">
            {b.link ? (
              <a
                href={b.link}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            ) : <span />}
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              View all broadcasts →
            </button>
          </div>
        </div>
      </div>

      {multi ? (
        <div className="mt-2 flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setIdx((i) => (i - 1 + broadcasts.length) % broadcasts.length)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex gap-1">
            {broadcasts.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 w-4 rounded-full",
                  i === safeIdx ? "bg-foreground" : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setIdx((i) => (i + 1) % broadcasts.length)}
            aria-label="Next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BroadcastHistoryView({ onBack }: { onBack: () => void }) {
  const listFn = useServerFn(listBroadcasts);
  const catsFn = useServerFn(getBroadcastCategories);
  const [category, setCategory] = React.useState<string>("__all");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const cats = useQuery({
    queryKey: ["broadcast-cats"],
    queryFn: () => catsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const list = useQuery({
    queryKey: ["broadcasts-history", { category, debounced }],
    queryFn: () =>
      listFn({
        data: {
          status: "all",
          categories: category !== "__all" ? [category] : undefined,
          search: debounced || undefined,
          limit: 100,
        },
      }),
    staleTime: 60 * 1000,
    // History view is gated by perms server-side; surface error inline.
    retry: false,
  });

  const rows = list.data?.entries ?? [];

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="px-4 pt-6">
        <SheetTitle className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span>Broadcast history</span>
        </SheetTitle>
        <SheetDescription>All recent announcements.</SheetDescription>
      </SheetHeader>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7"
            maxLength={200}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All</SelectItem>
            {(cats.data?.categories ?? []).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {list.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Couldn't load history.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No broadcasts found.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-md border bg-card p-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] capitalize">{r.category}</Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize",
                      r.computed_status === "active" && "border-emerald-600/40",
                      r.computed_status === "expired" && "border-amber-600/40",
                      r.computed_status === "archived" && "text-muted-foreground",
                    )}
                  >
                    {r.computed_status}
                  </Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 font-medium">{r.title}</p>
                {r.body ? (
                  <p className="text-xs text-muted-foreground">{r.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Row =
  | { kind: "header"; label: string }
  | { kind: "item"; n: Notification };

function NotifList({
  today,
  yesterday,
  last3,
  pastByWeek,
  onMarkRead,
  onClose,
}: {
  today: Notification[];
  yesterday: Notification[];
  last3: Notification[];
  pastByWeek: Map<string, Notification[]>;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const [pastOpen, setPastOpen] = React.useState(false);

  const rows: Row[] = React.useMemo(() => {
    const r: Row[] = [];
    const push = (label: string, items: Notification[]) => {
      if (!items.length) return;
      r.push({ kind: "header", label });
      for (const n of items) r.push({ kind: "item", n });
    };
    push("Today", today);
    push("Yesterday", yesterday);
    push("Last 3 days", last3);
    return r;
  }, [today, yesterday, last3]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === "header" ? 28 : 78),
    overscan: 8,
  });

  const pastEntries = React.useMemo(
    () => Array.from(pastByWeek.entries()).sort(([a], [b]) => (a < b ? 1 : -1)),
    [pastByWeek],
  );

  return (
    <div className="flex h-full flex-col">
      <div ref={parentRef} className="flex-1 overflow-y-auto px-2">
        <div
          style={{ height: `${virt.getTotalSize()}px`, position: "relative", width: "100%" }}
        >
          {virt.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={vi.key}
                ref={virt.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {row.kind === "header" ? (
                  <p className="sticky top-0 z-10 bg-background/95 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {row.label}
                  </p>
                ) : (
                  <NotifItem n={row.n} onMarkRead={onMarkRead} onClose={onClose} />
                )}
              </div>
            );
          })}
        </div>

        {pastEntries.length > 0 ? (
          <Collapsible open={pastOpen} onOpenChange={setPastOpen} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Past</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    pastOpen && "rotate-180",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {pastEntries.map(([wk, items]) => (
                <div key={wk}>
                  <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {wk}
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((n) => (
                      <NotifItem
                        key={n.id}
                        n={n}
                        onMarkRead={onMarkRead}
                        onClose={onClose}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}

function NotifItem({
  n,
  onMarkRead,
  onClose,
}: {
  n: Notification;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const unread = !n.read_at;
  return (
    <div
      className={cn(
        "group rounded-md border bg-card p-3 text-sm transition",
        unread && "border-l-2 border-l-foreground/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium leading-tight">{n.title}</p>
          {n.body ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {timeLabel(n.created_at)}
            </span>
            {n.link ? (
              <a
                href={n.link}
                onClick={() => {
                  if (unread) onMarkRead(n.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {unread ? (
              <button
                type="button"
                onClick={() => onMarkRead(n.id)}
                className="text-[11px] text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
              >
                Mark read
              </button>
            ) : null}
          </div>
        </div>
        {unread ? (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-foreground" />
        ) : null}
      </div>
    </div>
  );
}
