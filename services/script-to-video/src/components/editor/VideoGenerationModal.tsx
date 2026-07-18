import { useState } from "react";
import { Wand2, X, Sparkles, Loader2, Video, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipCard } from "@/components/app/ClipCard";
import api from '@/lib/api';
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveToLibrary?: (clip: any) => void;
};

const samples = [
  "A drone glides over misty mountains as the sun rises...",
  "In a busy city, a young entrepreneur opens her laptop...",
  "Waves crash on the shore as the camera pans to a quiet beach...",
];

export default function VideoGenerationModal({ open, onOpenChange, onSaveToLibrary }: Props) {
  // Tab: 'stock' = Pexels/Pixabay, 'ai' = Veo AI generation
  const [tab, setTab] = useState<'stock' | 'ai'>('stock');

  // Stock tab state
  const [script, setScript] = useState("");
  const [sceneMode, setSceneMode] = useState(false);
  const [sourceMode, setSourceMode] = useState<'all' | 'pexels' | 'pixabay'>('all');
  const [loading, setLoading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [sceneResults, setSceneResults] = useState<any[]>([]);

  // AI (Veo) tab state
  const [veoPrompt, setVeoPrompt] = useState("");
  const [veoAspect, setVeoAspect] = useState<'landscape' | 'portrait'>('landscape');
  const [veoQuality, setVeoQuality] = useState<'720p' | '1080p'>('720p');
  const [veoLoading, setVeoLoading] = useState(false);
  const [veoVideoUrl, setVeoVideoUrl] = useState<string | null>(null);

  const generate = async () => {
    if (!script.trim()) {
      toast.error("Enter a script first");
      return;
    }
    try {
      setLoading(true);
      setHasResults(false);
      if (sceneMode) {
        const sceneLines = script
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
          .map((line) => line.replace(/^scene\s*\d+\s*[:.-]?\s*/i, '').trim())
          .filter(Boolean);

        if (!sceneLines.length) {
          toast.error('Add at least one scene line');
          return;
        }

        const search = await api.searchSceneVideos(script, sceneLines, sourceMode);
        if (!search || !search.success) {
          toast.error(search?.message || 'Failed to fetch scene videos. Check API keys in Settings.');
          return;
        }

        const grouped = Array.isArray(search.scenes) ? search.scenes : [];
        setSceneResults(grouped);
        setHasResults(true);
        toast.success(`${grouped.length} scenes processed`);
      } else {
        const proc = await api.processScript(script);
        if (!proc || !proc.success) {
          toast.error('Failed to process script');
          return;
        }
        const { keywords, scenes } = proc;
        const query = scenes && scenes.length ? scenes[0] : script.slice(0, 120);
        const search = await api.searchVideosWithSource(query, keywords || [], sourceMode);
        if (!search || !search.success) {
          toast.error(search?.message || 'Failed to fetch videos. Check API keys in Settings.');
          return;
        }
        const res = search.results || [];
        setResults(res);
        setHasResults(true);
        toast.success(`${res.length} clips matched to your script`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generating videos');
    } finally {
      setLoading(false);
    }
  };

  const generateVeo = async () => {
    if (!veoPrompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    try {
      setVeoLoading(true);
      setVeoVideoUrl(null);
      toast.info("Generating AI video — this can take 30–90 seconds…");
      const result = await api.generateVeoVideo(veoPrompt.trim(), veoAspect, veoQuality);
      if (!result.success || !result.videoUrl) {
        throw new Error(result.message || "Generation failed — no video URL returned");
      }
      setVeoVideoUrl(result.videoUrl);
      toast.success("AI video ready!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate video");
    } finally {
      setVeoLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset all state
    setScript("");
    setSceneMode(false);
    setSourceMode('all');
    setLoading(false);
    setHasResults(false);
    setResults([]);
    setSceneResults([]);
    setVeoPrompt("");
    setVeoVideoUrl(null);
    setVeoLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[85vh] overflow-hidden border-border bg-background flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between pb-4 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="h-4 w-4 text-primary flex-shrink-0" />
            <DialogTitle className="text-lg truncate">Generate Videos from Script</DialogTitle>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto flex-1 pr-2 min-h-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl border border-border bg-secondary/60 p-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setTab('stock')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                tab === 'stock' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Film className="h-3.5 w-3.5" /> Stock Clips
            </button>
            <button
              type="button"
              onClick={() => setTab('ai')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                tab === 'ai' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Video className="h-3.5 w-3.5" /> AI Generate (Veo)
            </button>
          </div>

          {/* AI Generate (Veo) tab */}
          {tab === 'ai' && (
            <div className="relative overflow-hidden rounded-2xl border border-border glass-strong p-4 shadow-card flex-shrink-0 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Video className="h-4 w-4 text-primary" />
                <span>AI Video Generation</span>
              </div>
              <Textarea
                value={veoPrompt}
                onChange={(e) => setVeoPrompt(e.target.value)}
                placeholder="Describe the video scene in detail, e.g. 'A cozy living room at sunset, golden light streaming through the window, cinematic warmth'"
                className="min-h-[100px] max-h-[180px] resize-none border-border bg-background/60 text-sm leading-relaxed focus-visible:ring-primary"
              />
              <div className="flex flex-wrap gap-3">
                {/* Aspect ratio */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/60 p-1 text-xs font-medium">
                  {(['landscape', 'portrait'] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setVeoAspect(a)}
                      className={`rounded-md px-2.5 py-1 transition ${
                        veoAspect === a ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {a === 'landscape' ? '16:9 Landscape' : '9:16 Portrait'}
                    </button>
                  ))}
                </div>
                {/* Quality */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/60 p-1 text-xs font-medium">
                  {(['720p', '1080p'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setVeoQuality(q)}
                      className={`rounded-md px-2.5 py-1 transition ${
                        veoQuality === q ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Generation takes ~30–90s. Uses free Veo API.</span>
                <Button
                  onClick={generateVeo}
                  disabled={veoLoading}
                  className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95"
                >
                  {veoLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate</>}
                </Button>
              </div>
              {veoLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Generating your video — polling for results…</span>
                </div>
              )}
              {veoVideoUrl && !veoLoading && (
                <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3">
                  <video
                    src={veoVideoUrl}
                    controls
                    className="w-full rounded-lg max-h-64"
                    poster=""
                  />
                  <div className="flex gap-2">
                    <a
                      href={veoVideoUrl}
                      download="veo_generated.mp4"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full text-xs">
                        Download MP4
                      </Button>
                    </a>
                    {onSaveToLibrary && (
                      <Button
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          onSaveToLibrary({ videoUrl: veoVideoUrl, title: veoPrompt.slice(0, 60), source: 'Veo AI' });
                          toast.success("Saved to library!");
                        }}
                      >
                        Save to Library
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls Section (Stock tab) */}
          {tab === 'stock' && <div className="relative overflow-hidden rounded-2xl border border-border glass-strong p-4 shadow-card flex-shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm font-semibold mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate">Script Input</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition whitespace-nowrap ${
                    sceneMode ? 'border-primary bg-primary text-primary-foreground shadow-glow' : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    setSceneMode((current) => !current);
                    setHasResults(false);
                    setResults([]);
                    setSceneResults([]);
                  }}
                >
                  {sceneMode ? 'Scene-by-scene ON' : 'Scene-by-scene OFF'}
                </button>
                <div className="flex items-center gap-1 rounded-full border border-border bg-secondary/60 p-1 text-xs font-medium">
                  {(['all', 'pexels', 'pixabay'] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setSourceMode(source)}
                      className={`rounded-full px-2 py-1 transition whitespace-nowrap ${
                        sourceMode === source ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {source === 'all' ? 'All' : source === 'pexels' ? 'Pexels' : 'Pixabay'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={sceneMode ? "Enter one scene per line, e.g.\nScene 1: Man walking in forest at night\nScene 2: Close-up of mysterious glowing object\nScene 3: Man shocked reaction" : "Paste your video script here..."}
              className="min-h-[80px] max-h-[150px] resize-none border-border bg-background/60 text-sm leading-relaxed focus-visible:ring-primary"
            />
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Try:</span>
              <div className="flex flex-wrap items-center gap-2">
                {samples.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScript(s)}
                    className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground truncate max-w-[150px] sm:max-w-none"
                    title={s}
                  >
                    {s.slice(0, 25)}...
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-xs text-muted-foreground order-2 sm:order-1">{script.length} characters</span>
              <Button onClick={generate} disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95 w-full sm:w-auto order-1 sm:order-2">
                <Sparkles className="mr-2 h-4 w-4" />
                {loading ? "Generating..." : "Generate Videos"}
              </Button>
            </div>
          </div>}

          {/* Results + empty state — stock tab only */}
          {tab === 'stock' && hasResults && (
            <div className="space-y-4 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-lg font-semibold">Results</h3>
                <span className="text-sm text-muted-foreground">
                  {!sceneMode ? `${results.length} clips` : `${sceneResults.length} scenes`}
                </span>
              </div>

              {loading && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="aspect-video rounded-lg bg-muted" />
                      <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
                      <div className="mt-1 h-3 w-1/2 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              )}

              {!loading && !sceneMode && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((c: any, i: number) => (
                    <ClipCard key={c.videoUrl || i} clip={{
                      id: c.videoUrl || String(i),
                      title: c.title || '',
                      thumbnail: c.thumbnail || '',
                      duration: c.duration || '',
                      source: c.source || 'Unknown',
                      tags: c.tags || [],
                      videoUrl: c.videoUrl || ''
                    }} />
                  ))}
                </div>
              )}

              {!loading && sceneMode && (
                <div className="space-y-4 sm:space-y-6">
                  {sceneResults.map((scene, index) => (
                    <section key={`${scene.scene}-${index}`} className="space-y-3 rounded-2xl border border-border bg-card/60 p-3 sm:p-4 shadow-card">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold truncate">Scene {index + 1}</h4>
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{scene.scene}</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary shrink-0">
                          {scene.count || 0} clips
                        </span>
                      </div>

                      {scene.error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {scene.error}
                        </div>
                      )}

                      {Array.isArray(scene.results) && scene.results.length > 0 ? (
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                          {scene.results.map((clip: any, clipIndex: number) => (
                            <ClipCard
                              key={`${scene.scene}-${clip.videoUrl || clipIndex}`}
                              clip={{
                                id: clip.videoUrl || String(clipIndex),
                                title: clip.title || '',
                                thumbnail: clip.thumbnail || '',
                                duration: clip.duration || '',
                                source: clip.source || 'Unknown',
                                tags: clip.tags || [],
                                videoUrl: clip.videoUrl || ''
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 sm:p-6 text-center text-sm text-muted-foreground">
                          No clips found for this scene.
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'stock' && !hasResults && !loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-vibrant text-white shadow-glow">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-base sm:text-lg">No videos yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Enter a script above and hit Generate to see AI-matched stock clips appear here.
              </p>
            </div>
          )}
          {/* Add bottom padding to ensure last results are fully visible */}
          <div className="pb-8" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
