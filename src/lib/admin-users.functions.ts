// Server functions for /admin/users (Phase 10).
// Implements role hierarchy, suspension, and audit-log integration.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

// ============ Role hierarchy ============

const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  admin: 80,
  moderator: 50,
  curator: 30,
  member: 10,
};

function levelOf(name: string): number {
  return ROLE_LEVELS[name.toLowerCase()] ?? 0;
}

async function requirePerm(userId: string, key: string) {
  const { data } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: key,
  });
  if (!data) throw new Error(`Missing permission: ${key}`);
}

async function getActorMaxLevel(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role:roles(name)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const names = (data ?? [])
    .map((r) => (r.role as { name: string } | null)?.name)
    .filter(Boolean) as string[];
  return names.reduce((max, n) => Math.max(max, levelOf(n)), 0);
}

async function countOwners(): Promise<number> {
  const { data: ownerRole } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("name", "owner")
    .maybeSingle();
  if (!ownerRole) return 0;
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", ownerRole.id);
  return count ?? 0;
}

async function getMaxOwners(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "max_owners")
    .maybeSingle();
  const v = data?.value;
  if (typeof v === "number") return v;
  return 2;
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${local.length > 2 ? "•••" : ""}@${domain}`;
}

// ============ LIST USERS ============

const ListInput = z.object({
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100000).optional(),
});

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "users.view");
    const canSeeFullEmail =
      (await supabaseAdmin.rpc("has_permission", {
        _user_id: context.userId,
        _key: "audit.view",
      })).data === true;

    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const search = (data.search ?? "").trim();

    let q = supabaseAdmin
      .from("profiles")
      .select(
        "id, display_name, username, avatar_url, created_at, suspended_at, deleted_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (search) {
      const esc = search.replace(/[%_]/g, (m) => `\\${m}`);
      q = q.or(`display_name.ilike.%${esc}%,username.ilike.%${esc}%`);
    }
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = (profiles ?? []).map((p) => p.id);
    if (userIds.length === 0) {
      return { users: [], hasMore: false };
    }

    // Roles
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role:roles(id, name, color)")
      .in("user_id", userIds);
    const rolesByUser = new Map<
      string,
      Array<{ id: string; name: string; color: string | null }>
    >();
    for (const r of roleRows ?? []) {
      const role = r.role as
        | { id: string; name: string; color: string | null }
        | null;
      if (!role) continue;
      if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
      rolesByUser.get(r.user_id)!.push(role);
    }

    // Submission counts
    const subCounts = new Map<string, number>();
    for (const uid of userIds) {
      const { count } = await supabaseAdmin
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("submitter_id", uid);
      subCounts.set(uid, count ?? 0);
    }

    // Auth metadata (email + last_sign_in_at)
    const meta = new Map<
      string,
      { email: string | null; lastSignInAt: string | null }
    >();
    for (const uid of userIds) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        meta.set(uid, {
          email: u.user?.email ?? null,
          lastSignInAt: u.user?.last_sign_in_at ?? null,
        });
      } catch {
        meta.set(uid, { email: null, lastSignInAt: null });
      }
    }

    const users = (profiles ?? []).map((p) => {
      const m = meta.get(p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        suspended_at: p.suspended_at,
        email: canSeeFullEmail ? (m?.email ?? null) : maskEmail(m?.email ?? null),
        last_sign_in_at: m?.lastSignInAt ?? null,
        roles: rolesByUser.get(p.id) ?? [],
        submission_count: subCounts.get(p.id) ?? 0,
      };
    });

    return { users, hasMore: users.length === limit };
  });

// ============ USER DETAIL ============

const DetailInput = z.object({ userId: z.string().uuid() });

export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "users.view");
    const canSeeFullEmail =
      (await supabaseAdmin.rpc("has_permission", {
        _user_id: context.userId,
        _key: "audit.view",
      })).data === true;

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, display_name, username, avatar_url, created_at, updated_at, suspended_at, deleted_at, audit_privacy_mode",
      )
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("User not found");

    let email: string | null = null;
    let lastSignInAt: string | null = null;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      email = u.user?.email ?? null;
      lastSignInAt = u.user?.last_sign_in_at ?? null;
    } catch {
      // ignore
    }

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("granted_at, granted_by, role:roles(id, name, color)")
      .eq("user_id", data.userId);
    const roles = (roleRows ?? []).map((r) => ({
      ...(r.role as { id: string; name: string; color: string | null }),
      granted_at: r.granted_at,
      granted_by: r.granted_by,
    }));

    const { data: audit } = await supabaseAdmin
      .from("audit_log")
      .select(
        "id, created_at, actor_id, actor_display_snapshot, action, target_type, target_id, visibility",
      )
      .or(`actor_id.eq.${data.userId},target_id.eq.${data.userId}`)
      .order("created_at", { ascending: false })
      .limit(20);

    const { count: submissionCount } = await supabaseAdmin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("submitter_id", data.userId);

    const { count: aiJobCount } = await supabaseAdmin
      .from("ai_jobs")
      .select("id", { count: "exact", head: true })
      .eq("created_by", data.userId);

    return {
      profile: {
        ...profile,
        email: canSeeFullEmail ? email : maskEmail(email),
        last_sign_in_at: lastSignInAt,
      },
      roles,
      audit: audit ?? [],
      submission_count: submissionCount ?? 0,
      ai_job_count: aiJobCount ?? 0,
    };
  });

// ============ LIST ASSIGNABLE ROLES (server-filtered combobox) ============

export const listAssignableRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context.userId, "users.manage");
    const actorLevel = await getActorMaxLevel(context.userId);
    const { data, error } = await supabaseAdmin
      .from("roles")
      .select("id, name, description, color")
      .order("name");
    if (error) throw new Error(error.message);
    const assignable = (data ?? []).filter((r) => {
      const lvl = levelOf(r.name);
      if (lvl >= actorLevel) {
        // owner-actor (level 100) can assign owner only via cap-check downstream
        return actorLevel >= 100 && r.name === "owner";
      }
      return true;
    });
    return { roles: assignable, actorLevel };
  });

// ============ ASSIGN ROLE ============

const AssignInput = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const assignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "users.manage");
    const actorLevel = await getActorMaxLevel(context.userId);

    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id, name")
      .eq("id", data.roleId)
      .maybeSingle();
    if (!role) throw new Error("Role not found");

    const targetLvl = levelOf(role.name);

    if (role.name === "owner") {
      if (actorLevel < 100) throw new Error("Only owners can grant owner");
      const max = await getMaxOwners();
      const current = await countOwners();
      if (current >= max) throw new Error("max_owners_reached");
    } else if (targetLvl >= actorLevel) {
      throw new Error("insufficient_role_level");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: data.userId,
        role_id: data.roleId,
        granted_by: context.userId,
      });
    if (error) {
      if (/duplicate/i.test(error.message)) {
        throw new Error("User already has this role");
      }
      throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "user.role_granted",
      targetType: "user",
      targetId: data.userId,
      after: { role: role.name },
      visibility: "staff",
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      type: "admin_broadcast" as const,
      title: "Role granted",
      body: `You have been granted the "${role.name}" role.`,
      data: { kind: "role_granted", role: role.name } as never,
    });

    return { ok: true };
  });

// ============ REMOVE ROLE ============

const RemoveInput = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "users.manage");
    const actorLevel = await getActorMaxLevel(context.userId);

    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id, name")
      .eq("id", data.roleId)
      .maybeSingle();
    if (!role) throw new Error("Role not found");

    const targetLvl = levelOf(role.name);
    if (targetLvl >= actorLevel && !(role.name === "owner" && actorLevel >= 100)) {
      throw new Error("insufficient_role_level");
    }

    if (role.name === "owner") {
      const current = await countOwners();
      if (current <= 1) throw new Error("Cannot demote the last owner");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role_id", data.roleId);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "user.role_revoked",
      targetType: "user",
      targetId: data.userId,
      before: { role: role.name },
      visibility: "staff",
    });

    return { ok: true };
  });

// ============ SUSPEND / UNSUSPEND ============

const SuspendInput = z.object({
  userId: z.string().uuid(),
  suspend: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const setUserSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuspendInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "users.manage");
    if (data.userId === context.userId) {
      throw new Error("You cannot suspend yourself");
    }

    const actorLevel = await getActorMaxLevel(context.userId);
    const targetLevel = await getActorMaxLevel(data.userId);
    if (targetLevel >= actorLevel) {
      throw new Error("insufficient_role_level");
    }

    const patch = data.suspend
      ? { suspended_at: new Date().toISOString() }
      : { suspended_at: null };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: data.suspend ? "user.suspended" : "user.unsuspended",
      targetType: "user",
      targetId: data.userId,
      after: { reason: data.reason ?? null },
      visibility: "staff",
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      type: "admin_broadcast" as const,
      title: data.suspend ? "Account suspended" : "Account restored",
      body: data.suspend
        ? (data.reason ??
          "Your account has been suspended. Contact an administrator.")
        : "Your account access has been restored.",
      data: {
        kind: data.suspend ? "account_suspended" : "account_unsuspended",
      } as never,
    });

    return { ok: true };
  });
