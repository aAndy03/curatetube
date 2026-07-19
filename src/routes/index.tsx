import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Flag, Search, Sparkles, Trophy, ShieldCheck, Users2, PlayCircle, TrendingUp, Github } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { getLandingData } from "@/lib/landing.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CurateTube — Community-curated YouTube worth watching" },
      { name: "google-site-verification", content: "jzDIj-AVS2m4C5Yg87mbHNjQ9VneqyY5_EbEi0sQfHA" },
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
      { property: "og:image", content: "https://curatetube.lovable.app/og-cover.jpg" },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://curatetube.lovable.app/og-cover.jpg" },
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
          description: "Community-curated YouTube database. Like Nebula or Curiosity Stream, but free.",
        }),
      },
    ],
  }),
  component: Landing,
});

const CYCLE_NAMES = ["Nebula", "Curiosity Stream", "MagellanTV"];
const GITHUB_PROJECT_URL = "https://github.com/aAndy03/curatetube";

function CyclingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % CYCLE_NAMES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative block overflow-hidden pb-[0.15em] leading-[1.1]">
      <span
        key={i}
        className="inline-block animate-slide-down-in pb-[0.15em] leading-[1.1]"
        style={{
          background:
            "linear-gradient(180deg, #ffffff 0%, #c7d2fe 60%, #818cf8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {CYCLE_NAMES[i]},
      </span>
    </span>
  );
}

