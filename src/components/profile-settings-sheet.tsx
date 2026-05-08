import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  rewriteAuditIdentity,
  requestAccountDeletion,
  cancelAccountDeletion,
  getMyDeletionRequest,
  getMyAuthIdentities,
} from "@/lib/lists.functions";

export function ProfileSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, username, audit_privacy_mode, recommendation_opt_in",
        )
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [audit, setAudit] = React.useState<"anonymous" | "public">("anonymous");
  const [recOptIn, setRecOptIn] = React.useState(false);

  React.useEffect(() => {
    if (profileQ.data) {
      setDisplayName(profileQ.data.display_name ?? "");
      setUsername(profileQ.data.username ?? "");
      setAudit(profileQ.data.audit_privacy_mode);
      setRecOptIn(profileQ.data.recommendation_opt_in);
    }
  }, [profileQ.data]);

  type ProfilePatch = Partial<{
    display_name: string | null;
    username: string | null;
    audit_privacy_mode: "anonymous" | "public";
    recommendation_opt_in: boolean;
  }>;
  const save = async (patch: ProfilePatch) => {
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user!.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile", user?.id] });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Profile settings</SheetTitle>
          <SheetDescription>
            Inline edits save automatically.
          </SheetDescription>
        </SheetHeader>

        {profileQ.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="account" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="audit">Audit identity</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
              <TabsTrigger value="danger">Delete</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => save({ display_name: displayName || null })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => save({ username: username || null })}
                  placeholder="lowercase, unique"
                />
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Signed in as</p>
                <p className="font-medium">{user?.email}</p>
              </div>
              <Button variant="outline" onClick={signOut} className="w-full">
                Sign out
              </Button>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4 pt-4">
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="audit-public">Public attribution</Label>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline underline-offset-2"
                        >
                          What does this do?
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 text-sm">
                        When <strong>on</strong>, your display name can appear in
                        public surfaces (e.g. "Originally submitted by …").
                        When <strong>off</strong> (default), your actions are
                        recorded internally but show as "Anonymous" to staff
                        and to the public. Owners retain forensic access for
                        abuse cases — this is disclosed in the privacy policy.
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Forward-only. Use the buttons below to rewrite past entries.
                  </p>
                </div>
                <Switch
                  id="audit-public"
                  checked={audit === "public"}
                  onCheckedChange={(v) => {
                    const next = v ? "public" : "anonymous";
                    setAudit(next);
                    save({ audit_privacy_mode: next });
                  }}
                />
              </div>

              <BulkRewriteButtons />
            </TabsContent>

            <TabsContent value="privacy" className="space-y-4 pt-4">
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="rec-opt-in">Personal recommendations</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, you only see global recommendations (no profile
                    history is used).
                  </p>
                </div>
                <Switch
                  id="rec-opt-in"
                  checked={recOptIn}
                  onCheckedChange={(v) => {
                    setRecOptIn(v);
                    save({ recommendation_opt_in: v });
                  }}
                />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                A full data export (GDPR ZIP) will be offered before any
                account deletion completes.
              </p>
            </TabsContent>

            <TabsContent value="danger" className="space-y-4 pt-4">
              <DeleteAccountPanel />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BulkRewriteButtons() {
  const rewrite = useServerFn(rewriteAuditIdentity);
  const m = useMutation({
    mutationFn: (mode: "anonymize" | "attribute") =>
      rewrite({ data: { mode } }),
    onSuccess: (r) => toast.success(`Rewrote ${r.rewritten} audit entries`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={m.isPending}
        onClick={() => m.mutate("anonymize")}
      >
        Re-anonymize my past attributions
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={m.isPending}
        onClick={() => m.mutate("attribute")}
      >
        Attribute my past actions
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Each rewrite is itself recorded in the audit log.
      </p>
    </div>
  );
}

function DeleteAccountPanel() {
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const fetchReq = useServerFn(getMyDeletionRequest);
  const fetchIds = useServerFn(getMyAuthIdentities);
  const requestDel = useServerFn(requestAccountDeletion);
  const cancelDel = useServerFn(cancelAccountDeletion);

  const reqQ = useQuery({
    queryKey: ["account-deletion"],
    queryFn: () => fetchReq(),
  });
  const idsQ = useQuery({
    queryKey: ["auth-identities"],
    queryFn: () => fetchIds(),
  });

  const [confirm, setConfirm] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reason, setReason] = React.useState("");

  const active =
    reqQ.data?.request &&
    !reqQ.data.request.cancelled_at &&
    !reqQ.data.request.finalized_at;

  const submit = useMutation({
    mutationFn: async () => {
      const ids = idsQ.data;
      if (!ids) throw new Error("Loading identity providers…");
      // Tailored re-auth based on signup method (strongest if multi-method).
      if (ids.hasGoogle) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.href },
        });
        if (error) throw error;
        // OAuth redirects away; the deletion request happens after redirect.
        return null;
      }
      if (ids.hasPassword) {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user?.email) throw new Error("No email on file");
        const { error } = await supabase.auth.signInWithPassword({
          email: u.user.email,
          password,
        });
        if (error) throw new Error("Password did not match");
      } else {
        // Magic link path
        const { data: u } = await supabase.auth.getUser();
        if (!u.user?.email) throw new Error("No email on file");
        const { error } = await supabase.auth.signInWithOtp({
          email: u.user.email,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
        toast.message(
          "Check your email — finish from the magic link to confirm deletion.",
        );
        return null;
      }
      return requestDel({ data: { reason: reason || undefined } });
    },
    onSuccess: (r) => {
      if (r) {
        toast.success(
          `Deletion scheduled for ${new Date(r.scheduledFor).toLocaleString()}.`,
        );
        qc.invalidateQueries({ queryKey: ["account-deletion"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelDel(),
    onSuccess: () => {
      toast.success("Deletion cancelled.");
      qc.invalidateQueries({ queryKey: ["account-deletion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (active) {
    const scheduled = new Date(reqQ.data!.request!.scheduled_for);
    return (
      <div className="space-y-3 rounded-md border border-foreground/30 bg-muted p-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Deletion scheduled
        </div>
        <p className="text-muted-foreground">
          Your account will be permanently deleted on{" "}
          <strong>{scheduled.toLocaleString()}</strong>. Sign in any time before
          then to cancel.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancel deletion
        </Button>
      </div>
    );
  }

  const ids = idsQ.data;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-foreground/30 bg-muted p-3">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Delete account
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          7-day grace window. Personal data is hard-deleted afterward;
          submissions and approvals are kept but their attribution becomes
          “Deleted user”.
        </p>
      </div>

      {ids?.hasPassword ? (
        <div className="space-y-1.5">
          <Label htmlFor="del-password">Confirm your password</Label>
          <Input
            id="del-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : null}

      {ids?.hasGoogle ? (
        <p className="text-xs text-muted-foreground">
          You signed in with Google — clicking below will re-authenticate with
          Google before scheduling deletion.
        </p>
      ) : null}

      {!ids?.hasPassword && !ids?.hasGoogle ? (
        <p className="text-xs text-muted-foreground">
          You signed in with a magic link — clicking below will email a fresh
          confirmation link.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="del-reason">Reason (optional)</Label>
        <Input
          id="del-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Helps us improve."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="del-confirm">
          Type <strong>DELETE</strong> to confirm
        </Label>
        <Input
          id="del-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          disabled={
            confirm !== "DELETE" ||
            submit.isPending ||
            (ids?.hasPassword && !password)
          }
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          Schedule deletion
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out instead
        </Button>
      </div>
    </div>
  );
}
