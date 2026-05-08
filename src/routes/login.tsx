import * as React from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

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
    meta: [{ title: "Sign in — CurateTube" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = React.useState<"signin" | "signup" | "magic">(
    search.mode === "signup" ? "signup" : "signin",
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            CurateTube
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Welcome
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in or create an account. The first user becomes Owner.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <GoogleButton
            onDone={() => navigate({ to: search.redirect ?? "/feed" })}
          />

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            <span>or</span>
            <Separator className="flex-1" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
              <TabsTrigger value="magic">Magic link</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-4">
              <PasswordForm
                mode="signin"
                onDone={() => navigate({ to: search.redirect ?? "/feed" })}
              />
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <PasswordForm
                mode="signup"
                onDone={() => navigate({ to: search.redirect ?? "/feed" })}
              />
            </TabsContent>
            <TabsContent value="magic" className="pt-4">
              <MagicLinkForm />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function GoogleButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: window.location.origin + "/feed",
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
}: {
  mode: "signin" | "signup";
  onDone: () => void;
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
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/feed` },
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

function MagicLinkForm() {
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/feed` },
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
