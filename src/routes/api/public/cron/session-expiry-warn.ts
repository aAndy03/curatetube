// Plan 3 Phase 2: D-1 session expiry warning.
// Daily cron: notifies users whose 10-day refresh token TTL is within 24h of expiring.
// Auth: shared LEADERBOARD_CRON_SECRET (Bearer).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SESSION_TTL_DAYS = 10;
const WARN_WINDOW_HOURS = 24;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/session-expiry-warn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.LEADERBOARD_CRON_SECRET;
        if (!expected) return new Response("Cron secret not configured", { status: 500 });
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token || !safeEqual(token, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          // Window: users whose last sign-in was between (TTL - WARN) and TTL ago.
          const now = Date.now();
          const lo = new Date(now - SESSION_TTL_DAYS * 86400_000).toISOString();
          const hi = new Date(now - (SESSION_TTL_DAYS * 24 - WARN_WINDOW_HOURS) * 3600_000).toISOString();

          // listUsers paginates; we scan up to 1000 (admin clients).
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (error) throw error;

          let inserted = 0;
          for (const u of data.users) {
            const last = u.last_sign_in_at;
            if (!last) continue;
            if (last < lo || last > hi) continue;

            // Skip if a warning was inserted in the last 7 days.
            const since = new Date(now - 7 * 86400_000).toISOString();
            const { data: existing } = await supabaseAdmin
              .from("notifications")
              .select("id")
              .eq("user_id", u.id)
              .eq("type", "system" as never)
              .gte("created_at", since)
              .like("title", "Session expires%")
              .maybeSingle();
            if (existing) continue;

            const { error: insErr } = await supabaseAdmin.from("notifications").insert({
              user_id: u.id,
              type: "system" as never,
              title: "Session expires tomorrow",
              body: "Visit any page while signed in to extend your session another 10 days.",
              data: {},
            });
            if (!insErr) inserted++;
          }

          return Response.json({ ok: true, scanned: data.users.length, inserted });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("[cron/session-expiry-warn]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
