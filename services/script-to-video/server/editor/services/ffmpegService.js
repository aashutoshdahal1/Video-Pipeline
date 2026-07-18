const { execFile } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

/* ─────────────────────────────────────────────────────────────
   RUN FFmpeg
   ───────────────────────────────────────────────────────────── */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log('\n[FFMPEG CMD]', 'ffmpeg', args.join(' '));

    execFile('ffmpeg', args, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[FFMPEG ERROR]\n', stderr);
        return reject(new Error(`FFmpeg failed: ${stderr || err.message}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

/* ─────────────────────────────────────────────────────────────
   TRIM
   - Normalises every clip to the same codec / resolution /
     framerate / sample-rate so the concat demuxer can safely
     stream-copy them together without re-encoding.
   ───────────────────────────────────────────────────────────── */
async function trimVideo(input, output, start = 0, end = null, targetW = 1920, targetH = 1080, muted = false) {

  const duration = (end != null && end > start)
    ? Math.max(0.1, end - start)
    : null;

  console.log(`[TRIM] ${path.basename(input)} start=${start} end=${end} duration=${duration} muted=${muted}`);

  const args = [
    '-y',

    // Seek BEFORE -i for fast, accurate seeking
    '-ss', String(start),
    '-i', input,
    ...(duration != null ? ['-t', String(duration)] : []),

    // Normalise resolution / framerate / pixel format
    '-vf', [
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease`,
      `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black`,
      'setsar=1',           // ← fixes SAR/DAR mismatch that breaks concat
      'fps=30',
      'format=yuv420p',
    ].join(','),

    // Video codec — -bf 0 disables B-frames, eliminating encoder delay
    // which is the primary cause of per-segment timing drift
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-bf', '0',

    // Audio — muted clips have no audio, otherwise 2-ch 48 kHz AAC
    ...(muted ? ['-an'] : [
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
    ]),

    // Fix timestamps so concat demuxer works cleanly
    '-avoid_negative_ts', 'make_zero',
    '-fflags', '+genpts',

    // Ensure correct duration metadata
    '-map_metadata', '-1',

    '-movflags', '+faststart',
    output,
  ];

  await runFFmpeg(args);

  // Verify output exists and has substance
  const stat = await fsPromises.stat(output);
  if (stat.size < 1024) {
    throw new Error(`Trimmed output is too small (${stat.size} bytes): ${output}`);
  }

  console.log(`[TRIM OK] ${path.basename(output)} → ${(stat.size / 1024).toFixed(1)} KB`);
  return output;
}

/* ─────────────────────────────────────────────────────────────
   MERGE
   - Uses concat demuxer with ffconcat-safe path escaping.
   - Re-encodes merged output to avoid stream-copy edge cases
     where only the first segment appears in some players.
   ───────────────────────────────────────────────────────────── */
