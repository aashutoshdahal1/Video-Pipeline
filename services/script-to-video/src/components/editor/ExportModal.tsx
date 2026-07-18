import { useEffect, useRef, useState } from "react";
import { Check, Download, FileVideo, Loader2, Settings2, Smartphone, Monitor, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditor } from "./editor-context";

type AspectMode = "landscape" | "shorts";
type Resolution = "720p" | "1080p";
type Format = "MP4" | "MOV" | "WebM";
type ExportPhase = "idle" | "exporting" | "done" | "error";

const RESOLUTION_META: Record<AspectMode, Record<Resolution, { dims: string; note: string }>> = {
  landscape: {
    "720p":  { dims: "1280 × 720",  note: "faster render" },
    "1080p": { dims: "1920 × 1080", note: "best quality" },
  },
  shorts: {
    "720p":  { dims: "720 × 1280",  note: "faster render" },
    "1080p": { dims: "1080 × 1920", note: "best quality" },
  },
};

// Maps (aspectMode, resolution) → the export resolution key sent to server
const EXPORT_RES_KEY: Record<AspectMode, Record<Resolution, string>> = {
  landscape: { "720p": "720p",          "1080p": "1080p" },
  shorts:    { "720p": "720p-vertical", "1080p": "1080p-vertical" },
};

const FORMAT_EXT: Record<Format, string> = {
  MP4: "mp4",
  MOV: "mov",
  WebM: "webm",
};

export default function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const { startExport, clips, totalDuration, refreshLibrary } = useEditor();

  const [aspectMode, setAspectMode] = useState<AspectMode>("landscape");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [format, setFormat] = useState<Format>("MP4");
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showSavedAnimation, setShowSavedAnimation] = useState(false);

  // Simulated progress ticker — advances toward 90% while waiting for real export,
  // then jumps to 100% when startExport resolves.
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  // Reset everything when modal closes
  useEffect(() => {
    if (!open) {
      clearTicker();
      setPhase("idle");
      setProgress(0);
      setExportUrl(null);
      setErrorMsg(null);
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => () => clearTicker(), []);

  const eta = Math.max(0, Math.ceil(((100 - progress) / 100) * (totalDuration * 1.5)));

  const handleExport = async () => {
    if (!clips.length) return;

    setPhase("exporting");
    setProgress(0);
    setExportUrl(null);
    setErrorMsg(null);

    // Simulated progress: crawl to 90% over ~8s, then stall waiting for real result
    tickerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          clearTicker();
          return 90;
        }
        // accelerate early, decelerate near 90%
        const step = p < 50 ? 3 : p < 75 ? 1.5 : 0.5;
        return Math.min(90, p + step);
      });
    }, 180);

    try {
      const url = await startExport(EXPORT_RES_KEY[aspectMode][resolution] as Parameters<typeof startExport>[0]);
      clearTicker();

      if (url) {
        setProgress(100);
        setExportUrl(url);
        setPhase("done");
        // Show saved animation and refresh library
        setShowSavedAnimation(true);
        refreshLibrary();
        // Hide animation after 3 seconds
        setTimeout(() => setShowSavedAnimation(false), 3000);
      } else {
        // startExport returned nothing — treat as error
        setPhase("error");
        setErrorMsg("Export returned no file. Please try again.");
        setProgress(0);
      }
    } catch (err) {
      clearTicker();
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
      setProgress(0);
    }
  };

  const handleDownload = () => {
    if (!exportUrl || downloading) return;
    const fileName = `export_${resolution}${aspectMode === "shorts" ? "_shorts" : ""}.${FORMAT_EXT[format]}`;
    setDownloading(true);

    // Download via fetch so cross-origin `download` attribute isn't ignored
    // (this currently causes navigation/redirect to the `/outputs/...` URL).
    void (async () => {
      try {
        const resp = await fetch(exportUrl);
        if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Let the browser start the download before cleanup.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        setPhase("error");
        setErrorMsg(err instanceof Error ? err.message : "Download failed");
      } finally {
        setDownloading(false);
      }
    })();
  };

  const handlePreview = () => {
    if (!exportUrl) return;
    // Open exported file directly (browser will play/preview the video).
    window.open(exportUrl, "_blank", "noopener,noreferrer");
  };

  const canExport = clips.length > 0 && phase !== "exporting";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (phase !== "exporting") onOpenChange(v); }}>
      <DialogContent className="glass max-w-md border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-white">
              <Download className="h-4 w-4" />
            </span>
            Export Video
          </DialogTitle>
          <DialogDescription>
            Choose output settings, then render your final cut.
            {clips.length === 0 && (
              <span className="ml-1 text-destructive">Add clips to the timeline first.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Aspect / Format ───────────────────────────────────── */}
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

          {/* ── Resolution ────────────────────────────────────────── */}
          <fieldset disabled={phase === "exporting"} className="space-y-2">
            <legend className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" /> Resolution
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["720p", "1080p"] as Resolution[]).map((r) => (
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
                    {RESOLUTION_META[aspectMode][r].dims} · {RESOLUTION_META[aspectMode][r].note}
                  </div>
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── Format ────────────────────────────────────────────── */}
          <fieldset disabled={phase === "exporting"} className="space-y-2">
            <legend className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileVideo className="h-3.5 w-3.5" /> Format
            </legend>
            <div className="flex gap-1.5">
              {(["MP4", "MOV", "WebM"] as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-all ${
                    format === f
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── Progress / status ─────────────────────────────────── */}
          {phase !== "idle" && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-card/50 p-3">
              {/* Status line */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {phase === "exporting" && "Rendering…"}
                  {phase === "done" && "Export complete"}
                  {phase === "error" && "Export failed"}
                </span>
                {phase === "exporting" && (
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {Math.round(progress)}% · ~{eta}s remaining
                  </span>
                )}
                {phase === "done" && (
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {resolution} · {format}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {(phase === "exporting" || phase === "done") && (
                <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 gradient-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {/* Done state */}
              {phase === "done" && (
                <div className="flex items-center gap-1.5 text-[11px] text-accent">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Ready to download · {resolution} · {format}
                  </span>
                </div>
              )}

              {/* Error state */}
              {phase === "error" && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* Saved Animation */}
          {showSavedAnimation && (
            <div className="flex items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5 animate-pulse" />
                <span className="text-sm font-medium">Video saved successfully!</span>
              </div>
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
            // ── Download dropdown: Preview or Download ─────────────
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={downloading}
                  className="gradient-primary border-0 text-white shadow-glow"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {downloading ? "Preparing…" : `Download ${resolution}${aspectMode === "shorts" ? " Shorts" : ""} ${format}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handlePreview();
                  }}
                >
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDownload();
                  }}
                  disabled={downloading}
                >
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // ── Export / retry button ─────────────────────────────
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