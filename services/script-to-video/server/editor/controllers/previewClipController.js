const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const { execFile } = require('child_process');
const os = require('os');

// Transcode a single uploaded video to H.264/AAC so Chrome can play it natively.
// Streams the result directly back — no permanent file written.
async function previewClip(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const inputPath = file.path;
  const outPath = path.join(os.tmpdir(), `preview_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  try {
    await transcode(inputPath, outPath);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');

    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on('end', () => {
      // Clean up both files after response is sent
      fsPromises.unlink(outPath).catch(() => undefined);
      fsPromises.unlink(inputPath).catch(() => undefined);
    });
    stream.on('error', (err) => {
      console.error('[previewClip] stream error:', err);
      if (!res.headersSent) res.status(500).end();
      fsPromises.unlink(outPath).catch(() => undefined);
      fsPromises.unlink(inputPath).catch(() => undefined);
    });
  } catch (err) {
    console.error('[previewClip] transcode error:', err);
    fsPromises.unlink(inputPath).catch(() => undefined);
    fsPromises.unlink(outPath).catch(() => undefined);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

function transcode(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', input,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ];
    console.log('[previewClip] ffmpeg', args.join(' '));
    execFile('ffmpeg', args, { maxBuffer: 200 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(`FFmpeg failed: ${stderr || err.message}`));
      resolve();
    });
  });
}

module.exports = { previewClip };
