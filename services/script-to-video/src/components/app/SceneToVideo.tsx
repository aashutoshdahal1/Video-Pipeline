import { useState, useCallback } from "react";
import { Film, Mic, Sparkles, Loader2, ArrowRight, Wand2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";

interface ParsedScene {
  id: number;
  sceneDescription: string;
  voiceScript: string;
}

interface SceneResult {
  scene: ParsedScene;
  video: {
    id: string;
    title: string;
    thumbnail: string;
    duration: string;
    source: string;
    tags: string[];
    videoUrl: string;
  } | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  status: 'pending' | 'searching' | 'generating_voice' | 'complete' | 'error';
  error?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5005";

const defaultVoiceId = "voice-79";

export default function SceneToVideo() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<SceneResult[]>([]);
  const [sourceMode, setSourceMode] = useState<'all' | 'pexels' | 'pixabay'>('all');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait' | null>(null); // 16:9 or 9:16

  // Parse input format: "Scene 1: earth Voice Script: something.. Scene 2: sky Voice Script: something.."
  const parseScenes = useCallback((text: string): ParsedScene[] => {
    const scenes: ParsedScene[] = [];
    
    // Match pattern: Scene X: <description> Voice Script: <script>
    // Support multiple scene formats and flexible spacing
    const sceneRegex = /Scene\s*(\d+)\s*[:\-]?\s*([^Vv][^\n]*)Voice\s*Script\s*[:\-]?\s*([^S][^\n]*)/gi;
    
    let match;
    let id = 1;
    
    while ((match = sceneRegex.exec(text)) !== null) {
      const sceneDescription = match[2].trim();
      const voiceScript = match[3].trim();
      
      if (sceneDescription && voiceScript) {
        scenes.push({
          id: id++,
          sceneDescription,
          voiceScript
        });
      }
    }

    // Fallback: Try alternative parsing if no matches
    if (scenes.length === 0) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      let currentScene: Partial<ParsedScene> = {};
      
      for (const line of lines) {
        const sceneMatch = line.match(/Scene\s*\d+\s*[:\-]?\s*(.+)/i);
        const voiceMatch = line.match(/Voice\s*Script\s*[:\-]?\s*(.+)/i);
        
        if (sceneMatch) {
          if (currentScene.sceneDescription && currentScene.voiceScript) {
            scenes.push({
              id: id++,
              sceneDescription: currentScene.sceneDescription,
              voiceScript: currentScene.voiceScript
            });
          }
          currentScene = { sceneDescription: sceneMatch[1].trim() };
        } else if (voiceMatch && currentScene.sceneDescription) {
          currentScene.voiceScript = voiceMatch[1].trim();
        }
      }
      
      // Add last scene
      if (currentScene.sceneDescription && currentScene.voiceScript) {
        scenes.push({
          id: id++,
          sceneDescription: currentScene.sceneDescription,
          voiceScript: currentScene.voiceScript
        });
      }
    }

    return scenes;
  }, []);

  // Search for the best matching video for a scene
  const searchBestVideo = async (sceneDescription: string): Promise<SceneResult['video']> => {
    try {
      const search = await api.searchVideosWithSource(sceneDescription, [], sourceMode, orientation);
      if (!search?.success || !search.results?.length) {
        return null;
      }
      
      // Use the first (best ranked) result
      const bestMatch = search.results[0];
      return {
        id: bestMatch.videoUrl || `scene-${Date.now()}`,
        title: bestMatch.title || sceneDescription,
        thumbnail: bestMatch.thumbnail || '',
        duration: bestMatch.duration || '15',
        source: bestMatch.source || 'Unknown',
        tags: bestMatch.tags || [],
        videoUrl: bestMatch.videoUrl || ''
      };
    } catch (error) {
      console.error('Error searching video:', error);
      return null;
    }
  };

  // Generate voice for a script
  const generateVoice = async (script: string): Promise<{ blob: Blob; url: string } | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/tts/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script,
          voice: defaultVoiceId,
          pitch: 0,
          rate: 0,
        }),
      });

      if (!response.ok) {
        throw new Error('TTS generation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      return { blob, url };
    } catch (error) {
      console.error('Error generating voice:', error);
      return null;
    }
  };

  // Process all scenes
  const processScenes = async () => {
    if (!input.trim()) {
      toast.error("Please enter scene descriptions with voice scripts");
      return;
    }

    const scenes = parseScenes(input);
    
    if (scenes.length === 0) {
      toast.error("No valid scenes found. Use format: Scene 1: description Voice Script: script text");
      return;
    }

    // Check API keys
    const hasPexels = !!localStorage.getItem('pexels_key');
    const hasPixabay = !!localStorage.getItem('pixabay_key');
    
    if (!hasPexels && !hasPixabay) {
      toast.error("Please add Pexels or Pixabay API key in Settings");
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: scenes.length });
    
    // Initialize results
    const initialResults: SceneResult[] = scenes.map(scene => ({
      scene,
      video: null,
      audioBlob: null,
      audioUrl: null,
      status: 'pending'
    }));
    setResults(initialResults);

    const processedResults: SceneResult[] = [];

    // Process each scene sequentially
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      setProgress({ current: i + 1, total: scenes.length });

      // Update status to searching
      setResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: 'searching' } : r
      ));

      // Search for video
      const video = await searchBestVideo(scene.sceneDescription);

      // Update status to generating voice
      setResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, video, status: 'generating_voice' } : r
      ));

      // Generate voice
      const voiceResult = await generateVoice(scene.voiceScript);

      processedResults.push({
        scene,
        video,
        audioBlob: voiceResult?.blob || null,
        audioUrl: voiceResult?.url || null,
        status: video && voiceResult ? 'complete' : 'error',
        error: !video ? 'No video found' : !voiceResult ? 'Voice generation failed' : undefined
      });

      // Update final status for this scene
      setResults(prev => prev.map((r, idx) => 
        idx === i ? processedResults[i] : r
      ));
    }

    setIsProcessing(false);
    toast.success(`Processed ${scenes.length} scenes`);
    
    return processedResults;
  };

  // Helper to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Add all results to video editor
  const addToEditor = async () => {
    const completedScenes = results.filter(r => r.status === 'complete' && r.video && r.audioBlob);
    
    if (completedScenes.length === 0) {
      toast.error("No completed scenes to add");
      return;
    }

    toast.loading("Preparing scenes for editor...");

    try {
      // Convert voice files to base64 for storage
      const voiceFilesBase64 = await Promise.all(
        completedScenes.map(async (r, index) => {
          const base64 = await blobToBase64(r.audioBlob!);
          return {
            name: `scene-${index + 1}-voice.mp3`,
            type: "audio/mpeg",
            data: base64
          };
        })
      );

      // Prepare data for editor
      const editorData = {
        clips: completedScenes.map((r, index) => ({
          id: `scene-${Date.now()}-${index}`,
          name: r.scene.sceneDescription,
          duration: parseInt(r.video!.duration) || 15,
          thumbnail: r.video!.thumbnail,
          tag: r.video!.source,
          trimStart: 0,
          trimEnd: parseInt(r.video!.duration) || 15,
          url: r.video!.videoUrl,
          source: r.video!.source,
          sceneId: r.scene.id,
          voiceScript: r.scene.voiceScript
        })),
        voiceFiles: voiceFilesBase64,
        projectName: `Scene Video - ${new Date().toLocaleDateString()}`
      };

      // Store in localStorage for editor to pick up
      localStorage.setItem('pendingEditorData', JSON.stringify(editorData));
      
      toast.dismiss();
      toast.success(`Added ${completedScenes.length} scenes to editor`);
      
      // Navigate to video editor
      navigate('/app/video-editor');
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to prepare scenes");
      console.error(error);
    }
  };

  const getStatusIcon = (status: SceneResult['status']) => {
    switch (status) {
      case 'searching':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'generating_voice':
        return <Mic className="h-4 w-4 animate-pulse text-primary" />;
      case 'complete':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <span className="text-destructive text-xs">!</span>;
      default:
        return <span className="text-muted-foreground text-xs">○</span>;
    }
  };

  const sampleInput = `Scene 1: Aerial view of misty mountains at sunrise Voice Script: Welcome to the journey of a lifetime, where nature's beauty unfolds before your eyes.
Scene 2: Ocean waves crashing on tropical beach Voice Script: Feel the rhythm of the ocean as we explore paradise on Earth.
Scene 3: Forest path with sunlight filtering through trees Voice Script: Walk with us through ancient forests where time stands still.`;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border glass-strong p-6 shadow-card">
        <div className="absolute inset-0 -z-10 mesh-bg opacity-60" />
        
        <div className="flex items-center justify-between gap-2 text-sm font-semibold mb-4">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" /> 
            Create Video from Scenes
          </div>
          <div className="flex items-center gap-2">
            {/* Aspect Ratio Selector */}
            <div className="flex items-center gap-1 rounded-full border border-border bg-secondary/60 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setOrientation(null)}
                className={`rounded-full px-2 py-1 transition ${orientation === null ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="Any ratio"
              >
                Any
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`rounded-full px-2 py-1 transition ${orientation === 'landscape' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="16:9 Landscape"
              >
                16:9
              </button>
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`rounded-full px-2 py-1 transition ${orientation === 'portrait' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="9:16 Portrait (Shorts/Reels)"
              >
                9:16
              </button>
            </div>
            
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Enter scenes in this format:
Scene 1: earth rotating in space Voice Script: Welcome to our beautiful planet Earth, home to billions of life forms.
Scene 2: ocean waves at sunset Voice Script: The ocean covers more than 70 percent of our planet's surface.`}
          className="min-h-[160px] resize-none border-border bg-background/60 text-sm leading-relaxed focus-visible:ring-primary"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try example:</span>
          <button
            onClick={() => setInput(sampleInput)}
            className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            Nature documentary scenes
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {input.length > 0 && (
              <span>
                {parseScenes(input).length} scene{parseScenes(input).length !== 1 ? 's' : ''} detected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isProcessing && (
              <span className="text-xs text-muted-foreground">
                Processing {progress.current} of {progress.total}...
              </span>
            )}
            <Button 
              onClick={processScenes} 
              disabled={isProcessing || !input.trim()}
              className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate Scenes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Results Preview */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Scene Results</h3>
            <span className="text-sm text-muted-foreground">
              {results.filter(r => r.status === 'complete').length} of {results.length} ready
            </span>
          </div>

          <div className="space-y-3">
            {results.map((result, index) => (
              <div 
                key={result.scene.id} 
                className={`rounded-2xl border p-4 transition-all ${
                  result.status === 'complete' 
                    ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' 
                    : result.status === 'error'
                    ? 'border-destructive/30 bg-destructive/10'
                    : 'border-border bg-card/60'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 pt-1">
                    {getStatusIcon(result.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Scene {index + 1}</span>
                        {result.video && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            {result.video.source}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{result.scene.sceneDescription}</p>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <Mic className="h-3 w-3 text-muted-foreground mt-0.5" />
                      <p className="text-xs text-muted-foreground line-clamp-2">{result.scene.voiceScript}</p>
                    </div>

                    {result.error && (
                      <p className="text-xs text-destructive">{result.error}</p>
                    )}

                    {result.video && (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="relative aspect-video w-24 rounded-lg overflow-hidden bg-muted">
                          {result.video.thumbnail ? (
                            <img 
                              src={result.video.thumbnail} 
                              alt={result.video.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <Film className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{result.video.title}</p>
                          <p className="text-xs text-muted-foreground">{result.video.duration}s • {result.video.source}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {results.some(r => r.status === 'complete') && !isProcessing && (
            <Button 
              onClick={addToEditor}
              className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Add to Video Editor & Export
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
