import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Pause,
  Play,
  Plus,
  Scissors,
  Search,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5005";
const TAGS = ["all", "nature", "city", "people", "work", "ocean", "mountains", "night"];

type SavedItem = {
  _id: string;
  title?: string;
  videoUrl?: string;
  thumbnail?: string;
  duration?: string;
  source?: string;
  tags?: string[];
};

type TimelineClip = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  source: string;
  duration: number;
  start: number;
  end: number;
};

function parseDuration(raw?: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return parsed;
}

export default function NewProject() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [tag, setTag] = useState("all");
  const [query, setQuery] = useState("");

  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [playingSequence, setPlayingSequence] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sequenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const sequenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const previewIndexRef = useRef(0);
  const timelineRef = useRef<TimelineClip[]>([]);

  useEffect(() => {
    void fetchSaved();
  }, []);

  useEffect(() => {
    if (!audioFile) {
      setAudioPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  async function fetchSaved() {
    try {
      setSavedLoading(true);
      const response = await api.listSaved();
      if (response?.success) {
        setSaved(response.items || []);
      } else {
        setSaved([]);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load saved clips");
      setSaved([]);
    } finally {
      setSavedLoading(false);
    }
  }

  const filteredSaved = useMemo(() => {
    return saved.filter((item) => {
      const tags = item.tags || [];
      const title = (item.title || "").toLowerCase();
      const q = query.trim().toLowerCase();
      const tagMatch = tag === "all" || tags.includes(tag);
      const queryMatch =
        !q || title.includes(q) || tags.some((itemTag) => itemTag.toLowerCase().includes(q));
      return tagMatch && queryMatch;
    });
  }, [saved, tag, query]);

  const totalDuration = useMemo(() => {
    return timeline.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0);
  }, [timeline]);

  const selectedClip = useMemo(() => {
    return timeline.find((item) => item.id === selectedClipId) || timeline[0] || null;
  }, [timeline, selectedClipId]);

  const activePreviewClip = timeline[previewIndex] || null;

  useEffect(() => {
    if (!timeline.length) {
      setPreviewIndex(0);
      setPlayingSequence(false);
      return;
    }
    if (previewIndex > timeline.length - 1) {
      setPreviewIndex(0);
    }
  }, [timeline, previewIndex]);

  useEffect(() => {
    previewIndexRef.current = previewIndex;
  }, [previewIndex]);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  function hydrateDurationForClip(clipId: string, url: string) {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    const onLoaded = () => {
      const actual = probe.duration;
      if (Number.isFinite(actual) && actual > 0) {
        setTimeline((current) =>
          current.map((clip) => {
            if (clip.id !== clipId) return clip;
            const max = Number(actual.toFixed(2));
            const nextStart = Math.max(0, Math.min(clip.start, max - 0.2));
            const nextEnd = Math.max(nextStart + 0.2, Math.min(clip.end, max));
            return {
              ...clip,
              duration: max,
              start: Number(nextStart.toFixed(1)),
              end: Number(nextEnd.toFixed(1)),
            };
          })
        );
      }
      cleanup();
    };
    const onError = () => cleanup();
    const cleanup = () => {
      probe.removeEventListener("loadedmetadata", onLoaded);
      probe.removeEventListener("error", onError);
      probe.src = "";
    };
    probe.addEventListener("loadedmetadata", onLoaded);
    probe.addEventListener("error", onError);
  }

  useEffect(() => {
    if (!selectedClipId) return;
    const index = timeline.findIndex((clip) => clip.id === selectedClipId);
    if (index >= 0) setPreviewIndex(index);
  }, [selectedClipId, timeline]);

  function getElapsedInSequence(index: number, currentTime: number) {
    const before = timeline.slice(0, index).reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0);
    const current = timeline[index];
    if (!current) return before;
    const offset = Math.max(0, Math.min(currentTime, current.end) - current.start);
    return before + offset;
  }

  function syncVoiceoverTime() {
    const videoEl = sequenceVideoRef.current;
    const audioEl = sequenceAudioRef.current;
    if (!videoEl || !audioEl || !audioPreviewUrl || !timeline[previewIndex]) return;

    const elapsed = getElapsedInSequence(previewIndex, videoEl.currentTime);
    if (Math.abs(audioEl.currentTime - elapsed) > 0.35) {
      audioEl.currentTime = elapsed;
    }
  }

  async function startSequencePlayback() {
    if (!timeline.length) return;
    const videoEl = sequenceVideoRef.current;
    if (!videoEl) return;

    shouldAutoplayRef.current = true;
    setSelectedClipId(timeline[0]?.id || null);
    setPreviewIndex(0);
    setPlayingSequence(true);

    if (audioPreviewUrl && sequenceAudioRef.current) {
      sequenceAudioRef.current.currentTime = 0;
      await sequenceAudioRef.current.play().catch(() => undefined);
    }

    videoEl.currentTime = timeline[0].start;
    await videoEl.play().catch(() => undefined);
  }

  function pauseSequencePlayback() {
    sequenceVideoRef.current?.pause();
    sequenceAudioRef.current?.pause();
    setPlayingSequence(false);
  }

  function moveToNextClip() {
    const currentIndex = previewIndexRef.current;
    const list = timelineRef.current;
    if (currentIndex >= list.length - 1) {
      pauseSequencePlayback();
      return;
    }
    const nextIndex = currentIndex + 1;
    shouldAutoplayRef.current = true;
    setPreviewIndex(nextIndex);
    setSelectedClipId(list[nextIndex]?.id || null);
  }

  function onSequenceTimeUpdate() {
    const videoEl = sequenceVideoRef.current;
    const list = timelineRef.current;
    const clip = list[previewIndexRef.current];
    if (!videoEl || !clip) return;
    syncVoiceoverTime();
    if (videoEl.currentTime >= clip.end) {
      moveToNextClip();
    }
  }

  function onPreviewLoadedMetadata() {
    const videoEl = sequenceVideoRef.current;
    const clip = timeline[previewIndex];
    if (!videoEl || !clip) return;

    const actualDuration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : clip.duration;
    if (Math.abs(actualDuration - clip.duration) > 0.25) {
      setTimeline((current) =>
        current.map((item) => {
          if (item.id !== clip.id) return item;
          const newDuration = Number(actualDuration.toFixed(2));
          const newStart = Math.max(0, Math.min(item.start, newDuration - 0.2));
          const newEnd = Math.max(newStart + 0.2, Math.min(item.end, newDuration));
          return {
            ...item,
            duration: newDuration,
            start: Number(newStart.toFixed(1)),
            end: Number(newEnd.toFixed(1)),
          };
        })
      );
    }

    const startAt = Math.max(0, Math.min(clip.start, actualDuration - 0.2));
    videoEl.currentTime = startAt;

    if (playingSequence || shouldAutoplayRef.current) {
      void videoEl.play().catch(() => undefined);
      shouldAutoplayRef.current = false;
    }
  }

  function onPreviewPlay() {
    setPlayingSequence(true);
    if (!audioPreviewUrl || !sequenceAudioRef.current) return;
    syncVoiceoverTime();
    void sequenceAudioRef.current.play().catch(() => undefined);
  }

  function onPreviewPause() {
    sequenceAudioRef.current?.pause();
  }

  function addToTimeline(item: SavedItem) {
    if (!item.videoUrl) {
      toast.error("Clip has no playable URL");
      return;
    }

    const clipDuration = parseDuration(item.duration);
    const clip: TimelineClip = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: item.title || "Untitled clip",
      url: item.videoUrl,
      thumbnail: item.thumbnail || "",
      source: item.source || "saved",
      duration: clipDuration,
      start: 0,
      end: clipDuration,
    };

    setTimeline((current) => [...current, clip]);
    setSelectedClipId(clip.id);
    hydrateDurationForClip(clip.id, clip.url);
    if (timeline.length === 0) {
      setPreviewIndex(0);
    }
  }

  function updateTrim(clipId: string, [startRaw, endRaw]: number[]) {
    setTimeline((current) =>
      current.map((clip) => {
        if (clip.id !== clipId) return clip;
        const start = Math.max(0, Math.min(startRaw, clip.duration - 0.2));
        const end = Math.max(start + 0.2, Math.min(endRaw, clip.duration));
        return { ...clip, start: Number(start.toFixed(1)), end: Number(end.toFixed(1)) };
      })
    );

    const active = timeline.find((clip) => clip.id === clipId);
    if (active && timeline[previewIndex]?.id === clipId && sequenceVideoRef.current) {
      sequenceVideoRef.current.currentTime = Math.max(startRaw, 0);
    }
  }

  function moveClip(clipId: string, direction: -1 | 1) {
    setTimeline((current) => {
      const index = current.findIndex((clip) => clip.id === clipId);
      if (index === -1) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [clip] = next.splice(index, 1);
      next.splice(target, 0, clip);
      return next;
    });
  }

  function removeClip(clipId: string) {
    pauseSequencePlayback();
    setTimeline((current) => current.filter((clip) => clip.id !== clipId));
    if (selectedClipId === clipId) setSelectedClipId(null);
  }

  useEffect(() => {
    const videoEl = sequenceVideoRef.current;
    const clip = timeline[previewIndex];
    if (!videoEl || !clip) return;

    const jump = () => {
      videoEl.currentTime = clip.start;
      if (playingSequence || shouldAutoplayRef.current) {
        void videoEl.play().catch(() => undefined);
        shouldAutoplayRef.current = false;
      }
    };

    if (videoEl.readyState >= 1) {
      jump();
      return;
    }

    videoEl.addEventListener("loadedmetadata", jump, { once: true });
    return () => videoEl.removeEventListener("loadedmetadata", jump);
  }, [previewIndex, timeline, playingSequence]);

  async function removeSavedClip(id: string) {
    try {
      const result = await api.deleteSaved(id);
      if (result?.success) {
        setSaved((current) => current.filter((item) => item._id !== id));
        toast.success("Deleted from saved clips");
      } else {
        toast.error(result?.message || "Failed to delete clip");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete clip");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], `voiceover_${Date.now()}.webm`, { type: blob.type });
        setAudioFile(file);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.start();
      setRecording(true);
      toast.success("Recording started");
    } catch (error) {
      console.error(error);
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    toast.success("Voiceover recorded");
  }

  async function handleExport() {
    if (!timeline.length) {
      toast.error("Add at least one clip to timeline");
      return;
    }

    setExporting(true);
    setExportUrl("");

    try {
      const form = new FormData();
      form.append(
        "clips",
        JSON.stringify(
          timeline.map((clip) => ({
            url: clip.url,
            start: clip.start,
            end: clip.end,
          }))
        )
      );

      if (audioFile) {
        form.append("audioFile", audioFile, audioFile.name);
      }

      const response = await fetch(`${API_BASE}/api/editor/export`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.message || "Export failed");
      }

      const url = result.absoluteUrl || `${API_BASE}${result.url}`;
      setExportUrl(url);
      toast.success("Video exported");
    } catch (error) {
      console.error(error);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900 p-6 text-white shadow-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_50%)]" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Project - Video Editor</h1>
            <p className="mt-1 text-sm text-slate-300">CapCut-style timeline editing with voiceover and export.</p>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting || !timeline.length}
            className="bg-emerald-500 text-black hover:bg-emerald-400"
          >
            {exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div>
            <h2 className="text-xl font-semibold">Saved Clips</h2>
            <p className="mt-1 text-sm text-muted-foreground">Saved Library ready to reuse in timeline.</p>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clips by title or tag..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((itemTag) => (
                <button
                  key={itemTag}
                  onClick={() => setTag(itemTag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                    tag === itemTag
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  {itemTag}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedLoading && <p className="text-sm text-muted-foreground">Loading saved clips...</p>}

            {!savedLoading && filteredSaved.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No saved clips found.
              </div>
            )}

            {!savedLoading &&
              filteredSaved.map((clip) => (
                <div key={clip._id} className="overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="aspect-video bg-muted">
                    {clip.thumbnail ? (
                      <img src={clip.thumbnail} alt={clip.title || "clip"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Video className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-1 text-sm font-semibold">{clip.title || "Untitled clip"}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{clip.source || "saved"}</span>
                      <span>{clip.duration || "--"}s</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => addToTimeline(clip)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void removeSavedClip(clip._id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-xl font-semibold">Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Combined timeline preview with voiceover sync</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-black">
            {activePreviewClip ? (
              <video
                ref={sequenceVideoRef}
                key={`${activePreviewClip.id}-${previewIndex}`}
                src={activePreviewClip.url}
                controls
                onLoadedMetadata={onPreviewLoadedMetadata}
                onPlay={onPreviewPlay}
                onPause={onPreviewPause}
                onTimeUpdate={onSequenceTimeUpdate}
                onEnded={moveToNextClip}
                className="h-[280px] w-full object-contain"
              />
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No clips yet</div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3 text-sm">
            <div className="text-muted-foreground">
              {activePreviewClip
                ? `Clip ${previewIndex + 1} / ${timeline.length}: ${activePreviewClip.title}`
                : "Add clips to preview sequence"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void startSequencePlayback()} disabled={!timeline.length}>
                <Play className="mr-1 h-3.5 w-3.5" /> Play sequence
              </Button>
              <Button size="sm" variant="outline" onClick={pauseSequencePlayback} disabled={!playingSequence}>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4" /> Voiceover
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
            />
            <div className="text-sm text-muted-foreground">{audioFile ? audioFile.name : "No file chosen"}</div>
            {audioPreviewUrl && <audio ref={sequenceAudioRef} src={audioPreviewUrl} preload="metadata" />}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Upload
              </Button>
              {!recording ? (
                <Button onClick={() => void startRecording()}>
                  <Mic className="mr-2 h-4 w-4" /> Record
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopRecording}>
                  <Pause className="mr-2 h-4 w-4" /> Stop
                </Button>
              )}
            </div>
          </div>

          {exportUrl && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              Export complete: <a href={exportUrl} className="underline" target="_blank" rel="noreferrer">Download video</a>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Timeline</h2>
            <p className="mt-1 text-sm text-muted-foreground">Arrange, trim, and fine-tune your sequence.</p>
          </div>
          <div className="text-sm text-muted-foreground">{totalDuration.toFixed(1)}s total</div>
        </div>

        {timeline.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No clips yet. Add clips from Saved Clips.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {timeline.map((clip, index) => (
                <div
                  key={clip.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedClipId(clip.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedClipId(clip.id);
                    }
                  }}
                  className={`rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary ${
                    selectedClip?.id === clip.id ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="line-clamp-1 text-sm font-semibold">{index + 1}. {clip.title}</div>
                    <div className="text-xs text-muted-foreground">{(clip.end - clip.start).toFixed(1)}s</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, ((clip.end - clip.start) / clip.duration) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveClip(clip.id, -1);
                      }}
                    >
                      <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Left
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index === timeline.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveClip(clip.id, 1);
                      }}
                    >
                      <ArrowRight className="mr-1 h-3.5 w-3.5" /> Right
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeClip(clip.id);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {selectedClip && (
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Scissors className="h-4 w-4" /> Trim: {selectedClip.title}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedClip.start.toFixed(1)}s - {selectedClip.end.toFixed(1)}s
                  </span>
                </div>
                <Slider
                  min={0}
                  max={selectedClip.duration}
                  step={0.1}
                  value={[selectedClip.start, selectedClip.end]}
                  onValueChange={(value) => updateTrim(selectedClip.id, value)}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
