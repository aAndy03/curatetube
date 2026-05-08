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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <SidebarInset>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" disabled>
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Submit</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Submission flow ships in Phase 2
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" disabled>
                      <Bell className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Notifications — Phase 3</TooltipContent>
                </Tooltip>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSettingsOpen(true)}
                >
                  <UserCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile</span>
                </Button>
              </div>
            </header>
            <main className="min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <ProfileSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

// Re-export breadcrumb chevron in case child screens want it
export { ChevronRight as Chevron, Link as RouterLink };
