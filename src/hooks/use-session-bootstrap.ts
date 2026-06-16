// Phase 6 Step 1 — Client cache for the consolidated session payload.
// All authenticated surfaces should read profile / roles / permissions /
// unread count / recommendation weights / public app-settings from here
// instead of issuing their own queries. Cached for the session (5 min stale,
// 30 min gc); invalidate the `["session-bootstrap", userId]` key after any
// mutation that changes one of those slices (role grant, weight save,
// notification read, etc.).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSessionBootstrap,
  type SessionBootstrap,
} from "@/lib/session-bootstrap.functions";
import { useAuth } from "@/lib/auth-context";

export const SESSION_BOOTSTRAP_KEY = ["session-bootstrap"] as const;

export function useSessionBootstrap() {
  const { user } = useAuth();
  const fetchBootstrap = useServerFn(getSessionBootstrap);
  const q = useQuery({
    queryKey: [...SESSION_BOOTSTRAP_KEY, user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: () => fetchBootstrap(),
  });

  const permissionSet = React.useMemo(
    () => new Set(q.data?.permissions ?? []),
    [q.data?.permissions],
  );

  return {
    ...q,
    data: q.data as SessionBootstrap | undefined,
    has: (key: string) => permissionSet.has(key),
    isOwner: !!q.data?.isOwner,
  };
}
