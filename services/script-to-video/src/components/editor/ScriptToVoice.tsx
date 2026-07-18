import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Plus, Loader2, Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "./editor-context";
import { toast } from "sonner";

interface Voice {
  id: string;
  name: string;
  gender: string;
  accent: string;
}

interface GeneratedAudio {
  blob: Blob;
  url: string;
  voiceId: string;
  script: string;
  voiceName: string;
  addedToTimeline?: boolean;
}

export default function ScriptToVoice() {
  const [script, setScript] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("voice-79");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [addingToTimeline, setAddingToTimeline] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const addToTimelineInFlightRef = useRef(false);
  
  const { addVoiceFile, voiceFiles } = useEditor();

  const stableHash = (input: string) => {
    // Simple, fast, deterministic hash (not cryptographic).
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  const nextAvailableTtsFilename = (baseName: string) => {
    const existing = new Set(voiceFiles.map((f) => f.name));
    if (!existing.has(baseName)) return baseName;
    const dot = baseName.lastIndexOf(".");
    const stem = dot >= 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot >= 0 ? baseName.slice(dot) : "";
    let i = 1;
    while (existing.has(`${stem}-${i}${ext}`)) i++;
    return `${stem}-${i}${ext}`;
  };

  // Load available voices
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const response = await fetch("http://localhost:5005/api/tts/voices");
        if (response.ok) {
          const data = await response.json();
          setVoices(data.voices || []);
        } else {
          toast.error("Failed to load voices");
        }
      } catch (error) {
        console.error("Error loading voices:", error);
        toast.error("Failed to load voices");
      } finally {
        setLoadingVoices(false);
      }
    };

    loadVoices();
  }, []);

  // Generate voice from script
  const generateVoice = async () => {
    if (!script.trim()) {
      toast.error("Please enter a script");
      return;
    }

    if (script.length > 5000) {
      toast.error("Script too long (max 5000 characters)");
      return;
    }

    setGenerating(true);
    
    try {
      const response = await fetch("http://localhost:5005/api/tts/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script,
          voice: selectedVoice,
          pitch: 0,
          rate: 0,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Voice generation failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const selectedVoiceData = voices.find(v => v.id === selectedVoice);
      
      const audio: GeneratedAudio = {
        blob,
        url,
        voiceId: selectedVoice,
        script,
        voiceName: selectedVoiceData?.name || "Unknown",
        addedToTimeline: false
      };

      setGeneratedAudio(audio);
      toast.success("Voice generated successfully");
    } catch (error) {
      console.error("Error generating voice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate voice");
    } finally {
      setGenerating(false);
    }
  };

  // Play/pause generated audio
  const togglePlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!generatedAudio || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Add generated audio to timeline
  const addToTimeline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!generatedAudio || addingToTimeline || generatedAudio.addedToTimeline) return;
    if (addToTimelineInFlightRef.current) return;

    addToTimelineInFlightRef.current = true;
    setAddingToTimeline(true);
    
    try {
      // Convert blob to File
      const key = `${generatedAudio.voiceId}::${generatedAudio.script}`;
      const baseName = `tts-${generatedAudio.voiceId}-${stableHash(key)}.mp3`;
      const name = nextAvailableTtsFilename(baseName);
      const file = new File([generatedAudio.blob], name, {
        type: "audio/mpeg"
      });

      addVoiceFile(file, { mode: "append" });
      
      // Mark as added to timeline
      setGeneratedAudio(prev => prev ? { ...prev, addedToTimeline: true } : null);
      
      toast.success("Voice added to timeline");
    } catch (error) {
      console.error("Error adding to timeline:", error);
      toast.error("Failed to add voice to timeline");
    } finally {
      setAddingToTimeline(false);
      addToTimelineInFlightRef.current = false;
    }
  };

  // Download generated audio
  const downloadAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!generatedAudio) return;

    const a = document.createElement("a");
    a.href = generatedAudio.url;
    a.download = `voice-${generatedAudio.voiceName}-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Cleanup audio URL when component unmounts
  useEffect(() => {
    return () => {
      if (generatedAudio?.url) {
        URL.revokeObjectURL(generatedAudio.url);
      }
    };
  }, [generatedAudio]);

  return (
    <div className={`glass rounded-2xl shadow-elegant transition-all duration-200 ${
      isExpanded 
        ? "flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 scrollbar-thin" 
        : "p-3"
    }`}>
      {/* Header - always visible */}
      <div 
        className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5" />
          Script to Voice
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </div>
      
      {/* Content - only visible when expanded */}
      {isExpanded && (
        <>
          <section className="space-y-2.5">
            <div className="space-y-2.5">
              {/* Voice Selection */}
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Voice
                </label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={loadingVoices || generating}
                  className="w-full rounded-lg border border-border/50 bg-card/40 px-2.5 py-1.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                >
                  {loadingVoices ? (
                    <option>Loading voices...</option>
                  ) : (
                    voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} ({voice.gender}, {voice.accent})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Script Input */}
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Script {script.length > 0 && `(${script.length}/5000)`}
                </label>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value.slice(0, 5000))}
                  placeholder="Enter your script here..."
                  disabled={generating}
                  className="w-full rounded-lg border border-border/50 bg-card/40 px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
                  rows={4}
                />
              </div>

              {/* Generate Button */}
              <Button
                onClick={generateVoice}
                disabled={!script.trim() || generating || loadingVoices}
                className="w-full"
                size="sm"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-1.5 h-3.5 w-3.5" />
                    Generate Voice
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Generated Audio Controls - only show when expanded */}
          {generatedAudio && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Play className="h-3.5 w-3.5" />
                Generated Audio
              </div>
              
              <div className="rounded-lg border border-border/50 bg-card/40 p-2.5">
                <div className="mb-2 text-xs text-muted-foreground">
                  Voice: {generatedAudio.voiceName}
                </div>
                <div className="mb-3 text-xs text-muted-foreground line-clamp-2">
                  {generatedAudio.script}
                </div>
                
                {/* Audio element (hidden) */}
                <audio
                  ref={audioRef}
                  src={generatedAudio.url}
                  onEnded={() => setIsPlaying(false)}
                  preload="metadata"
                />
                
                {/* Playback Controls */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={togglePlayback}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="mr-1 h-3 w-3" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 h-3 w-3" />
                        Play
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadAudio}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Save
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={addToTimeline}
                    disabled={addingToTimeline || generatedAudio?.addedToTimeline}
                    className={`${generatedAudio?.addedToTimeline ? 'bg-muted text-muted-foreground' : 'gradient-accent border-0 text-white'}`}
                  >
                    {addingToTimeline ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Adding...
                      </>
                    ) : generatedAudio?.addedToTimeline ? (
                      <>
                        <Plus className="mr-1 h-3 w-3" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1 h-3 w-3" />
                        Timeline
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
