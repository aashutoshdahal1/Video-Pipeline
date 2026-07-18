import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { GripVertical, Magnet, Scissors, Trash2, ZoomIn, ZoomOut, Music, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor, usePlayback, formatTime, type LibraryItem, type Clip, type TransitionMode } from "./editor-context";

interface TrimDrag {
  clipId: string;
  edge: "left" | "right";
  startX: number;
  initialStart: number;
  initialEnd: number;
  pendingStart?: number;
  pendingEnd?: number;
}

interface AudioSegmentDrag {
  edge: "start" | "end" | "move";
  startX: number;
  initialStart: number;
  initialEnd: number;
  segmentIndex: number;
}

interface TimelineClipLayout {
  clipId: string;
  startTime: number;
  duration: number;
  widthPx: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MIN_CLIP_WIDTH_PX = 40;
const TRACK_HEIGHT = 56;
const RULER_HEIGHT = 24;
const AUDIO_TRACK_HEIGHT = 28;
const MIN_VOICE_REGION_SECONDS = 0.1;
const MIN_MUSIC_REGION_SECONDS = 0.1;
const TRACK_SIDE_PADDING_PX = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────
export default function Timeline() {
  const {
    clips,
    setSelected,
    addToTimeline,
    reorderClip,
    moveClip,
    removeClip,
    splitClip,
    updateTrim,
    snapEnabled,
    toggleSnap,
    zoom,
    setZoom,
    voicePreviewUrls,
    voiceDurations,
    voiceSegments,
    setVoiceSegments,
    musicFile,
    musicDuration,
    musicSegments,
    setMusicSegments,
    playheadTime,
    subscribePlayhead,
    seekToTime,
    totalDuration,
    transitions,
    cycleTransition,
  } = useEditor();
  // selectedClipId and playingSequence from PlaybackCtx — updates here don't rebuild the main context
  const { selectedClipId, playingSequence } = usePlayback();

  const [dropActive, setDropActive] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<"voice" | "music" | null>(null);
  const [selectedAudioSegmentIndex, setSelectedAudioSegmentIndex] = useState<number | null>(null);

  const trimDragRef = useRef<TrimDrag | null>(null);
  const clipDragIndexRef = useRef<number | null>(null);
  const voiceDragRef = useRef<AudioSegmentDrag | null>(null);
  const musicDragRef = useRef<AudioSegmentDrag | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const rulerTriangleRef = useRef<HTMLDivElement | null>(null);

  // ── Derived layout values ──────────────────────────────────────────
  const pxPerSec = 14 * zoom;
  const snapStep = snapEnabled ? 0.5 : 0.1;
  const snapTime = useCallback(
    (time: number) => Number((Math.round(time / snapStep) * snapStep).toFixed(1)),
    [snapStep],
  );
  const clampTimelineTime = useCallback(
    (time: number) => Math.max(0, Math.min(totalDuration, snapTime(time))),
    [snapTime, totalDuration],
  );
  // (no-op placeholder) keep zoom derived values local.

  // Round up to next even second, minimum 20s
  const timelineWidth = useMemo(
    () => Math.max(20, Math.ceil((totalDuration + 4) / 2) * 2),
    [totalDuration],
  );

  // Ruler markers: one tick every 2s, but thin ticks every 0.5s at high zoom
  const majorInterval = zoom >= 2 ? 1 : 2;
  const minorInterval = 0.5;
  const markerTimes = useMemo(
    () => Array.from(
      { length: Math.floor(timelineWidth / majorInterval) + 1 },
      (_, i) => i * majorInterval,
    ),
    [timelineWidth, majorInterval],
  );
  const timelineContentWidth = useMemo(() => timelineWidth * pxPerSec, [timelineWidth, pxPerSec]);
  const clipLayouts = useMemo<TimelineClipLayout[]>(() => {
    let currentStart = 0;

    return clips.map((clip) => {
      const duration = Math.max(0, clip.trimEnd - clip.trimStart);
      const layout = {
        clipId: clip.id,
        startTime: currentStart,
        duration,
        widthPx: Math.max(MIN_CLIP_WIDTH_PX, duration * pxPerSec),
      };

      currentStart += duration;
      return layout;
    });
  }, [clips, pxPerSec]);

  // ── Keep pxPerSec in a ref so the subscriber below always sees the latest value ──
  const pxPerSecRef = useRef(pxPerSec);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);

  // ── Track latest playheadTime in a ref so JSX reads don't cause re-renders ──
  const playheadTimeRef = useRef(playheadTime);
  useEffect(() => { playheadTimeRef.current = playheadTime; }, [playheadTime]);

  const playingSequenceRef = useRef(playingSequence);
  useEffect(() => { playingSequenceRef.current = playingSequence; }, [playingSequence]);

  // ── Segment refs — drag handlers read latest segments without re-registering listeners ──
  const voiceSegmentsRef = useRef(voiceSegments);
  useEffect(() => { voiceSegmentsRef.current = voiceSegments; }, [voiceSegments]);
  const musicSegmentsRef = useRef(musicSegments);
  useEffect(() => { musicSegmentsRef.current = musicSegments; }, [musicSegments]);

  // ── Subscribe to the playhead event bus — zero React re-renders at 60fps ──
  useEffect(() => {
    return subscribePlayhead((t) => {
      const px = pxPerSecRef.current;
      const x = TRACK_SIDE_PADDING_PX + Math.max(0, t) * px;
      // Needle
      const el = playheadLineRef.current;
      if (el) el.style.transform = `translateX(${x}px)`;
      // Ruler triangle
      const tri = rulerTriangleRef.current;
      if (tri) tri.style.transform = `translateX(${x - 5}px)`;
      // Auto-scroll
      const scroller = scrollerRef.current;
      if (playingSequenceRef.current && scroller) {
        const playheadX = t * px;
        const visibleRight = scroller.scrollLeft + scroller.clientWidth;
        if (playheadX > visibleRight - scroller.clientWidth * 0.2) {
          scroller.scrollLeft = playheadX - scroller.clientWidth * 0.4;
        }
      }
    });
  }, [subscribePlayhead]);

