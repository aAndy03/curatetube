import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "./audit.server";

type DeleteMode = "instant" | "grace";

type DeleteAccountOptions = {
  mode: DeleteMode;
};

type CleanupResult = {
  ok: true;
  deletedUserId: string;
  affectedVideos: number;
};

function assertNoError(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function deleteWhere(table: string, column: string, userId: string) {
  const { error } = await supabaseAdmin
    .from(table as never)
    .delete()
    .eq(column as never, userId as never);
  assertNoError(`Failed to clean ${table}`, error);
}

async function updateWhere(
  table: string,
  patch: Record<string, unknown>,
  column: string,
  userId: string,
) {
  const { error } = await supabaseAdmin
    .from(table as never)
    .update(patch as never)
    .eq(column as never, userId as never);
  assertNoError(`Failed to anonymize ${table}`, error);
}

async function recalculateSubmissionCounts(videoIds: string[]) {
  for (const videoId of videoIds) {
    const { count, error: countError } = await supabaseAdmin
      .from("video_submitters")
      .select("video_id", { count: "exact", head: true })
      .eq("video_id", videoId);
    assertNoError("Failed to recount video submitters", countError);

    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ submission_count: count ?? 0 })
      .eq("id", videoId);
    assertNoError("Failed to update video submission count", updateError);
  }
}

export async function deleteAccountDataNow(
  userId: string,
  options: DeleteAccountOptions,
): Promise<CleanupResult> {
  const now = new Date().toISOString();

  await writeAudit(supabaseAdmin, {
    actorId: userId,
    action: options.mode === "instant" ? "account.delete_instant" : "account.delete_finalized",
    targetType: "user",
    targetId: userId,
    after: { mode: options.mode },
    visibility: "staff",
    forceAnonymous: true,
  });

  await updateWhere(
    "audit_log",
    { actor_display_snapshot: "Deleted user" },
    "actor_id",
    userId,
  );

  await updateWhere(
    "profiles",
    {
      display_name: null,
      username: null,
      avatar_url: null,
      audit_privacy_mode: "anonymous",
      recommendation_opt_in: false,
      deleted_at: now,
    },
    "id",
    userId,
  );

  const { data: submittedRows, error: submittedError } = await supabaseAdmin
    .from("video_submitters")
    .select("video_id")
    .eq("user_id", userId);
  assertNoError("Failed to inspect submitted videos", submittedError);
  const affectedVideoIds = Array.from(
    new Set((submittedRows ?? []).map((row) => row.video_id).filter(Boolean)),
  );

  await deleteWhere("user_category_pins", "user_id", userId);
  await deleteWhere("user_feed_dedup", "user_id", userId);
  await deleteWhere("user_feed_state", "user_id", userId);
  await deleteWhere("user_broadcast_reads", "user_id", userId);
  await deleteWhere("user_video_status", "user_id", userId);
  await deleteWhere("video_suggestions", "user_id", userId);
  await deleteWhere("video_submitters", "user_id", userId);
  await deleteWhere("rate_limit_events", "user_id", userId);
  await deleteWhere("batch_flush_log", "user_id", userId);
  await deleteWhere("notifications", "user_id", userId);
  await deleteWhere("user_roles", "user_id", userId);
  await deleteWhere("feed_sections", "owner_id", userId);
  if (options.mode === "instant") {
    await deleteWhere("submissions", "submitter_id", userId);
  } else {
    await updateWhere("submissions", { submitter_id: null, anonymous: true }, "submitter_id", userId);
  }
  await updateWhere("submissions", { decided_by: null }, "decided_by", userId);
  await updateWhere("user_roles", { granted_by: null }, "granted_by", userId);
  await deleteWhere("account_deletion_requests", "user_id", userId);

  await recalculateSubmissionCounts(affectedVideoIds);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError && !/not found/i.test(authError.message)) {
    throw new Error(`Failed to delete auth user: ${authError.message}`);
  }

  await deleteWhere("profiles", "id", userId);

  return {
    ok: true,
    deletedUserId: userId,
    affectedVideos: affectedVideoIds.length,
  };
}

export async function finalizeDueAccountDeletions(limit = 25) {
  const { data: requests, error } = await supabaseAdmin
    .from("account_deletion_requests")
    .select("user_id, scheduled_for")
    .lte("scheduled_for", new Date().toISOString())
    .is("cancelled_at", null)
    .is("finalized_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  assertNoError("Failed to load due account deletions", error);

  const results: Array<{
    userId: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const request of requests ?? []) {
    try {
      await deleteAccountDataNow(request.user_id, { mode: "grace" });
      results.push({ userId: request.user_id, ok: true });
    } catch (error) {
      results.push({
        userId: request.user_id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    processed: results.length,
    results,
  };
}