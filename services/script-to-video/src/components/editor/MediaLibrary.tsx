import { useMemo, useState } from "react";
import { Film, Plus, RefreshCw, Search, Trash2, Play, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useEditor, formatTime, type LibraryItem } from "./editor-context";
import VideoGenerationModal from "./VideoGenerationModal";

export default function MediaLibrary() {
  const { library, addToTimeline, loadingLibrary, removeLibraryItem, refreshLibrary } = useEditor();
  const [q, setQ] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const tags = useMemo(() => ["all", ...new Set(library.map((item) => item.tag.toLowerCase()))], [library]);
  const [tag, setTag] = useState("all");

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const previousLibrary = new Set(library.map(item => item.id));
    await refreshLibrary();
    // Check for new items
    const newItems = library.filter(item => !previousLibrary.has(item.id));
    if (newItems.length > 0) {
      setRecentlyAdded(new Set(newItems.map(item => item.id)));
      // Clear highlight after 3 seconds
      setTimeout(() => setRecentlyAdded(new Set()), 3000);
    }
    setIsRefreshing(false);
  };

  const handlePreview = (item: LibraryItem) => {
    if (!item.url) return;
    setSelectedItem(item);
    setPreviewOpen(true);
  };

  const items = useMemo(
    () =>
      library.filter(
        (i) =>
          (tag === "all" || i.tag.toLowerCase() === tag) &&
          i.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [library, q, tag],
  );

  const onDragStart = (e: React.DragEvent, item: LibraryItem) => {
    e.dataTransfer.setData("application/x-clip", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl shadow-elegant">
      <div className="flex items-center gap-2 border-b border-border/50 p-4">
        <Film className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">Saved Videos</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {library.length}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="Refresh library"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClick={() => setGenerationModalOpen(true)}
            placeholder="Search or generate videos..."
            className="h-9 border-border/60 bg-background/40 pl-8 text-sm cursor-pointer hover:border-primary/50 transition-colors"
            readOnly={false}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 shrink-0"
            onClick={() => setGenerationModalOpen(true)}
            aria-label="Generate videos"
          >
            <Wand2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition ${
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

      <div className="scrollbar-thin grid min-h-0 flex-1 grid-cols-2 gap-2.5 overflow-y-auto p-3 pt-0">
        {loadingLibrary && (
          <div className="col-span-2 py-12 text-center text-xs text-muted-foreground">Loading saved clips...</div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            onClick={() => handlePreview(item)}
            className={`group relative cursor-grab overflow-hidden rounded-xl border border-border/60 bg-card/60 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow active:cursor-grabbing ${
              recentlyAdded.has(item.id) ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-background animate-pulse' : ''
            }`}
          >
            <div
              className="relative aspect-video w-full"
              style={{
                background: item.thumbnail
                  ? `url(${item.thumbnail}) center / cover no-repeat`
                  : "linear-gradient(135deg,#1f2937,#111827)",
              }}
            >
              <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
              <button
                type="button"
                aria-label="Remove saved clip"
                className="absolute right-1.5 top-1.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md bg-destructive/85 text-destructive-foreground opacity-0 backdrop-blur transition-opacity hover:bg-destructive group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeLibraryItem(item.savedId);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <button
                aria-label="Preview video"
                className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(item);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow backdrop-blur">
                  <Play className="h-2 w-2 fill-current" />
                </span>
              </button>
            </div>
            <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              {formatTime(item.duration)}
            </div>
            <div className="flex items-center justify-between gap-1 p-2">
              <div className="truncate text-[11px] font-medium">{item.name}</div>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => addToTimeline(item)}
                  aria-label="Add to timeline"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 text-destructive"
                  onClick={() => void removeLibraryItem(item.savedId)}
                  aria-label="Delete saved clip"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!loadingLibrary && items.length === 0 && (
          <div className="col-span-2 py-12 text-center text-xs text-muted-foreground">
            No clips match your search.
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl border-border bg-background p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-left">{selectedItem?.name}</DialogTitle>
            <DialogDescription className="text-left">Preview the selected saved video without leaving the editor.</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="overflow-hidden rounded-xl border border-border bg-black">
              <video
                key={selectedItem?.url}
                src={selectedItem?.url || ''}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="h-full w-full max-h-[70vh] min-h-[320px] object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Generation Modal */}
      <VideoGenerationModal 
        open={generationModalOpen} 
        onOpenChange={setGenerationModalOpen}
        onSaveToLibrary={(clip) => {
          // The library will be refreshed automatically when videos are saved
          refreshLibrary();
        }}
      />
    </div>
  );
}