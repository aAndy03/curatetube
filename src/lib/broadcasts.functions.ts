import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

async function requirePerm(userId: string, key: string) {
  const { data } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _key: key,
  });
  if (!data) throw new Error(`Missing permission: ${key}`);
}

async function requireAnyPerm(userId: string, keys: string[]) {
  for (const k of keys) {
    const { data } = await supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: k,
    });
    if (data) return;
  }
  throw new Error(`Missing permission: one of ${keys.join(", ")}`);
}

export type BroadcastRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: string;
  expires_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string;
  recipient_count: number;
  read_count: number;
  computed_status: "active" | "expired" | "archived";
  created_at: string;
  updated_at: string;
};

function computeStatus(row: {
  archived_at: string | null;
  expires_at: string | null;
}): "active" | "expired" | "archived" {
  if (row.archived_at) return "archived";
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
    return "expired";
  return "active";
}

// =================== ADMIN: LIST ===================

const ListInput = z.object({
  status: z.enum(["all", "active", "archived", "expired"]).optional(),
  categories: z.array(z.string().min(1).max(64)).max(20).optional(),
  search: z.string().max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, [
      "notification.broadcast",
      "broadcasts.archive",
      "broadcasts.delete",
    ]);

    let q = supabaseAdmin
      .from("broadcast_notifications" as never)
      .select(
        "id, title, body, link, category, expires_at, archived_at, archived_by, created_by, recipient_count, created_at, updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 50) - 1);

    if (data.categories?.length) q = q.in("category", data.categories);
    if (data.search) {
      const esc = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${esc}%,body.ilike.%${esc}%`);
    }
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);

    const status = data.status ?? "all";
    const nowIso = new Date().toISOString();
    if (status === "archived") q = q.not("archived_at", "is", null);
    else if (status === "active")
      q = q.is("archived_at", null).or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    else if (status === "expired")
      q = q.is("archived_at", null).lt("expires_at", nowIso);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<Omit<BroadcastRow, "computed_status" | "read_count">>;
    const ids = list.map((r) => r.id);
    const reads = new Map<string, number>();
    if (ids.length) {
      const { data: rd } = await supabaseAdmin
        .from("user_broadcast_reads" as never)
        .select("broadcast_id")
        .in("broadcast_id", ids);
      for (const r of (rd ?? []) as Array<{ broadcast_id: string }>) {
        reads.set(r.broadcast_id, (reads.get(r.broadcast_id) ?? 0) + 1);
      }
    }

    const entries: BroadcastRow[] = list.map((r) => ({
      ...r,
      read_count: reads.get(r.id) ?? 0,
      computed_status: computeStatus(r),
    }));

    return { entries, total: count ?? entries.length };
  });

// =================== USER: ACTIVE FEED + READ ===================

export const listActiveBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .select("id, title, body, link, category, expires_at, created_at")
      .is("archived_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      title: string;
      body: string | null;
      link: string | null;
      category: string;
      expires_at: string | null;
      created_at: string;
    }>;
    if (!list.length) return { broadcasts: [] };

    const { data: reads } = await supabaseAdmin
      .from("user_broadcast_reads" as never)
      .select("broadcast_id")
      .eq("user_id", context.userId)
      .in(
        "broadcast_id",
        list.map((r) => r.id),
      );
    const readSet = new Set(
      ((reads ?? []) as Array<{ broadcast_id: string }>).map((r) => r.broadcast_id),
    );

    return {
      broadcasts: list.map((r) => ({ ...r, read: readSet.has(r.id) })),
    };
  });

// Public history (any authenticated user) — excludes archived
const HistoryInput = z.object({
  category: z.string().min(1).max(64).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const listBroadcastHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HistoryInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("broadcast_notifications" as never)
      .select("id, title, body, link, category, expires_at, archived_at, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.category) q = q.eq("category", data.category);
    if (data.search) {
      const esc = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${esc}%,body.ilike.%${esc}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      title: string;
      body: string | null;
      link: string | null;
      category: string;
      expires_at: string | null;
      archived_at: string | null;
      created_at: string;
    }>;
    return {
      entries: list.map((r) => ({
        ...r,
        computed_status: computeStatus(r) as "active" | "expired" | "archived",
      })),
    };
  });

export const markBroadcastRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("user_broadcast_reads" as never)
      .upsert(
        {
          user_id: context.userId,
          broadcast_id: data.id,
          read_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,broadcast_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================== ADMIN: CREATE (replaces old broadcastNotification fanout) ===================

const SafeLink = z
  .string()
  .max(500)
  .regex(/^https?:\/\//i, "Only http(s) links are allowed");

const CreateInput = z.object({
  title: z.string().min(1).max(140),
  body: z.string().max(1000).optional(),
  link: SafeLink.optional(),
  category: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("general"),
  expires_at: z.string().datetime().nullable().optional(),
  fanout: z.boolean().optional().default(true),
});

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "notification.broadcast");

    // Recipient fan-out (optional but on by default for parity with old admin.broadcast)
    let recipients: string[] = [];
    if (data.fanout) {
      const { data: users, error: uerr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .is("deleted_at", null);
      if (uerr) throw new Error(uerr.message);
      recipients = (users ?? []).map((u) => u.id);
    }

    const { data: ins, error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .insert({
        title: data.title,
        body: data.body ?? null,
        link: data.link ?? null,
        category: data.category,
        expires_at: data.expires_at ?? null,
        created_by: context.userId,
        recipient_count: recipients.length,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const broadcastId = (ins as { id: string }).id;

    if (recipients.length) {
      const rows = recipients.map((uid) => ({
        user_id: uid,
        type: "admin_broadcast" as const,
        title: data.title,
        body: data.body ?? null,
        link: data.link ?? null,
        data: { broadcast: true, broadcast_id: broadcastId, category: data.category } as never,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error: nerr } = await supabaseAdmin
          .from("notifications")
          .insert(slice);
        if (nerr) throw new Error(nerr.message);
      }
    }

    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "broadcast.create",
      targetType: "broadcast",
      targetId: broadcastId,
      after: { title: data.title, category: data.category, recipients: recipients.length },
      visibility: "staff",
    });

    return { id: broadcastId, sent: recipients.length };
  });

// =================== ADMIN: UPDATE ===================

const UpdateInput = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      title: z.string().min(1).max(140).optional(),
      body: z.string().max(1000).nullable().optional(),
      link: z.string().max(500).nullable().optional(),
      category: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
      expires_at: z.string().datetime().nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, "Empty patch"),
});

export const updateBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "notification.broadcast");
    const { error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "broadcast.update",
      targetType: "broadcast",
      targetId: data.id,
      after: data.patch,
      visibility: "staff",
    });
    return { ok: true };
  });

// =================== ADMIN: BATCH ARCHIVE / RESTORE / DELETE ===================

const BatchInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export const archiveBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, [
      "broadcasts.archive",
      "notification.broadcast",
    ]);
    const { error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .update({
        archived_at: new Date().toISOString(),
        archived_by: context.userId,
      } as never)
      .in("id", data.ids)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await writeAudit(supabaseAdmin, {
        actorId: context.userId,
        action: "broadcast.archive",
        targetType: "broadcast",
        targetId: id,
        visibility: "staff",
      });
    }
    return { ok: true, count: data.ids.length };
  });

export const restoreBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyPerm(context.userId, [
      "broadcasts.archive",
      "notification.broadcast",
    ]);
    const { error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .update({ archived_at: null, archived_by: null } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await writeAudit(supabaseAdmin, {
        actorId: context.userId,
        action: "broadcast.restore",
        targetType: "broadcast",
        targetId: id,
        visibility: "staff",
      });
    }
    return { ok: true, count: data.ids.length };
  });

export const deleteBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "broadcasts.delete");
    const { error } = await supabaseAdmin
      .from("broadcast_notifications" as never)
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await writeAudit(supabaseAdmin, {
        actorId: context.userId,
        action: "broadcast.delete",
        targetType: "broadcast",
        targetId: id,
        visibility: "staff",
      });
    }
    return { ok: true, count: data.ids.length };
  });

// =================== CATEGORIES ===================

export const getBroadcastCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "broadcast_categories")
      .maybeSingle();
    const raw = data?.value;
    const arr = Array.isArray(raw)
      ? (raw as unknown[]).filter((x): x is string => typeof x === "string")
      : ["general"];
    return { categories: arr };
  });


const CategoriesInput = z.object({
  categories: z
    .array(
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/),
    )
    .min(1)
    .max(40),
});

export const setBroadcastCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CategoriesInput.parse(d))
  .handler(async ({ data, context }) => {
    await requirePerm(context.userId, "settings.edit");
    const unique = Array.from(new Set(data.categories));
    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: "broadcast_categories",
      value: unique as never,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actorId: context.userId,
      action: "settings.update",
      targetType: "app_setting",
      targetId: "broadcast_categories",
      after: { value: unique },
      visibility: "staff",
    });
    return { ok: true };
  });
