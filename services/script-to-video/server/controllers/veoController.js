const { generateVeoVideo } = require('../services/veoService');

async function veoGenerate(req, res) {
  const { prompt, aspectRatio = 'landscape', quality = '720p' } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ success: false, message: 'prompt is required' });
  }

  try {
    const result = await generateVeoVideo({ prompt: prompt.trim(), aspectRatio, quality });
    return res.json({ success: true, videoUrl: result.videoUrl });
  } catch (err) {
    console.error('[VEO CONTROLLER]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { veoGenerate };
