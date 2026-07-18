import { LayoutDashboard, Plus, Bookmark, History, Settings, VideoIcon, Clapperboard } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, end: true },
  { title: "New Project", url: "/app/new", icon: Plus },
  { title: "Saved Clips", url: "/app/library", icon: Bookmark },
  { title: "History", url: "/app/history", icon: History },
  { title: "Settings", url: "/app/settings", icon: Settings },
  { title: "Video Editor", url: "/app/video-editor", icon: VideoIcon },
  { title: "Timeline Editor", url: "/app/timeline-editor", icon: Clapperboard }
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (url: string, end?: boolean) =>
    end ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        {collapsed ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-vibrant shadow-glow">
            <span className="text-sm font-bold text-white">S</span>
          </div>
        ) : (
          <Logo />
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.end} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


      </SidebarContent>
    </Sidebar>
  );
}