/** Two big drifting indigo/blue blurs — the whole visual signature. */
function AuroraBlobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute rounded-full opacity-70 blur-[120px] motion-safe:animate-blob-a"
        style={{
          top: "-10%",
          left: "-15%",
          width: 720,
          height: 720,
          background:
            "radial-gradient(circle at 30% 30%, #4338ca 0%, #1e1b4b 45%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full opacity-70 blur-[130px] motion-safe:animate-blob-b"
        style={{
          bottom: "-20%",
          right: "-10%",
          width: 780,
          height: 780,
          background:
            "radial-gradient(circle at 60% 60%, #2563eb 0%, #1e3a8a 40%, transparent 72%)",
        }}
      />
      <div
        className="absolute rounded-full opacity-40 blur-[100px] motion-safe:animate-blob-c"
        style={{
          top: "40%",
          left: "55%",
          width: 480,
          height: 480,
          background:
            "radial-gradient(circle, #6366f1 0%, transparent 70%)",
        }}
      />
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
  const topCats = data?.topCategories ?? [];

  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate({ to: "/search", search: { q: trimmed } });
  };

  return (
    <div className="dark">
      <main
        className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white"
        style={{
          background:
            "radial-gradient(ellipse at top, #0f0f2e 0%, #050514 55%, #000000 100%)",
        }}
      >
        {/* Aurora background */}
        <AuroraBlobs />

        {/* Subtle noise / vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* Floating pill nav */}
        <header className="relative z-30 px-4 pt-6">
          <nav className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 backdrop-blur-xl">
            <Link to="/" className="flex items-center gap-2 pl-2 text-sm font-semibold tracking-tight">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: "linear-gradient(135deg,#818cf8,#3b82f6)" }}
              />
              CurateTube
              <span className="ml-1 rounded-full border border-indigo-400/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-indigo-300">
                MVP
              </span>
              <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
                alpha
              </span>
            </Link>
            <div className="hidden items-center gap-1 text-sm md:flex">
              <NavPill to="/categories">Browse</NavPill>
              <NavPill to="/leaderboard">Leaderboard</NavPill>
              <NavPill to="/privacy">Privacy</NavPill>
              <NavPill to="/terms">Terms</NavPill>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={GITHUB_PROJECT_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View CurateTube on GitHub"
                className="rounded-full p-2 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Github className="h-[18px] w-[18px]" />
              </a>
              <Link
                to="/login"
                className="hidden rounded-full px-3 py-1.5 text-sm text-white/70 transition hover:text-white sm:inline-block"
              >
                Sign in
              </Link>
              <Link
                to="/login"
                search={{ mode: "signup" }}
                className="rounded-full border border-white/70 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white hover:text-black"
              >
                Get started
              </Link>
            </div>
          </nav>
        </header>

        {/* HERO */}
        <section className="relative z-10 mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center px-4 py-20 text-center">
          <Badge
            variant="outline"
            className="mb-8 border-white/15 bg-white/[0.03] px-3 py-1 text-xs font-normal tracking-wider text-white/70 backdrop-blur"
          >
            <Sparkles className="mr-1.5 h-3 w-3 text-indigo-300" />
            Community-curated YouTube · Free forever
          </Badge>

          <h1 className="text-balance pb-2 text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl lg:text-[5.5rem]">
            <CyclingWord />
            <span className="block">
              <span className="text-white/50">but </span>
              <span className="text-white">free.</span>
            </span>
          </h1>

          <p className="mt-8 max-w-2xl text-pretty text-base leading-relaxed text-white/60 md:text-lg">
            Documentaries, deep dives, and ideas worth your time. Submitted by people,
            curated by moderators, ranked by the community — no subscription, no attention-farming algorithm.
          </p>

          {/* Primary CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/categories"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Explore the library
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/[0.08]"
            >
              Create free account
            </Link>
          </div>

          {/* Interactive search cue */}
          <form
            onSubmit={submitSearch}
            className="mt-10 flex w-full max-w-xl items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] p-1.5 pl-5 backdrop-blur-xl transition focus-within:border-indigo-400/40 focus-within:bg-white/[0.06]"
          >
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try &ldquo;chernobyl&rdquo;, &ldquo;deep sea&rdquo;, &ldquo;forgotten history&rdquo;…"
              className="h-9 flex-1 border-0 bg-transparent p-0 text-sm text-white placeholder:text-white/35 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 rounded-full bg-indigo-500 px-4 text-white hover:bg-indigo-400"
            >
              Search
            </Button>
          </form>

          {/* Category cue chips — the "engage me" ques */}
          {topCats.length > 0 && (
            <div className="mt-6 w-full max-w-3xl">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/40">
                Or start with a topic
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {topCats.slice(0, 8).map((c) => (
                  <Link
                    key={c.slug}
                    to="/categories/$slug"
                    params={{ slug: c.slug }}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/70 backdrop-blur transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
                  >
                    {c.name}
                    <span className="text-white/30 group-hover:text-indigo-300">
                      {c.count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="mt-10 text-xs text-white/40">
            Built in the open · No ads · No tracking by default
          </p>
        </section>

        {/* STATS band */}
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Curated videos", value: stats?.videos, icon: PlayCircle },
              { label: "Topics & categories", value: stats?.categories, icon: Flag },
              { label: "Suggestions cast (all-time)", value: stats?.suggestions, icon: TrendingUp },
              { label: "Added this week", value: stats?.weeklySubmissions, icon: Sparkles },
              { label: "Public contributors", value: stats?.contributors, icon: Users2 },
            ].map((s) => (
              <div
                key={s.label}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.04]"
              >
                <s.icon className="absolute right-4 top-4 h-4 w-4 text-white/25" />
                <div className="text-2xl font-semibold tabular-nums tracking-tight text-white md:text-3xl">
                  {s.value?.toLocaleString() ?? "—"}
                </div>
                <div className="mt-1 text-xs text-white/50">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURED VIDEOS strip */}
        {videos.length > 0 && (
          <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/40">
                  On the leaderboard now
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  Rising this week
                </h2>
              </div>
              <Link
                to="/leaderboard"
                className="text-sm text-white/60 hover:text-white"
              >
                See leaderboard →
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              {videos.map((v) => (
                <Link
                  key={v.id}
                  to="/v/$id"
                  params={{ id: v.id }}
                  className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
                >
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt={v.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-900/40 to-slate-900" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                    <p className="line-clamp-2 text-[11px] font-medium text-white">
                      {v.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FEATURES */}
        <section className="relative z-10 mx-auto max-w-5xl px-4 pb-24">
          <div className="grid gap-3 md:grid-cols-3">
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
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur transition hover:border-indigo-400/30 hover:bg-white/[0.04]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-white/55">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative z-10 mx-auto max-w-3xl px-4 pb-24 text-center">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 backdrop-blur-xl">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Ready to find your next favourite thing?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
              Free, community-owned, and built without dark patterns. Join the alpha and help shape it.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                search={{ mode: "signup" }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/categories"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.05] hover:text-white"
              >
                Peek inside first
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative z-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-white/50 md:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white/80">CurateTube</span>
              <span className="text-xs">— like Nebula, but free.</span>
            </div>
            <nav className="flex flex-wrap items-center gap-4">
              <Link to="/categories" className="hover:text-white">Categories</Link>
              <Link to="/leaderboard" className="hover:text-white">Leaderboard</Link>
              <Link to="/privacy" className="hover:text-white">Privacy</Link>
              <Link to="/terms" className="hover:text-white">Terms</Link>
              <Link to="/login" className="hover:text-white">Sign in</Link>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}

function NavPill({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full px-3 py-1.5 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </Link>
  );
}
