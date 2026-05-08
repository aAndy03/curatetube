// Cron endpoint: rebuilds due global snapshots for all enabled tiers.
// Auth: Bearer LEADERBOARD_CRON_SECRET (timing-safe comparison).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { rebuildAllDueGlobal, rebuildSnapshot } from "@/lib/leaderboard.server";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/leaderboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.LEADERBOARD_CRON_SECRET;
        if (!expected) {
          return new Response("Cron secret not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token || !safeEqual(token, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { tierSlug?: string; force?: boolean } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body is fine */
        }

        try {
          if (body.tierSlug) {
            const r = await rebuildSnapshot(body.tierSlug, {
              scopeType: "global",
              scopeValue: null,
            });
            return Response.json({ ok: true, results: r ? [r] : [] });
          }
          const results = await rebuildAllDueGlobal();
          return Response.json({ ok: true, results });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("[cron/leaderboard]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
