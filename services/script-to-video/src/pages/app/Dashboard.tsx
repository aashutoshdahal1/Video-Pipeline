import { useState, useEffect } from "react";
import { Sparkles, Wand2, FolderOpen, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClipCard, ClipSkeleton } from "@/components/app/ClipCard";
import { MOCK_CLIPS } from "@/lib/data/clips";
import SceneToVideo from "@/components/app/SceneToVideo";
import api from '@/lib/api';
import { toast } from "sonner";

const samples = [
  "A drone glides over misty mountains as the sun rises…",
  "In a busy city, a young entrepreneur opens her laptop…",
  "Waves crash on the shore as the camera pans to a quiet beach…",
];

const getDefaultStats = () => [
  { label: "Projects", value: "0", icon: FolderOpen, trend: "" },
  { label: "Clips saved", value: "0", icon: Sparkles, trend: "" },
  { label: "Hours saved", value: "0h", icon: Clock, trend: "" },
  { label: "Generations", value: "0", icon: TrendingUp, trend: "" },
];

export default function Dashboard() {
  const [script, setScript] = useState("");
  const [sceneMode, setSceneMode] = useState(false);
  const [sourceMode, setSourceMode] = useState<'all' | 'pexels' | 'pixabay'>('all');
  const [loading, setLoading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [sceneResults, setSceneResults] = useState<any[]>([]);
  const [configStatus, setConfigStatus] = useState({ pexels: false, pixabay: false });
  const [stats, setStats] = useState(getDefaultStats());
  
  useEffect(() => {
    const sel = localStorage.getItem('selectedScript');
    if (sel) {
      setScript(sel);
      localStorage.removeItem('selectedScript');
    }
    // Check API key status
    setConfigStatus({
      pexels: !!localStorage.getItem('pexels_key'),
      pixabay: !!localStorage.getItem('pixabay_key'),
    });
    
    // Load real stats
    (async () => {
      try {
        const saved = await api.listSaved();
        const hist = localStorage.getItem('scriptHistory');
        const histArr = hist ? JSON.parse(hist) : [];
        
        setStats([
          { label: "Projects", value: String(histArr.length), icon: FolderOpen, trend: "" },
          { label: "Clips saved", value: String((saved && saved.items) ? saved.items.length : 0), icon: Sparkles, trend: "" },
          { label: "Hours saved", value: "0h", icon: Clock, trend: "" },
          { label: "Generations", value: String(histArr.length), icon: TrendingUp, trend: "" },
        ]);
      } catch (e) {
        console.warn('failed to load stats', e);
      }
    })();
  }, []);

  const generate = async () => {
    if (!script.trim()) {
      toast.error("Paste a script first");
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

        try {
          const histRaw = localStorage.getItem('scriptHistory');
          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ id: Date.now(), title: script.slice(0, 60), scenes: grouped.length, clips: grouped.reduce((sum, scene) => sum + (scene.count || 0), 0), when: new Date().toISOString(), script, sceneMode: true });
          localStorage.setItem('scriptHistory', JSON.stringify(hist.slice(0, 50)));
          setStats([
            { label: "Projects", value: String(hist.length), icon: FolderOpen, trend: "" },
            { label: "Clips saved", value: stats[1]?.value || "0", icon: Sparkles, trend: "" },
            { label: "Hours saved", value: "0h", icon: Clock, trend: "" },
            { label: "Generations", value: String(hist.length), icon: TrendingUp, trend: "" },
          ]);
        } catch (e) {
          console.warn('failed to write history', e);
        }
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
        // push to local history and reload stats
        try {
          const histRaw = localStorage.getItem('scriptHistory');
          const hist = histRaw ? JSON.parse(histRaw) : [];
          hist.unshift({ id: Date.now(), title: script.slice(0, 60), scenes: scenes.length || 0, clips: res.length, when: new Date().toISOString(), script, sceneMode: false });
          localStorage.setItem('scriptHistory', JSON.stringify(hist.slice(0, 50)));
          
          // update stats
          setStats([
            { label: "Projects", value: String(hist.length), icon: FolderOpen, trend: "" },
            { label: "Clips saved", value: stats[1]?.value || "0", icon: Sparkles, trend: "" },
            { label: "Hours saved", value: "0h", icon: Clock, trend: "" },
            { label: "Generations", value: String(hist.length), icon: TrendingUp, trend: "" },
          ]);
        } catch (e) {
          console.warn('failed to write history', e);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generating videos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back 👋</h1>
        <p className="mt-1 text-muted-foreground">Paste a script and watch it become a video board.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-bold">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border glass-strong p-6 shadow-card md:p-8">
        <div className="absolute inset-0 -z-10 mesh-bg opacity-60" />
        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Generate videos from script
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${sceneMode ? 'border-primary bg-primary text-primary-foreground shadow-glow' : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground'}`}
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
                  className={`rounded-full px-3 py-1 transition ${sourceMode === source ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
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
          placeholder={sceneMode ? "Enter one scene per line, e.g.\nScene 1: Man walking in forest at night\nScene 2: Close-up of mysterious glowing object\nScene 3: Man shocked reaction" : "Paste your video script here…"}
          className="mt-4 min-h-[180px] resize-none border-border bg-background/60 text-base leading-relaxed focus-visible:ring-primary"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => setScript(s)}
              className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {s.slice(0, 38)}…
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{script.length} characters</span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
              Source: {sourceMode === 'all' ? 'All' : sourceMode === 'pexels' ? 'Pexels' : 'Pixabay'}
            </span>
            {(!configStatus.pexels || !configStatus.pixabay) && (
              <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950">
                  ⚠️ Add API keys in Settings to fetch real videos
                </span>
            )}
            <Button onClick={generate} disabled={loading} className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
              <Sparkles className="mr-2 h-4 w-4" />
              {loading ? "Generating…" : "Generate Videos"}
            </Button>
          </div>
        </div>
      </div>

      {/* Scene to Video Section */}
      <section className="border-t border-border pt-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Scene-based Video Creation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create videos with matching scenes and auto-generated voiceovers
          </p>
        </div>
        <SceneToVideo />
      </section>

      <section className="border-t border-border pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Results</h2>
          {hasResults && <span className="text-sm text-muted-foreground">{results.length} clips</span>}
        </div>

        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <ClipSkeleton key={i} />)}
          </div>
        )}

        {!loading && hasResults && !sceneMode && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

        {!loading && hasResults && sceneMode && (
          <div className="space-y-8">
            {sceneResults.map((scene, index) => (
              <section key={`${scene.scene}-${index}`} className="space-y-4 rounded-3xl border border-border bg-card/60 p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Scene {index + 1}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{scene.scene}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {scene.count || 0} clips
                  </span>
                </div>

                {scene.error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {scene.error}
                  </div>
                )}

                {Array.isArray(scene.results) && scene.results.length > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
                    No clips found for this scene.
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {!loading && !hasResults && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 p-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-vibrant text-white shadow-glow animate-float">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold">No videos yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Paste a script above and hit Generate to see AI-matched stock clips appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}