import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { finalizeDueAccountDeletions } from "@/lib/account-deletion.server";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/account-deletions")({
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
          const result = await finalizeDueAccountDeletions();
          return Response.json(result, { status: result.ok ? 200 : 207 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error("[cron/account-deletions]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});