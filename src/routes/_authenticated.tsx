import * as React from "react";
import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Plus, Search, UserCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { ProfileSettingsSheet } from "@/components/profile-settings-sheet";
import { SubmitSheet } from "@/components/submit-sheet";
import { NotificationsSheet } from "@/components/notifications-sheet";
import { SubmitSheetProvider, useSubmitSheet } from "@/lib/use-submit-sheet";
import { usePermissions } from "@/lib/use-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotifications } from "@/lib/lists.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <SubmitSheetProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background text-foreground">
            <AppSidebar />
            <SidebarInset>
              <Header />
              <main className="min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
                <Outlet />
              </main>
            </SidebarInset>
          </div>
          <SheetMounts />
        </SidebarProvider>
      </SubmitSheetProvider>
    </TooltipProvider>
  );
}

function Header() {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const { setOpen } = useSubmitSheet();
  const { data: perms } = usePermissions();
  const canSubmit = perms?.has("submission.create");
  const fetchNotifs = useServerFn(listNotifications);
  const notifQ = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifs(),
    refetchInterval: 60_000,
  });
  const unread = notifQ.data?.unread ?? 0;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search videos, creators, tags…"
              className="h-9 w-full rounded-md border bg-card pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canSubmit ? (
            <Button size="sm" variant="default" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Submit</span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="ghost" disabled>
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Submit</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>You need the Contributor role to submit.</TooltipContent>
            </Tooltip>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="relative"
            onClick={() => setNotifOpen(true)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-medium leading-none text-background">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
            <UserCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </Button>
        </div>
      </header>
      <ProfileSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}

function SheetMounts() {
  const { open, setOpen } = useSubmitSheet();
  return <SubmitSheet open={open} onOpenChange={setOpen} />;
}

export { ChevronRight as Chevron, Link as RouterLink };
