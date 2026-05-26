// Cron endpoint: AI orchestrator tick (claim + run + sweep).
// Auth: Bearer LEADERBOARD_CRON_SECRET (reuses the existing cron secret).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { tick } from "@/lib/ai/orchestrator.server";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/ai-orchestrator")({
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

        try {
          const result = await tick();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("[cron/ai-orchestrator]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
