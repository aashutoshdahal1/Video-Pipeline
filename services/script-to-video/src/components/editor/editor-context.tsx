import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import api from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5005";
type ExportResolution = "720p" | "1080p" | "720p-vertical" | "1080p-vertical";
export type TransitionMode = "none" | "crossfade" | "wipe" | "zoom-in" | "zoom-out";

function parseDuration(raw?: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return parsed;
}

export type Clip = {
  id: string;
  name: string;
  duration: number;
  thumbnail: string;
  tag: string;
  trimStart: number;
  trimEnd: number;
  url: string;
  source: string;
  muted?: boolean;
  mediaType?: "video" | "image";
};

export type AudioSegment = {
  id: string;
  startTime: number; // seconds from sequence start
  endTime: number; // seconds from sequence start
  sourceIndex: number; // index into voiceFiles (used for preview/export)
};

export type LibraryItem = {
  id: string;
  name: string;
  duration: number;
  thumbnail: string;
  tag: string;
  url: string;
  source: string;
  savedId: string;
  mediaType?: "video" | "image";
};

type SavedItem = {
  _id: string;
  title?: string;
  videoUrl?: string;
  thumbnail?: string;
  duration?: string;
  source?: string;
  tags?: string[];
};

type EditorSnapshot = {
  clips: Clip[];
  selectedClipId: string | null;
  previewIndex: number;
  projectName: string;
};

