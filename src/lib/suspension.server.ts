// Server-side helper: reject suspended users from mutating actions.
// The Supabase auth-middleware file is auto-generated and cannot be edited,
// so suspension is enforced inside server fns by calling this helper.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertNotSuspended(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("suspended_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.suspended_at) {
    throw new Error(
      "Your account is suspended. Contact an administrator to restore access.",
    );
  }
}
