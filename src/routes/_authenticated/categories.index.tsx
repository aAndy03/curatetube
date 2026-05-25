import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  ArrowUp,
  ArrowDown,
  MoveRight,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { listCategoriesWithStats } from "@/lib/library.functions";
import {
  getCategoryTree,
  createCategory,
  renameCategory,
  reorderCategories,
  reparentCategory,
  deleteCategory,
  type CategoryNode,
} from "@/lib/categories.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/categories/")({
  head: () => ({
    meta: [
      { title: "Categories — CurateTube" },
      { name: "description", content: "Browse the curated library by category." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const perms = usePermissions();
  const canManage = perms.data?.has("taxonomy.manage") ?? false;
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ct.categories.editBanner") === "1";
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderTree className="h-5 w-5" /> Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Tap a category to see all approved videos inside it (and its sub-categories).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48"
          />
          {canManage && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" />
              Edit mode
              <Switch checked={editMode} onCheckedChange={setEditMode} />
            </label>
          )}
        </div>
      </header>

      {editMode && canManage && !bannerDismissed && (
        <Alert>
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>
              You're editing the category tree. Changes save immediately. Depth is
              capped at 6 levels. Re-parenting under a descendant is blocked.
            </span>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("ct.categories.editBanner", "1");
                setBannerDismissed(true);
              }}
              className="rounded p-1 hover:bg-muted"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </AlertDescription>
        </Alert>
      )}

      {editMode && canManage ? (
        <EditorTree search={search} />
      ) : (
        <BrowseGrid search={search} />
      )}
    </div>
  );
}

// ============ Browse mode ============
function BrowseGrid({ search }: { search: string }) {
  const fn = useServerFn(listCategoriesWithStats);
  const { data, isLoading } = useQuery({
    queryKey: ["categories-browse"],
    queryFn: () => fn(),
    staleTime: 30 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const items = data?.categories ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, search]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <FolderTree className="mx-auto h-6 w-6 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-medium">
          {search ? "No matches" : "No categories yet"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {search
            ? "Try a different search term."
            : "Once moderators tag videos with categories, they'll show up here."}
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((c) => (
        <Link
          key={c.id}
          to="/categories/$slug"
          params={{ slug: c.slug }}
          className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-foreground/30"
        >
          <div className="grid h-28 grid-cols-2 gap-px bg-border">
            {c.thumbnails.length === 0 ? (
              <div className="col-span-2 flex items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                No videos yet
              </div>
            ) : (
              Array.from({ length: 4 }).map((_, i) => {
                const t = c.thumbnails[i];
                return (
                  <div key={i} className="bg-muted/40">
                    {t ? (
                      <img
                        src={t}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">
              {c.video_count} {c.video_count === 1 ? "video" : "videos"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============ Editor mode ============
type TreeRow = CategoryNode & { children: TreeRow[] };

function buildTree(nodes: CategoryNode[]): TreeRow[] {
  const byParent = new Map<string | null, CategoryNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parent_id) ?? [];
    arr.push(n);
    byParent.set(n.parent_id, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  const build = (parentId: string | null): TreeRow[] =>
    (byParent.get(parentId) ?? []).map((n) => ({ ...n, children: build(n.id) }));
  return build(null);
}

function EditorTree({ search }: { search: string }) {
  const qc = useQueryClient();
  const getTree = useServerFn(getCategoryTree);
  const { data, isLoading } = useQuery({
    queryKey: ["categories-tree"],
    queryFn: () => getTree(),
    staleTime: Infinity,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addUnder, setAddUnder] = useState<{ parent: CategoryNode | null } | null>(null);
  const [renaming, setRenaming] = useState<CategoryNode | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);

  const tree = useMemo(() => buildTree(data?.categories ?? []), [data]);
  const flatVisible = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return (data?.categories ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [data, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories-tree"] });
    qc.invalidateQueries({ queryKey: ["categories-browse"] });
  };

  const createFn = useServerFn(createCategory);
  const renameFn = useServerFn(renameCategory);
  const reorderFn = useServerFn(reorderCategories);
  const reparentFn = useServerFn(reparentCategory);
  const deleteFn = useServerFn(deleteCategory);

  const createMut = useMutation({
    mutationFn: (input: { name: string; parent_id: string | null }) =>
      createFn({ data: { ...input, sort_order: 9999 } }),
    onSuccess: () => {
      toast.success("Category created");
      invalidate();
      setAddUnder(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: (input: { id: string; name: string }) => renameFn({ data: input }),
    onSuccess: () => {
      toast.success("Renamed");
      invalidate();
      setRenaming(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (input: { parent_id: string | null; ordered_ids: string[] }) =>
      reorderFn({ data: input }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const reparentMut = useMutation({
    mutationFn: (input: { id: string; new_parent_id: string | null }) =>
      reparentFn({ data: input }),
    onSuccess: () => {
      toast.success("Moved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (input: {
      id: string;
      reparent_to?: string | null;
      uncategorize_videos?: boolean;
    }) => deleteFn({ data: input }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (node: CategoryNode, dir: -1 | 1) => {
    const siblings = (data?.categories ?? [])
      .filter((c) => c.parent_id === node.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const idx = siblings.findIndex((s) => s.id === node.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    const next = siblings.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    reorderMut.mutate({
      parent_id: node.parent_id,
      ordered_ids: next.map((s) => s.id),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const allCategories = data?.categories ?? [];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <p className="text-sm font-medium">Tree editor</p>
        <Button size="sm" variant="outline" onClick={() => setAddUnder({ parent: null })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add root category
        </Button>
      </div>

      <div className="divide-y">
        {flatVisible ? (
          flatVisible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            flatVisible.map((n) => (
              <Row
                key={n.id}
                node={n}
                depth={n.depth}
                expanded={false}
                hasChildren={false}
                onToggle={() => {}}
                onAddChild={() => setAddUnder({ parent: n })}
                onRename={() => setRenaming(n)}
                onDelete={() => setDeleting(n)}
                onMove={() => {}}
                onReparent={(newParentId) =>
                  reparentMut.mutate({ id: n.id, new_parent_id: newParentId })
                }
                allCategories={allCategories}
                disableReorder
              />
            ))
          )
        ) : tree.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No categories yet. Add one to get started.
          </p>
        ) : (
          <TreeRows
            rows={tree}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
            onAddChild={(node) => setAddUnder({ parent: node })}
            onRename={(node) => setRenaming(node)}
            onDelete={(node) => setDeleting(node)}
            onMove={move}
            onReparent={(node, newParentId) =>
              reparentMut.mutate({ id: node.id, new_parent_id: newParentId })
            }
            allCategories={allCategories}
          />
        )}
      </div>

      {addUnder && (
        <NameDialog
          title={addUnder.parent ? `Add under "${addUnder.parent.name}"` : "Add root category"}
          confirmLabel="Create"
          onCancel={() => setAddUnder(null)}
          onConfirm={(name) =>
            createMut.mutate({ name, parent_id: addUnder.parent?.id ?? null })
          }
          loading={createMut.isPending}
        />
      )}
      {renaming && (
        <NameDialog
          title={`Rename "${renaming.name}"`}
          initial={renaming.name}
          confirmLabel="Save"
          onCancel={() => setRenaming(null)}
          onConfirm={(name) => renameMut.mutate({ id: renaming.id, name })}
          loading={renameMut.isPending}
        />
      )}
      {deleting && (
        <DeleteDialog
          node={deleting}
          allCategories={allCategories}
          onCancel={() => setDeleting(null)}
          onConfirm={(opts) => deleteMut.mutate({ id: deleting.id, ...opts })}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  );
}

function TreeRows(props: {
  rows: TreeRow[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (n: CategoryNode) => void;
  onRename: (n: CategoryNode) => void;
  onDelete: (n: CategoryNode) => void;
  onMove: (n: CategoryNode, dir: -1 | 1) => void;
  onReparent: (n: CategoryNode, newParentId: string | null) => void;
  allCategories: CategoryNode[];
}) {
  return (
    <>
      {props.rows.map((r) => (
        <RowGroup key={r.id} row={r} {...props} />
      ))}
    </>
  );
}

function RowGroup(props: {
  row: TreeRow;
  rows: TreeRow[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (n: CategoryNode) => void;
  onRename: (n: CategoryNode) => void;
  onDelete: (n: CategoryNode) => void;
  onMove: (n: CategoryNode, dir: -1 | 1) => void;
  onReparent: (n: CategoryNode, newParentId: string | null) => void;
  allCategories: CategoryNode[];
}) {
  const { row, expanded } = props;
  const isOpen = expanded.has(row.id);
  return (
    <>
      <Row
        node={row}
        depth={row.depth}
        expanded={isOpen}
        hasChildren={row.children.length > 0}
        onToggle={() => props.onToggle(row.id)}
        onAddChild={() => props.onAddChild(row)}
        onRename={() => props.onRename(row)}
        onDelete={() => props.onDelete(row)}
        onMove={(dir) => props.onMove(row, dir)}
        onReparent={(p) => props.onReparent(row, p)}
        allCategories={props.allCategories}
      />
      {isOpen &&
        row.children.map((child) => (
          <RowGroup key={child.id} {...props} row={child} />
        ))}
    </>
  );
}

function Row(props: {
  node: CategoryNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onAddChild: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onReparent: (newParentId: string | null) => void;
  allCategories: CategoryNode[];
  disableReorder?: boolean;
}) {
  const { node, depth, expanded, hasChildren } = props;
  const atMaxDepth = node.depth >= 6;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
      style={{ paddingLeft: 12 + depth * 18 }}
    >
      <button
        type="button"
        onClick={props.onToggle}
        className="flex h-5 w-5 items-center justify-center text-muted-foreground"
        disabled={!hasChildren}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )
        ) : null}
      </button>
      <Link
        to="/categories/$slug"
        params={{ slug: node.slug }}
        className="flex-1 truncate text-sm hover:underline"
      >
        {node.name}
      </Link>
      <span className="text-xs text-muted-foreground">
        {node.video_count} · d{node.depth}
      </span>
      <div className="flex items-center gap-0.5">
        {!props.disableReorder && (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => props.onMove(-1)} aria-label="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => props.onMove(1)} aria-label="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <ReparentPopover
          node={node}
          allCategories={props.allCategories}
          onPick={props.onReparent}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={props.onAddChild}
          disabled={atMaxDepth}
          aria-label="Add child"
          title={atMaxDepth ? "Max depth reached" : "Add child"}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={props.onRename} aria-label="Rename">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={props.onDelete}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ReparentPopover({
  node,
  allCategories,
  onPick,
}: {
  node: CategoryNode;
  allCategories: CategoryNode[];
  onPick: (newParentId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // Disallow self + descendants
  const descendants = useMemo(() => {
    const out = new Set<string>([node.id]);
    let added = true;
    while (added) {
      added = false;
      for (const c of allCategories) {
        if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) {
          out.add(c.id);
          added = true;
        }
      }
    }
    return out;
  }, [allCategories, node.id]);

  const options = useMemo(() => {
    return allCategories
      .filter((c) => !descendants.has(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [allCategories, descendants, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move to parent" title="Move under…">
          <MoveRight className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Move under…</p>
        <Input
          autoFocus
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2 h-8"
        />
        <div className="max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            (root)
          </button>
          {options.map((o) => (
            <button
              type="button"
              key={o.id}
              onClick={() => {
                onPick(o.id);
                setOpen(false);
              }}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              style={{ paddingLeft: 8 + o.depth * 10 }}
              title={`depth ${o.depth}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NameDialog({
  title,
  initial,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string;
  initial?: string;
  confirmLabel: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial ?? "");
  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(name.trim())} disabled={loading || !name.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  node,
  allCategories,
  loading,
  onCancel,
  onConfirm,
}: {
  node: CategoryNode;
  allCategories: CategoryNode[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: (opts: { reparent_to?: string | null; uncategorize_videos?: boolean }) => void;
}) {
  const hasChildren = allCategories.some((c) => c.parent_id === node.id);
  const [strategy, setStrategy] = useState<"uncategorize" | "reparent">("uncategorize");
  const [reparentTo, setReparentTo] = useState<string>("");

  const candidates = allCategories
    .filter((c) => c.id !== node.id && c.parent_id !== node.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{node.name}"?</DialogTitle>
          <DialogDescription>
            {hasChildren
              ? "This category has children. Re-parent or delete them first."
              : node.video_count > 0
                ? `${node.video_count} video(s) are linked. Choose what happens to them.`
                : "This category has no videos."}
          </DialogDescription>
        </DialogHeader>

        {!hasChildren && node.video_count > 0 && (
          <div className="space-y-3">
            <Select value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uncategorize">Uncategorize the videos</SelectItem>
                <SelectItem value="reparent">Move them to another category</SelectItem>
              </SelectContent>
            </Select>
            {strategy === "reparent" && (
              <Select value={reparentTo} onValueChange={setReparentTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose category…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              loading ||
              hasChildren ||
              (node.video_count > 0 && strategy === "reparent" && !reparentTo)
            }
            onClick={() => {
              if (node.video_count === 0) onConfirm({});
              else if (strategy === "uncategorize")
                onConfirm({ uncategorize_videos: true });
              else onConfirm({ reparent_to: reparentTo });
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
