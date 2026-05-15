import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Megaphone,
  Archive,
  ArchiveRestore,
  Trash2,
  Download,
  Plus,
  X,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/lib/use-permissions";
import {
  createBroadcast,
  listBroadcasts,
  archiveBroadcasts,
  restoreBroadcasts,
  deleteBroadcasts,
  updateBroadcast,
  getBroadcastCategories,
  setBroadcastCategories,
  type BroadcastRow,
} from "@/lib/broadcasts.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  head: () => ({ meta: [{ title: "Broadcasts — CurateTube" }] }),
  component: BroadcastsPage,
});

function BroadcastsPage() {
  const { data: perms } = usePermissions();
  const canBroadcast = perms?.has("notification.broadcast") || perms?.isOwner;
  const canArchive =
    canBroadcast || perms?.has("broadcasts.archive") || perms?.isOwner;

  if (!canBroadcast && !canArchive) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        You need the <code>notification.broadcast</code> permission.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center gap-2">
        <Megaphone className="h-5 w-5" />
        <div>
          <h1 className="text-xl font-semibold">Broadcasts</h1>
          <p className="text-sm text-muted-foreground">
            Send announcements and manage the broadcast archive.
          </p>
        </div>
      </header>

      <Tabs defaultValue={canBroadcast ? "compose" : "archive"}>
        <TabsList>
          {canBroadcast ? <TabsTrigger value="compose">Compose</TabsTrigger> : null}
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>
        {canBroadcast ? (
          <TabsContent value="compose" className="pt-4">
            <ComposePanel />
          </TabsContent>
        ) : null}
        <TabsContent value="archive" className="pt-4">
          <ArchivePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== COMPOSE ==============

function ComposePanel() {
  const qc = useQueryClient();
  const fn = useServerFn(createBroadcast);
  const catsFn = useServerFn(getBroadcastCategories);
  const cats = useQuery({
    queryKey: ["broadcast-cats"],
    queryFn: () => catsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [link, setLink] = React.useState("");
  const [category, setCategory] = React.useState<string>("general");
  const [expires, setExpires] = React.useState<Date | undefined>(undefined);

  React.useEffect(() => {
    if (cats.data?.categories.length && !cats.data.categories.includes(category)) {
      setCategory(cats.data.categories[0]);
    }
  }, [cats.data, category]);

  const send = useMutation({
    mutationFn: () =>
      fn({
        data: {
          title: title.trim(),
          body: body.trim() || undefined,
          link: link.trim() || undefined,
          category,
          expires_at: expires ? expires.toISOString() : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Sent to ${r.sent} users`);
      setTitle("");
      setBody("");
      setLink("");
      setExpires(undefined);
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const titleLen = title.length;

  return (
    <div className="space-y-3 rounded-md border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          placeholder="Maintenance window tonight at 22:00 UTC"
        />
        <p className="text-right text-[10px] text-muted-foreground">
          {titleLen}/140
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Body (optional)</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={4}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="link">Link (optional)</Label>
          <Input
            id="link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/changelog"
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(cats.data?.categories ?? ["general"]).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Expires at (optional)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              {expires ? expires.toLocaleString() : "No expiration"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={expires}
              onSelect={setExpires}
              disabled={(d) => d < new Date(new Date().toDateString())}
            />
            {expires ? (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpires(undefined)}>
                  Clear
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          disabled={!title.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? "Sending…" : "Send to everyone"}
        </Button>
      </div>
    </div>
  );
}

// ============== ARCHIVE ==============

const PAGE_SIZE = 25;

type StatusFilter = "all" | "active" | "archived" | "expired";

function ArchivePanel() {
  const qc = useQueryClient();
  const { data: perms } = usePermissions();
  const canDelete = perms?.has("broadcasts.delete") || perms?.isOwner;
  const canEditCats = perms?.has("settings.edit") || perms?.isOwner;

  const listFn = useServerFn(listBroadcasts);
  const archiveFn = useServerFn(archiveBroadcasts);
  const restoreFn = useServerFn(restoreBroadcasts);
  const deleteFn = useServerFn(deleteBroadcasts);
  const updateFn = useServerFn(updateBroadcast);
  const catsFn = useServerFn(getBroadcastCategories);
  const setCatsFn = useServerFn(setBroadcastCategories);

  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [category, setCategory] = React.useState<string>("__all");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState<Date | undefined>();
  const [dateTo, setDateTo] = React.useState<Date | undefined>();
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [status, category, debounced, dateFrom, dateTo]);

  const cats = useQuery({
    queryKey: ["broadcast-cats"],
    queryFn: () => catsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const queryKey = [
    "broadcasts",
    { status, category, debounced, dateFrom: dateFrom?.toISOString() ?? null, dateTo: dateTo?.toISOString() ?? null, page },
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: () =>
      listFn({
        data: {
          status,
          categories: category !== "__all" ? [category] : undefined,
          search: debounced || undefined,
          dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
          dateTo: dateTo ? new Date(dateTo.getTime() + 86_400_000 - 1).toISOString() : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    staleTime: 30 * 1000,
  });

  const rows = list.data?.entries ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = (v: boolean) => {
    const next = new Set(selected);
    rows.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
    setSelected(next);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["broadcasts"] });
  const selectedIds = Array.from(selected);

  const archive = useMutation({
    mutationFn: (ids: string[]) => archiveFn({ data: { ids } }),
    onSuccess: (_r, ids) => {
      toast.success(`Archived ${ids.length}`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: (ids: string[]) => restoreFn({ data: { ids } }),
    onSuccess: (_r, ids) => {
      toast.success(`Restored ${ids.length}`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (ids: string[]) => deleteFn({ data: { ids } }),
    onSuccess: (_r, ids) => {
      toast.success(`Deleted ${ids.length}`);
      setSelected(new Set());
      setConfirmDelete(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRow = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) =>
      updateFn({ data: { id: v.id, patch: v.patch as never } }),
    onSuccess: () => {
      toast.success("Updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const headers = [
      "id", "title", "category", "status", "created_at", "expires_at",
      "archived_at", "recipient_count", "read_count",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const data = (selectedIds.length ? rows.filter((r) => selected.has(r.id)) : rows);
    const csv = [
      headers.join(","),
      ...data.map((r) =>
        [r.id, r.title, r.category, r.computed_status, r.created_at, r.expires_at, r.archived_at, r.recipient_count, r.read_count]
          .map(escape).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `broadcasts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title/body…"
            className="pl-7"
            maxLength={200}
          />
        </div>
        <div className="w-32">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {(cats.data?.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-normal">
              {dateFrom || dateTo
                ? `${dateFrom?.toLocaleDateString() ?? "…"} → ${dateTo?.toLocaleDateString() ?? "…"}`
                : "Date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateFrom, to: dateTo }}
              onSelect={(r) => {
                setDateFrom(r?.from);
                setDateTo(r?.to);
              }}
            />
            {(dateFrom || dateTo) ? (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                  Clear
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {canEditCats ? (
            <CategoriesEditor
              categories={cats.data?.categories ?? []}
              onSave={async (next) => {
                await setCatsFn({ data: { categories: next } });
                toast.success("Categories updated");
                qc.invalidateQueries({ queryKey: ["broadcast-cats"] });
              }}
            />
          ) : null}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Batch bar */}
      {selectedIds.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => archive.mutate(selectedIds)}
              disabled={archive.isPending}
            >
              <Archive className="mr-1 h-3.5 w-3.5" /> Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restore.mutate(selectedIds)}
              disabled={restore.isPending}
            >
              <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Restore
            </Button>
            {canDelete ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(selectedIds)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-24">Category</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32">Sent</TableHead>
              <TableHead className="w-32">Expires</TableHead>
              <TableHead className="w-24">Reads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No broadcasts match.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <BroadcastTableRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onToggle={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(r.id); else next.delete(r.id);
                    setSelected(next);
                  }}
                  categories={cats.data?.categories ?? []}
                  onPatch={(patch) => updateRow.mutate({ id: r.id, patch })}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} total</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
          <span>Page {page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.length} broadcast{confirmDelete?.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the broadcast records. User notifications already sent are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && del.mutate(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BroadcastTableRow({
  row,
  selected,
  onToggle,
  categories,
  onPatch,
}: {
  row: BroadcastRow;
  selected: boolean;
  onToggle: (v: boolean) => void;
  categories: string[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(row.title);
  React.useEffect(() => setTitle(row.title), [row.title]);

  const commitTitle = () => {
    const t = title.trim();
    setEditing(false);
    if (t && t !== row.title) onPatch({ title: t });
    else setTitle(row.title);
  };

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(Boolean(v))} />
      </TableCell>
      <TableCell className="max-w-md">
        {editing ? (
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") { setTitle(row.title); setEditing(false); }
            }}
            className="h-7"
            maxLength={140}
          />
        ) : (
          <button
            type="button"
            className="line-clamp-1 text-left text-sm hover:underline"
            onClick={() => setEditing(true)}
            title="Click to edit title"
          >
            {row.title}
          </button>
        )}
        {row.body ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.body}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <Select value={row.category} onValueChange={(v) => onPatch({ category: v })}>
          <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(categories.length ? categories : [row.category]).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "capitalize",
            row.computed_status === "active" && "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
            row.computed_status === "expired" && "border-amber-600/40 text-amber-700 dark:text-amber-400",
            row.computed_status === "archived" && "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {row.computed_status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(row.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-xs">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">
              {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={row.expires_at ? new Date(row.expires_at) : undefined}
              onSelect={(d) => onPatch({ expires_at: d ? d.toISOString() : null })}
            />
            {row.expires_at ? (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => onPatch({ expires_at: null })}>
                  Clear
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {row.read_count} / {row.recipient_count}
      </TableCell>
    </TableRow>
  );
}

function CategoriesEditor({
  categories,
  onSave,
}: {
  categories: string[];
  onSave: (next: string[]) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<string[]>(categories);
  const [input, setInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setList(categories);
  }, [open, categories]);

  const add = () => {
    const v = input.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(v)) return;
    if (list.includes(v)) return;
    setList([...list, v]);
    setInput("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">Categories</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </p>
        <div className="flex flex-wrap gap-1">
          {list.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1">
              {c}
              <button
                type="button"
                onClick={() => setList(list.filter((x) => x !== c))}
                className="ml-0.5 rounded hover:bg-muted-foreground/20"
                aria-label={`Remove ${c}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="new-slug"
            maxLength={64}
            className="h-8"
          />
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={saving || list.length === 0}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(list);
              setOpen(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
