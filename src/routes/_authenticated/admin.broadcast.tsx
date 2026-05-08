import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { broadcastNotification } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  head: () => ({ meta: [{ title: "Broadcast notification — CurateTube" }] }),
  component: BroadcastPage,
});

function BroadcastPage() {
  const { data: perms } = usePermissions();
  const fn = useServerFn(broadcastNotification);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [link, setLink] = React.useState("");

  const send = useMutation({
    mutationFn: () =>
      fn({
        data: {
          title,
          body: body || undefined,
          link: link || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Sent to ${r.sent} users`);
      setTitle("");
      setBody("");
      setLink("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!perms?.has("notification.broadcast")) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        You need the <code>notification.broadcast</code> permission.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-2">
        <Megaphone className="h-5 w-5" />
        <div>
          <h1 className="text-xl font-semibold">Broadcast notification</h1>
          <p className="text-sm text-muted-foreground">
            Sends an in-app notification to every active member.
          </p>
        </div>
      </header>

      <div className="space-y-3 rounded-md border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder="Maintenance window tonight at 22:00 UTC"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Body (optional)</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link">Link (optional)</Label>
          <Input
            id="link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/changelog"
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button
            disabled={!title.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Sending…" : "Send to everyone"}
          </Button>
        </div>
      </div>
    </div>
  );
}
