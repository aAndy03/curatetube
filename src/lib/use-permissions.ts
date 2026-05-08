import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

/**
 * Loads the current user's effective permission keys (Owner inherits all).
 * Returns an empty set when signed-out.
 */
export function usePermissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["permissions", user?.id ?? null],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [rolesRes, permsRes] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role:roles(name, role_permissions(permission_key))")
          .eq("user_id", user!.id),
        supabase.from("permissions").select("key"),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (permsRes.error) throw permsRes.error;

      const roles =
        (rolesRes.data ?? [])
          .map((r) => r.role)
          .filter(Boolean) as Array<{
          name: string;
          role_permissions: { permission_key: string }[];
        }>;

      const isOwner = roles.some((r) => r.name === "owner");
      const allKeys = (permsRes.data ?? []).map((p) => p.key);

      const granted = isOwner
        ? new Set(allKeys)
        : new Set(
            roles.flatMap((r) =>
              (r.role_permissions ?? []).map((rp) => rp.permission_key),
            ),
          );

      return {
        roleNames: roles.map((r) => r.name),
        isOwner,
        permissions: granted,
        has: (key: string) => granted.has(key),
      };
    },
  });
}
