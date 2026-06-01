import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  X,
  Plus,
  Pause,
  Play,
  Search,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import {
  listUsers,
  getUserDetail,
  listAssignableRoles,
  assignUserRole,
  removeUserRole,
  setUserSuspension,
} from "@/lib/admin-users.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Users — CurateTube" }] }),
  component: AdminUsersPage,
});

const PAGE_SIZE = 50;

type UserRow = Awaited<ReturnType<typeof listUsers>>["users"][number];

function initialsOf(name: string | null, username: string | null) {
  const s = (name || username || "??").trim();
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function AdminUsersPage() {
  const { data: perms } = usePermissions();
  const canView = perms?.isOwner || perms?.has("users.view");
  const canManage = perms?.isOwner || perms?.has("users.manage");

  const fetchUsers = useServerFn(listUsers);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [openUserId, setOpenUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ["admin-users", debouncedSearch],
    enabled: !!canView,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchUsers({
        data: { search: debouncedSearch, limit: PAGE_SIZE, offset: pageParam },
      }),
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length * PAGE_SIZE : undefined,
  });

  // Infinite scroll sentinel
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  if (perms && !canView) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-medium">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view the users administration page.
        </p>
      </div>
    );
  }

  const rows: UserRow[] = (query.data?.pages ?? []).flatMap((p) => p.users);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage roles, suspend abusive accounts, and inspect activity.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username…"
            className="pl-8"
          />
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Submissions</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6">
                  <Skeleton className="h-24 w-full" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30"
                  onClick={() => setOpenUserId(u.id)}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initialsOf(u.display_name, u.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {u.display_name ?? u.username ?? "Unknown"}
                        </div>
                        {u.username ? (
                          <div className="text-xs text-muted-foreground">
                            @{u.username}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {u.email ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge
                            key={r.id}
                            variant="secondary"
                            className="capitalize"
                          >
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{u.submission_count}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {timeAgo(u.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-2">
                    {u.suspended_at ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} className="h-8" />
        {query.isFetchingNextPage ? (
          <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more…
          </div>
        ) : null}
      </div>

      {openUserId ? (
        <UserDetailSheet
          userId={openUserId}
          canManage={!!canManage}
          onClose={() => setOpenUserId(null)}
        />
      ) : null}
    </div>
  );
}

function UserDetailSheet({
  userId,
  canManage,
  onClose,
}: {
  userId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getUserDetail);
  const fetchRoles = useServerFn(listAssignableRoles);
  const assign = useServerFn(assignUserRole);
  const remove = useServerFn(removeUserRole);
  const suspend = useServerFn(setUserSuspension);

  const detailQ = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => fetchDetail({ data: { userId } }),
  });

  const rolesQ = useQuery({
    queryKey: ["admin-users-assignable-roles"],
    enabled: canManage,
    queryFn: () => fetchRoles(),
    staleTime: 60_000,
  });

  const [pendingRoleId, setPendingRoleId] = React.useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = React.useState(false);
  const [confirmRemoveRole, setConfirmRemoveRole] = React.useState<
    { roleId: string; roleName: string } | null
  >(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const assignMut = useMutation({
    mutationFn: (roleId: string) => assign({ data: { userId, roleId } }),
    onSuccess: () => {
      toast.success("Role granted");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSettled: () => setPendingRoleId(null),
  });

  const removeMut = useMutation({
    mutationFn: (roleId: string) => remove({ data: { userId, roleId } }),
    onSuccess: () => {
      toast.success("Role revoked");
      invalidate();
      setConfirmRemoveRole(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const suspendMut = useMutation({
    mutationFn: (shouldSuspend: boolean) =>
      suspend({ data: { userId, suspend: shouldSuspend } }),
    onSuccess: (_d, vars) => {
      toast.success(vars ? "User suspended" : "User restored");
      invalidate();
      setConfirmSuspend(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const detail = detailQ.data;
  const currentRoleIds = new Set((detail?.roles ?? []).map((r) => r.id));
  const availableRoles = (rolesQ.data?.roles ?? []).filter(
    (r) => !currentRoleIds.has(r.id),
  );

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User detail</SheetTitle>
          <SheetDescription>
            Inspect roles, activity, and manage access.
          </SheetDescription>
        </SheetHeader>

        {detailQ.isLoading || !detail ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Profile */}
            <section className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={detail.profile.avatar_url ?? undefined} />
                <AvatarFallback>
                  {initialsOf(
                    detail.profile.display_name,
                    detail.profile.username,
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {detail.profile.display_name ??
                    detail.profile.username ??
                    "Unknown"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {detail.profile.email ?? "—"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {detail.profile.suspended_at ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Joined{" "}
                    {new Date(detail.profile.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-3 gap-2">
              <StatTile label="Submissions" value={detail.submission_count} />
              <StatTile label="AI jobs" value={detail.ai_job_count} />
              <StatTile
                label="Last active"
                value={timeAgo(detail.profile.last_sign_in_at)}
              />
            </section>

            {/* Roles */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Roles</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.roles.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No roles assigned.
                  </span>
                ) : (
                  detail.roles.map((r) => (
                    <Badge
                      key={r.id}
                      variant="secondary"
                      className="gap-1 capitalize"
                    >
                      {r.name}
                      {canManage ? (
                        <button
                          type="button"
                          className="ml-1 rounded-sm opacity-60 hover:opacity-100"
                          onClick={() =>
                            setConfirmRemoveRole({
                              roleId: r.id,
                              roleName: r.name,
                            })
                          }
                          aria-label={`Remove ${r.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </Badge>
                  ))
                )}
              </div>
              {canManage ? (
                <div className="mt-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add role
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-0">
                      <Command>
                        <CommandInput placeholder="Search roles…" />
                        <CommandList>
                          <CommandEmpty>No assignable roles.</CommandEmpty>
                          <CommandGroup>
                            {availableRoles.map((r) => (
                              <CommandItem
                                key={r.id}
                                onSelect={() => {
                                  setPendingRoleId(r.id);
                                  assignMut.mutate(r.id);
                                }}
                                disabled={pendingRoleId === r.id}
                                className="capitalize"
                              >
                                {r.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              ) : null}
            </section>

            {/* Audit */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
              <div className="space-y-1.5">
                {detail.audit.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No entries.</p>
                ) : (
                  detail.audit.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-baseline justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <span className="font-mono">{a.action}</span>
                      <span className="text-muted-foreground">
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Suspension */}
            {canManage ? (
              <section className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <h3 className="text-sm font-semibold text-destructive">
                  Access control
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Suspended users cannot submit videos and are hidden from the
                  moderation queue. Their approved videos remain visible.
                </p>
                <Button
                  size="sm"
                  variant={detail.profile.suspended_at ? "default" : "destructive"}
                  className="mt-3"
                  onClick={() => {
                    if (detail.profile.suspended_at) {
                      suspendMut.mutate(false);
                    } else {
                      setConfirmSuspend(true);
                    }
                  }}
                  disabled={suspendMut.isPending}
                >
                  {detail.profile.suspended_at ? (
                    <>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Unsuspend
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1.5 h-3.5 w-3.5" />
                      Suspend account
                    </>
                  )}
                </Button>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>

      <AlertDialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend this user?</AlertDialogTitle>
            <AlertDialogDescription>
              The user will be notified and blocked from submitting new
              videos. Their approved content stays public.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspendMut.mutate(true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmRemoveRole}
        onOpenChange={(v) => !v && setConfirmRemoveRole(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove role "{confirmRemoveRole?.roleName}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This revokes the role immediately. You can re-grant it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmRemoveRole && removeMut.mutate(confirmRemoveRole.roleId)
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
