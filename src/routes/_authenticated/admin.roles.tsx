import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { usePermissions } from "@/lib/use-permissions";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Roles & Permissions — CurateTube" }] }),
  component: RolesAdmin,
});

type Role = { id: string; name: string; description: string | null; is_system: boolean };
type Perm = { key: string; area: string; description: string | null };

function RolesAdmin() {
  const { data: perms } = usePermissions();
  const qc = useQueryClient();

  const canManage =
    perms?.isOwner || perms?.has("role.set_permissions");

  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description, is_system")
        .order("name");
      if (error) throw error;
      return data as Role[];
    },
  });

  const permsQ = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("key, area, description")
        .order("area")
        .order("key");
      if (error) throw error;
      return data as Perm[];
    },
  });

  const matrixQ = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_id, permission_key");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const r of data ?? []) {
        if (!map.has(r.role_id)) map.set(r.role_id, new Set());
        map.get(r.role_id)!.add(r.permission_key);
      }
      return map;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({
      roleId,
      key,
      grant,
    }: {
      roleId: string;
      key: string;
      grant: boolean;
    }) => {
      if (grant) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: roleId, permission_key: key });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId)
          .eq("permission_key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (perms && !canManage) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-medium">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to edit role permissions.
        </p>
      </div>
    );
  }

  if (rolesQ.isLoading || permsQ.isLoading || matrixQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const roles = rolesQ.data ?? [];
  const permissions = permsQ.data ?? [];
  const matrix = matrixQ.data ?? new Map<string, Set<string>>();

  const grouped = permissions.reduce<Record<string, Perm[]>>((acc, p) => {
    (acc[p.area] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Roles &amp; Permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Owner inherits every permission. Toggle any cell to grant or revoke.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left">
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r.id}
                  className="px-3 py-2 text-center font-medium capitalize"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {r.name}
                    {r.is_system ? (
                      <Badge variant="secondary" className="text-[10px]">
                        system
                      </Badge>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([area, list]) => (
              <React.Fragment key={area}>
                <tr className="bg-muted/40">
                  <td
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    colSpan={1 + roles.length}
                  >
                    {area}
                  </td>
                </tr>
                {list.map((p) => (
                  <tr key={p.key} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <HoverCard openDelay={150}>
                        <HoverCardTrigger asChild>
                          <span className="cursor-default font-mono text-xs">
                            {p.key}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80 text-sm">
                          <div className="font-mono text-xs text-muted-foreground">
                            {p.key}
                          </div>
                          <p className="mt-1">
                            {p.description ?? "No description."}
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    </td>
                    {roles.map((r) => {
                      const isOwner = r.name === "owner";
                      const checked =
                        isOwner || matrix.get(r.id)?.has(p.key) || false;
                      return (
                        <td key={r.id} className="px-3 py-2 text-center">
                          <Checkbox
                            checked={checked}
                            disabled={isOwner || toggle.isPending}
                            onCheckedChange={(v) =>
                              toggle.mutate({
                                roleId: r.id,
                                key: p.key,
                                grant: !!v,
                              })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