async function mergeVideos(files, output, maxDuration = null) {
  if (!files || files.length === 0) {
    throw new Error('mergeVideos: no files provided');
  }

  console.log(`[MERGE] ${files.length} clip(s) → ${path.basename(output)}`);

  // Single clip — just copy, no ffmpeg needed
  if (files.length === 1) {
    await fsPromises.copyFile(files[0], output);
    console.log('[MERGE] single clip, copied directly');
    return output;
  }

  // Verify all trimmed files exist and are non-trivial before building concat list
  for (const f of files) {
    let stat;
    try {
      stat = await fsPromises.stat(f);
    } catch {
      throw new Error(`Trimmed file not found: ${f}`);
    }
    if (stat.size < 1024) {
      throw new Error(`Trimmed file is too small (${stat.size} bytes): ${f}`);
    }
    console.log(`  [MERGE CHECK] ${path.basename(f)} → ${(stat.size / 1024).toFixed(1)} KB`);
  }

  // Build concat list — ffconcat expects single-quoted paths.
  // Escape apostrophes so paths remain valid.
  const listFile = path.join(path.dirname(output), 'concat.txt');
  const listContent = files
    .map((f) => {
      const normalized = f.replace(/\\/g, '/');
      const escaped = normalized.replace(/'/g, `'\\''`);
      return `file '${escaped}'`;
    })
    .join('\n');

  await fsPromises.writeFile(listFile, listContent, 'utf8');
  console.log('[MERGE CONCAT LIST]\n', listContent);

  // Re-encode merge output for maximum playback compatibility.
  // -bf 0: no B-frames keeps timestamps precise (prevents ~100ms drift per segment).
  // Hard-cap with -t when expected duration is known.
  const cappedDur = maxDuration != null && maxDuration > 0
    ? Number((Math.round(maxDuration * 30) / 30).toFixed(6))
    : null;
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    ...(cappedDur != null ? ['-t', String(cappedDur)] : []),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-bf', '0',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ];

  await runFFmpeg(args);

  // Verify merged output
  const stat = await fsPromises.stat(output);
  if (stat.size < 1024) {
    throw new Error(`Merged output is too small (${stat.size} bytes)`);
  }
  console.log(`[MERGE OK] ${path.basename(output)} → ${(stat.size / 1024).toFixed(1)} KB`);

  return output;
}

/* ─────────────────────────────────────────────────────────────
   ADD AUDIO (voiceover / music)
   - Re-encodes video so any metadata quirks are resolved.
   - Mixes original video audio with the provided audio file,
     or replaces it entirely depending on whether the merged
     video already has audio content.
   ───────────────────────────────────────────────────────────── */
async function addAudio(videoPath, audioPath, outputPath, voiceStartTime = 0, voiceEndTime = 0) {
  const voiceStart = Math.max(0, Number(voiceStartTime) || 0);
  const voiceEnd = Math.max(voiceStart, Number(voiceEndTime) || 0);
  const trimDur = voiceEnd > voiceStart ? voiceEnd - voiceStart : null;
  const delayMs = Math.round(voiceStart * 1000);

  console.log(
    `[AUDIO] mixing ${path.basename(audioPath)} into ${path.basename(videoPath)} start=${voiceStart}s end=${voiceEnd}s`,
  );

  const audioFilter =
    trimDur != null && trimDur > 0
      ? `[1:a]atrim=0:${trimDur},asetpts=PTS-STARTPTS,adelay=${delayMs},apad[a]`
      : `[1:a]asetpts=PTS-STARTPTS,adelay=${delayMs},apad[a]`;

  const args = [
    '-y',
    '-i', videoPath,
    '-i', audioPath,

    '-map', '0:v:0',
    '-map', '[a]',

    '-filter_complex', audioFilter,

    // Re-encode video to resolve any residual metadata issues
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',

    // Encode audio
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',

    // Stop output when video ends (we padded audio with apad).
    '-shortest',

    '-movflags', '+faststart',
    outputPath,
  ];

  await runFFmpeg(args);

  const stat = await fsPromises.stat(outputPath);
  console.log(`[AUDIO OK] ${path.basename(outputPath)} → ${(stat.size / 1024).toFixed(1)} KB`);

  return outputPath;
}

/* ─────────────────────────────────────────────────────────────
   MIX AUDIO (voiceover + optional background music)
   - Applies volume + mute controls.
   - Voice is trimmed to [voiceStartTime, voiceEndTime], then
     delayed into the sequence timeline and padded.
   - Music is looped to cover the full video duration.
   - Output always maps video stream + mixed audio stream.
   ───────────────────────────────────────────────────────────── */
async function mixAudio(
  videoPath,
  voicePaths = [],
  musicPath,
  outputPath,
  voiceSegments = [],
  musicSegments = [],
  voiceVolume = 100,
  voiceMuted = false,
  musicVolume = 35,
  maxDuration = null,
) {
  const voiceVol = voiceMuted ? 0 : Math.max(0, Math.min(1, (Number(voiceVolume) || 0) / 100));
  const musicVol = Math.max(0, Math.min(1, (Number(musicVolume) || 0) / 100));

  const normalizedVoiceSegments = Array.isArray(voiceSegments)
    ? voiceSegments
        .map((s) => ({
          startTime: Number(s?.startTime ?? s?.start ?? 0),
          endTime: Number(s?.endTime ?? s?.end ?? 0),
          sourceIndex: Number(s?.sourceIndex ?? 0),
        }))
        .filter((s) => Number.isFinite(s.startTime) && Number.isFinite(s.endTime))
    : [];

  const normalizedMusicSegments = Array.isArray(musicSegments)
    ? musicSegments
        .map((s) => ({
          startTime: Number(s?.startTime ?? s?.start ?? 0),
          endTime: Number(s?.endTime ?? s?.end ?? 0),
        }))
        .filter((s) => Number.isFinite(s.startTime) && Number.isFinite(s.endTime))
    : [];

  const hasVoiceInput = Array.isArray(voicePaths) && voicePaths.length > 0;
  const useVoice = Boolean(
    hasVoiceInput &&
      !voiceMuted &&
      voiceVol > 0.0001 &&
      normalizedVoiceSegments.some((s) => s.endTime > s.startTime),
  );
  const useMusic = Boolean(
    musicPath && musicVol > 0.0001 && normalizedMusicSegments.some((s) => s.endTime > s.startTime),
  );

  // If neither voice nor music is effectively enabled:
  // - If no audio files were provided, keep existing behavior (copy video).
  // - If audio files were provided but volumes/mute disable output,
  //   replace any existing clip audio with silence.
  if (!useVoice && !useMusic) {
    if (!hasVoiceInput && !musicPath) {
      await fsPromises.copyFile(videoPath, outputPath);
      return outputPath;
    }

    const ffArgs = [
      "-y",
      "-i",
      videoPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map",
      "0:v:0",
      "-map",
      "1:a",

      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    await runFFmpeg(ffArgs);
    return outputPath;
  }

  const args = ["-y", "-i", videoPath];

  // Video is input 0. Voice sources (if any) are pushed next.
  const voiceInputBaseIndex = 1;
  let musicIndex = null;

  if (useVoice) {
    // Loop each voice source so segments can extend past its duration.
    for (const vp of voicePaths) {
      args.push("-stream_loop", "-1", "-i", vp);
    }
  }

  if (useMusic) {
    musicIndex = useVoice ? voiceInputBaseIndex + voicePaths.length : voiceInputBaseIndex;
    args.push("-stream_loop", "-1", "-i", musicPath);
  }

  const filterParts = [];
  const voiceMixLabels = [];
  const musicMixLabels = [];

  if (useVoice) {
    normalizedVoiceSegments.forEach((seg, i) => {
      const start = Math.max(0, seg.startTime);
      const end = Math.max(start, seg.endTime);
      const trimDur = end > start ? end - start : 0;
      if (trimDur <= 0) return;
      const delayMs = Math.round(start * 1000);
      const outLabel = `[voice${i}]`;
      // atrim to segment duration, then delay to its timeline position.
      const srcIdx = Math.max(0, Math.min(seg.sourceIndex ?? 0, voicePaths.length - 1));
      const voiceInputIdx = voiceInputBaseIndex + srcIdx;
      filterParts.push(
        `[${voiceInputIdx}:a]atrim=0:${trimDur},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${voiceVol},apad${outLabel}`,
      );
      voiceMixLabels.push(outLabel);
    });
  }

  if (useMusic) {
    normalizedMusicSegments.forEach((seg, i) => {
      const start = Math.max(0, seg.startTime);
      const end = Math.max(start, seg.endTime);
      const trimDur = end > start ? end - start : 0;
      if (trimDur <= 0) return;
      const delayMs = Math.round(start * 1000);
      const outLabel = `[music${i}]`;
      filterParts.push(
        `[${musicIndex}:a]atrim=0:${trimDur},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${musicVol},apad${outLabel}`,
      );
      musicMixLabels.push(outLabel);
    });
  }

  const mixLabels = [...voiceMixLabels, ...musicMixLabels];

  if (mixLabels.length === 1) {
    filterParts.push(`${mixLabels[0]}anull[a]`);
  } else if (mixLabels.length > 1) {
    filterParts.push(
      `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=3:normalize=0[a]`,
    );
  } else {
    // No usable segments despite passing files.
    const ffArgs = [
      "-y",
      "-i",
      videoPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map",
      "0:v:0",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    await runFFmpeg(ffArgs);
    return outputPath;
  }

  const argsFilterComplex = filterParts.join(";");

  console.log("[MIX AUDIO] using filters:", argsFilterComplex);

  const ffArgs = [
    ...args,
    "-filter_complex",
    argsFilterComplex,
    "-map",
    "0:v:0",
    "-map",
    "[a]",

    // Re-encode video so container/audio are consistent.
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-bf",
    "0",

    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-b:a",
    "128k",

    // Hard-cap output to the video duration so apad/amix never extend past it.
    ...(maxDuration != null && maxDuration > 0 ? ["-t", String(Number(maxDuration.toFixed(3)))] : ["-shortest"]),
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runFFmpeg(ffArgs);

  const stat = await fsPromises.stat(outputPath);
  console.log(`[MIX OK] ${path.basename(outputPath)} → ${(stat.size / 1024).toFixed(1)} KB`);
  return outputPath;
}

/* ─────────────────────────────────────────────────────────────
   PROBE — get duration of a local video file
   ───────────────────────────────────────────────────────────── */
function probeVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { maxBuffer: 1 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const d = parseFloat(stdout.trim());
        resolve(Number.isFinite(d) ? d : null);
      }
    );
  });
}


/* ─────────────────────────────────────────────────────────────
   MERGE WITH TRANSITIONS
   - Uses FFmpeg xfade filter to apply crossfade, wipe, zoom-in,
     zoom-out effects between adjacent clips.
   - Clips with "none" transition are joined without overlap.
   - TRANSITION_DURATION controls the overlap length (seconds).
   ───────────────────────────────────────────────────────────── */
const TRANSITION_DURATION = 0.5; // seconds

// Map our UI mode names to FFmpeg xfade transition names
const XFADE_MAP = {
  crossfade: 'fade',
  wipe:      'wiperight',
  'zoom-in': 'zoomin',
  'zoom-out': 'fadeblack',
};

async function mergeVideosWithTransitions(files, durations, transitions, output) {
  if (!files || files.length === 0) throw new Error('mergeVideosWithTransitions: no files');

  // Single clip — just copy
  if (files.length === 1) {
    await fsPromises.copyFile(files[0], output);
    return output;
  }

  // Check whether any transition is non-none
  const hasAnyTransition = transitions.some(t => t && t !== 'none');

  if (!hasAnyTransition) {
    // Fall back to plain concat (faster)
    const totalDur = durations.reduce((s, d) => s + d, 0);
    return mergeVideos(files, output, totalDur > 0 ? totalDur : null);
  }

  // Verify all files exist
  for (const f of files) {
    const stat = await fsPromises.stat(f);
    if (stat.size < 1024) throw new Error(`Segment too small: ${f}`);
  }

  // Build xfade filter chain.
  // Each xfade needs: offset = sum of (duration[i] - TD) for all prior transitions.
  // Clips without transitions are just concatenated at their full duration.
  const n = files.length;
  const inputs = files.map(f => ['-i', f]).flat();

  const filterParts = [];
  let prevLabel = '[0:v]';
  let prevALabel = '[0:a]';
  let timeOffset = 0;

  for (let i = 0; i < n - 1; i++) {
    const mode = transitions[i] || 'none';
    const xfaceName = XFADE_MAP[mode] || null;
    const nextVLabel = i === n - 2 ? '[vout]' : `[v${i + 1}]`;
    const nextALabel = i === n - 2 ? '[aout]' : `[a${i + 1}]`;

    if (xfaceName) {
      // This transition has an overlap — offset is end of previous clip minus TD
      timeOffset += durations[i] - TRANSITION_DURATION;
      filterParts.push(
        `${prevLabel}[${i + 1}:v]xfade=transition=${xfaceName}:duration=${TRANSITION_DURATION}:offset=${timeOffset.toFixed(3)}${nextVLabel}`,
        `${prevALabel}[${i + 1}:a]acrossfade=d=${TRANSITION_DURATION}${nextALabel}`,
      );
    } else {
      // No transition — plain concat of these two using xfade with fade=0 OR just offset normally
      // Use concat filter segment for no-transition pairs
      timeOffset += durations[i];
      filterParts.push(
        `${prevLabel}[${i + 1}:v]xfade=transition=fade:duration=0.01:offset=${timeOffset.toFixed(3)}${nextVLabel}`,
        `${prevALabel}[${i + 1}:a]acrossfade=d=0.01${nextALabel}`,
      );
    }

    prevLabel = nextVLabel;
    prevALabel = nextALabel;
  }

  const filterComplex = filterParts.join(';');

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ];

  await runFFmpeg(args);

  const stat = await fsPromises.stat(output);
  if (stat.size < 1024) throw new Error(`mergeWithTransitions output too small`);
  console.log(`[MERGE+TRANSITIONS OK] -> ${(stat.size / 1024).toFixed(1)} KB`);
  return output;
}

module.exports = {
  trimVideo,
  mergeVideos,
  mergeVideosWithTransitions,
  addAudio,
  mixAudio,
  probeVideoDuration,
};