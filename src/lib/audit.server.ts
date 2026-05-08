// Server-only audit log writer.
// `actor_display_snapshot` resolved at write time using the actor's privacy mode.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Visibility = "internal" | "staff" | "public";

export type AuditEntry = {
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  visibility?: Visibility;
  forceAnonymous?: boolean;
};

export async function writeAudit(
  supabase: SupabaseClient<Database>,
  e: AuditEntry,
) {
  let snapshot = "Anonymous contributor";
  if (!e.forceAnonymous) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username, audit_privacy_mode")
      .eq("id", e.actorId)
      .maybeSingle();
    if (profile && profile.audit_privacy_mode === "public") {
      snapshot = profile.display_name ?? profile.username ?? "Unknown";
    }
  }
  await supabase.from("audit_log").insert({
    actor_id: e.actorId,
    actor_display_snapshot: snapshot,
    action: e.action,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    before: (e.before ?? null) as never,
    after: (e.after ?? null) as never,
    visibility: e.visibility ?? "internal",
  });
}