  // ── Initial/static playhead position (on seek, zoom, or mount) ──────
  useEffect(() => {
    const el = playheadLineRef.current;
    if (!el) return;
    el.style.transform = `translateX(${TRACK_SIDE_PADDING_PX + Math.max(0, playheadTime) * pxPerSec}px)`;
  }, [playheadTime, pxPerSec]);

  // ── Ctrl+D duplicates the selected audio segment (CapCut-style) ─────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() !== "d") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase();
      const isTypingTarget =
        tag === "INPUT" || tag === "TEXTAREA" || Boolean(target?.isContentEditable);
      if (isTypingTarget) return;

      e.preventDefault();
      e.stopPropagation();

      if (!selectedAudioTrack) return;
      if (selectedAudioSegmentIndex == null) return;
      if (totalDuration <= 0) return;

      if (selectedAudioTrack === "voice") {
        const seg = voiceSegments[selectedAudioSegmentIndex];
        if (!seg) return;
        const len = seg.endTime - seg.startTime;
        if (len <= 0) return;
        const insertStart = seg.endTime;
        const insertEnd = Math.min(totalDuration, insertStart + len);
        const actualLen = insertEnd - insertStart;
        if (actualLen < MIN_VOICE_REGION_SECONDS) return;

        const shifted = voiceSegments
          .slice(selectedAudioSegmentIndex + 1)
          .map((s) => ({
            ...s,
            startTime: s.startTime + actualLen,
            endTime: s.endTime + actualLen,
          }))
          .filter((s) => s.startTime < totalDuration && s.endTime > s.startTime);

        const next: typeof voiceSegments = [
          ...voiceSegments.slice(0, selectedAudioSegmentIndex + 1),
          { id: `voice-${Date.now()}`, startTime: insertStart, endTime: insertEnd, sourceIndex: seg.sourceIndex },
          ...shifted,
        ];

        setVoiceSegments(next);
        setSelectedAudioSegmentIndex(selectedAudioSegmentIndex + 1);
      }

      if (selectedAudioTrack === "music") {
        const seg = musicSegments[selectedAudioSegmentIndex];
        if (!seg) return;
        const len = seg.endTime - seg.startTime;
        if (len <= 0) return;
        const insertStart = seg.endTime;
        const insertEnd = Math.min(totalDuration, insertStart + len);
        const actualLen = insertEnd - insertStart;
        if (actualLen < MIN_MUSIC_REGION_SECONDS) return;

        const shifted = musicSegments
          .slice(selectedAudioSegmentIndex + 1)
          .map((s) => ({
            ...s,
            startTime: s.startTime + actualLen,
            endTime: s.endTime + actualLen,
          }))
          .filter((s) => s.startTime < totalDuration && s.endTime > s.startTime);

        const next: typeof musicSegments = [
          ...musicSegments.slice(0, selectedAudioSegmentIndex + 1),
          { id: `music-${Date.now()}`, startTime: insertStart, endTime: insertEnd, sourceIndex: seg.sourceIndex },
          ...shifted,
        ];

        setMusicSegments(next);
        setSelectedAudioSegmentIndex(selectedAudioSegmentIndex + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedAudioTrack,
    selectedAudioSegmentIndex,
    totalDuration,
    voiceSegments,
    musicSegments,
    setVoiceSegments,
    setMusicSegments,
  ]);

