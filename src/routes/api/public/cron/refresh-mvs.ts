// Cron endpoint: refreshes one or all materialized views via SECURITY DEFINER RPC.
// Auth: Bearer LEADERBOARD_CRON_SECRET (reused; rename later if desired).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALL_VIEWS = ["mv_trending", "mv_suggested_feed", "mv_category_stats"] as const;
type MvName = (typeof ALL_VIEWS)[number];

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/refresh-mvs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.LEADERBOARD_CRON_SECRET;
        if (!expected) return new Response("Cron secret not configured", { status: 500 });
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token || !safeEqual(token, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { view?: MvName } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body = refresh all */
        }

        const targets: MvName[] =
          body.view && ALL_VIEWS.includes(body.view) ? [body.view] : [...ALL_VIEWS];

        const results: Array<{ view: MvName; ok: boolean; error?: string; rows?: number }> = [];
        for (const v of targets) {
          const { data, error } = await supabaseAdmin.rpc("refresh_mv" as never, { _name: v } as never);
          if (error) {
            results.push({ view: v, ok: false, error: error.message });
          } else {
            const r = data as { ok: boolean; rows?: number; error?: string } | null;
            results.push({ view: v, ok: !!r?.ok, rows: r?.rows, error: r?.error });
          }
        }

        return Response.json({ ok: results.every((r) => r.ok), results });
      },
    },
  },
});
