import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Flag,
  Sparkles,
  Trophy,
  ShieldCheck,
  Users2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getLandingData } from "@/lib/landing.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CurateTube — Community-curated YouTube worth watching" },
      {
        name: "description",
        content:
          "Nebula, Curiosity Stream, MagellanTV — but free. Community-curated YouTube: contributors submit, moderators curate, the best rises.",
      },
      { property: "og:title", content: "CurateTube — Like Nebula, but free" },
      {
        property: "og:description",
        content:
          "Community-curated YouTube database. Contributors submit, moderators curate, and the best videos rise via suggestions and time-anchored leaderboards.",
      },
      { property: "og:url", content: "https://curatetube.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://curatetube.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CurateTube",
          url: "https://curatetube.lovable.app/",
          description:
            "Community-curated YouTube database. Like Nebula or Curiosity Stream, but free.",
        }),
      },
    ],
  }),
  component: Landing,
});

const CYCLE_NAMES = ["Nebula", "Curiosity Stream", "MagellanTV"];

function CyclingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % CYCLE_NAMES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-flex overflow-hidden align-baseline pb-[0.15em] leading-[1.1]">
      <span
        key={i}
        className="inline-block animate-slide-down-in pb-[0.15em] leading-[1.1] text-foreground"
      >
        {CYCLE_NAMES[i]}
      </span>
    </span>
  );
}

// Deterministic procedural blobs (no SSR/CSR mismatch).
const BLOBS = Array.from({ length: 6 }, (_, idx) => {
  // simple LCG-ish deterministic values
  const s = (n: number) => ((Math.sin((idx + 1) * n) + 1) / 2);
  return {
    top: `${Math.round(s(12.9) * 80)}%`,
    left: `${Math.round(s(78.2) * 85)}%`,
    size: 280 + Math.round(s(43.1) * 320),
    hue: Math.round(s(19.7) * 60) + (idx % 2 === 0 ? 200 : 280),
    opacity: 0.18 + s(7.3) * 0.22,
  };
});

function ProceduralBlobs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle, hsl(${b.hue} 80% 60% / ${b.opacity}) 0%, transparent 70%)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/feed", replace: true });
    }
  }, [user, loading, navigate]);

  const fetchLanding = useServerFn(getLandingData);
  const { data } = useQuery({
    queryKey: ["landing"],
    queryFn: () => fetchLanding(),
    staleTime: 5 * 60 * 1000,
  });

  const videos = data?.videos ?? [];
  const stats = data?.stats;

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="relative z-20 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            CurateTube
            <Badge variant="outline" className="border-primary/40 text-[10px] uppercase tracking-wider text-primary">
              MVP
            </Badge>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              alpha
            </Badge>
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/privacy" className="px-2 text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="px-2 text-sm text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/login" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* HERO with video wall */}
      <section className="relative isolate min-h-[88vh] overflow-hidden">
        {/* Video wall background */}
        <div
          aria-hidden
          className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-0 motion-reduce:hidden"
        >
          {Array.from({ length: 6 }).map((_, idx) => {
            const v = videos[idx];
            if (!v)
              return (
                <div
                  key={idx}
                  className="bg-gradient-to-br from-muted/40 to-background"
                />
              );
            return (
              <div key={v.id} className="relative overflow-hidden">
                <iframe
                  title={v.title}
                  src={`https://www.youtube.com/embed/${v.youtube_id}?autoplay=1&mute=1&loop=1&playlist=${v.youtube_id}&controls=0&modestbranding=1&showinfo=0&rel=0&playsinline=1&disablekb=1`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  className="pointer-events-none absolute inset-0 h-[120%] w-[120%] -translate-x-[10%] -translate-y-[10%] scale-125"
                  loading="lazy"
                />
              </div>
            );
          })}
        </div>
        {/* Reduced-motion fallback: static thumbnails */}
        <div
          aria-hidden
          className="absolute inset-0 hidden grid-cols-3 grid-rows-2 motion-reduce:grid"
        >
          {Array.from({ length: 6 }).map((_, idx) => {
            const v = videos[idx];
            return (
              <div
                key={idx}
                className="bg-muted bg-cover bg-center"
                style={v?.thumbnail_url ? { backgroundImage: `url(${v.thumbnail_url})` } : undefined}
              />
            );
          })}
        </div>

        {/* Blur + vignette overlays */}
        <div aria-hidden className="absolute inset-0 backdrop-blur-2xl" />
        <div
          aria-hidden
          className="absolute inset-0 bg-background/60"
          style={{
            boxShadow: "inset 0 0 240px 80px hsl(var(--background) / 0.95)",
          }}
        />
        <ProceduralBlobs />

        {/* Content */}
        <div className="relative z-10 mx-auto flex min-h-[88vh] max-w-4xl flex-col items-center justify-center px-4 py-24 text-center">
          <Badge
            variant="outline"
            className="mb-6 animate-fade-in border-primary/30 bg-background/40 px-3 py-1 backdrop-blur"
          >
            <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
            Community-curated YouTube
          </Badge>

          <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
            <CyclingWord />
            <span className="text-muted-foreground">, but </span>
            <span className="bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              free.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            Documentaries, deep dives, and ideas worth your time — submitted by
            people, curated by moderators, ranked by the community. No
            subscription. No algorithm chasing your attention.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="lg" className="shadow-lg shadow-primary/20">
              <Link to="/categories">
                Browse the library <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="backdrop-blur">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Built in the open · No ads · No tracking by default
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative mx-auto max-w-5xl px-4 py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Flag,
              title: "Suggest, don't just like",
              body: "A distinct community signal that powers a leaderboard with full archives.",
            },
            {
              icon: Trophy,
              title: "Time-anchored leaderboards",
              body: "Top 10/30/100 with admin-tuned refresh cadence and snapshot history.",
            },
            {
              icon: ShieldCheck,
              title: "Privacy-first by default",
              body: "Anonymous attribution out of the box. Opt in to public credit any time.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-6 backdrop-blur transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="relative mx-auto max-w-5xl px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Approved videos", value: stats?.videos, icon: Sparkles },
            { label: "Categories", value: stats?.categories, icon: Flag },
            { label: "Public contributors", value: stats?.contributors, icon: Users2 },
          ].map((s) => (
            <div
              key={s.label}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-6 backdrop-blur"
            >
              <s.icon className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/40" />
              <div className="text-3xl font-semibold tabular-nums tracking-tight">
                {s.value?.toLocaleString() ?? "—"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-border/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">CurateTube</span>
            <span className="text-xs">— like Nebula, but free.</span>
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <Link to="/categories" className="hover:text-foreground">
              Categories
            </Link>
            <Link to="/leaderboard" className="hover:text-foreground">
              Leaderboard
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