  // ── Trim drag — DOM-only during drag, single flush on mouseup ────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = trimDragRef.current;
      if (!drag) return;
      // Store pending trim in ref — no React state update during drag
      const deltaSec = (e.clientX - drag.startX) / pxPerSecRef.current;
      if (drag.edge === "left") {
        drag.pendingStart = drag.initialStart + deltaSec;
        drag.pendingEnd = drag.initialEnd;
      } else {
        drag.pendingStart = drag.initialStart;
        drag.pendingEnd = drag.initialEnd + deltaSec;
      }
    };
    const onUp = () => {
      const drag = trimDragRef.current;
      if (drag && drag.pendingStart !== undefined && drag.pendingEnd !== undefined) {
        updateTrim(drag.clipId, drag.pendingStart, drag.pendingEnd);
      }
      trimDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [updateTrim]);

  // ── Voice region drag — DOM-only during drag, single flush on mouseup ──
  const pendingVoiceSegsRef = useRef<typeof voiceSegments | null>(null);
  const totalDurationRef2 = useRef(totalDuration);
  useEffect(() => { totalDurationRef2.current = totalDuration; }, [totalDuration]);

  const clampRef = useRef(clampTimelineTime);
  useEffect(() => { clampRef.current = clampTimelineTime; }, [clampTimelineTime]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = voiceDragRef.current;
      if (!drag) return;
      const segments = voiceSegmentsRef.current;
      const segIndex = drag.segmentIndex;
      const seg = segments[segIndex];
      if (!seg) return;

      const clamp = clampRef.current;
      const deltaSec = (e.clientX - drag.startX) / pxPerSecRef.current;
      const minLen = MIN_VOICE_REGION_SECONDS;
      const prevEnd = segments[segIndex - 1]?.endTime ?? 0;
      const nextStart = segments[segIndex + 1]?.startTime ?? totalDurationRef2.current;

      let updated: typeof segments;
      if (drag.edge === "start") {
        const newStart = clamp(Math.max(prevEnd, Math.min(drag.initialStart + deltaSec, drag.initialEnd - minLen)));
        const newEnd = clamp(Math.max(newStart + minLen, Math.min(drag.initialEnd, nextStart)));
        if (newEnd <= newStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: newStart, endTime: newEnd } : s));
      } else if (drag.edge === "end") {
        const newEnd = clamp(Math.max(drag.initialStart + minLen, Math.min(drag.initialEnd + deltaSec, nextStart)));
        if (newEnd <= drag.initialStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: clamp(drag.initialStart), endTime: newEnd } : s));
      } else {
        const segmentLength = Math.max(minLen, drag.initialEnd - drag.initialStart);
        const boundedStart = clamp(Math.max(prevEnd, Math.min(drag.initialStart + deltaSec, nextStart - segmentLength)));
        const boundedEnd = clamp(Math.min(nextStart, boundedStart + segmentLength));
        if (boundedEnd <= boundedStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: boundedStart, endTime: boundedEnd } : s));
      }
      // Buffer in ref — no React state update during drag
      pendingVoiceSegsRef.current = updated;
      voiceSegmentsRef.current = updated;
    };

    const onUp = () => {
      const pending = pendingVoiceSegsRef.current;
      if (pending) {
        setVoiceSegments(pending);
        pendingVoiceSegsRef.current = null;
      }
      voiceDragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setVoiceSegments]);

  // ── Music region drag — DOM-only during drag, single flush on mouseup ──
  const pendingMusicSegsRef = useRef<typeof musicSegments | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = musicDragRef.current;
      if (!drag) return;
      const segments = musicSegmentsRef.current;
      const segIndex = drag.segmentIndex;
      const seg = segments[segIndex];
      if (!seg) return;

      const clamp = clampRef.current;
      const deltaSec = (e.clientX - drag.startX) / pxPerSecRef.current;
      const minLen = MIN_MUSIC_REGION_SECONDS;
      const prevEnd = segments[segIndex - 1]?.endTime ?? 0;
      const nextStart = segments[segIndex + 1]?.startTime ?? totalDurationRef2.current;

      let updated: typeof segments;
      if (drag.edge === "start") {
        const newStart = clamp(Math.max(prevEnd, Math.min(drag.initialStart + deltaSec, drag.initialEnd - minLen)));
        const newEnd = clamp(Math.max(newStart + minLen, Math.min(drag.initialEnd, nextStart)));
        if (newEnd <= newStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: newStart, endTime: newEnd } : s));
      } else if (drag.edge === "end") {
        const newEnd = clamp(Math.max(drag.initialStart + minLen, Math.min(drag.initialEnd + deltaSec, nextStart)));
        if (newEnd <= drag.initialStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: clamp(drag.initialStart), endTime: newEnd } : s));
      } else {
        const segmentLength = Math.max(minLen, drag.initialEnd - drag.initialStart);
        const boundedStart = clamp(Math.max(prevEnd, Math.min(drag.initialStart + deltaSec, nextStart - segmentLength)));
        const boundedEnd = clamp(Math.min(nextStart, boundedStart + segmentLength));
        if (boundedEnd <= boundedStart + 0.00001) return;
        updated = segments.map((s, i) => (i === segIndex ? { ...s, startTime: boundedStart, endTime: boundedEnd } : s));
      }
      pendingMusicSegsRef.current = updated;
      musicSegmentsRef.current = updated;
    };

    const onUp = () => {
      const pending = pendingMusicSegsRef.current;
      if (pending) {
        setMusicSegments(pending);
        pendingMusicSegsRef.current = null;
      }
      musicDragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMusicSegments]);

  // ── Ruler click / drag to seek ────────────────────────────────────
  const getTimeFromRulerEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): number => {
      const scroller = scrollerRef.current;
      if (!scroller) return 0;
      const rect = scroller.getBoundingClientRect();
      const x = e.clientX - rect.left + scroller.scrollLeft - TRACK_SIDE_PADDING_PX;
      return Math.max(0, Math.min(totalDuration, x / pxPerSec));
    },
    [pxPerSec, totalDuration],
  );

  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingPlayhead(true);
      // Move playhead DOM immediately — no React state update yet
      const t0 = getTimeFromRulerEvent(e);
      const px0 = TRACK_SIDE_PADDING_PX + t0 * pxPerSecRef.current;
      if (playheadLineRef.current) playheadLineRef.current.style.transform = `translateX(${px0}px)`;
      if (rulerTriangleRef.current) rulerTriangleRef.current.style.transform = `translateX(${px0 - 5}px)`;
      let pendingTime = t0;

      const onMove = (ev: MouseEvent) => {
        const t = getTimeFromRulerEvent(ev);
        pendingTime = t;
        const px = TRACK_SIDE_PADDING_PX + t * pxPerSecRef.current;
        if (playheadLineRef.current) playheadLineRef.current.style.transform = `translateX(${px}px)`;
        if (rulerTriangleRef.current) rulerTriangleRef.current.style.transform = `translateX(${px - 5}px)`;
      };
      const onUp = () => {
        setIsDraggingPlayhead(false);
        seekToTime(pendingTime); // single context update on release
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [getTimeFromRulerEvent, seekToTime],
  );

  // ── Drop from media library ───────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const raw = e.dataTransfer.getData("application/x-clip");
    if (raw) {
      try {
        addToTimeline(JSON.parse(raw) as LibraryItem);
      } catch {
        // ignore malformed drag data
      }
    }
  };

  // ── Start trim drag ───────────────────────────────────────────────
  const startTrimDrag = useCallback((
    e: React.MouseEvent,
    clipId: string,
    edge: "left" | "right",
    start: number,
    end: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    trimDragRef.current = { clipId, edge, startX: e.clientX, initialStart: start, initialEnd: end };
  }, []);

  // ── Zoom helpers ──────────────────────────────────────────────────
  const zoomIn = () => setZoom(Math.min(4, zoom + 0.25));
  const zoomOut = () => setZoom(Math.max(0.25, zoom - 0.25));

  // Wheel-to-zoom — must be a non-passive native listener so preventDefault works
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => e.deltaY < 0 ? Math.min(4, z + 0.25) : Math.max(0.25, z - 0.25));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Audio segment helpers (placeholder — full proportional fill) ──
  const hasVoice =
    Boolean(voicePreviewUrls.length > 0 && voiceSegments.length > 0 && totalDuration > 0) &&
    voiceSegments.some((s) => s.endTime > s.startTime);
  const hasMusic =
    Boolean(musicFile && musicSegments.length > 0 && totalDuration > 0) &&
    musicSegments.some((s) => s.endTime > s.startTime);

  // ── Stable audio track callbacks — stable refs prevent defeating memo on VoiceTrackRow/MusicTrackRow ──
  const onVoiceSelectSegment = useCallback((idx: number) => {
    setSelectedAudioTrack("voice");
    setSelectedAudioSegmentIndex(idx);
  }, []);
  const onVoiceDeleteSegment = useCallback((segmentIndex: number) => {
    setVoiceSegments(voiceSegmentsRef.current.filter((_, i) => i !== segmentIndex));
    setSelectedAudioSegmentIndex((current) => {
      if (current == null) return null;
      if (current === segmentIndex) return null;
      return current > segmentIndex ? current - 1 : current;
    });
  }, [setVoiceSegments]);
  const onVoiceStartDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("voice");
    setSelectedAudioSegmentIndex(segmentIndex);
    voiceDragRef.current = { edge: "start", startX: e.clientX, initialStart: voiceSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: voiceSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);
  const onVoiceEndDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("voice");
    setSelectedAudioSegmentIndex(segmentIndex);
    voiceDragRef.current = { edge: "end", startX: e.clientX, initialStart: voiceSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: voiceSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);
  const onVoiceSegmentDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("voice");
    setSelectedAudioSegmentIndex(segmentIndex);
    voiceDragRef.current = { edge: "move", startX: e.clientX, initialStart: voiceSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: voiceSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);

  const onMusicSelectSegment = useCallback((idx: number) => {
    setSelectedAudioTrack("music");
    setSelectedAudioSegmentIndex(idx);
  }, []);
  const onMusicDeleteSegment = useCallback((segmentIndex: number) => {
    setMusicSegments(musicSegmentsRef.current.filter((_, i) => i !== segmentIndex));
    setSelectedAudioSegmentIndex((current) => {
      if (current == null) return null;
      if (current === segmentIndex) return null;
      return current > segmentIndex ? current - 1 : current;
    });
  }, [setMusicSegments]);
  const onMusicStartDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("music");
    setSelectedAudioSegmentIndex(segmentIndex);
    musicDragRef.current = { edge: "start", startX: e.clientX, initialStart: musicSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: musicSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);
  const onMusicEndDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("music");
    setSelectedAudioSegmentIndex(segmentIndex);
    musicDragRef.current = { edge: "end", startX: e.clientX, initialStart: musicSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: musicSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);
  const onMusicSegmentDragMouseDown = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAudioTrack("music");
    setSelectedAudioSegmentIndex(segmentIndex);
    musicDragRef.current = { edge: "move", startX: e.clientX, initialStart: musicSegmentsRef.current[segmentIndex]?.startTime ?? 0, initialEnd: musicSegmentsRef.current[segmentIndex]?.endTime ?? 0, segmentIndex };
  }, []);

  return (
    <div className="glass w-full rounded-2xl shadow-elegant select-none overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Timeline</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            {clips.length} clips · {formatTime(totalDuration)}
          </span>
          {playingSequence && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              playing
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={snapEnabled ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            aria-label="Toggle snap"
            onClick={toggleSnap}
            title={snapEnabled ? "Snap on" : "Snap off"}
          >
            <Magnet className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={zoomOut}
            aria-label="Zoom out"
            disabled={zoom <= 0.25}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-11 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={zoomIn}
            aria-label="Zoom in"
            disabled={zoom >= 4}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Track area ──────────────────────────────────────────────── */}
      <div
        ref={scrollerRef}
        className={[
          "scrollbar-thin w-full min-w-0 overflow-x-auto transition-colors duration-150",
          dropActive ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "",
        ].join(" ")}
        style={{ background: "var(--timeline-bg)", borderRadius: "0 0 1rem 1rem", contain: "layout" }}
        onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
        onDragLeave={() => setDropActive(false)}
        onDrop={onDrop}

      >
        {/* Inner width container so everything shares the same coordinate space */}
        <div
          className="relative"
          style={{ width: `${timelineContentWidth + TRACK_SIDE_PADDING_PX * 2}px`, minWidth: 0 }}
        >
          {/* ── Ruler — memoized, never re-renders during playback ── */}
          <TimelineRuler
            rulerRef={rulerRef}
            rulerTriangleRef={rulerTriangleRef}
            markerTimes={markerTimes}
            pxPerSec={pxPerSec}
            zoom={zoom}
            majorInterval={majorInterval}
            minorInterval={minorInterval}
            timelineWidth={timelineWidth}
            initialTriangleX={TRACK_SIDE_PADDING_PX + Math.max(0, playheadTime) * pxPerSec - 5}
            onMouseDown={handleRulerMouseDown}
          />

          {/* ── Video track ────────────────────────────────────────── */}
          <div
            className="relative px-3 pt-2 pb-1"
            style={{ minHeight: `${TRACK_HEIGHT + 16}px` }}
          >
            {/* Playhead needle — position updated via DOM ref (zero React re-renders) */}
            <div
              ref={playheadLineRef}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5"
              style={{
                background: "hsl(var(--primary))",
                transform: `translateX(${TRACK_SIDE_PADDING_PX + Math.max(0, playheadTime) * pxPerSec}px)`,
                willChange: "transform",
              }}
            />

            {clips.length === 0 ? (
              <div
                className="flex items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground"
                style={{ height: `${TRACK_HEIGHT}px` }}
              >
                Drag clips from the library to start your edit
              </div>
            ) : (
              <ClipTrack
                clips={clips}
                clipLayouts={clipLayouts}
                selectedClipId={selectedClipId}
                transitions={transitions}
                pxPerSec={pxPerSec}
                timelineContentWidth={timelineContentWidth}
                clipDragIndexRef={clipDragIndexRef}
                setSelected={setSelected}
                setSelectedAudioTrack={setSelectedAudioTrack}
                removeClip={removeClip}
                reorderClip={reorderClip}
                moveClip={moveClip}
                splitClip={splitClip}
                startTrimDrag={startTrimDrag}
                cycleTransition={cycleTransition}
              />
            )}
          </div>

          {/* ── Audio tracks ───────────────────────────────────────── */}
          <div className="space-y-1 px-3 pb-3">
            <VoiceTrackRow
              label="Voice"
              icon={<Mic className="h-3 w-3" />}
              color="oklch(0.7 0.18 200)"
              filled={hasVoice}
              segments={voiceSegments}
              totalWidth={timelineContentWidth}
              trackPaddingLeft={TRACK_SIDE_PADDING_PX}
              pxPerSec={pxPerSec}
              totalDuration={totalDuration}
              selectedSegmentIndex={selectedAudioTrack === "voice" ? selectedAudioSegmentIndex : null}
              onSelectSegment={onVoiceSelectSegment}
              onDeleteSegment={onVoiceDeleteSegment}
              onStartDragMouseDown={onVoiceStartDragMouseDown}
              onEndDragMouseDown={onVoiceEndDragMouseDown}
              onSegmentDragMouseDown={onVoiceSegmentDragMouseDown}
            />
            <MusicTrackRow
              label="Music"
              icon={<Music className="h-3 w-3" />}
              color="oklch(0.62 0.22 295)"
              filled={hasMusic}
              segments={musicSegments}
              totalWidth={timelineContentWidth}
              trackPaddingLeft={TRACK_SIDE_PADDING_PX}
              pxPerSec={pxPerSec}
              totalDuration={totalDuration}
              selectedSegmentIndex={selectedAudioTrack === "music" ? selectedAudioSegmentIndex : null}
              onSelectSegment={onMusicSelectSegment}
              onDeleteSegment={onMusicDeleteSegment}
              onStartDragMouseDown={onMusicStartDragMouseDown}
              onEndDragMouseDown={onMusicEndDragMouseDown}
              onSegmentDragMouseDown={onMusicSegmentDragMouseDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineRuler — memoized so 1500+ ticks never re-render during playback/clip transitions
// ─────────────────────────────────────────────────────────────────────────────
interface TimelineRulerProps {
  rulerRef: React.RefObject<HTMLDivElement | null>;
  rulerTriangleRef: React.RefObject<HTMLDivElement | null>;
  markerTimes: number[];
  pxPerSec: number;
  zoom: number;
  majorInterval: number;
  minorInterval: number;
  timelineWidth: number;
  initialTriangleX: number;
  onMouseDown: (e: React.MouseEvent) => void;
}

const TimelineRuler = memo(function TimelineRuler({
  rulerRef, rulerTriangleRef, markerTimes, pxPerSec, zoom,
  majorInterval, minorInterval, timelineWidth, initialTriangleX, onMouseDown,
}: TimelineRulerProps) {
  return (
    <div
      ref={rulerRef}
      className="sticky top-0 z-10 flex cursor-col-resize items-end border-b border-border/40"
      style={{ height: `${RULER_HEIGHT}px`, background: "var(--timeline-bg)" }}
      onMouseDown={onMouseDown}
    >
      {markerTimes.map((t) => (
        <div
          key={t}
          className="absolute bottom-0 flex flex-col items-start"
          style={{ left: `${TRACK_SIDE_PADDING_PX + t * pxPerSec}px` }}
        >
          <span className="mb-0.5 text-[9px] tabular-nums text-muted-foreground/70 pl-0.5">
            {formatTime(t)}
          </span>
          <div className="h-2 w-px bg-border/60" />
        </div>
      ))}
      {zoom >= 1.5 &&
        Array.from(
          { length: Math.floor(timelineWidth / minorInterval) + 1 },
          (_, i) => i * minorInterval,
        )
          .filter((t) => t % majorInterval !== 0)
          .map((t) => (
            <div
              key={`minor-${t}`}
              className="absolute bottom-0 h-1 w-px bg-border/30"
              style={{ left: `${TRACK_SIDE_PADDING_PX + t * pxPerSec}px` }}
            />
          ))}
      {/* Playhead triangle — position driven by DOM ref, initial value only used on mount */}
      <div
        ref={rulerTriangleRef}
        className="pointer-events-none absolute bottom-0 left-0 z-20 flex flex-col items-center"
        style={{ transform: `translateX(${initialTriangleX}px)`, willChange: "transform" }}
      >
        <div
          className="h-0 w-0"
          style={{
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "6px solid hsl(var(--primary))",
            marginBottom: "-1px",
          }}
        />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Voice track row (with draggable start/end edges)
// ─────────────────────────────────────────────────────────────────────────────
interface VoiceTrackRowProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  filled: boolean;
  totalWidth: number;
  trackPaddingLeft: number;
  pxPerSec: number;
  totalDuration: number;
  segments: { id: string; startTime: number; endTime: number }[];
  selectedSegmentIndex: number | null;
  onSelectSegment: (segmentIndex: number) => void;
  onDeleteSegment: (segmentIndex: number) => void;
  onSegmentDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
  onStartDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
  onEndDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
}

const VoiceTrackRow = memo(function VoiceTrackRow({
  label,
  icon,
  color,
  filled,
  totalWidth,
  trackPaddingLeft,
  pxPerSec,
  totalDuration,
  segments,
  selectedSegmentIndex,
  onSelectSegment,
  onDeleteSegment,
  onSegmentDragMouseDown,
  onStartDragMouseDown,
  onEndDragMouseDown,
}: VoiceTrackRowProps) {
  const bedHeight = 20;

  return (
    <div style={{ height: `${AUDIO_TRACK_HEIGHT}px` }}>
      <div
        className="relative overflow-hidden rounded-md border border-border/40 bg-background/40 select-none"
        style={{ width: `${totalWidth}px`, height: `${bedHeight}px` }}
      >
        {filled &&
          segments.map((seg, i) => {
            const startX = Math.max(0, seg.startTime * pxPerSec);
            const widthPx = Math.max(0, (seg.endTime - seg.startTime) * pxPerSec);
            if (widthPx <= 0) return null;

            const waveformBarCount = Math.min(200, Math.max(1, Math.floor(widthPx / 4)));
            const isSelected = selectedSegmentIndex === i;

            return (
              <div
                key={seg.id}
                className="absolute top-0 h-full cursor-grab opacity-85 active:cursor-grabbing"
                style={{
                  left: `${trackPaddingLeft + startX}px`,
                  width: `${widthPx}px`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectSegment(i);
                  onSegmentDragMouseDown(e, i);
                }}
                title="Drag to move voice segment"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, ${color} 0%, ${color} 92%, transparent 100%)`,
                  }}
                >
                  <div className="flex h-full items-center gap-px px-1">
                    {Array.from({ length: waveformBarCount }).map((_, j) => (
                      <div
                        key={j}
                        className="w-0.5 shrink-0 rounded-sm bg-white/70"
                        style={{
                          height: `${28 + Math.abs(Math.sin(j * 0.9)) * 60}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Move voice start"
                  onMouseDown={(e) => onStartDragMouseDown(e, i)}
                  className={[
                    "absolute top-0 z-10 w-2 cursor-ew-resize bg-white/40",
                    isSelected ? "ring-2 ring-primary/30" : "",
                  ].join(" ")}
                  style={{ left: "-1px", height: `${bedHeight}px`, borderRadius: 2 }}
                  title={`Voice start: ${formatTime(seg.startTime)}`}
                />

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Move voice end"
                  onMouseDown={(e) => onEndDragMouseDown(e, i)}
                  className={[
                    "absolute top-0 z-10 w-2 cursor-ew-resize bg-white/40",
                    isSelected ? "ring-2 ring-primary/30" : "",
                  ].join(" ")}
                  style={{
                    left: `${widthPx - 1}px`,
                    height: `${bedHeight}px`,
                    borderRadius: 2,
                  }}
                  title={`Voice end: ${formatTime(seg.endTime)}`}
                />

                {isSelected && (
                  <div className="absolute -top-0.5 right-0 z-20 flex items-center gap-1 rounded bg-black/30 px-1 py-0.5 text-[9px] text-white/90 backdrop-blur">
                    <span>
                      {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                    </span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-white/90 transition-colors hover:bg-destructive/80 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(i);
                      }}
                      aria-label="Delete voice segment"
                      title="Delete voice segment"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

        {(!filled || segments.length === 0) && (
          <div className="flex h-full items-center justify-center px-2">
            <span className="text-[9px] text-muted-foreground/50">No voice</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Music track row (with draggable start/end edges)
// ─────────────────────────────────────────────────────────────────────────────
interface MusicTrackRowProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  filled: boolean;
  totalWidth: number;
  trackPaddingLeft: number;
  pxPerSec: number;
  totalDuration: number;
  segments: { id: string; startTime: number; endTime: number }[];
  selectedSegmentIndex: number | null;
  onSelectSegment: (segmentIndex: number) => void;
  onDeleteSegment: (segmentIndex: number) => void;
  onSegmentDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
  onStartDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
  onEndDragMouseDown: (e: React.MouseEvent, segmentIndex: number) => void;
}

const MusicTrackRow = memo(function MusicTrackRow({
  label,
  icon,
  color,
  filled,
  totalWidth,
  trackPaddingLeft,
  pxPerSec,
  totalDuration,
  segments,
  selectedSegmentIndex,
  onSelectSegment,
  onDeleteSegment,
  onSegmentDragMouseDown,
  onStartDragMouseDown,
  onEndDragMouseDown,
}: MusicTrackRowProps) {
  const bedHeight = 20;

  return (
    <div style={{ height: `${AUDIO_TRACK_HEIGHT}px` }}>
      <div
        className="relative overflow-hidden rounded-md border border-border/40 bg-background/40 select-none"
        style={{ width: `${totalWidth}px`, height: `${bedHeight}px` }}
      >
        {filled &&
          segments.map((seg, i) => {
            const startX = Math.max(0, seg.startTime * pxPerSec);
            const widthPx = Math.max(0, (seg.endTime - seg.startTime) * pxPerSec);
            if (widthPx <= 0) return null;

            const waveformBarCount = Math.min(200, Math.max(1, Math.floor(widthPx / 4)));
            const isSelected = selectedSegmentIndex === i;

            return (
              <div
                key={seg.id}
                className="absolute top-0 h-full cursor-grab opacity-85 active:cursor-grabbing"
                style={{
                  left: `${trackPaddingLeft + startX}px`,
                  width: `${widthPx}px`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectSegment(i);
                  onSegmentDragMouseDown(e, i);
                }}
                title="Drag to move music segment"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, ${color} 0%, ${color} 92%, transparent 100%)`,
                  }}
                >
                  <div className="flex h-full items-center gap-px px-1">
                    {Array.from({ length: waveformBarCount }).map((_, j) => (
                      <div
                        key={j}
                        className="w-0.5 shrink-0 rounded-sm bg-white/70"
                        style={{
                          height: `${28 + Math.abs(Math.sin(j * 0.9)) * 60}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Move music start"
                  onMouseDown={(e) => onStartDragMouseDown(e, i)}
                  className={[
                    "absolute top-0 z-10 w-2 cursor-ew-resize bg-white/40",
                    isSelected ? "ring-2 ring-primary/30" : "",
                  ].join(" ")}
                  style={{ left: "-1px", height: `${bedHeight}px`, borderRadius: 2 }}
                  title={`Music start: ${formatTime(seg.startTime)}`}
                />

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Move music end"
                  onMouseDown={(e) => onEndDragMouseDown(e, i)}
                  className={[
                    "absolute top-0 z-10 w-2 cursor-ew-resize bg-white/40",
                    isSelected ? "ring-2 ring-primary/30" : "",
                  ].join(" ")}
                  style={{
                    left: `${widthPx - 1}px`,
                    height: `${bedHeight}px`,
                    borderRadius: 2,
                  }}
                  title={`Music end: ${formatTime(seg.endTime)}`}
                />

                {isSelected && (
                  <div className="absolute -top-0.5 right-0 z-20 flex items-center gap-1 rounded bg-black/30 px-1 py-0.5 text-[9px] text-white/90 backdrop-blur">
                    <span>
                      {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                    </span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-white/90 transition-colors hover:bg-destructive/80 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(i);
                      }}
                      aria-label="Delete music segment"
                      title="Delete music segment"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

        {(!filled || segments.length === 0) && (
          <div className="flex h-full items-center px-2">
            <span className="text-[9px] text-muted-foreground/50">No music</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Audio track row
// ─────────────────────────────────────────────────────────────────────────────
interface AudioTrackRowProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  filled: boolean;
  totalWidth: number;
  pxPerSec: number;
  totalDuration: number;
  // If true, hide the label text once the track is filled.
  hideLabelWhenFilled?: boolean;
}

function AudioTrackRow({
  label,
  icon,
  color,
  filled,
  totalWidth,
  pxPerSec,
  totalDuration,
  hideLabelWhenFilled,
}: AudioTrackRowProps) {
  const segmentWidth = totalDuration * pxPerSec;

  return (
    <div
      className="flex items-center gap-2"
      style={{ height: `${AUDIO_TRACK_HEIGHT}px` }}
    >
      {/* Label */}
      <div
        className={[
          "flex shrink-0 items-center justify-end gap-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
          hideLabelWhenFilled && filled ? "w-0 overflow-hidden opacity-0" : "w-16",
        ].join(" ")}
      >
        {icon}
        {(hideLabelWhenFilled && filled) ? null : label}
      </div>

      {/* Track bed */}
      <div
        className="relative overflow-hidden rounded-md border border-border/40 bg-background/40"
        style={{ width: `${totalWidth}px`, height: "20px" }}
      >
        {filled && segmentWidth > 0 && (
          <div
            className="absolute left-0 top-0 h-full opacity-80"
            style={{
              width: `${segmentWidth}px`,
              background: `linear-gradient(90deg, ${color} 0%, ${color} 92%, transparent 100%)`,
            }}
          >
            {/* Simulated waveform bars */}
            <div className="flex h-full items-center gap-px px-1">
              {Array.from({ length: Math.min(200, Math.floor(segmentWidth / 4)) }).map((_, j) => (
                <div
                  key={j}
                  className="w-0.5 shrink-0 rounded-sm bg-white/70"
                  style={{
                    height: `${28 + Math.abs(Math.sin(j * 0.9)) * 60}%`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {!filled && (
          <div className="flex h-full items-center px-2">
            <span className="text-[9px] text-muted-foreground/50">No {label.toLowerCase()} added</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ClipTrack — memo-wrapped so playhead ticks don't re-render all clips ──────
interface ClipTrackProps {
  clips: Clip[];
  clipLayouts: TimelineClipLayout[];
  selectedClipId: string | null;
  transitions: Record<string, TransitionMode>;
  pxPerSec: number;
  timelineContentWidth: number;
  clipDragIndexRef: React.MutableRefObject<number | null>;
  setSelected: (id: string | null) => void;
  setSelectedAudioTrack: (t: "voice" | "music" | null) => void;
  removeClip: (id: string) => void;
  reorderClip: (from: number, to: number) => void;
  moveClip: (id: string, dir: -1 | 1) => void;
  splitClip: (id: string) => void;
  startTrimDrag: (e: React.MouseEvent, clipId: string, edge: "left" | "right", start: number, end: number) => void;
  cycleTransition: (leftId: string, rightId: string) => void;
}

const transitionLabelFn = (mode: TransitionMode) => {
  if (mode === "crossfade") return "CF";
  if (mode === "wipe") return "WP";
  if (mode === "zoom-in") return "ZI";
  if (mode === "zoom-out") return "ZO";
  return "+";
};

// ── ClipItem — individual clip memoized so only the 2 changing clips re-render ─
interface ClipItemProps {
  clip: Clip;
  idx: number;
  clipLayout: TimelineClipLayout | undefined;
  isSel: boolean;
  isLast: boolean;
  nextClipId: string | undefined;
  transitionMode: TransitionMode;
  pxPerSec: number;
  clipCount: number;
  clipDragIndexRef: React.MutableRefObject<number | null>;
  setSelected: (id: string | null) => void;
  setSelectedAudioTrack: (t: "voice" | "music" | null) => void;
  removeClip: (id: string) => void;
  reorderClip: (from: number, to: number) => void;
  moveClip: (id: string, dir: -1 | 1) => void;
  splitClip: (id: string) => void;
  startTrimDrag: (e: React.MouseEvent, clipId: string, edge: "left" | "right", start: number, end: number) => void;
  cycleTransition: (leftId: string, rightId: string) => void;
}

const ClipItem = memo(function ClipItem({
  clip, idx, clipLayout, isSel, isLast, nextClipId, transitionMode,
  pxPerSec, clipCount, clipDragIndexRef,
  setSelected, setSelectedAudioTrack, removeClip, reorderClip, moveClip, splitClip,
  startTrimDrag, cycleTransition,
}: ClipItemProps) {
  const clipDuration = clipLayout?.duration ?? Math.max(0, clip.trimEnd - clip.trimStart);
  const w = clipLayout?.widthPx ?? Math.max(MIN_CLIP_WIDTH_PX, clipDuration * pxPerSec);
  const leftPx = (clipLayout?.startTime ?? 0) * pxPerSec;

  return (
    <div key={clip.id}>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={() => { clipDragIndexRef.current = idx; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.stopPropagation();
          if (clipDragIndexRef.current !== null && clipDragIndexRef.current !== idx) {
            reorderClip(clipDragIndexRef.current, idx);
          }
          clipDragIndexRef.current = null;
        }}
        onClick={() => { setSelected(clip.id); setSelectedAudioTrack(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setSelected(clip.id);
          if (e.key === "Delete" || e.key === "Backspace") removeClip(clip.id);
        }}
        className={[
          "group absolute top-0 flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-all duration-100",
          isSel ? "border-primary shadow-glow ring-2 ring-primary/40 z-10" : "border-border/60 hover:border-primary/40",
        ].join(" ")}
        style={{
          left: `${leftPx}px`,
          width: `${w}px`,
          height: `${TRACK_HEIGHT}px`,
          background: clip.thumbnail
            ? `url(${clip.thumbnail}) center / cover no-repeat`
            : "linear-gradient(135deg,#0f172a,#1f2937)",
          flexShrink: 0,
        }}
      >
        <button
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-lg bg-white/50 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Trim start"
          onMouseDown={(e) => startTrimDrag(e, clip.id, "left", clip.trimStart, clip.trimEnd)}
        />
        <button
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-lg bg-white/50 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Trim end"
          onMouseDown={(e) => startTrimDrag(e, clip.id, "right", clip.trimStart, clip.trimEnd)}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/50 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
          <span className="flex min-w-0 items-center gap-1">
            <GripVertical className="h-3 w-3 shrink-0 opacity-60" />
            <span className="truncate">{clip.name}</span>
          </span>
          <span className="ml-1 shrink-0 tabular-nums opacity-70">{formatTime(clipDuration)}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-4 gap-px px-0.5 opacity-40">
          {Array.from({ length: Math.max(4, Math.floor(w / 6)) }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-white/50"
              style={{ height: `${35 + Math.abs(Math.sin(i * 1.7 + idx)) * 55}%`, alignSelf: "flex-end" }}
            />
          ))}
        </div>
        {isSel && (
          <div className="absolute right-1 top-7 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [&>button]:rounded [&>button]:bg-black/70 [&>button]:p-1 [&>button]:text-white [&>button]:backdrop-blur [&>button]:transition-colors">
            <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, -1); }} disabled={idx === 0} aria-label="Move left" title="Move left" className="hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40">
              <span className="text-[10px]">←</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 1); }} disabled={idx === clipCount - 1} aria-label="Move right" title="Move right" className="hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40">
              <span className="text-[10px]">→</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); splitClip(clip.id); }} aria-label="Split at playhead" title="Split" className="hover:bg-primary">
              <Scissors className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }} aria-label="Delete clip" title="Delete" className="hover:bg-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {!isLast && nextClipId && (
        <button
          onClick={() => cycleTransition(clip.id, nextClipId)}
          className={[
            "absolute top-1/2 z-20 flex h-7 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border text-[9px] font-semibold shadow-sm transition-all",
            transitionMode !== "none"
              ? "border-primary bg-primary/20 text-primary"
              : "border-dashed border-border/70 text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary",
          ].join(" ")}
          style={{ left: `${leftPx + w}px` }}
          title={`Transition: ${transitionMode}`}
          aria-label="Cycle transition"
        >
          {transitionLabelFn(transitionMode)}
        </button>
      )}
    </div>
  );
});

const ClipTrack = memo(function ClipTrack({
  clips, clipLayouts, selectedClipId, transitions, pxPerSec,
  timelineContentWidth, clipDragIndexRef, setSelected, setSelectedAudioTrack,
  removeClip, reorderClip, moveClip, splitClip, startTrimDrag, cycleTransition,
}: ClipTrackProps) {
  return (
    <div className="relative" style={{ width: `${timelineContentWidth}px`, height: `${TRACK_HEIGHT}px` }}>
      {clips.map((clip, idx) => {
        const nextClip = clips[idx + 1];
        const transitionKey = nextClip ? `${clip.id}::${nextClip.id}` : "";
        const transitionMode: TransitionMode = transitionKey ? (transitions[transitionKey] ?? "none") : "none";
        return (
          <ClipItem
            key={clip.id}
            clip={clip}
            idx={idx}
            clipLayout={clipLayouts[idx]}
            isSel={clip.id === selectedClipId}
            isLast={idx === clips.length - 1}
            nextClipId={nextClip?.id}
            transitionMode={transitionMode}
            pxPerSec={pxPerSec}
            clipCount={clips.length}
            clipDragIndexRef={clipDragIndexRef}
            setSelected={setSelected}
            setSelectedAudioTrack={setSelectedAudioTrack}
            removeClip={removeClip}
            reorderClip={reorderClip}
            moveClip={moveClip}
            splitClip={splitClip}
            startTrimDrag={startTrimDrag}
            cycleTransition={cycleTransition}
          />
        );
      })}
    </div>
  );
});
