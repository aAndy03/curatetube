import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, BellOff, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listNotifications } from "@/lib/lists.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { enqueue } from "@/lib/action-queue";

export function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);

  const q = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: () => fetchList(),
    refetchInterval: open ? false : 60_000,
  });

  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  React.useEffect(() => {
    if (open && (q.data?.unread ?? 0) > 0) {
      void markRead({ data: {} }).then(() =>
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      );
    }
  }, [open, q.data?.unread, markRead, qc]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Notifications
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                markRead({ data: {} }).then(() =>
                  qc.invalidateQueries({ queryKey: ["notifications"] }),
                )
              }
            >
              <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
            </Button>
          </SheetTitle>
          <SheetDescription>Real-time updates appear here.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-7rem)] pr-2">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !q.data || q.data.notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
              <BellOff className="h-6 w-6" />
              No notifications yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {q.data.notifications.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border bg-card p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium leading-tight">{n.title}</p>
                      {n.body ? (
                        <p className="text-xs text-muted-foreground">{n.body}</p>
                      ) : null}
                    </div>
                    {!n.read_at ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-foreground" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
