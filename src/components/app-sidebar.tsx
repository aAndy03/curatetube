import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Flag,
  Trophy,
  TrendingUp,
  FolderTree,
  Users2,
  Bookmark,
  Heart,
  Eye,
  ShieldCheck,
  Settings,
  Sparkles,
  ScrollText,
  SlidersHorizontal,
  Megaphone,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/lib/use-permissions";

const main = [
  { title: "Home", url: "/feed", icon: Home },
  { title: "Suggest Feed", url: "/suggest", icon: Flag },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { title: "Trending", url: "/trending", icon: TrendingUp },
  { title: "Categories", url: "/categories", icon: FolderTree },
  { title: "Creators", url: "/creators", icon: Users2 },
];

const personal = [
  { title: "Wishlist", url: "/me/wishlist", icon: Bookmark },
  { title: "Liked", url: "/me/liked", icon: Heart },
  { title: "Watched", url: "/me/watched", icon: Eye },
  { title: "Suggested", url: "/me/suggested", icon: Sparkles },
];

export function AppSidebar() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const { data: perms } = usePermissions();
  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  const showModeration = perms?.has("submission.view_queue");
  const showAdmin =
    perms?.isOwner ||
    perms?.has("role.edit") ||
    perms?.has("user.assign_role") ||
    perms?.has("settings.edit");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="px-2 py-1 text-sm font-semibold tracking-tight">
          CurateTube
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Browse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>You</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {personal.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showModeration ? (
          <SidebarGroup>
            <SidebarGroupLabel>Moderation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/moderation")}
                  >
                    <Link to="/moderation">
                      <ShieldCheck />
                      <span>Queue</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {showAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { url: "/admin/roles", icon: Settings, title: "Roles & Permissions" },
                  { url: "/admin/audit", icon: ScrollText, title: "Audit log", perm: "audit.view" },
                  { url: "/admin/recommendations", icon: SlidersHorizontal, title: "Recommendations", perm: "settings.edit" },
                  { url: "/admin/settings", icon: Settings, title: "App settings", perm: "settings.edit" },
                  { url: "/admin/broadcast", icon: Megaphone, title: "Broadcast", perm: "notification.broadcast" },
                ]
                  .filter((i) => !i.perm || perms?.has(i.perm) || perms?.isOwner)
                  .map((i) => (
                    <SidebarMenuItem key={i.url}>
                      <SidebarMenuButton asChild isActive={isActive(i.url)}>
                        <Link to={i.url}>
                          <i.icon />
                          <span>{i.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 text-[10px] text-muted-foreground">alpha0.3.2 · Plan 3 · Phase 2</p>
      </SidebarFooter>
    </Sidebar>
  );
}
