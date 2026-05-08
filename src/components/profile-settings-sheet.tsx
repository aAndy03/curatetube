import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="audit">Audit identity</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
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

              <div className="grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Available in Phase 3"
                >
                  Re-anonymize my past attributions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Available in Phase 3"
                >
                  Attribute my past actions
                </Button>
              </div>
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
              <div className="text-sm text-muted-foreground">
                Account deletion (tailored to your sign-in method) and full data
                export will arrive in Phase 3.
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
