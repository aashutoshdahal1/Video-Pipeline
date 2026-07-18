import { useEffect, useRef, useCallback } from "react";
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor, usePlayback, formatTime } from "./editor-context";

export default function PreviewPlayer() {
  const {
    clips, setSelected, totalDuration,
    setPreviewIndex,
    playheadTime, setPlayheadTime, notifyPlayhead, subscribePlayhead,
    seekRequest, seekToTime,
    setPlayingSequence,
    voicePreviewUrls,
    musicPreviewUrl,
    voiceVolume,
    voiceMuted,
    musicVolume,
    voiceDurations,
    musicDuration,
    voiceSegments,
    musicSegments,
  } = useEditor();
  // selectedClipId, previewIndex, playingSequence from PlaybackCtx — updates here
  // don't cascade to the main context's useEditor() consumers (TopBar, ToolsPanel, etc.)
  const { selectedClipId, previewIndex, playingSequence } = usePlayback();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceAudioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const timeDisplayRef = useRef<HTMLSpanElement | null>(null);
  const scrubberRef = useRef<HTMLInputElement | null>(null);

  // Stable refs to avoid stale closures in rAF / event handlers
  const clipsRef = useRef(clips);
  const previewIndexRef = useRef(previewIndex);
  const playingRef = useRef(playingSequence);
  const isMovingRef = useRef(false);
  // Forward ref so startRAF can call startImageRAF without a circular dep
  const startImageRAFRef = useRef<() => void>(() => undefined);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { previewIndexRef.current = previewIndex; }, [previewIndex]);
  useEffect(() => { playingRef.current = playingSequence; }, [playingSequence]);

  // ── Subscribe to playhead bus — update time display + scrubber without re-renders ──
  const totalDurationRef = useRef(totalDuration);
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  useEffect(() => {
    return subscribePlayhead((t) => {
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = formatTime(t);
      const scrubber = scrubberRef.current;
      if (scrubber) scrubber.value = String(Math.min(t, totalDurationRef.current));
    });
  }, [subscribePlayhead]);

  // ── Audio volume sync ────────────────────────────────────────────────
  useEffect(() => {
    const vol = voiceMuted ? 0 : Math.max(0, Math.min(1, voiceVolume / 100));
    for (const a of voiceAudioRefs.current) {
      if (a) a.volume = vol;
    }
  }, [voiceVolume, voiceMuted]);

  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = Math.max(0, Math.min(1, musicVolume / 100));
    }
  }, [musicVolume]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const getElapsedBefore = useCallback((index: number) =>
    clipsRef.current
      .slice(0, index)
      .reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0),
  []);

  const getActiveSegment = useCallback(
    <T extends { startTime: number; endTime: number }>(segments: T[], t: number) =>
      segments.find((s) => t >= s.startTime && t <= s.endTime) ?? null,
    [],
  );

  const findClipAtTime = useCallback((time: number) => {
    let elapsed = 0;
    const list = clipsRef.current;
    for (let i = 0; i < list.length; i++) {
      const len = Math.max(0, list[i].trimEnd - list[i].trimStart);
      if (time < elapsed + len || i === list.length - 1) {
        return {
          index: i,
          localTime: Math.max(list[i].trimStart,
            Math.min(list[i].trimEnd, list[i].trimStart + (time - elapsed))),
        };
      }
      elapsed += len;
    }
    return null;
  }, []);

  // ── Shared audio sync (used by both video and image RAF ticks) ──────────
  const syncAudio = useCallback((elapsed: number) => {
    const music = musicRef.current;

    if (music && musicPreviewUrl && music.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const dur = musicDuration > 0 ? musicDuration :
        (Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0);
      const activeMusic = getActiveSegment(musicSegments, elapsed);
      const within = dur > 0 && activeMusic != null;
      if (within && playingRef.current) {
        const desired = (elapsed - (activeMusic?.startTime ?? 0)) % dur;
        if (Math.abs(music.currentTime - desired) > 0.12) music.currentTime = desired;
        if (music.paused) void music.play().catch(() => undefined);
      } else {
        if (!music.paused) music.pause();
      }
    }

    if (voicePreviewUrls.length) {
      const activeVoice = getActiveSegment(voiceSegments, elapsed);
      const srcIdx = activeVoice?.sourceIndex ?? 0;
      const dur = voiceDurations[srcIdx] ?? 0;
      const within = dur > 0 && activeVoice != null;
      for (let i = 0; i < voiceAudioRefs.current.length; i++) {
        const a = voiceAudioRefs.current[i];
        if (!a) continue;
        if (!within || i !== srcIdx) { if (!a.paused) a.pause(); }
      }
      if (within && playingRef.current) {
        const audio = voiceAudioRefs.current[srcIdx];
        if (audio) {
          const desiredAudioTime = elapsed - (activeVoice?.startTime ?? 0);
          if (desiredAudioTime >= dur - 0.02) {
            if (!audio.paused) audio.pause();
          } else {
            const desired = Math.max(0, desiredAudioTime);
            if (Math.abs(audio.currentTime - desired) > 0.3) audio.currentTime = desired;
            if (audio.paused) void audio.play().catch(() => undefined);
          }
        }
      }
    }
  }, [voicePreviewUrls, musicPreviewUrl, voiceDurations, musicDuration, voiceSegments, musicSegments, getActiveSegment]);

  // ── rAF loop ─────────────────────────────────────────────────────────
  const startRAF = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const video = videoRef.current;
      const idx = previewIndexRef.current;
      const list = clipsRef.current;
      const clip = list[idx];
      if (!clip || !playingRef.current) return;
      // Image clips are driven by startImageRAF, not this loop
      if (clip.mediaType === "image") return;
      if (!video) return;

      const elapsed = getElapsedBefore(idx) +
        Math.max(0, Math.min(video.currentTime, clip.trimEnd) - clip.trimStart);
      notifyPlayhead(elapsed);
      syncAudio(elapsed);

      // Advance to next clip when current ends
      if (!isMovingRef.current && video.currentTime >= clip.trimEnd - 0.05) {
        moveToNextClip();
        // moveToNextClip sets playingRef.current=false on the last clip — bail out
        if (!playingRef.current) return;
        // If the next clip is an image, hand off to the image RAF
        const nextClip = clipsRef.current[previewIndexRef.current];
        if (nextClip?.mediaType === "image") {
          startImageRAFRef.current();
          return; // don't reschedule the video tick
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getElapsedBefore, getActiveSegment, notifyPlayhead, syncAudio]);

  const stopRAF = useCallback(() => { cancelAnimationFrame(rafRef.current); }, []);

  // ── Clip advancement ─────────────────────────────────────────────────
  const moveToNextClip = useCallback(() => {
    if (isMovingRef.current) return;
    isMovingRef.current = true;
    const idx = previewIndexRef.current;
    const list = clipsRef.current;
    if (idx >= list.length - 1) {
      // Set synchronously before any rAF tick can observe playingRef.current=true
      playingRef.current = false;
      videoRef.current?.pause();
      for (const a of voiceAudioRefs.current) a?.pause();
      musicRef.current?.pause();
      setPlayingSequence(false);
      stopRAF();
      isMovingRef.current = false;
      return;
    }
    const nextIdx = idx + 1;
    previewIndexRef.current = nextIdx;
    setPreviewIndex(nextIdx);
    setSelected(list[nextIdx].id);
    isMovingRef.current = false;
  }, [setPreviewIndex, setSelected, setPlayingSequence, stopRAF]);

  // ── Seek to trimStart when the active clip's URL changes ──────────────
  // Track the URL so this re-fires when a new blob is added at previewIndex 0
  // (previewIndex stays 0 on first upload, so deps=[previewIndex] never re-fired).
  const activeClipUrl = clips[previewIndex]?.url ?? "";
  const activeClipTrimStart = clips[previewIndex]?.trimStart ?? 0;

  useEffect(() => {
    const clip = clips[previewIndex];
    if (!clip || clip.mediaType === "image") return; // images have no video to seek
    const video = videoRef.current;
    if (!video || !activeClipUrl) return;

    const seek = () => { video.currentTime = activeClipTrimStart; };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIndex, activeClipUrl]);

  // ── Muted state sync ─────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const clip = clips[previewIndex];
    if (!video || !clip) return;
    video.muted = Boolean(clip.muted);
  }, [previewIndex, clips]);

  // ── Seek requests (from timeline scrub) ──────────────────────────────
  useEffect(() => {
    if (!seekRequest || !clips.length) return;
    const target = findClipAtTime(seekRequest.time);
    if (!target) return;

    const video = videoRef.current;
    const music = musicRef.current;

    const applySeek = () => {
      if (!video) return;
      video.currentTime = target.localTime;
      if (voicePreviewUrls.length) {
        const activeVoice = getActiveSegment(voiceSegments, seekRequest.time);
        for (const a of voiceAudioRefs.current) a?.pause();
        if (activeVoice) {
          const srcIdx = activeVoice.sourceIndex ?? 0;
          const audio = voiceAudioRefs.current[srcIdx];
          const dur = voiceDurations[srcIdx] ?? audio?.duration ?? 0;
          if (audio && dur > 0) {
            audio.currentTime = Math.min(
              Math.max(0, seekRequest.time - activeVoice.startTime),
              Math.max(0, dur - 0.02),
            );
          }
        }
      }
      if (music && musicPreviewUrl) {
        const dur = musicDuration > 0 ? musicDuration :
          (Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0);
        const activeMusic = getActiveSegment(musicSegments, seekRequest.time);
        const within = dur > 0 && activeMusic != null;
        if (within) {
          music.currentTime = (seekRequest.time - (activeMusic?.startTime ?? 0)) % dur;
          if (playingRef.current) void music.play().catch(() => undefined);
        } else {
          music.pause();
        }
      }
      if (playingRef.current) void video.play().catch(() => undefined);
    };

    if (target.index !== previewIndex) {
      setPreviewIndex(target.index);
      setSelected(clips[target.index]?.id ?? null);
      const handler = () => {
        video?.removeEventListener("loadedmetadata", handler);
        applySeek();
      };
      video?.addEventListener("loadedmetadata", handler, { once: true });
    } else {
      applySeek();
    }

    setPlayheadTime(seekRequest.time);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.id]);

  // ── Sync previewIndex when timeline clip is clicked ──────────────────
  useEffect(() => {
    if (!selectedClipId) return;
    const idx = clips.findIndex(c => c.id === selectedClipId);
    if (idx >= 0 && idx !== previewIndex) setPreviewIndex(idx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId]);

  // ── Image clip playback via RAF (no video element) ───────────────────
  const imageStartTimeRef = useRef<number | null>(null);
  const imagePlayheadBaseRef = useRef<number>(0);

  const startImageRAF = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    imageStartTimeRef.current = performance.now();

    const tick = () => {
      const idx = previewIndexRef.current;
      const list = clipsRef.current;
      const clip = list[idx];
      if (!clip || !playingRef.current) return;

      const slotDuration = clip.trimEnd - clip.trimStart;
      const elapsed = (performance.now() - (imageStartTimeRef.current ?? performance.now())) / 1000;
      const t = getElapsedBefore(idx) + Math.min(elapsed, slotDuration);
      notifyPlayhead(t);
      syncAudio(t);

      if (elapsed >= slotDuration - 0.05) {
        // End of sequence
        if (idx >= list.length - 1) {
          playingRef.current = false;
          setPlayingSequence(false);
          imageStartTimeRef.current = null;
          return;
        }
        // Advance index
        const nextIdx = idx + 1;
        previewIndexRef.current = nextIdx;
        setPreviewIndex(nextIdx);
        setSelected(list[nextIdx].id);

        const nextClip = list[nextIdx];
        if (nextClip.mediaType === "image") {
          // Re-arm timer for next image
          imageStartTimeRef.current = performance.now();
          rafRef.current = requestAnimationFrame(tick);
        } else {
          // Switch to video playback
          const video = videoRef.current;
          if (!video) return;
          const loadAndPlay = () => {
            video.currentTime = nextClip.trimStart;
            video.play().then(() => startRAF()).catch((err) => {
              playingRef.current = false;
              setPlayingSequence(false);
              console.error("[PreviewPlayer] image→video play() rejected:", err);
            });
          };
          if (video.src !== nextClip.url || video.error || video.readyState === HTMLMediaElement.HAVE_NOTHING) {
            video.src = nextClip.url;
            video.addEventListener("canplay", loadAndPlay, { once: true });
            video.load();
          } else {
            loadAndPlay();
          }
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [getElapsedBefore, syncAudio, notifyPlayhead, setPlayingSequence, setPreviewIndex, setSelected, startRAF]);

  // Keep the forward ref in sync so startRAF can call startImageRAF without circular dep
  useEffect(() => { startImageRAFRef.current = startImageRAF; }, [startImageRAF]);

  // ── Play / Pause controls ─────────────────────────────────────────────
  const play = useCallback(() => {
    if (!clips.length) return;
    const clip = clips[previewIndex];
    if (!clip?.url) return;

    // Unlock all audio elements inside the user-gesture handler so the browser
    // autoplay policy allows subsequent play() calls from the rAF loop.
    const unlockAudio = () => {
      const unlock = (a: HTMLAudioElement | null) => {
        if (!a) return;
        const p = a.play();
        if (p) p.then(() => a.pause()).catch(() => undefined);
      };
      for (const a of voiceAudioRefs.current) unlock(a);
      unlock(musicRef.current);
    };

    // Image clip — no video element involved
    if (clip.mediaType === "image") {
      unlockAudio();
      playingRef.current = true;
      setPlayingSequence(true);
      startImageRAF();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const doPlay = () => {
      if (video.currentTime >= clip.trimEnd - 0.05) {
        video.currentTime = clip.trimStart;
      }
      unlockAudio();
      playingRef.current = true;
      setPlayingSequence(true);
      const promise = video.play();
      if (promise !== undefined) {
        promise.then(() => startRAF()).catch((err) => {
          playingRef.current = false;
          setPlayingSequence(false);
          console.error("[PreviewPlayer] play() rejected:", err);
        });
      } else {
        startRAF();
      }
    };

    const srcMismatch = video.src !== clip.url;
    const broken = video.error !== null || video.readyState === HTMLMediaElement.HAVE_NOTHING;

    if (srcMismatch || broken) {
      video.src = clip.url;
      video.addEventListener("canplay", () => {
        video.currentTime = clip.trimStart;
        doPlay();
      }, { once: true });
      video.addEventListener("error", () => {
        console.error("[PreviewPlayer] error after load:", video.error?.message);
      }, { once: true });
      video.load();
      return;
    }

    doPlay();
  }, [clips, previewIndex, getElapsedBefore, setPlayingSequence, startRAF, startImageRAF]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    for (const a of voiceAudioRefs.current) a?.pause();
    musicRef.current?.pause();
    playingRef.current = false;
    imageStartTimeRef.current = null;
    setPlayingSequence(false);
    stopRAF();
  }, [setPlayingSequence, stopRAF]);

  const jumpClip = useCallback((dir: -1 | 1) => {
    const nextIdx = Math.max(0, Math.min(clips.length - 1, previewIndex + dir));
    setPreviewIndex(nextIdx);
    setSelected(clips[nextIdx]?.id ?? null);
    if (playingSequence) void videoRef.current?.play().catch(() => undefined);
  }, [clips, previewIndex, playingSequence, setPreviewIndex, setSelected]);

  // ── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => () => stopRAF(), [stopRAF]);

  const activeClip = clips[previewIndex] ?? null;

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl shadow-elegant">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
          <span className="text-xs font-medium text-muted-foreground truncate">
            Preview · {activeClip?.name ?? "No clip selected"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span ref={timeDisplayRef} className="font-mono tabular-nums text-foreground">{formatTime(playheadTime)}</span>
          <span>/</span>
          <span className="font-mono tabular-nums">{formatTime(totalDuration)}</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          className="relative aspect-video max-h-full w-full overflow-hidden rounded-xl shadow-glow ring-1 ring-white/10"
          style={{ display: activeClip ? "block" : "none" }}
        >
          {/* Image clip — key forces a new DOM node per clip so the old image
              stays visible until the new one is decoded (no black flash). */}
          {activeClip?.mediaType === "image" && activeClip.url && (
            <img
              key={activeClip.id}
              src={activeClip.url}
              alt={activeClip.name}
              className="h-full w-full bg-black object-contain"
            />
          )}
          {/* Video clip — always rendered so videoRef is never null.
              Never set src="" — that puts the element into an error state. */}
          <video
            ref={videoRef}
            {...(activeClip?.mediaType !== "image" && activeClip?.url ? { src: activeClip.url } : {})}
            className="h-full w-full bg-black object-contain"
            style={{ display: activeClip?.mediaType === "image" ? "none" : "block" }}
            playsInline
            preload="auto"
          />
          <div className="absolute left-4 top-4 rounded-md bg-black/40 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur">
            1080p
          </div>
        </div>

        {!activeClip && (
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
            No clips yet
          </div>
        )}

        {voicePreviewUrls.map((url, i) => (
          <audio
            key={`voice-${i}-${url}`}
            ref={(el) => { voiceAudioRefs.current[i] = el; }}
            src={url}
            preload="auto"
          />
        ))}
        {musicPreviewUrl && (
          <audio ref={musicRef} src={musicPreviewUrl} preload="auto" loop />
        )}
      </div>

      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpClip(-1)}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => (playingSequence ? pause() : play())}
            size="icon"
            className="h-9 w-9 gradient-primary border-0 text-white"
            disabled={!clips.length}
          >
            {playingSequence
              ? <Pause className="h-4 w-4" />
              : <Play className="ml-0.5 h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpClip(1)}>
            <SkipForward className="h-4 w-4" />
          </Button>
          <div className="ml-2 flex flex-1 items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <input
              ref={scrubberRef}
              type="range"
              min={0}
              max={Math.max(0.1, totalDuration)}
              step={0.05}
              defaultValue={Math.min(playheadTime, totalDuration)}
              onChange={(e) => seekToTime(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
              aria-label="Timeline scrub"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => videoRef.current?.requestFullscreen?.()}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
