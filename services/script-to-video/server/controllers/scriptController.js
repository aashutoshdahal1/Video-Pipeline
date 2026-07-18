const { extractKeywords, splitScenes } = require('../utils/ai');

async function processScript(req, res, next) {
  try {
    const { script } = req.body;
    if (!script || typeof script !== 'string') return res.status(400).json({ success: false, message: 'script is required' });
    const scenes = splitScenes(script);
    const keywords = extractKeywords(script, 15);
    res.json({ success: true, keywords, scenes });
  } catch (err) {
    next(err);
  }
}

module.exports = { processScript };
