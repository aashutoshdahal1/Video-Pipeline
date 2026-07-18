import { memo, useEffect, useRef, useState } from "react";
import { Check, Download, Moon, Redo2, Sparkles, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useEditor } from "./editor-context";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onExport: () => void;
};

export default memo(function TopBar({ theme, onToggleTheme, onExport }: Props) {
  const { projectName, updateProjectName, canUndo, canRedo, undo, redo } = useEditor();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(Date.now());
  const t = useRef<number | null>(null);

  useEffect(() => {
    setSaving(true);
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      setSaving(false);
      setSavedAt(Date.now());
    }, 700);
    return () => {
      if (t.current) window.clearTimeout(t.current);
    };
  }, [projectName]);

  return (
    <header className="glass z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-9 w-9" />
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Script2Video AI
          </div>
          <input
            value={projectName}
            onChange={(e) => updateProjectName(e.target.value)}
            className="w-56 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold text-foreground outline-none transition hover:border-border focus:border-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {saving ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Saving…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-accent" /> Saved · just now
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Undo" onClick={undo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Redo" onClick={redo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Toggle theme" onClick={onToggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Button
          onClick={onExport}
          className="gradient-primary border-0 text-white shadow-glow transition hover:opacity-95"
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>
    </header>
  );
});