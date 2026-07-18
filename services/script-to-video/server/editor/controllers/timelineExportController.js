const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { trimVideo, mergeVideos, mixAudio, probeVideoDuration } = require('../services/ffmpegService');

function parseJsonField(val) {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

const FPS = 30;
const FRAME = 1 / FPS; // ~0.0333s — one frame at 30fps

/** Snap a duration (seconds) to the nearest frame boundary at FPS to avoid sub-frame drift. */
function snapToFrame(sec) {
  return Math.round(sec * FPS) / FPS;
}

/**
 * POST /api/editor/timeline-export
 *
 * Accepts multipart/form-data:
 *   clips        – JSON array of { timelineSec, duration, type, filename }
 *   resolution   – "720p" | "1080p"
 *   sceneFiles   – uploaded scene files (videos + images), in order
 *
 * Builds a final MP4 where each scene starts at its timelineSec position.
 * Gaps between scenes are filled with a black frame so the output timeline
 * matches the uploaded timestamps exactly.
 */
async function timelineExport(req, res, next) {
  let tempDir = null;

  try {
    /* ── 1. PARSE INPUTS ─────────────────────────────────────────── */
    let clips;
    try {
      clips = typeof req.body.clips === 'string'
        ? JSON.parse(req.body.clips)
        : req.body.clips;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid clips JSON' });
    }

    if (!Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({ success: false, message: 'No clips provided' });
    }

    const resKey = req.body.resolution || '1080p';
    const resolution = resKey; // kept for logging
    const RES_MAP = {
      '1080p':          { w: 1920, h: 1080 },
      '720p':           { w: 1280, h: 720  },
      '1080p-vertical': { w: 1080, h: 1920 },
      '720p-vertical':  { w: 720,  h: 1280 },
    };
    const { w: targetW, h: targetH } = RES_MAP[resKey] || RES_MAP['1080p'];

    // Audio inputs
    const voiceFiles = req.files?.audioFiles || [];
    const musicFileArr = req.files?.musicFile || [];
    const musicFile = musicFileArr[0] || null;
    const voiceSegments = parseJsonField(req.body.voiceSegments) || [];
    const musicSegments = parseJsonField(req.body.musicSegments) || [];
    const voiceVolume = Number(req.body.voiceVolume) || 100;
    const voiceMuted = req.body.voiceMuted === '1' || req.body.voiceMuted === true;
    const musicVolume = Number(req.body.musicVolume) || 35;

    const hasAudio = (voiceFiles.length > 0 && voiceSegments.length > 0 && !voiceMuted) ||
      (musicFile && musicSegments.length > 0);

    const uploadedFiles = req.files?.sceneFiles || [];
    if (uploadedFiles.length !== clips.length) {
      return res.status(400).json({
        success: false,
        message: `Mismatch: ${clips.length} clips described but ${uploadedFiles.length} files uploaded`,
      });
    }

    console.log(`[TIMELINE EXPORT] ${clips.length} scene(s) at ${resolution}`);
    clips.forEach((c, i) =>
      console.log(`  Scene ${i + 1}: ${c.filename} | start=${c.timelineSec}s | dur=${c.duration}s | type=${c.type}`)
    );

    /* ── 2. WORKSPACE ────────────────────────────────────────────── */
    tempDir = path.join(__dirname, '..', 'temp', `tl_export_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const outputDir = path.join(__dirname, '..', 'outputs');
    await fs.mkdir(outputDir, { recursive: true });

    /* ── 3. SORT BY TIMELINE POSITION ───────────────────────────── */
    // Pair each clip descriptor with its uploaded file, then sort by timelineSec
    const pairs = clips.map((clip, i) => ({
      clip,
      file: uploadedFiles[i],
      timelineSec: Number(clip.timelineSec) || 0,
      duration: Number(clip.duration) || 5,
    })).sort((a, b) => a.timelineSec - b.timelineSec);

    /* ── 4. PROBE ACTUAL DURATIONS ───────────────────────────────── */
    // For videos, probe the real duration — but never exceed the client-reported
    // slot duration. The client already computes slotDuration = min(gap, actual),
    // so overriding with the raw probed value would re-introduce black gaps.
    for (const pair of pairs) {
      if (pair.clip.type === 'video') {
        try {
          const real = await probeVideoDuration(pair.file.path);
          if (real && real > 0) {
            pair.duration = Math.min(real, pair.duration);
          }
        } catch {
          // keep the client-reported duration
        }
      }
      // images keep their reported duration (default 5s)
    }

    /* ── 5. BUILD SEGMENT LIST (scenes + black gap fills) ──────────
     *
     * All times are snapped to frame boundaries (1/30s) so that no
     * sub-frame rounding accumulates across segments. This is the
     * main source of "delayed scene start" bugs.
     */
    const segments = []; // { type: 'scene'|'gap', ... }
    let cursor = 0;

    for (const pair of pairs) {
      // Snap start and duration to frame grid
      const sceneStart    = snapToFrame(pair.timelineSec);
      const sceneDuration = snapToFrame(pair.duration);

      // Fill gap before this scene — threshold is one frame to ignore rounding noise
      if (sceneStart > cursor + FRAME) {
        const gapDur = snapToFrame(sceneStart - cursor);
        segments.push({ type: 'gap', startSec: cursor, duration: gapDur });
        cursor = snapToFrame(cursor + gapDur);
      }

      segments.push({ type: 'scene', pair, startSec: cursor, duration: sceneDuration });
      cursor = snapToFrame(cursor + sceneDuration);
    }

    console.log('[TIMELINE EXPORT] Segments:');
    segments.forEach((s, i) => {
      if (s.type === 'gap') console.log(`  [${i}] GAP  ${s.startSec.toFixed(2)}s → +${s.duration.toFixed(2)}s`);
      else console.log(`  [${i}] SCENE ${s.pair.clip.filename} @ ${s.startSec.toFixed(2)}s, dur=${s.duration.toFixed(2)}s`);
    });

    /* ── 6. RENDER EACH SEGMENT ─────────────────────────────────── */
    const renderedParts = [];
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const outPath = path.join(tempDir, `part_${i}.mp4`);

      if (seg.type === 'gap') {
        // Generate black video segment
        console.log(`[SEGMENT ${i}] Generating ${seg.duration.toFixed(2)}s black gap`);
        await renderBlackSegment(outPath, seg.duration, targetW, targetH);
      } else {
        const { pair } = seg;
        if (pair.clip.type === 'image') {
          // Convert image to video segment
          console.log(`[SEGMENT ${i}] Image → ${seg.duration.toFixed(2)}s video: ${pair.clip.filename}`);
          await renderImageToVideo(pair.file.path, outPath, seg.duration, targetW, targetH);
        } else {
          // Trim video to desired duration
          console.log(`[SEGMENT ${i}] Trim video: ${pair.clip.filename}`);
          await trimVideo(pair.file.path, outPath, 0, seg.duration, targetW, targetH, false);
        }
      }

      // Verify
      try {
        const stat = await fs.stat(outPath);
        if (stat.size < 512) throw new Error(`Segment too small: ${stat.size} bytes`);
      } catch (e) {
        return res.status(500).json({ success: false, message: `Failed to render segment ${i}: ${e.message}` });
      }

      renderedParts.push(outPath);
    }

    /* ── 7. MERGE ────────────────────────────────────────────────── */
    console.log(`[TIMELINE EXPORT] Merging ${renderedParts.length} parts…`);
    const mergedPath = path.join(tempDir, 'merged.mp4');

    if (renderedParts.length === 1) {
      await fs.copyFile(renderedParts[0], mergedPath);
    } else {
      // cursor holds the exact end of the last segment — use it to cap the concat output.
      await mergeVideos(renderedParts, mergedPath, cursor > 0 ? cursor : null);
    }

    /* ── 8. MIX AUDIO ───────────────────────────────────────────── */
    // Probe merged duration to hard-cap audio — prevents apad from extending past the timeline.
    const { probeVideoDuration } = require('../services/ffmpegService');
    const mergedDuration = await probeVideoDuration(mergedPath).catch(() => null);
    console.log(`[TIMELINE EXPORT] Merged video duration: ${mergedDuration}s`);

    let readyPath = mergedPath;
    if (hasAudio) {
      console.log('[TIMELINE EXPORT] Mixing audio…');
      const mixedPath = path.join(tempDir, 'mixed.mp4');
      const voicePaths = voiceFiles.map(f => f.path);
      const musicPath = musicFile ? musicFile.path : null;
      await mixAudio(
        mergedPath,
        voicePaths,
        musicPath,
        mixedPath,
        voiceSegments,
        musicSegments,
        voiceVolume,
        voiceMuted,
        musicVolume,
        mergedDuration,
      );
      readyPath = mixedPath;
    }

    /* ── 9. OUTPUT ───────────────────────────────────────────────── */
    const finalName = `timeline_${Date.now()}.mp4`;
    const finalPath = path.join(outputDir, finalName);
    await fs.copyFile(readyPath, finalPath);

    const stat = await fs.stat(finalPath);
    console.log(`[TIMELINE EXPORT COMPLETE] ${finalName} — ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

    const url = `/outputs/${finalName}`;
    return res.json({
      success: true,
      url,
      absoluteUrl: `${req.protocol}://${req.get('host')}${url}`,
      fileSizeBytes: stat.size,
      sceneCount: pairs.length,
    });

  } catch (err) {
    console.error('[TIMELINE EXPORT ERROR]', err.message);
    console.error(err.stack);
    next(err);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((e) =>
        console.warn('[CLEANUP WARN]', e.message)
      );
    }
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function runFFmpeg(args) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    console.log('[FFMPEG]', 'ffmpeg', args.slice(0, 8).join(' '), '...');
    // No timeout on execFile — long scenes can take many minutes
    execFile('ffmpeg', args, { maxBuffer: 200 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[FFMPEG ERROR]', stderr?.slice(-2000));
        return reject(new Error(`FFmpeg failed: ${stderr?.slice(-500) || err.message}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Render a black silent video of exactly `duration` seconds */
async function renderBlackSegment(output, duration, w, h) {
  const dur = Math.max(FRAME, snapToFrame(duration));
  const args = [
    '-y',
    '-f', 'lavfi', '-i', `color=black:size=${w}x${h}:rate=${FPS}`,
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=48000`,
    '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-bf', '0',                    // no B-frames — eliminates encoder delay
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
    '-avoid_negative_ts', 'make_zero',
    '-fflags', '+genpts',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    output,
  ];
  await runFFmpeg(args);
}

/** Convert a still image to a video clip of `duration` seconds */
async function renderImageToVideo(imagePath, output, duration, w, h) {
  const dur = Math.max(FRAME, snapToFrame(duration));
  const args = [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=48000`,
    '-t', String(dur),
    '-vf', [
      `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
      'setsar=1',
      `fps=${FPS}`,
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-bf', '0',                    // no B-frames
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
    '-avoid_negative_ts', 'make_zero',
    '-fflags', '+genpts',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    output,
  ];
  await runFFmpeg(args);
}

module.exports = { timelineExport };
