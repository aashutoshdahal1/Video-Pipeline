import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import TopBar from "@/components/editor/TopBar";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import Timeline from "@/components/editor/Timeline";
import ToolsPanel from "@/components/editor/ToolsPanel";
import ScriptToVoice from "@/components/editor/ScriptToVoice";
import { EditorProvider, useEditor, formatTime, type LibraryItem } from "@/components/editor/editor-context";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  Play,
  Film,
  ImageIcon,
  Search,
  Settings2,
  Check,
  Download,
  Loader2,
  X as XIcon,
  Plus,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Supported built-in filename convention patterns */
export type ConventionMode = "MM-SS" | "HH-MM-SS" | "custom";

export type ConventionConfig = {
  mode: ConventionMode;
  /** Custom regex pattern (used when mode === "custom"). Must have capturing groups for timestamp parts. */
  customPattern: string;
  /** Human-readable example for the current convention */
  example: string;
};

const DEFAULT_CONVENTION: ConventionConfig = {
  mode: "MM-SS",
  customPattern: "",
  example: "[00-00]_scene.mp4",
};

/** Parse a timestamp from a filename using the selected convention. Returns seconds or null. */
function parseTimestamp(filename: string, convention: ConventionConfig): number | null {
  if (convention.mode === "MM-SS") {
    const m = filename.match(/^\[(\d{2})-(\d{2})\]/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  if (convention.mode === "HH-MM-SS") {
    const m = filename.match(/^\[(\d{2})-(\d{2})-(\d{2})\]/);
    if (!m) return null;
    return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  }
  // custom
  try {
    const re = new RegExp(convention.customPattern);
    const m = filename.match(re);
    if (!m || m.length < 2) return null;
    if (m.length >= 4) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    if (m.length >= 3) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return parseInt(m[1], 10);
  } catch {
    return null;
  }
}

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isVideo(name: string) {
  return ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext(name));
}

// ── Scene type ────────────────────────────────────────────────────────────────

export type Scene = {
  id: string;
  file: File;
  objectUrl: string;
  filename: string;
  startSec: number | null;
  timelineSec: number;
  duration: number;
  type: "video" | "image";
  thumbnail: string;
  tag: string;
};

// ── Convention Settings Popover ───────────────────────────────────────────────

function ConventionSettings({
  convention,
  onChange,
}: {
  convention: ConventionConfig;
  onChange: (c: ConventionConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customPattern, setCustomPattern] = useState(convention.customPattern);
  const [example, setExample] = useState(convention.example);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Filename convention settings">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <p className="mb-3 text-sm font-semibold">Filename Convention</p>
        <div className="space-y-2">
          {(["MM-SS", "HH-MM-SS", "custom"] as ConventionMode[]).map((mode) => (
            <label
              key={mode}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                convention.mode === mode
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/60 hover:bg-secondary/50"
              }`}
            >
              <input
                type="radio"
                name="convention"
                value={mode}
                checked={convention.mode === mode}
                onChange={() => {
                  const examples: Record<ConventionMode, string> = {
                    "MM-SS": "[00-00]_scene.mp4",
                    "HH-MM-SS": "[01-02-30]_scene.mp4",
                    custom: convention.example,
                  };
                  onChange({ ...convention, mode, example: examples[mode] });
                }}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium font-mono">[{mode}]</span>
                {mode !== "custom" && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    e.g. <code className="text-primary">{mode === "MM-SS" ? "[00-07]" : "[01-02-30]"}_scene.mp4</code>
                  </p>
                )}
                {mode === "custom" && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">Supply a custom regex pattern</p>
                )}
              </div>
            </label>
          ))}
        </div>

        {convention.mode === "custom" && (
          <div className="mt-3 space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Regex pattern
            </label>
            <Input
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value)}
              placeholder="^\[(\d+)-(\d+)\]"
              className="h-8 font-mono text-xs"
            />
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Example filename
            </label>
            <Input
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="[00-30]_intro.mp4"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onChange({ mode: "custom", customPattern, example });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        )}

        {convention.mode !== "custom" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Current example: <code className="text-primary">{convention.example}</code>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── ScenesLibrary panel ───────────────────────────────────────────────────────

function ScenesLibrary({
  scenes,
  convention,
  onConventionChange,
  onAddFiles,
  onRemove,
  onClearAll,
  onAddToTimeline,
  isDraggingOver,
  onDragOver,
  onDragLeave,
  onDrop,
  fileInputRef,
  onFileInput,
}: {
  scenes: Scene[];
  convention: ConventionConfig;
  onConventionChange: (c: ConventionConfig) => void;
  onAddFiles: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onAddToTimeline: (scene: Scene) => void;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("all");

  const tags = useMemo(
    () => ["all", ...new Set(scenes.map((s) => s.tag))],
    [scenes]
  );

  const filtered = useMemo(
    () =>
      scenes.filter(
        (s) =>
          (tag === "all" || s.tag === tag) &&
          s.filename.toLowerCase().includes(q.toLowerCase())
      ),
    [scenes, q, tag]
  );

  const onDragStart = (e: React.DragEvent, scene: Scene) => {
    const item: LibraryItem = {
      id: scene.id,
      savedId: scene.id,
      name: scene.filename,
      duration: scene.duration,
      thumbnail: scene.thumbnail,
      tag: scene.tag,
      url: scene.objectUrl,
      source: "scene",
    };
    e.dataTransfer.setData("application/x-clip", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className={`glass flex h-full min-h-0 flex-col rounded-2xl shadow-elegant relative transition-all ${isDraggingOver ? "ring-2 ring-primary/60" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-semibold">Drop scenes here</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 p-4">
        <Film className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">Scenes</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {scenes.length}
        </span>
        <ConventionSettings convention={convention} onChange={onConventionChange} />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onAddFiles}
          aria-label="Add scenes"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        {scenes.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
            onClick={onClearAll}
            aria-label="Clear all scenes"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Search + tags */}
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search scenes..."
            className="h-9 border-border/60 bg-background/40 pl-8 text-sm"
          />
        </div>
        <div className="scrollbar-thin overflow-x-auto pb-0.5">
          <div className="flex gap-1.5" style={{ minWidth: "max-content" }}>
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition ${
                  tag === t
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="scrollbar-thin grid min-h-0 flex-1 grid-cols-2 gap-2.5 overflow-y-auto p-3 pt-0">
        {scenes.length === 0 && (
          <div
            className="col-span-2 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-card/30 py-10 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={onAddFiles}
          >
            <Upload className="h-8 w-8 opacity-40" />
            <div className="text-center text-sm">
              <p className="font-medium">Drop video/image files</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Name files like
                <br />
                <code className="font-mono text-primary">{convention.example}</code>
              </p>
            </div>
          </div>
        )}

        {filtered.map((scene) => (
          <div
            key={scene.id}
            draggable
            onDragStart={(e) => onDragStart(e, scene)}
            className="group relative cursor-grab overflow-hidden rounded-xl border border-border/60 bg-card/60 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow active:cursor-grabbing"
          >
            {/* Thumbnail */}
            <div
              className="relative aspect-video w-full"
              style={{
                background:
                  scene.thumbnail || scene.type === "image"
                    ? `url(${scene.thumbnail || scene.objectUrl}) center / cover no-repeat`
                    : "linear-gradient(135deg,#1f2937,#111827)",
              }}
            >
              <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
              {/* Remove button */}
              <button
                type="button"
                aria-label="Remove scene"
                className="absolute right-1.5 top-1.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md bg-destructive/85 text-destructive-foreground opacity-0 backdrop-blur transition-opacity hover:bg-destructive group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(scene.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
              {/* Play overlay (video only) */}
              {scene.type === "video" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow backdrop-blur">
                    <Play className="h-2 w-2 fill-current" />
                  </span>
                </div>
              )}
              {scene.type === "image" && (
                <ImageIcon className="absolute bottom-1.5 right-1.5 h-3 w-3 text-white/70 drop-shadow" />
              )}
            </div>

            {/* Duration badge */}
            <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              {scene.startSec != null ? formatTime(scene.startSec) : scene.duration.toFixed(1) + "s"}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-1 p-2">
              <div className="truncate text-[11px] font-medium" title={scene.filename}>
                {scene.filename}
              </div>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onAddToTimeline(scene)}
                  aria-label="Add to timeline"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {scenes.length > 0 && filtered.length === 0 && (
          <div className="col-span-2 py-12 text-center text-xs text-muted-foreground">
            No scenes match your search.
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        className="hidden"
        onChange={onFileInput}
      />
    </div>
  );
}

// ── Timeline Export Modal ─────────────────────────────────────────────────────

function TimelineExportModal({
  open,
  onOpenChange,
  scenes,
  onExport,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  scenes: Scene[];
  onExport: (res: string) => Promise<string>;
}) {
  type Resolution = "720p" | "1080p";
  type AspectMode = "landscape" | "shorts";
  type Phase = "idle" | "exporting" | "done" | "error";

  const EXPORT_RES_KEY: Record<AspectMode, Record<Resolution, string>> = {
    landscape: { "720p": "720p",          "1080p": "1080p" },
    shorts:    { "720p": "720p-vertical", "1080p": "1080p-vertical" },
  };

  const RESOLUTION_DIMS: Record<AspectMode, Record<Resolution, string>> = {
    landscape: { "720p": "1280 × 720",  "1080p": "1920 × 1080" },
    shorts:    { "720p": "720 × 1280",  "1080p": "1080 × 1920" },
  };

  const [aspectMode, setAspectMode] = useState<AspectMode>("landscape");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      clearTicker();
      setPhase("idle");
      setProgress(0);
      setExportUrl(null);
      setErrorMsg(null);
    }
  }, [open]);

  useEffect(() => () => clearTicker(), []);

  const handleExport = async () => {
    setPhase("exporting");
    setProgress(0);
    setExportUrl(null);
    setErrorMsg(null);

    tickerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          clearTicker();
          return 90;
        }
        const step = p < 50 ? 3 : p < 75 ? 1.5 : 0.5;
        return Math.min(90, p + step);
      });
    }, 200);

    try {
      const url = await onExport(EXPORT_RES_KEY[aspectMode][resolution]);
      clearTicker();
      setProgress(100);
      setExportUrl(url);
      setPhase("done");
      toast.success("Timeline export complete!");
    } catch (err) {
      clearTicker();
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Export failed");
      setProgress(0);
    }
  };

  const handleDownload = () => {
    if (!exportUrl || downloading) return;
    setDownloading(true);
    void (async () => {
      try {
        const resp = await fetch(exportUrl);
        if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `timeline_export_${resolution}${aspectMode === "shorts" ? "_shorts" : ""}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        setPhase("error");
        setErrorMsg(err instanceof Error ? err.message : "Download failed");
      } finally {
        setDownloading(false);
      }
    })();
  };

  const canExport = scenes.length > 0 && phase !== "exporting";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (phase !== "exporting") onOpenChange(v);
      }}
    >
      <DialogContent className="glass max-w-md border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-white">
              <Download className="h-4 w-4" />
            </span>
            Export Timeline
          </DialogTitle>
          <DialogDescription>
            Render {scenes.length} scene{scenes.length !== 1 ? "s" : ""} into a final video.
            {scenes.length === 0 && (
              <span className="ml-1 text-destructive">Add scenes first.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Aspect mode toggle */}
          <fieldset disabled={phase === "exporting"} className="space-y-2">
            <legend className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" /> Format
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAspectMode("landscape")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  aspectMode === "landscape"
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "border-border/60 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Monitor className="h-3.5 w-3.5 shrink-0" /> Landscape
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">16:9 · YouTube / standard</div>
              </button>
              <button
                type="button"
                onClick={() => setAspectMode("shorts")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  aspectMode === "shorts"
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "border-border/60 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" /> Shorts
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">9:16 · YouTube Shorts / Reels</div>
              </button>
            </div>
          </fieldset>

          {/* Resolution picker */}
          <fieldset disabled={phase === "exporting"} className="space-y-2">
            <legend className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" /> Resolution
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["720p", "1080p"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResolution(r)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    resolution === r
                      ? "border-primary bg-primary/10 shadow-glow"
                      : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{r}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {RESOLUTION_DIMS[aspectMode][r]} · {r === "720p" ? "faster render" : "best quality"}
                  </div>
                </button>
              ))}
            </div>
          </fieldset>

          {phase !== "idle" && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {phase === "exporting" && "Rendering…"}
                  {phase === "done" && "Export complete"}
                  {phase === "error" && "Export failed"}
                </span>
                {phase === "exporting" && (
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {Math.round(progress)}%
                  </span>
                )}
              </div>
              {(phase === "exporting" || phase === "done") && (
                <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 gradient-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {phase === "done" && (
                <div className="flex items-center gap-1.5 text-[11px] text-accent">
                  <Check className="h-3.5 w-3.5 shrink-0" /> Ready to download
                </div>
              )}
              {phase === "error" && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <XIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={phase === "exporting"}
          >
            {phase === "done" ? "Close" : "Cancel"}
          </Button>
          {phase === "done" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => exportUrl && window.open(exportUrl, "_blank", "noopener,noreferrer")}
              >
                Preview
              </Button>
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="gradient-primary border-0 text-white shadow-glow"
              >
                <Download className="mr-1.5 h-4 w-4" />
                {downloading ? "Preparing…" : `Download ${resolution}${aspectMode === "shorts" ? " Shorts" : ""}`}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleExport}
              disabled={!canExport}
              className="gradient-primary border-0 text-white shadow-glow"
            >
              {phase === "exporting" ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Exporting…
                </>
              ) : phase === "error" ? (
                "Retry Export"
              ) : (
                "Start Export"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inner content (inside EditorProvider) ────────────────────────────────────

function TimelineEditorContent({
  exportOpen,
  onExportOpenChange,
}: {
  exportOpen: boolean;
  onExportOpenChange: (v: boolean) => void;
}) {
  const {
    addToTimeline, addManyToTimeline, setPreviewIndex,
    voiceFiles, voiceSegments, voiceVolume, voiceMuted,
    musicFile, musicSegments, musicVolume,
  } = useEditor();

  // Keep refs so doTimelineExport always sees latest values without causing re-renders.
  // TimelineEditorContent should only re-render for its own local state, not audio state.
  const voiceFilesRef = useRef(voiceFiles);
  const voiceSegmentsRef = useRef(voiceSegments);
  const voiceVolumeRef = useRef(voiceVolume);
  const voiceMutedRef = useRef(voiceMuted);
  const musicFileRef = useRef(musicFile);
  const musicSegmentsRef = useRef(musicSegments);
  const musicVolumeRef = useRef(musicVolume);
  useEffect(() => { voiceFilesRef.current = voiceFiles; }, [voiceFiles]);
  useEffect(() => { voiceSegmentsRef.current = voiceSegments; }, [voiceSegments]);
  useEffect(() => { voiceVolumeRef.current = voiceVolume; }, [voiceVolume]);
  useEffect(() => { voiceMutedRef.current = voiceMuted; }, [voiceMuted]);
  useEffect(() => { musicFileRef.current = musicFile; }, [musicFile]);
  useEffect(() => { musicSegmentsRef.current = musicSegments; }, [musicSegments]);
  useEffect(() => { musicVolumeRef.current = musicVolume; }, [musicVolume]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [convention, setConvention] = useState<ConventionConfig>(DEFAULT_CONVENTION);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5005";

  // ── Load media metadata + thumbnail ──────────────────────────────────────
  const loadMedia = useCallback(
    (scene: Scene): Promise<Partial<Scene>> =>
      new Promise((resolve) => {
        if (scene.type === "video") {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.src = scene.objectUrl;
          v.onloadedmetadata = () => {
            v.currentTime = 0.1;
          };
          v.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 160;
            canvas.height = 90;
            canvas.getContext("2d")?.drawImage(v, 0, 0, 160, 90);
            const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
            const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5;
            resolve({ duration: dur, thumbnail });
            v.src = "";
          };
          v.onerror = () => resolve({ duration: 5, thumbnail: "" });
        } else {
          resolve({ duration: 5, thumbnail: scene.objectUrl });
        }
      }),
    []
  );

  // ── Transcode a video file to H.264 so Chrome can play it ───────────────
  // Returns a blob URL for the transcoded file; caller must revoke when done.
  const transcodeForPreview = useCallback(async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`${API_BASE}/api/editor/preview-clip`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`preview-clip ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }, [API_BASE]);

  // ── Process files ─────────────────────────────────────────────────────────
  const processFiles = useCallback(
    async (files: File[]) => {
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

      // Build initial scene list with original blob URLs
      const newScenes: Scene[] = sorted.map((file) => {
        const startSec = parseTimestamp(file.name, convention);
        const type = isVideo(file.name) ? "video" : "image";
        const tag = startSec != null ? formatTime(startSec) : "untimed";
        return {
          id: `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          objectUrl: URL.createObjectURL(file),
          filename: file.name,
          startSec,
          timelineSec: startSec ?? 0,
          duration: 5,
          type,
          thumbnail: "",
          tag,
        };
      });

      // For video scenes, transcode to H.264 so Chrome's demuxer can open them.
      // Replace objectUrl with the transcoded blob URL (original file stays in scene.file for export).
      const transcoded = await Promise.all(
        newScenes.map(async (scene) => {
          if (scene.type !== "video") return scene;
          try {
            const previewUrl = await transcodeForPreview(scene.file);
            URL.revokeObjectURL(scene.objectUrl); // free the original blob
            return { ...scene, objectUrl: previewUrl };
          } catch (err) {
            console.warn("[processFiles] transcode failed, falling back to original:", err);
            return scene; // keep original blob — may fail in Chrome if HEVC
          }
        })
      );

      const withMedia = await Promise.all(
        transcoded.map(async (scene) => {
          const info = await loadMedia(scene);
          return { ...scene, ...info };
        })
      );

      const resolved = withMedia.map((scene, idx) => {
        if (scene.startSec != null) return scene;
        if (idx === 0) return { ...scene, timelineSec: 0 };
        const prev = withMedia[idx - 1];
        return { ...scene, timelineSec: prev.timelineSec + prev.duration };
      });

      setScenes((prev) => {
        const existing = new Set(prev.map((s) => `${s.filename}-${s.file.size}`));
        const fresh = resolved.filter((s) => !existing.has(`${s.filename}-${s.file.size}`));
        return [...prev, ...fresh].sort((a, b) => a.timelineSec - b.timelineSec);
      });

      // Build all LibraryItems first, then add in one batch (no per-clip re-renders)
      const items: LibraryItem[] = resolved.map((scene, i) => {
        const next = resolved[i + 1];
        const slotDuration =
          next != null && next.timelineSec > scene.timelineSec
            ? next.timelineSec - scene.timelineSec
            : scene.duration;
        return {
          id: scene.id,
          savedId: scene.id,
          name: scene.filename,
          duration: Math.min(slotDuration, scene.duration),
          thumbnail: scene.thumbnail,
          tag: scene.tag,
          url: scene.objectUrl,
          source: "scene",
          mediaType: scene.type === "video" ? "video" : "image",
        };
      });

      if (items.length > 0) {
        addManyToTimeline(items);
        setPreviewIndex(0);
        toast.success(`Loaded ${items.length} scene${items.length > 1 ? "s" : ""}`);
      }
    },
    [loadMedia, transcodeForPreview, convention, addManyToTimeline, setPreviewIndex]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  // ── Drag & drop onto the Scenes panel or entire page ─────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = () => setIsDraggingOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("image/")
    );
    if (files.length) processFiles(files);
  };

  // ── Remove / clear ────────────────────────────────────────────────────────
  const removeScene = (id: string) => {
    setScenes((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.objectUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const clearScenes = () => {
    scenes.forEach((s) => URL.revokeObjectURL(s.objectUrl));
    setScenes([]);
  };

  // ── Manual "Add to timeline" from panel ──────────────────────────────────
  const addSceneToTimeline = (scene: Scene) => {
    const item: LibraryItem = {
      id: scene.id,
      savedId: scene.id,
      name: scene.filename,
      duration: scene.duration,
      thumbnail: scene.thumbnail,
      tag: scene.tag,
      url: scene.objectUrl,
      source: "scene",
    };
    addToTimeline(item);
    toast.success(`Added "${scene.filename}" to timeline`);
  };

  // ── Timeline export (sends local files to backend) ────────────────────────
  const doTimelineExport = async (resolution: string): Promise<string> => {
    const form = new FormData();
    const ordered = [...scenes].sort((a, b) => a.timelineSec - b.timelineSec);

    // Use the same consecutive slot-duration logic as the preview player so the
    // export duration matches what the user sees. Scenes follow each other with
    // no black gaps — slotDuration = gap-to-next (capped at actual duration).
    let cursor = 0;
    const clipsForExport = ordered.map((scene, i) => {
      const next = ordered[i + 1];
      const slotDuration =
        next != null && next.timelineSec > scene.timelineSec
          ? Math.min(next.timelineSec - scene.timelineSec, scene.duration)
          : scene.duration;
      const startSec = cursor;
      cursor += slotDuration;
      return {
        timelineSec: startSec,
        duration: slotDuration,
        type: scene.type,
        filename: scene.filename,
      };
    });
    form.append("clips", JSON.stringify(clipsForExport));
    form.append("resolution", resolution);

    for (const scene of ordered) {
      form.append("sceneFiles", scene.file, scene.filename);
    }

    // Voice
    for (const f of voiceFilesRef.current) {
      form.append("audioFiles", f, f.name);
    }
    if (voiceSegmentsRef.current.length > 0) {
      form.append("voiceSegments", JSON.stringify(voiceSegmentsRef.current));
    }
    form.append("voiceVolume", String(voiceVolumeRef.current));
    form.append("voiceMuted", voiceMutedRef.current ? "1" : "0");

    // Music
    if (musicFileRef.current) {
      form.append("musicFile", musicFileRef.current, musicFileRef.current.name);
    }
    if (musicSegmentsRef.current.length > 0) {
      form.append("musicSegments", JSON.stringify(musicSegmentsRef.current));
    }
    form.append("musicVolume", String(musicVolumeRef.current));

    const response = await fetch(`${API_BASE}/api/editor/timeline-export`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Export failed (${response.status})`);
    }

    const result = await response.json();
    if (!result.success) throw new Error(result.message || "Export failed");
    return result.absoluteUrl || `${API_BASE}${result.url}`;
  };

  useEffect(() => {
    if (exportOpen && scenes.length === 0) {
      toast.error("Add scenes to the timeline first");
      onExportOpenChange(false);
    }
  }, [exportOpen, scenes.length, onExportOpenChange]);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3 p-3">
        {/* Left: Scenes panel */}
        <aside className="col-span-3 min-h-0 min-w-0 xl:col-span-2">
          <ScenesLibrary
            scenes={scenes}
            convention={convention}
            onConventionChange={setConvention}
            onAddFiles={() => fileInputRef.current?.click()}
            onRemove={removeScene}
            onClearAll={clearScenes}
            onAddToTimeline={addSceneToTimeline}
            isDraggingOver={isDraggingOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
            onFileInput={handleFileInput}
          />
        </aside>

        {/* Center: Preview player */}
        <main className="col-span-6 flex min-h-0 min-w-0 flex-col xl:col-span-7">
          <PreviewPlayer />
        </main>

        {/* Right: Tools + Voice */}
        <aside className="col-span-3 min-h-0 min-w-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0 min-w-0">
            <ToolsPanel />
          </div>
          <div className="flex-shrink-0 min-w-0">
            <ScriptToVoice />
          </div>
        </aside>
      </div>

      {/* Bottom: shared Timeline strip */}
      <div className="px-3 pb-3 w-full min-w-0 shrink-0">
        <Timeline />
      </div>

      <TimelineExportModal
        open={exportOpen}
        onOpenChange={onExportOpenChange}
        scenes={scenes}
        onExport={doTimelineExport}
      />
    </>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

function TimelineEditorPage() {
  const [exportOpen, setExportOpen] = useState(false);
  const { theme, toggle } = useTheme();

  // We need access to scenes for the export — hoist exportOpen here and pass setter down
  // via a simple callback prop on TimelineEditorContent.
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        theme={theme}
        onToggleTheme={toggle}
        onExport={() => setExportOpen(true)}
      />
      <TimelineEditorContent exportOpen={exportOpen} onExportOpenChange={setExportOpen} />
    </div>
  );
}

export default function TimelineEditor() {
  return (
    <EditorProvider persistKey="editor:timeline-editor:v1">
      <TimelineEditorPage />
    </EditorProvider>
  );
}
