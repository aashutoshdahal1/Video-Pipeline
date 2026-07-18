import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/app/Dashboard";
import NewProject from "@/pages/app/NewProject";
import ProjectView from "@/pages/app/ProjectView";
import Library from "@/pages/app/Library";
import History from "@/pages/app/History";
import Settings from "@/pages/app/Settings";
import VideoEditor from "./pages/app/VideoEditor.tsx";
import TimelineEditor from "./pages/app/TimelineEditor.tsx";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="new" element={<NewProject />} />
              <Route path="project" element={<ProjectView />} />
              <Route path="library" element={<Library />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="video-editor" element={<VideoEditor />} />
              <Route path="timeline-editor" element={<TimelineEditor />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
