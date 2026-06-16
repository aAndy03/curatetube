// Phase 6 Step 1 — Consolidated session bootstrap.
// One server round-trip returning everything every authenticated page needs at
// mount: profile snapshot, role names, granted permission keys, unread
// notification count, recommendation weights, and the public subset of
// `app_settings`. Replaces N independent fetches scattered across surfaces.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SessionBootstrap = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    audit_privacy_mode: string | null;
  } | null;
  roleNames: string[];
  isOwner: boolean;
  permissions: string[];
  unreadCount: number;
  recommendationWeights: Record<string, number>;
  appSettingsPublic: Record<string, boolean | string | number | null>;
};

// Whitelist of `app_settings` keys that are safe for any signed-in user to read
// (drives UI toggles like submit-quota, AI feedback prompts, etc.). Anything
// not in this list stays admin-only and is fetched through `listAppSettings`.
const PUBLIC_APP_SETTING_KEYS = new Set<string>([
  "submit.daily_quota",
  "suggest.daily_quota",
  "ai.feedback.enabled",
  "ui.banner.text",
  "ui.banner.variant",
]);

export const getSessionBootstrap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionBootstrap> => {
    const { userId, supabase } = context;

    const [
      profileRes,
      rolesRes,
      unreadRes,
      weightsRes,
      settingsRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, audit_privacy_mode")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role:roles(name, role_permissions(permission_key))")
        .eq("user_id", userId),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
      supabaseAdmin
        .from("recommendation_settings")
        .select("weights")
        .eq("id", true)
        .maybeSingle(),
      supabaseAdmin.from("app_settings").select("key, value"),
    ]);

    const roles = ((rolesRes.data ?? [])
      .map((r) => r.role)
      .filter(Boolean) as Array<{
      name: string;
      role_permissions: { permission_key: string }[];
    }>);
    const isOwner = roles.some((r) => r.name === "owner");

    let permissions: string[];
    if (isOwner) {
      const { data: all } = await supabaseAdmin.from("permissions").select("key");
      permissions = (all ?? []).map((p) => p.key);
    } else {
      permissions = Array.from(
        new Set(
          roles.flatMap((r) =>
            (r.role_permissions ?? []).map((rp) => rp.permission_key),
          ),
        ),
      );
    }

    const appSettingsPublic: Record<string, boolean | string | number | null> = {};
    for (const row of settingsRes.data ?? []) {
      if (PUBLIC_APP_SETTING_KEYS.has(row.key)) {
        appSettingsPublic[row.key] = row.value as never;
      }
    }

    return {
      profile: profileRes.data ?? null,
      roleNames: roles.map((r) => r.name),
      isOwner,
      permissions,
      unreadCount: unreadRes.count ?? 0,
      recommendationWeights:
        (weightsRes.data?.weights ?? {}) as Record<string, number>,
      appSettingsPublic,
    };
  });
