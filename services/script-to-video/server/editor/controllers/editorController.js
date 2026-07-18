const path = require('path');
const fs = require('fs/promises');
const { downloadVideo } = require('../services/videoDownloadService');
const ffmpeg = require('../services/ffmpegService');

async function exportVideo(req, res, next) {
  let tempDir = null;

  try {
    /* ── 1. PARSE CLIPS ───────────────────────────────────────── */
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
    // Resolve target dimensions from resolution key
    const RES_MAP = {
      '1080p':          { w: 1920, h: 1080 },
      '720p':           { w: 1280, h: 720  },
      '1080p-vertical': { w: 1080, h: 1920 },
      '720p-vertical':  { w: 720,  h: 1280 },
    };
    const { w: targetW, h: targetH } = RES_MAP[resKey] || RES_MAP['1080p'];

    // Transitions between adjacent clips (array of N-1 mode strings)
    let transitions = [];
    try {
      if (req.body.transitions) transitions = JSON.parse(req.body.transitions);
    } catch { transitions = []; }
    if (!Array.isArray(transitions)) transitions = [];
    const voiceStartTime = Number(req.body.voiceStartTime) || 0;
    const voiceEndTime = Number(req.body.voiceEndTime) || 0;
    const musicStartTime = Number(req.body.musicStartTime) || 0;
    const musicEndTime = Number(req.body.musicEndTime) || 0;
    const voiceVolume = Number.isFinite(Number(req.body.voiceVolume)) ? Number(req.body.voiceVolume) : 100;
    const voiceMuted = String(req.body.voiceMuted) === '1' || req.body.voiceMuted === true;
    const musicVolume = Number.isFinite(Number(req.body.musicVolume)) ? Number(req.body.musicVolume) : 35;

    // ── Audio segments (CapCut/Canva-style duplicated blocks) ──
    let voiceSegments = [];
    let musicSegments = [];

    try {
      if (typeof req.body.voiceSegments === 'string' && req.body.voiceSegments.trim()) {
        const parsed = JSON.parse(req.body.voiceSegments);
        voiceSegments = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      voiceSegments = [];
    }

    try {
      if (typeof req.body.musicSegments === 'string' && req.body.musicSegments.trim()) {
        const parsed = JSON.parse(req.body.musicSegments);
        musicSegments = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      musicSegments = [];
    }

    // Backward compatibility: fall back to legacy single-region fields.
    if (!voiceSegments.length && voiceEndTime > voiceStartTime) {
      voiceSegments = [{ startTime: voiceStartTime, endTime: voiceEndTime, sourceIndex: 0 }];
    }
    if (!musicSegments.length && musicEndTime > musicStartTime) {
      musicSegments = [{ startTime: musicStartTime, endTime: musicEndTime, sourceIndex: 0 }];
    }

    console.log(`[EXPORT] Starting export of ${clips.length} clip(s)`);
    clips.forEach((c, i) =>
      console.log(`  Clip ${i + 1}: url=${c.url} start=${c.start} end=${c.end} muted=${c.muted}`)
    );

    /* ── 2. WORKSPACE ─────────────────────────────────────────── */
    tempDir = path.join(__dirname, '..', 'temp', `export_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const outputDir = path.join(__dirname, '..', 'outputs');
    await fs.mkdir(outputDir, { recursive: true });

    /* ── 3. DOWNLOAD ──────────────────────────────────────────── */
    console.log('[EXPORT] Downloading clips...');
    const downloaded = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];

      if (!clip.url) {
        return res.status(400).json({
          success: false,
          message: `Clip ${i + 1} is missing a URL`,
        });
      }

      const filePath = path.join(tempDir, `source_${i}.mp4`);
      console.log(`  [DOWNLOAD ${i + 1}/${clips.length}] ${clip.url}`);

      await downloadVideo(clip.url, filePath);

      downloaded.push({
        path: filePath,
        start: Number(clip.start) || 0,
        end: clip.end != null ? Number(clip.end) : null,
        muted: clip.muted || false,
      });
    }

    /* ── 4. TRIM ──────────────────────────────────────────────── */
    console.log('[EXPORT] Trimming clips...');
    const trimmed = [];

    for (let i = 0; i < downloaded.length; i++) {
      const item = downloaded[i];
      const out = path.join(tempDir, `trim_${i}.mp4`);

      console.log(`  [TRIM ${i + 1}/${downloaded.length}] start=${item.start} end=${item.end} muted=${item.muted}`);

      await ffmpeg.trimVideo(item.path, out, item.start, item.end, targetW, targetH, item.muted);

      // Verify trimmed file
      try {
        await fs.access(out);
      } catch {
        return res.status(500).json({
          success: false,
          message: `Trim failed for clip ${i + 1} — output file not found`,
        });
      }

      trimmed.push(out);
    }

    /* ── 5. MERGE ─────────────────────────────────────────────── */
    console.log('[EXPORT] Merging clips...');
    const mergedPath = path.join(tempDir, 'merged.mp4');
    // Sum of all trimmed durations — hard-cap concat output to prevent repeating scenes.
    const trimmedDurations = downloaded.map(item =>
      (item.end != null && item.end > item.start) ? (item.end - item.start) : 0
    );
    const expectedDuration = trimmedDurations.reduce((s, d) => s + d, 0);
    console.log(`[EXPORT] Expected total duration: ${expectedDuration.toFixed(3)}s`);
    await ffmpeg.mergeVideosWithTransitions(
      trimmed, trimmedDurations, transitions, mergedPath
    );

    // Verify merged file
    try {
      await fs.access(mergedPath);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Merge failed — merged file not found',
      });
    }

    // Probe merged duration to hard-cap audio so it never exceeds the video length.
    const mergedDuration = await ffmpeg.probeVideoDuration(mergedPath).catch(() => null);
    console.log(`[EXPORT] Merged video duration: ${mergedDuration}s`);

    /* ── 6. AUDIO (optional) ──────────────────────────────────── */
    const finalName = `final_${Date.now()}.mp4`;
    const finalPath = path.join(outputDir, finalName);

    const voiceUploads = req.files?.audioFiles || req.files?.audioFile || [];
    const voiceFiles = Array.isArray(voiceUploads) ? voiceUploads : [];
    const voicePaths = voiceFiles.map((f) => f.path).filter(Boolean);
    const musicFile = req.files?.musicFile?.[0] || null;

    if (voicePaths.length || musicFile) {
      console.log('[EXPORT] Mixing audio tracks:', {
        voice: voiceFiles[0]?.originalname || null,
        music: musicFile?.originalname || null,
        voiceStartTime,
        voiceEndTime,
        musicStartTime,
        musicEndTime,
        voiceSegments,
        musicSegments,
        voiceVolume,
        voiceMuted,
        musicVolume,
      });

      await ffmpeg.mixAudio(
        mergedPath,
        voicePaths,
        musicFile?.path || null,
        finalPath,
        voiceSegments,
        musicSegments,
        voiceVolume,
        voiceMuted,
        musicVolume,
        mergedDuration,
      );
    } else {
      console.log('[EXPORT] No audio/music files — copying merged output');
      await fs.copyFile(mergedPath, finalPath);
    }

    // Final verification
    try {
      await fs.access(finalPath);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Export failed — final file not produced',
      });
    }

    const stat = await fs.stat(finalPath);
    console.log(`[EXPORT COMPLETE] ${finalName} — ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

    const url = `/outputs/${finalName}`;
    return res.json({
      success: true,
      url,
      absoluteUrl: `${req.protocol}://${req.get('host')}${url}`,
      fileSizeBytes: stat.size,
      clipCount: clips.length,
    });

  } catch (err) {
    console.error('[EXPORT ERROR]', err.message);
    console.error(err.stack);
    next(err);
  } finally {
    // Always clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((e) =>
        console.warn('[CLEANUP WARN]', e.message)
      );
    }
  }
}

module.exports = { exportVideo };