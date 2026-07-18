import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const location = useLocation();
  const isVideoEditor =
    location.pathname === "/app/video-editor" ||
    location.pathname === "/app/timeline-editor";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background mesh-bg">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          {!isVideoEditor && (
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
              <SidebarTrigger />
              <div className="ml-2 hidden items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-sm text-muted-foreground md:flex md:w-72">
                <Search className="h-4 w-4" />
                <span>Search clips, projects…</span>
                <kbd className="ml-auto rounded bg-background px-1.5 py-0.5 text-xs">⌘K</kbd>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <ThemeToggle />
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                </Button>
                <div className="ml-2 h-8 w-8 rounded-full bg-gradient-vibrant ring-2 ring-background" />
              </div>
            </header>
          )}
          <main className={isVideoEditor ? "flex-1 flex flex-col min-w-0 relative" : "flex-1 p-4 md:p-8 animate-fade-in min-w-0"}>
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}