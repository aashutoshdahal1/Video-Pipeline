import { useState } from "react";
import { Bookmark, Download, RefreshCw, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import api from '@/lib/api';
import type { Clip } from "@/lib/data/clips";

type ClipCardProps = {
  clip: Clip;
  onRemove?: () => void | Promise<void>;
  removeLabel?: string;
};

export function ClipCard({ clip, onRemove, removeLabel = 'Remove' }: ClipCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-smooth hover:-translate-y-1 hover:shadow-glow animate-scale-in">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img
          src={clip.thumbnail}
          alt={clip.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
        <button
          aria-label="Preview"
          onClick={() => clip.videoUrl ? setOpen(true) : toast.error('Video URL not available')}
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow backdrop-blur">
            <Play className="h-6 w-6 fill-current" />
          </span>
        </button>
        <Badge className="absolute right-2 top-2 bg-black/70 text-white hover:bg-black/70">
          {clip.duration}
        </Badge>
        <Badge variant="secondary" className="absolute left-2 top-2 glass-strong text-xs">
          {clip.source}
        </Badge>
      </div>

      <div className="space-y-3 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold">{clip.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {clip.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (!clip.videoUrl) {
                toast.error('Video URL not available');
                return;
              }
              setOpen(true);
            }}
          >
            <Play className="mr-1 h-3.5 w-3.5" /> Play
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              try {
                const { id, _id, ...payload } = clip as Clip & { _id?: string };
                await api.saveClip(payload);
                toast.success('Saved to library');
              } catch (err) {
                console.error(err);
                toast.error('Failed to save');
              }
            }}
          >
            <Bookmark className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              try {
                if (!clip.videoUrl) {
                  toast.error('Video URL not available');
                  return;
                }
                const link = document.createElement('a');
                link.href = clip.videoUrl;
                link.download = `${clip.title || 'video'}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Download started');
              } catch (err) {
                console.error(err);
                toast.error('Failed to download');
              }
            }}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Download
          </Button>
          {onRemove && (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              aria-label={removeLabel}
              onClick={async () => {
                try {
                  await onRemove();
                  toast.success('Removed from saved clips');
                } catch (err) {
                  console.error(err);
                  toast.error('Failed to remove');
                }
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="Replace" onClick={() => toast('Searching alternatives…')}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl border-border bg-background p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-left">{clip.title}</DialogTitle>
          <DialogDescription className="text-left">Preview the selected stock video without leaving the app.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <video
              key={clip.videoUrl}
              src={clip.videoUrl}
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
    </>
  );
}

export function ClipSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="aspect-video animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="flex gap-1.5">
          <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}