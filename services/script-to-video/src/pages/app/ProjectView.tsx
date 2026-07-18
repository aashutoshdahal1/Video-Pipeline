import { useState } from "react";
import { ArrowLeft, Download, GripVertical, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipCard } from "@/components/app/ClipCard";
import { MOCK_SCENES } from "@/lib/data/clips";
import { toast } from "sonner";

export default function ProjectView() {
  const [scenes] = useState(() => {
    try {
      const raw = localStorage.getItem('lastProject');
      if (raw) {
        return JSON.parse(raw).scenes || MOCK_SCENES;
      }
    } catch (e) {
      // ignore
    }
    return MOCK_SCENES;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link to="/app" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">City Lights — Brand Story</h1>
          <p className="mt-1 text-sm text-muted-foreground">3 scenes · 9 clips selected · Updated just now</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            try {
              const projectsRaw = localStorage.getItem('projects');
              const projects = projectsRaw ? JSON.parse(projectsRaw) : [];
              projects.unshift({ id: Date.now(), title: 'Draft project', scenes });
              localStorage.setItem('projects', JSON.stringify(projects.slice(0, 20)));
              toast.success('Draft saved');
            } catch (e) {
              console.error(e);
              toast.error('Failed to save draft');
            }
          }}>Save Draft</Button>
          <Button onClick={() => toast("Export coming soon ✨")} className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
            <Download className="mr-2 h-4 w-4" /> Export Video
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border glass-strong p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> AI Scene Breakdown
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          We split your script into 3 scenes and extracted visual keywords for each.
        </p>
      </div>

      <div className="space-y-10">
        {scenes.map((scene, idx) => (
          <section key={scene.id} className="relative">
            <div className="absolute left-4 top-12 h-[calc(100%-3rem)] w-px bg-border md:left-6" aria-hidden />
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow md:h-12 md:w-12 md:text-base">
                {idx + 1}
              </div>
              <div className="flex-1 space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{scene.title}</h2>
                    <button className="text-muted-foreground hover:text-foreground" aria-label="Drag">
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm italic text-muted-foreground">"{scene.text}"</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {scene.keywords.map((k) => (
                      <Badge key={k} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">#{k}</Badge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {scene.clips.map((c) => <ClipCard key={c.id} clip={c} />)}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}