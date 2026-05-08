import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { usePermissions } from "@/lib/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [{ title: "Home — CurateTube" }],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { data: perms, isLoading } = usePermissions();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">
            Your configurable feed lives here. Sections arrive in Phase 5.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            (perms?.roleNames ?? []).map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r}
              </Badge>
            ))
          )}
        </div>
      </header>

      <section className="rounded-xl border bg-card p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-medium">Phase 1 is live</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Auth, roles &amp; permissions, the audit log, and the app shell are
          ready. Submissions, the Suggest signal, leaderboards, and the
          configurable feed will follow.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-3">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </section>
    </div>
  );
}
