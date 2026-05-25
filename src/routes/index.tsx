import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Flag, ShieldCheck, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CurateTube — Community-curated YouTube worth watching" },
      {
        name: "description",
        content:
          "Community-curated YouTube database. Contributors submit, moderators curate, and the best videos rise via suggestions and time-anchored leaderboards.",
      },
      { property: "og:title", content: "CurateTube — Community-curated YouTube worth watching" },
      {
        property: "og:description",
        content:
          "Community-curated YouTube database. Contributors submit, moderators curate, and the best videos rise via suggestions and time-anchored leaderboards.",
      },
      { property: "og:url", content: "https://curatetube.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://curatetube.lovable.app/" }],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            CurateTube
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/privacy"
              className="px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Terms
            </Link>
            {loading ? null : user ? (
              <Button asChild size="sm">
                <Link to="/feed">
                  Open app <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/login" search={{ mode: "signup" }}>
                    Get started
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          A community-curated database of YouTube worth watching.
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground md:text-lg">
          Contributors submit, moderators curate, and the community surfaces the
          best of YouTube — with leaderboards, configurable feeds, and a
          privacy-first approach.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {user ? (
            <Button asChild size="lg">
              <Link to="/feed">Open your feed</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/login">Sign in to start</Link>
            </Button>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-24 md:grid-cols-3">
        {[
          {
            icon: Flag,
            title: "Suggest, don't just like",
            body: "A distinct community signal that powers a leaderboard with archives.",
          },
          {
            icon: Trophy,
            title: "Time-anchored leaderboards",
            body: "Top 10/30/100 with admin-tuned refresh cadence and full snapshot history.",
          },
          {
            icon: ShieldCheck,
            title: "Privacy-first audit",
            body: "Anonymous by default. Opt in to public attribution any time.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border bg-card p-5">
            <f.icon className="h-5 w-5" />
            <h2 className="mt-3 text-sm font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