type EditorState = {
  library: LibraryItem[];
  loadingLibrary: boolean;
  clips: Clip[];
  selectedClipId: string | null;
  previewIndex: number;
  setPreviewIndex: (n: number) => void;
  playheadTime: number;
  setPlayheadTime: (n: number) => void;
  /** Subscribe to high-frequency playhead ticks without causing React re-renders. */
  subscribePlayhead: (cb: (t: number) => void) => () => void;
  /** Broadcast a playhead time to all DOM subscribers — no React state update, zero re-renders. */
  notifyPlayhead: (t: number) => void;
  seekRequest: { time: number; id: number } | null;
  seekToTime: (n: number) => void;
  playingSequence: boolean;
  setPlayingSequence: (b: boolean) => void;
  zoom: number;
  voiceVolume: number;
  voiceMuted: boolean;
  // Voice track region placement on the sequence timeline.
  // The audio file is treated as starting at 0:00 inside the voice region.
  voiceStartTime: number; // seconds from sequence start
  voiceEndTime: number; // seconds from sequence start
  voiceDurations: number[]; // seconds per voiceFiles entry
  setVoiceStartTime: (n: number) => void;
  setVoiceEndTime: (n: number) => void;
  voiceSegments: AudioSegment[];
  setVoiceSegments: (segs: AudioSegment[]) => void;
  musicVolume: number;
  music: string | null;
  // Uploaded background music file (not persisted across refreshes).
  musicFile: File | null;
  musicPreviewUrl: string;
  setMusicFile: (f: File | null) => void;
  // Background music region placement on the sequence timeline.
  // The music file is treated as starting at 0:00 inside the music region.
  musicStartTime: number; // seconds from sequence start
  musicEndTime: number; // seconds from sequence start
  musicDuration: number; // seconds of the uploaded music file
  setMusicStartTime: (n: number) => void;
  setMusicEndTime: (n: number) => void;
  musicSegments: AudioSegment[];
  setMusicSegments: (segs: AudioSegment[]) => void;
  // Multiple voice sources (appended by the user).
  voiceFiles: File[];
  voicePreviewUrls: string[];
  recording: boolean;
  exporting: boolean;
  exportUrl: string;
  projectName: string;
  updateProjectName: (s: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  refreshLibrary: () => Promise<void>;
  removeLibraryItem: (savedId: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  addToTimeline: (item: LibraryItem) => void;
  addManyToTimeline: (items: LibraryItem[]) => void;
  removeClip: (id: string) => void;
  splitClip: (id: string) => void;
  reorderClip: (from: number, to: number) => void;
  // NOTE: does NOT push undo — callers (Timeline trim drag) push before dragging starts
  updateTrim: (id: string, start: number, end: number) => void;
  pushUndoSnapshot: () => void;
  moveClip: (clipId: string, direction: -1 | 1) => void;
  setZoom: (n: number) => void;
  setVoiceVolume: (n: number) => void;
  setVoiceMuted: (b: boolean) => void;
  setMusicVolume: (n: number) => void;
  setMusic: (s: string | null) => void;
  addVoiceFile: (f: File, opts?: { mode?: "append" | "replace" }) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  startExport: (resolution?: ExportResolution) => Promise<string | null>;
  totalDuration: number;
  clearAll: () => void;
  syncVoiceWithClips: () => void;
  toggleClipMute: (id: string) => void;
  transitions: Record<string, TransitionMode>;
  setTransitions: React.Dispatch<React.SetStateAction<Record<string, TransitionMode>>>;
  cycleTransition: (leftId: string, rightId: string) => void;
};

const Ctx = createContext<EditorState | null>(null);

// ── Playback context — holds only the fields that change on every clip advance ──
// Kept separate so TopBar, ToolsPanel, ScenesLibrary etc. do NOT re-render when
// the active clip changes. Only Timeline, PreviewPlayer, and ToolsPanel subscribe.
type PlaybackState = {
  selectedClipId: string | null;
  previewIndex: number;
  playingSequence: boolean;
};
const PlaybackCtx = createContext<PlaybackState>({ selectedClipId: null, previewIndex: 0, playingSequence: false });

export function EditorProvider({ children, persistKey: persistKeyProp }: { children: ReactNode; persistKey?: string }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [clips, setClips] = useState<Clip[]>([]);
  const [transitions, setTransitions] = useState<Record<string, TransitionMode>>({});
  const transitionsRef = useRef(transitions);
  useEffect(() => { transitionsRef.current = transitions; }, [transitions]);
  const [selectedClipId, setSelected] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<{ time: number; id: number } | null>(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Default to 100 so preview loudness matches raw downloaded/generated audio.
  const [voiceVolume, setVoiceVolume] = useState(100);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceStartTime, setVoiceStartTime] = useState(0);
  const [voiceEndTime, setVoiceEndTime] = useState(0);
  const [voiceSegments, setVoiceSegments] = useState<AudioSegment[]>([]);
  const [voiceDurations, setVoiceDurations] = useState<number[]>([]);
  const [musicVolume, setMusicVolume] = useState(35);
  const [music, setMusic] = useState<string | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicPreviewUrl, setMusicPreviewUrl] = useState("");
  const [musicStartTime, setMusicStartTime] = useState(0);
  const [musicEndTime, setMusicEndTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicSegments, setMusicSegments] = useState<AudioSegment[]>([]);
  const [voiceFiles, setVoiceFiles] = useState<File[]>([]);
  const [voicePreviewUrls, setVoicePreviewUrls] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState("");
  const [projectName, setProjectName] = useState("Untitled Project");
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const PERSIST_KEY = persistKeyProp ?? "editor:video-editor:v1";
  const hydratedFromStorageRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // ── Playhead event bus — subscribers receive ticks without React re-renders ──
  // rAF callers should use notifyPlayhead() instead of setPlayheadTime() for the
  // hot path; setPlayheadTime is throttled to ~6fps for the seek scrubber display.
  const playheadSubscribersRef = useRef<Set<(t: number) => void>>(new Set());
  const subscribePlayhead = useCallback((cb: (t: number) => void) => {
    playheadSubscribersRef.current.add(cb);
    return () => { playheadSubscribersRef.current.delete(cb); };
  }, []);
  const notifyPlayhead = useCallback((t: number) => {
    for (const cb of playheadSubscribersRef.current) cb(t);
  }, []);

  // ── Stable refs so callbacks always see latest values without re-creating ──
  const seekIdRef = useRef(0);
  const totalDurationRef = useRef(0);
  const playheadTimeRef = useRef(0);

  // Refs for snapshot — avoids stale closures inside setState callbacks
  const clipsRef = useRef(clips);
  const selectedClipIdRef = useRef(selectedClipId);
  const previewIndexRef = useRef(previewIndex);
  const projectNameRef = useRef(projectName);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { selectedClipIdRef.current = selectedClipId; }, [selectedClipId]);
  useEffect(() => { previewIndexRef.current = previewIndex; }, [previewIndex]);
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { playheadTimeRef.current = playheadTime; }, [playheadTime]);

  // ── Snapshot helpers (read from refs — always current) ──────────────────
  const createSnapshot = useCallback((): EditorSnapshot => ({
    clips: clipsRef.current.map((c) => ({ ...c })),
    selectedClipId: selectedClipIdRef.current,
    previewIndex: previewIndexRef.current,
    projectName: projectNameRef.current,
  }), []);

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setClips(snapshot.clips.map((c) => ({ ...c })));
    setSelected(snapshot.selectedClipId);
    setPreviewIndex(snapshot.previewIndex);
    setProjectName(snapshot.projectName);
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    const snapshot = createSnapshot();
    setUndoStack((cur) => [...cur.slice(-39), snapshot]);
    setRedoStack([]);
  }, [createSnapshot]);

  // ── Fix: snapshot captured before entering setState to avoid stale closure ──
  const undo = useCallback(() => {
    const current = createSnapshot(); // capture NOW, outside setState
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack((r) => [...r.slice(-39), current]);
      applySnapshot(previous);
      return stack.slice(0, -1);
    });
  }, [createSnapshot, applySnapshot]);

  const redo = useCallback(() => {
    const current = createSnapshot();
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [...u.slice(-39), current]);
      applySnapshot(next);
      return stack.slice(0, -1);
    });
  }, [createSnapshot, applySnapshot]);

  const updateProjectName = useCallback((nextName: string) => {
    if (nextName === projectNameRef.current) return;
    pushUndoSnapshot();
    setProjectName(nextName);
  }, [pushUndoSnapshot]);

  // ── Library init ──────────────────────────────────────────────────────────
  useEffect(() => { void refreshLibrary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore last editor state (clips + trims) ─────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) {
        hydratedFromStorageRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        hydratedFromStorageRef.current = true;
        return;
      }

      const restoredClips: Clip[] = Array.isArray(parsed.clips) ? parsed.clips : [];
      if (!Array.isArray(restoredClips) || restoredClips.length === 0) {
        // Still mark as hydrated so we can start persisting edits.
        hydratedFromStorageRef.current = true;
        return;
      }

      // Basic validation to avoid crashing on malformed storage.
      // Also drop blob: URLs — they are session-scoped and always dead after a reload.
      const safeClips = restoredClips
        .filter(
          (c) =>
            c &&
            typeof c === "object" &&
            typeof (c as any).id === "string" &&
            typeof (c as any).url === "string" &&
            !String((c as any).url).startsWith("blob:"),
        )
        .map((c) => {
          const rawDuration = Number((c as any).duration);
          const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : Number((c as any).trimEnd) || 0;
          const d = duration > 0 ? duration : 1;

          const rawTrimStart = Number((c as any).trimStart);
          const rawTrimEnd = Number((c as any).trimEnd);

          const trimStart = Math.max(0, Math.min(Number.isFinite(rawTrimStart) ? rawTrimStart : 0, d - 0.2));
          const trimEnd = Math.max(trimStart + 0.2, Math.min(Number.isFinite(rawTrimEnd) ? rawTrimEnd : d, d));

          return {
            ...(c as any),
            duration: d,
            trimStart,
            trimEnd,
          } as Clip;
        });

      setClips(safeClips);

      const restoredSelected = typeof parsed.selectedClipId === "string" ? parsed.selectedClipId : null;
      setSelected(restoredSelected);

      if (typeof parsed.projectName === "string") setProjectName(parsed.projectName);

      if (typeof parsed.zoom === "number") setZoom(parsed.zoom);
      if (typeof parsed.snapEnabled === "boolean") setSnapEnabled(parsed.snapEnabled);
      if (typeof parsed.voiceVolume === "number") setVoiceVolume(parsed.voiceVolume);
      if (typeof parsed.voiceMuted === "boolean") setVoiceMuted(parsed.voiceMuted);
      if (typeof parsed.musicVolume === "number") setMusicVolume(parsed.musicVolume);
      if (typeof parsed.music === "string" || parsed.music === null) setMusic(parsed.music);

      // Voice regions (supports both new voiceSegments and legacy voiceStartTime/voiceEndTime)
      const maybeVoiceSegments = (parsed as { voiceSegments?: unknown }).voiceSegments;
      if (Array.isArray(maybeVoiceSegments)) {
        const segs = maybeVoiceSegments
          .map((s, i) => {
            const rec = s as Record<string, unknown>;
            const start = typeof rec.startTime === "number" ? rec.startTime : typeof rec.start === "number" ? rec.start : null;
            const end = typeof rec.endTime === "number" ? rec.endTime : typeof rec.end === "number" ? rec.end : null;
            if (start == null || end == null) return null;
            const startTime = Math.max(0, start);
            const endTime = Math.max(startTime, end);
            if (!(endTime > startTime)) return null;
            return {
              id: typeof rec.id === "string" ? rec.id : `voice-${i}`,
              startTime,
              endTime,
              sourceIndex: typeof rec.sourceIndex === "number" ? rec.sourceIndex : 0,
            };
          })
          .filter((x): x is AudioSegment => Boolean(x));
        setVoiceSegments(segs);
        if (segs.length) {
          setVoiceStartTime(segs[0].startTime);
          setVoiceEndTime(segs[segs.length - 1].endTime);
        } else {
          setVoiceStartTime(0);
          setVoiceEndTime(0);
        }
      } else {
        if (typeof parsed.voiceStartTime === "number") setVoiceStartTime(Math.max(0, parsed.voiceStartTime));
        if (typeof parsed.voiceEndTime === "number") setVoiceEndTime(Math.max(0, parsed.voiceEndTime));
        if (typeof parsed.voiceStartTime === "number" && typeof parsed.voiceEndTime === "number" && parsed.voiceEndTime > parsed.voiceStartTime) {
          setVoiceSegments([{ id: "voice-0", startTime: Math.max(0, parsed.voiceStartTime), endTime: Math.max(0, parsed.voiceEndTime), sourceIndex: 0 }]);
        }
      }

      // Music regions (supports both new musicSegments and legacy musicStartTime/musicEndTime)
      const maybeMusicSegments = (parsed as { musicSegments?: unknown }).musicSegments;
      if (Array.isArray(maybeMusicSegments)) {
        const segs = maybeMusicSegments
          .map((s, i) => {
            const rec = s as Record<string, unknown>;
            const start = typeof rec.startTime === "number" ? rec.startTime : typeof rec.start === "number" ? rec.start : null;
            const end = typeof rec.endTime === "number" ? rec.endTime : typeof rec.end === "number" ? rec.end : null;
            if (start == null || end == null) return null;
            const startTime = Math.max(0, start);
            const endTime = Math.max(startTime, end);
            if (!(endTime > startTime)) return null;
            return {
              id: typeof rec.id === "string" ? rec.id : `music-${i}`,
              startTime,
              endTime,
              sourceIndex: typeof rec.sourceIndex === "number" ? rec.sourceIndex : 0,
            };
          })
          .filter((x): x is AudioSegment => Boolean(x));
        setMusicSegments(segs);
        if (segs.length) {
          setMusicStartTime(segs[0].startTime);
          setMusicEndTime(segs[segs.length - 1].endTime);
        } else {
          setMusicStartTime(0);
          setMusicEndTime(0);
        }
      } else {
        if (typeof parsed.musicStartTime === "number") setMusicStartTime(Math.max(0, parsed.musicStartTime));
        if (typeof parsed.musicEndTime === "number") setMusicEndTime(Math.max(0, parsed.musicEndTime));
        if (typeof parsed.musicStartTime === "number" && typeof parsed.musicEndTime === "number" && parsed.musicEndTime > parsed.musicStartTime) {
          setMusicSegments([{ id: "music-0", startTime: Math.max(0, parsed.musicStartTime), endTime: Math.max(0, parsed.musicEndTime), sourceIndex: 0 }]);
        }
      }

      // Restore previewIndex near the selected clip.
      if (restoredSelected) {
        const idx = safeClips.findIndex((c) => c.id === restoredSelected);
        if (idx >= 0) setPreviewIndex(idx);
      }
    } catch {
      // If storage is corrupted, just start fresh.
    } finally {
      hydratedFromStorageRef.current = true;
    }
  }, []);

  // ── Voice file add (supports appending multiple voice sources) ──────────
  const voiceFilesRef = useRef<File[]>(voiceFiles);
  useEffect(() => {
    voiceFilesRef.current = voiceFiles;
  }, [voiceFiles]);
  const voiceSegmentInitGuardRef = useRef<Set<number>>(new Set());

  const addVoiceFile = useCallback(
    (file: File, opts?: { mode?: "append" | "replace" }) => {
      const mode = opts?.mode ?? "append";
      // Check if this file already exists.
      // - For TTS inserts, `ScriptToVoice` uses a stable filename (`tts-...`), so name match is enough.
      // - For uploads/recordings, require (name + size + type) match to avoid skipping distinct files
      //   that happen to share a name.
      const isTtsFile = file.name.startsWith("tts-");
      const isDuplicate = voiceFilesRef.current.some((existingFile) => {
        if (isTtsFile) return existingFile.name === file.name;
        return (
          existingFile.name === file.name &&
          existingFile.size === file.size &&
          existingFile.type === file.type
        );
      });
      
      if (isDuplicate) {
        console.log("Duplicate voice file detected, skipping:", file.name);
        return;
      }

      console.log("Adding voice file:", file.name);
      // For "replace", reset everything so the new voice becomes the single source on the track.
      if (mode === "replace") {
        for (const url of voicePreviewUrls) {
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        }
        voiceFilesRef.current = [];
        voiceSegmentInitGuardRef.current = new Set();
        setVoiceFiles([]);
        setVoicePreviewUrls([]);
        setVoiceDurations([]);
        setVoiceSegments([]);
      }

      const idx = voiceFilesRef.current.length;
      const url = URL.createObjectURL(file);

      // Update ref immediately to keep indices correct even if the user adds files quickly.
      voiceFilesRef.current = [...voiceFilesRef.current, file];

      setVoiceFiles((prev) => [...prev, file]);
      setVoicePreviewUrls((prev) => [...prev, url]);
      setVoiceDurations((prev) => [...prev, 0]);

      let cancelled = false;
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.src = url;

      const onLoaded = () => {
        if (cancelled) return;
        const d = Number.isFinite(audio.duration) ? audio.duration : 0;
        const safeDuration = d > 0 ? d : 0;

        setVoiceDurations((prev) => {
          const next = [...prev];
          next[idx] = safeDuration;
          return next;
        });

        if (!safeDuration) return;

        // Defensive guard: some browsers can fire metadata events more than once.
        // Ensure we only ever attempt to initialize a segment once per file index.
        if (voiceSegmentInitGuardRef.current.has(idx)) return;
        voiceSegmentInitGuardRef.current.add(idx);

        const seqLen = totalDurationRef.current;
        console.log("Creating voice segment - seqLen:", seqLen, "safeDuration:", safeDuration);
        
        setVoiceSegments((prev) => {
          console.log("Current voice segments:", prev.length, prev);
          
          // Check if we already have a segment for this voice file index
          const existingSegment = prev.find(s => s.sourceIndex === idx);
          if (existingSegment) {
            console.log("Voice segment already exists for this file, skipping");
            return prev;
          }
          
          // Place new voice after the latest existing voice segment.
          // Prefer a small gap, but NEVER at the cost of truncating the audio.
          const PREFERRED_GAP_SECONDS = 1;
          const lastEnd = prev.length ? Math.max(0, ...prev.map((s) => s.endTime)) : 0;

          const timelineLen = Math.max(0, seqLen);
          const hasTimeline = timelineLen > 0;

          // Start with a gap, but if it would cause truncation, drop the gap.
          const gap =
            prev.length && hasTimeline && lastEnd + PREFERRED_GAP_SECONDS + safeDuration > timelineLen
              ? 0
              : prev.length
                ? PREFERRED_GAP_SECONDS
                : 0;

          let nextStart = prev.length ? lastEnd + gap : 0;
          let nextEnd = nextStart + safeDuration;

          // If we have a finite timeline and this segment would overflow,
          // shift it earlier so the full audio fits (even if it overlaps).
          if (hasTimeline && nextEnd > timelineLen) {
            nextStart = Math.max(0, timelineLen - safeDuration);
            nextEnd = nextStart + safeDuration;
          }

          console.log("New segment - start:", nextStart, "end:", nextEnd);

          if (nextEnd <= nextStart) {
            console.log("Invalid segment, skipping");
            return prev;
          }

          const newSegment = {
            id: `voice-${Date.now()}`,
            startTime: nextStart,
            endTime: nextEnd,
            sourceIndex: idx,
          };

          console.log("Adding new voice segment:", newSegment);
          return [...prev, newSegment];
        });
      };

      const onError = () => {
        if (cancelled) return;
        setVoiceDurations((prev) => {
          const next = [...prev];
          next[idx] = 0;
          return next;
        });
      };

      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("error", onError);

      return () => {
        cancelled = true;
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
        audio.src = "";
        // Only revoke when we did not persist it to state (the preview list owns it).
      };
    },
    [setVoiceDurations, setVoiceFiles, setVoicePreviewUrls, setVoiceSegments, voicePreviewUrls],
  );

  // ── Music preview URL lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!musicFile) {
      setMusicPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(musicFile);
    setMusicPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [musicFile]);

  // Load music duration from uploaded background music so the timeline can trim it.
  useEffect(() => {
    if (!musicPreviewUrl) return;
    let cancelled = false;
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = musicPreviewUrl;

    const onLoaded = () => {
      if (cancelled) return;
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      const safeDuration = d > 0 ? d : 0;
      setMusicDuration(safeDuration);

      // Place music at 0:00 by default.
      const seqLen = totalDurationRef.current;
      const defaultEnd = seqLen > 0 ? Math.min(safeDuration, seqLen) : safeDuration;
      setMusicSegments([{ id: "music-0", startTime: 0, endTime: defaultEnd, sourceIndex: 0 }]);
      setMusicStartTime(0);
      setMusicEndTime(defaultEnd);
    };

    const onError = () => {
      if (cancelled) return;
      setMusicDuration(0);
      setMusicSegments([]);
      setMusicStartTime(0);
      setMusicEndTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      audio.src = "";
    };
  }, [musicPreviewUrl]);

  // ── Reset playback state when clips are cleared ───────────────────────────
  // Fix: only depend on `clips` — don't read+write playingSequence/playheadTime in same effect
  useEffect(() => {
    if (!clips.length) {
      setPreviewIndex(0);
      setPlayingSequence(false);
      setPlayheadTime(0);
    } else if (previewIndex > clips.length - 1) {
      setPreviewIndex(0);
    }
  }, [clips]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist editor edits (clips + trims) ───────────────────────────────
  useEffect(() => {
    if (!hydratedFromStorageRef.current) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const payload = {
        version: 1,
        projectName,
        clips,
        selectedClipId,
        zoom,
        snapEnabled,
        voiceVolume,
        voiceMuted,
        voiceStartTime,
        voiceEndTime,
        voiceSegments,
        musicVolume,
        music,
        musicStartTime,
        musicEndTime,
        musicSegments,
        updatedAt: Date.now(),
      };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    }, 350);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [
    clips,
    selectedClipId,
    projectName,
    zoom,
    snapEnabled,
    voiceVolume,
    voiceMuted,
    voiceStartTime,
    voiceEndTime,
    musicVolume,
    music,
    musicStartTime,
    musicEndTime,
  ]);

  // ── totalDuration — keep ref in sync for seekToTime ──────────────────────
  const totalDuration = useMemo(
    () => clips.reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0),
    [clips],
  );
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  // Keep voice segments inside the rendered sequence bounds.
  useEffect(() => {
    if (!voiceFiles.length) return;
    const minRegion = 0.1;
    setVoiceSegments((prev) => {
      if (!prev.length) return prev;
      const safeTotal = Math.max(0, totalDuration);
      if (safeTotal <= minRegion) return [];

      let changed = false;
      const next = prev
        .map((seg) => {
          const start = Math.max(0, Math.min(seg.startTime, safeTotal - minRegion));
          const end = Math.max(start + minRegion, Math.min(seg.endTime, safeTotal));
          if (start === seg.startTime && end === seg.endTime) return seg;
          changed = true;
          return { ...seg, startTime: start, endTime: end };
        })
        .sort((a, b) => a.startTime - b.startTime);
      return changed ? next : prev;
    });
  }, [totalDuration, voiceFiles]);

  // Keep music segments inside the rendered sequence bounds.
  useEffect(() => {
    if (!musicFile) return;
    const minRegion = 0.1;
    setMusicSegments((prev) => {
      if (!prev.length) return prev;
      const safeTotal = Math.max(0, totalDuration);
      if (safeTotal <= minRegion) return [];

      let changed = false;
      const next = prev
        .map((seg) => {
          const start = Math.max(0, Math.min(seg.startTime, safeTotal - minRegion));
          const end = Math.max(start + minRegion, Math.min(seg.endTime, safeTotal));
          if (start === seg.startTime && end === seg.endTime) return seg;
          changed = true;
          return { ...seg, startTime: start, endTime: end };
        })
        .sort((a, b) => a.startTime - b.startTime);
      return changed ? next : prev;
    });
  }, [totalDuration, musicFile]);

  // Sync legacy single-region times from the segments (stable refs avoid extra renders).
  const voiceStartRef = useRef(voiceStartTime);
  const voiceEndRef = useRef(voiceEndTime);
  const musicStartRef = useRef(musicStartTime);
  const musicEndRef = useRef(musicEndTime);

  useEffect(() => {
    const first = voiceSegments.length ? voiceSegments[0].startTime : 0;
    const last = voiceSegments.length ? voiceSegments[voiceSegments.length - 1].endTime : 0;
    if (first !== voiceStartRef.current) { voiceStartRef.current = first; setVoiceStartTime(first); }
    if (last !== voiceEndRef.current) { voiceEndRef.current = last; setVoiceEndTime(last); }
  }, [voiceSegments]);

  useEffect(() => {
    const first = musicSegments.length ? musicSegments[0].startTime : 0;
    const last = musicSegments.length ? musicSegments[musicSegments.length - 1].endTime : 0;
    if (first !== musicStartRef.current) { musicStartRef.current = first; setMusicStartTime(first); }
    if (last !== musicEndRef.current) { musicEndRef.current = last; setMusicEndTime(last); }
  }, [musicSegments]);

  // ── seekToTime — stable, uses ref for totalDuration ──────────────────────
  const seekToTime = useCallback((n: number) => {
    const clamped = Math.max(0, Math.min(n, totalDurationRef.current));
    setPlayheadTime(clamped);
    setSeekRequest({ time: clamped, id: ++seekIdRef.current });
  }, []);

  // ── Library ───────────────────────────────────────────────────────────────
  const refreshLibrary = useCallback(async () => {
    try {
      setLoadingLibrary(true);
      const response = await api.listSaved();
      const items: SavedItem[] = response?.success ? response.items || [] : [];
      setLibrary(
        items
          .filter((item) => Boolean(item.videoUrl))
          .map((item) => ({
            id: item._id,
            savedId: item._id,
            name: item.title || "Untitled clip",
            duration: parseDuration(item.duration),
            thumbnail: item.thumbnail || "",
            tag: item.tags?.[0] || item.source || "saved",
            url: item.videoUrl || "",
            source: item.source || "saved",
          })),
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to load saved clips");
      setLibrary([]);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  const removeLibraryItem = useCallback(async (savedId: string) => {
    try {
      const result = await api.deleteSaved(savedId);
      if (result?.success) {
        setLibrary((cur) => cur.filter((item) => item.savedId !== savedId));
        toast.success("Deleted from saved clips");
      } else {
        toast.error(result?.message || "Failed to delete clip");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete clip");
    }
  }, []);

  // ── Hydrate real duration from video element ──────────────────────────────
  // Fix: cancelled flag prevents setState after unmount
  const hydrateDurationForClip = useCallback((clipId: string, url: string) => {
    let cancelled = false;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;

    const cleanup = () => {
      probe.removeEventListener("loadedmetadata", onLoaded);
      probe.removeEventListener("error", onError);
      probe.src = "";
    };

    const onLoaded = () => {
      if (!cancelled) {
        const actual = probe.duration;
        if (Number.isFinite(actual) && actual > 0) {
          setClips((cur) =>
            cur.map((clip) => {
              if (clip.id !== clipId) return clip;
              const max = Number(actual.toFixed(2));
              const nextStart = Math.max(0, Math.min(clip.trimStart, max - 0.2));
              const nextEnd = Math.max(nextStart + 0.2, Math.min(clip.trimEnd, max));
              return {
                ...clip,
                duration: max,
                trimStart: Number(nextStart.toFixed(1)),
                trimEnd: Number(nextEnd.toFixed(1)),
              };
            }),
          );
        }
      }
      cleanup();
    };

    const onError = () => { cleanup(); };

    probe.addEventListener("loadedmetadata", onLoaded);
    probe.addEventListener("error", onError);

    return () => { cancelled = true; cleanup(); };
  }, []);

  // ── Clip operations ───────────────────────────────────────────────────────
  const addToTimeline = useCallback((item: LibraryItem) => {
    if (!item.url) { toast.error("Clip has no playable URL"); return; }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mediaType = item.mediaType ?? "video";
    const clip: Clip = {
      id,
      name: item.name,
      duration: item.duration,
      thumbnail: item.thumbnail,
      tag: item.tag,
      trimStart: 0,
      trimEnd: item.duration,
      url: item.url,
      source: item.source,
      mediaType,
    };
    pushUndoSnapshot();
    setClips((c) => {
      if (c.length === 0) setTimeout(() => setPreviewIndex(0), 0);
      return [...c, clip];
    });
    // Images have a fixed duration — no need to probe via video element
    if (mediaType === "video") hydrateDurationForClip(id, clip.url);
    setSelected(id);
  }, [pushUndoSnapshot, hydrateDurationForClip]);

  // Bulk add — one setState for all clips, one undo snapshot, no per-clip re-renders
  const addManyToTimeline = useCallback((items: LibraryItem[]) => {
    const valid = items.filter(item => item.url);
    if (!valid.length) return;

    const newClips: Clip[] = valid.map((item) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: item.name,
      duration: item.duration,
      thumbnail: item.thumbnail,
      tag: item.tag,
      trimStart: 0,
      trimEnd: item.duration,
      url: item.url,
      source: item.source,
      mediaType: item.mediaType ?? "video",
    }));

    pushUndoSnapshot();
    setClips((c) => {
      const wasEmpty = c.length === 0;
      if (wasEmpty) setTimeout(() => setPreviewIndex(0), 0);
      return [...c, ...newClips];
    });
    setSelected(newClips[newClips.length - 1].id);

    // Batch all video duration probes — wait for all, then do ONE setClips update
    const videoClips = newClips.filter(c => c.mediaType !== "image");
    if (videoClips.length === 0) return;

    const results = new Map<string, number>();
    let pending = videoClips.length;

    const flush = () => {
      if (results.size === 0) return;
      setClips((cur) => cur.map((clip) => {
        const actual = results.get(clip.id);
        if (actual == null) return clip;
        const max = Number(actual.toFixed(2));
        const nextStart = Math.max(0, Math.min(clip.trimStart, max - 0.2));
        const nextEnd = Math.max(nextStart + 0.2, Math.min(clip.trimEnd, max));
        return { ...clip, duration: max, trimStart: Number(nextStart.toFixed(1)), trimEnd: Number(nextEnd.toFixed(1)) };
      }));
    };

    for (const clip of videoClips) {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = clip.url;
      const done = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) results.set(clip.id, probe.duration);
        probe.src = "";
        pending--;
        if (pending === 0) flush();
      };
      probe.addEventListener("loadedmetadata", done, { once: true });
      probe.addEventListener("error", done, { once: true });
    }
  }, [pushUndoSnapshot]);

  const removeClip = useCallback((id: string) => {
    pushUndoSnapshot();
    setClips((c) => c.filter((x) => x.id !== id));
    setSelected((s) => (s === id ? null : s));
    setPlayingSequence(false);
  }, [pushUndoSnapshot]);

  const splitClip = useCallback((id: string) => {
    // Snapshot before split
    pushUndoSnapshot();

    setClips((currentClips) => {
      const idx = currentClips.findIndex((x) => x.id === id);
      if (idx < 0) return currentClips;
      const orig = currentClips[idx];
      const clipLength = orig.trimEnd - orig.trimStart;
      if (clipLength < 0.5) return currentClips;

      const mid = clipLength / 2 + orig.trimStart;
      const precision = snapEnabled ? 0.5 : 0.1;
      const snappedMid = Number((Math.round(mid / precision) * precision).toFixed(1));

      const now = Date.now();
      const a: Clip = { ...orig, id: `${orig.id}-a-${now}`, trimEnd: snappedMid };
      const b: Clip = { ...orig, id: `${orig.id}-b-${now}`, trimStart: snappedMid };

      // Select the right half and seek to current playhead position
      setSelected(b.id);
      setPreviewIndex(idx + 1);
      // Use setTimeout to allow clips state to settle before seeking
      setTimeout(() => seekToTime(totalDurationRef.current > 0 ? playheadTimeRef.current : 0), 0);

      return [...currentClips.slice(0, idx), a, b, ...currentClips.slice(idx + 1)];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushUndoSnapshot, snapEnabled, seekToTime]);

  const reorderClip = useCallback((from: number, to: number) => {
    pushUndoSnapshot();
    setClips((c) => {
      const next = [...c];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, [pushUndoSnapshot]);

  const moveClip = useCallback((clipId: string, direction: -1 | 1) => {
    pushUndoSnapshot();
    setClips((cur) => {
      const idx = cur.findIndex((c) => c.id === clipId);
      if (idx === -1) return cur;
      const target = idx + direction;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      const [clip] = next.splice(idx, 1);
      next.splice(target, 0, clip);
      return next;
    });
  }, [pushUndoSnapshot]);

  // Fix: NO pushUndoSnapshot here — caller (Timeline) pushes once on mousedown
  const updateTrim = useCallback((id: string, start: number, end: number) => {
    const precision = snapEnabled ? 0.5 : 0.1;
    const snap = (v: number) => Number((Math.round(v / precision) * precision).toFixed(1));
    setClips((c) =>
      c.map((x) =>
        x.id === id
          ? {
              ...x,
              trimStart: snap(Math.max(0, Math.min(start, x.duration - 0.2))),
              trimEnd: snap(Math.max(start + 0.2, Math.min(end, x.duration))),
            }
          : x,
      ),
    );
  }, [snapEnabled]);

  const toggleClipMute = useCallback((id: string) => {
    pushUndoSnapshot();
    setClips((c) =>
      c.map((x) =>
        x.id === id
          ? {
              ...x,
              muted: x.muted === undefined ? true : !x.muted,
            }
          : x,
      ),
    );
  }, [pushUndoSnapshot]);

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        addVoiceFile(new File([blob], `voiceover_${Date.now()}.webm`, { type: blob.type }));
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      };
      recorder.start();
      setRecording(true);
      toast.success("Recording started");
    } catch (error) {
      console.error(error);
      toast.error("Microphone access denied");
    }
  }, [addVoiceFile]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    toast.success("Voiceover recorded");
  }, []);

  // ── Transitions ───────────────────────────────────────────────────────────
  const cycleTransition = useCallback((leftId: string, rightId: string) => {
    const key = `${leftId}::${rightId}`;
    const order: TransitionMode[] = ["none", "crossfade", "wipe", "zoom-in", "zoom-out"];
    setTransitions((prev) => {
      const cur = prev[key] ?? "none";
      const idx = order.indexOf(cur);
      const next = order[(idx + 1) % order.length];
      return { ...prev, [key]: next };
    });
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const startExport = useCallback(async (resolution: ExportResolution = "1080p"): Promise<string | null> => {
  if (!clipsRef.current.length) {
    toast.error("Add at least one clip");
    return null;
  }

  setExporting(true);
  setExportUrl("");

  try {
    const form = new FormData();

    const clipsList = clipsRef.current;
    const clipsForExport = clipsList.map((clip) => ({
      url: clip.url,
      start: clip.trimStart,
      end: clip.trimEnd,
      muted: clip.muted || false,
    }));
    form.append("clips", JSON.stringify(clipsForExport));

    // Transitions between adjacent clips: array of N-1 modes in clip order.
    const t = transitionsRef.current;
    const transitionsForExport = clipsList.slice(0, -1).map((clip, i) => {
      const next = clipsList[i + 1];
      return t[`${clip.id}::${next.id}`] ?? "none";
    });
    form.append("transitions", JSON.stringify(transitionsForExport));

    form.append("resolution", resolution);

    // Always send volume/mute settings so ffmpeg can apply them.
    form.append("voiceVolume", String(voiceVolume));
    form.append("voiceMuted", String(voiceMuted ? 1 : 0));
    form.append("musicVolume", String(musicVolume));

    // Voice: may contain multiple appended voice sources.
    // Must match multer config in server.
    for (const f of voiceFiles) {
      form.append("audioFiles", f, f.name);
    }

    form.append("voiceStartTime", String(voiceStartTime));
    form.append("voiceEndTime", String(voiceEndTime));
    form.append(
      "voiceSegments",
      JSON.stringify(voiceSegments.map((s) => ({ startTime: s.startTime, endTime: s.endTime, sourceIndex: s.sourceIndex }))),
    );

    form.append("musicStartTime", String(musicStartTime));
    form.append("musicEndTime", String(musicEndTime));
    form.append("musicSegments", JSON.stringify(musicSegments.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))));

    if (musicFile) {
      form.append("musicFile", musicFile, musicFile.name);
    }

    const response = await fetch(`${API_BASE}/api/editor/export`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Export failed");
    }

    const url = result.absoluteUrl || `${API_BASE}${result.url}`;

    setExportUrl(url);
    toast.success("Export complete");

    return url;
  } catch (err) {
    console.error(err);
    toast.error(err instanceof Error ? err.message : "Export failed");
    return null;
  } finally {
    setExporting(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceVolume, voiceMuted, voiceFiles, voiceStartTime, voiceEndTime, voiceSegments, musicStartTime, musicEndTime, musicSegments, musicFile, musicVolume]);

  // ── Clear all clips and voice files ───────────────────────────────────────
  const clearAll = useCallback(() => {
    pushUndoSnapshot();
    // Clear clips
    setClips([]);
    setSelected(null);
    setPreviewIndex(0);
    // Clear voice files
    for (const url of voicePreviewUrls) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    voiceFilesRef.current = [];
    setVoiceFiles([]);
    setVoicePreviewUrls([]);
    setVoiceDurations([]);
    setVoiceSegments([]);
    setVoiceStartTime(0);
    setVoiceEndTime(0);
    // Clear music
    setMusicFile(null);
    setMusicSegments([]);
    setMusicStartTime(0);
    setMusicEndTime(0);
    toast.success("Editor cleared");
  }, [pushUndoSnapshot, voicePreviewUrls]);

  // ── Sync voice segments to match clip positions exactly ─────────────────────
  const syncVoiceWithClips = useCallback(() => {
    if (!clips.length || !voiceFiles.length) {
      toast.error("No clips or voice files to sync");
      return;
    }

    if (voiceFiles.length !== clips.length) {
      toast.warning(`Mismatch: ${clips.length} clips but ${voiceFiles.length} voice files`);
    }

    pushUndoSnapshot();

    // Trim clips to match voice duration and recalculate positions
    let currentTime = 0;
    const clipPositions: { start: number; end: number; clipIndex: number }[] = [];
    const updatedClips = clips.map((clip, index) => {
      const voiceDuration = voiceDurations[index] || 0;
      const originalDuration = Math.max(0, clip.trimEnd - clip.trimStart);
      
      // If we have a valid voice duration, trim clip to match it
      let newTrimEnd = clip.trimEnd;
      if (voiceDuration > 0 && voiceDuration < originalDuration) {
        newTrimEnd = clip.trimStart + voiceDuration;
      }
      
      const finalDuration = Math.max(0, newTrimEnd - clip.trimStart);
      clipPositions.push({
        start: currentTime,
        end: currentTime + finalDuration,
        clipIndex: index
      });
      currentTime += finalDuration;
      
      return {
        ...clip,
        trimEnd: newTrimEnd
      };
    });

    // Update clips with trimmed durations
    setClips(updatedClips);

    // Create new voice segments aligned with trimmed clip positions
    const newSegments: AudioSegment[] = voiceFiles.map((_, index) => {
      const position = clipPositions[index] || { start: currentTime, end: currentTime, clipIndex: index };
      const duration = voiceDurations[index] || 0;
      
      // Voice segment spans the full clip duration (which is now trimmed to match voice)
      const actualEnd = Math.min(position.start + duration, position.end);
      
      return {
        id: `voice-sync-${index}-${Date.now()}`,
        startTime: position.start,
        endTime: Math.max(position.start + 0.1, actualEnd),
        sourceIndex: index
      };
    });

    setVoiceSegments(newSegments);
    
    if (newSegments.length > 0) {
      setVoiceStartTime(newSegments[0].startTime);
      setVoiceEndTime(newSegments[newSegments.length - 1].endTime);
    }
    
    toast.success(`Synced and trimmed ${Math.min(voiceFiles.length, clips.length)} scenes to match voice duration`);
  }, [clips, voiceFiles, voiceDurations, setClips, setVoiceSegments, setVoiceStartTime, setVoiceEndTime, pushUndoSnapshot]);

  const toggleSnap = useCallback(() => setSnapEnabled((cur) => !cur), []);

  // ── Context value — memoized so stable callbacks don't trigger re-renders ──
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const value = useMemo<EditorState>(() => ({
    library,
    loadingLibrary,
    clips,
    selectedClipId,
    previewIndex,
    setPreviewIndex,
    playheadTime,
    setPlayheadTime,
    seekRequest,
    seekToTime,
    subscribePlayhead,
    notifyPlayhead,
    playingSequence,
    setPlayingSequence,
    zoom,
    voiceVolume,
    voiceMuted,
    voiceStartTime,
    voiceEndTime,
    voiceSegments,
    voiceDurations,
    musicVolume,
    music,
    musicFile,
    musicPreviewUrl,
    musicStartTime,
    musicEndTime,
    musicSegments,
    musicDuration,
    voiceFiles,
    voicePreviewUrls,
    recording,
    exporting,
    exportUrl,
    projectName,
    updateProjectName,
    canUndo,
    canRedo,
    undo,
    redo,
    snapEnabled,
    toggleSnap,
    refreshLibrary,
    removeLibraryItem,
    setSelected,
    addToTimeline,
    addManyToTimeline,
    removeClip,
    splitClip,
    reorderClip,
    updateTrim,
    toggleClipMute,
    pushUndoSnapshot,
    moveClip,
    setZoom,
    setVoiceVolume,
    setVoiceMuted,
    setVoiceStartTime,
    setVoiceEndTime,
    setVoiceSegments,
    setMusicVolume,
    setMusic,
    setMusicFile,
    setMusicStartTime,
    setMusicEndTime,
    setMusicSegments,
    addVoiceFile,
    startRecording,
    stopRecording,
    startExport,
    totalDuration,
    clearAll,
    syncVoiceWithClips,
    transitions,
    setTransitions,
    cycleTransition,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    library, loadingLibrary, clips,
    // selectedClipId, previewIndex, playingSequence intentionally omitted —
    // they live in PlaybackCtx so clip advances don't rebuild this value and
    // re-render every useEditor() consumer (TopBar, ToolsPanel, etc.).
    // playheadTime also omitted — tracked via ref + subscriber bus.
    seekRequest, zoom, voiceVolume, voiceMuted, voiceStartTime,
    voiceEndTime, voiceSegments, voiceDurations, musicVolume, music, musicFile,
    musicPreviewUrl, musicStartTime, musicEndTime, musicSegments, musicDuration,
    voiceFiles, voicePreviewUrls, recording, exporting, exportUrl, projectName,
    canUndo, canRedo, snapEnabled, totalDuration,
    // stable callbacks — included so lint doesn't complain but these never change:
    setPreviewIndex, setPlayheadTime, seekToTime, subscribePlayhead, notifyPlayhead, setPlayingSequence,
    updateProjectName, undo, redo, toggleSnap, refreshLibrary, removeLibraryItem, setSelected,
    addToTimeline, addManyToTimeline, removeClip, splitClip, reorderClip, updateTrim,
    toggleClipMute, pushUndoSnapshot, moveClip, setZoom, setVoiceVolume, setVoiceMuted,
    setVoiceStartTime, setVoiceEndTime, setVoiceSegments, setMusicVolume, setMusic,
    setMusicFile, setMusicStartTime, setMusicEndTime, setMusicSegments, addVoiceFile,
    startRecording, stopRecording, startExport, clearAll, syncVoiceWithClips,
    transitions, setTransitions, cycleTransition,
  ]);

  // PlaybackCtx is a plain (non-memoized) object — React only re-renders its consumers
  // when selectedClipId/previewIndex/playingSequence actually change, which is exactly
  // what we want. The object identity changes on every EditorProvider render, but
  // React bails out individual consumers if the value is referentially equal.
  // We must memoize it to avoid re-rendering PlaybackCtx consumers on unrelated state changes.
  const playbackValue = useMemo<PlaybackState>(
    () => ({ selectedClipId, previewIndex, playingSequence }),
    [selectedClipId, previewIndex, playingSequence],
  );

  return (
    <Ctx.Provider value={value}>
      <PlaybackCtx.Provider value={playbackValue}>
        {children}
      </PlaybackCtx.Provider>
    </Ctx.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}

export function usePlayback() {
  return useContext(PlaybackCtx);
}

export function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}