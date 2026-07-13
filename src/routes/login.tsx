import * as React from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { getLandingData } from "@/lib/landing.functions";

const SearchSchema = z.object({
  redirect: z.string().optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: SearchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: search.redirect ?? "/feed" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — CurateTube" },
      {
        name: "description",
        content:
          "Sign in or create your CurateTube account to submit videos, suggest favorites, and shape the community-curated YouTube library.",
      },
      { property: "og:title", content: "Sign in — CurateTube" },
      {
        property: "og:description",
        content: "Sign in to CurateTube to submit, suggest, and curate YouTube videos.",
      },
      { property: "og:url", content: "https://curatetube.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://curatetube.lovable.app/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const redirectPath = search.redirect ?? "/feed";
  const [tab, setTab] = React.useState<"signin" | "signup" | "magic">(
    search.mode === "signup" ? "signup" : "signin",
  );

  const fetchLanding = useServerFn(getLandingData);
  const { data: landing } = useQuery({
    queryKey: ["landing"],
    queryFn: () => fetchLanding(),
    staleTime: 5 * 60 * 1000,
  });
  const topCats = landing?.topCategories ?? [];
  const stats = landing?.stats;

  return (
    <div className="dark">
      <main
        className="relative min-h-screen overflow-hidden bg-[#050514] text-white"
        style={{
          background:
            "radial-gradient(ellipse at top, #0f0f2e 0%, #050514 55%, #000000 100%)",
        }}
      >
        {/* Aurora — matches landing */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute rounded-full opacity-60 blur-[120px] motion-safe:animate-blob-a"
            style={{
              top: "-15%",
              left: "-10%",
              width: 620,
              height: 620,
              background:
                "radial-gradient(circle at 30% 30%, #4338ca 0%, #1e1b4b 45%, transparent 70%)",
            }}
          />
          <div
            className="absolute rounded-full opacity-60 blur-[130px] motion-safe:animate-blob-b"
            style={{
              bottom: "-20%",
              right: "-15%",
              width: 700,
              height: 700,
              background:
                "radial-gradient(circle at 60% 60%, #2563eb 0%, #1e3a8a 40%, transparent 72%)",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8">
          {/* Tiny header */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: "linear-gradient(135deg,#818cf8,#3b82f6)" }}
              />
              CurateTube
            </Link>
            <Link to="/" className="text-xs text-white/50 hover:text-white">
              ← back home
            </Link>
          </div>

          <div className="my-auto grid gap-10 py-10 md:grid-cols-2 md:items-center">
            {/* LEFT — copy + interactive cues */}
            <div>
              <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs tracking-wider text-white/70 backdrop-blur">
                <Sparkles className="h-3 w-3 text-indigo-300" />
                Free forever · community-owned
              </div>
              <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
                Join the people picking the{" "}
                <span
                  style={{
                    background:
                      "linear-gradient(180deg, #ffffff 0%, #c7d2fe 60%, #818cf8 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  best of YouTube
                </span>
                .
              </h1>
              <p className="mt-5 max-w-md text-sm text-white/60 md:text-base">
                An account lets you suggest videos, save favourites, and rank the community leaderboard.
                It takes ten seconds.
              </p>

              {/* Interactive cue: topic chips */}
              {topCats.length > 0 && (
                <div className="mt-8">
                  <p className="mb-3 text-xs uppercase tracking-widest text-white/40">
                    What are you into? — pick one to explore
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                  <p className="mt-3 text-[11px] text-white/40">
                    You can browse without an account — sign in unlocks suggesting, saving, and submitting.
                  </p>
                </div>
              )}

              {/* Mini stat strip */}
              {stats && (
                <div className="mt-8 flex flex-wrap gap-3 text-sm">
                  <MiniStat label="curated videos" value={stats.videos} />
                  <MiniStat label="categories" value={stats.categories} />
                  <MiniStat label="contributors" value={stats.contributors} />
                </div>
              )}
            </div>

            {/* RIGHT — auth card */}
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
                <h2 className="text-lg font-semibold tracking-tight">
                  {tab === "signup" ? "Create your account" : "Welcome back"}
                </h2>
                <p className="mt-1 text-xs text-white/55">
                  Sessions last 10 days. No spam, ever.
                </p>

                <div className="mt-5">
                  <GoogleButton
                    redirectPath={redirectPath}
                    onDone={() => navigate({ to: redirectPath })}
                  />
                </div>

                <div className="my-4 flex items-center gap-3 text-xs text-white/40">
                  <Separator className="flex-1 bg-white/10" />
                  <span>or</span>
                  <Separator className="flex-1 bg-white/10" />
                </div>

                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList className="grid w-full grid-cols-3 bg-white/[0.04]">
                    <TabsTrigger value="signin">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Sign up</TabsTrigger>
                    <TabsTrigger value="magic">Magic link</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signin" className="pt-4">
                    <PasswordForm
                      mode="signin"
                      redirectPath={redirectPath}
                      onDone={() => navigate({ to: redirectPath })}
                    />
                  </TabsContent>
                  <TabsContent value="signup" className="pt-4">
                    <PasswordForm
                      mode="signup"
                      redirectPath={redirectPath}
                      onDone={() => navigate({ to: redirectPath })}
                    />
                  </TabsContent>
                  <TabsContent value="magic" className="pt-4">
                    <MagicLinkForm redirectPath={redirectPath} />
                  </TabsContent>
                </Tabs>
              </div>

              <p className="mt-4 text-center text-[11px] text-white/40">
                By continuing you agree to our{" "}
                <Link to="/terms" className="underline underline-offset-2 hover:text-white/70">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-white/70">
                  Privacy Policy
                </Link>
                .
              </p>

              <div className="mt-3 text-center">
                <Link
                  to="/categories"
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
                >
                  Just browsing? Explore anonymously
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 backdrop-blur">
      <div className="text-base font-semibold tabular-nums text-white">
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}



function GoogleButton({
  onDone,
  redirectPath,
}: {
  onDone: () => void;
  redirectPath: string;
}) {
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        // Preserve the post-login destination through the OAuth round-trip.
        const target = redirectPath.startsWith("/") ? redirectPath : "/feed";
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: window.location.origin + target,
        });
        if (result.error) {
          setLoading(false);
          toast.error(
            result.error instanceof Error ? result.error.message : "Sign-in failed",
          );
          return;
        }
        if (result.redirected) return;
        onDone();
      }}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Continue with Google
    </Button>
  );
}

const PasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

function PasswordForm({
  mode,
  onDone,
  redirectPath,
}: {
  mode: "signin" | "signup";
  onDone: () => void;
  redirectPath: string;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = PasswordSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error("Use a valid email and a password of 8+ characters.");
      return;
    }
    setLoading(true);
    try {
      const target = redirectPath.startsWith("/") ? redirectPath : "/feed";
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${target}` },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-email`}>Email</Label>
        <Input
          id={`${mode}-email`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-password`}>Password</Label>
        <Input
          id={`${mode}-password`}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

function MagicLinkForm({ redirectPath }: { redirectPath: string }) {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      toast.error("Enter a valid email.");
      return;
    }
    setLoading(true);
    const target = redirectPath.startsWith("/") ? redirectPath : "/feed";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${target}` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Check your inbox for the link.");
  };

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        We sent a link to <strong>{email}</strong>. Open it on this device to
        finish signing in.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send magic link
      </Button>
    </form>
  );
}
