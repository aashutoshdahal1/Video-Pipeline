const { searchUnified, searchScenes } = require('../services/videoService');

function normalizeSourcesParam(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return ['all'];
  return value.split(',').map((source) => source.trim()).filter(Boolean);
}

async function searchVideos(req, res, next) {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ success: false, message: 'query is required' });
    const kwsRaw = req.query.keywords || '';
    const keywords = kwsRaw ? kwsRaw.split(',').map(k => k.trim()).filter(Boolean) : [];
    const sources = normalizeSourcesParam(req.query.source);
    const orientation = req.query.orientation || null; // 'landscape' (16:9) or 'portrait' (9:16)
    // Allow passing API keys from client via headers
    const pexelsKey = req.headers['x-pexels-key'] || req.headers['x-pexels-key'.toLowerCase()];
    const pixabayKey = req.headers['x-pixabay-key'] || req.headers['x-pixabay-key'.toLowerCase()];
    console.log(`[Search] query=${query}, source=${sources.join(',')}, orientation=${orientation}, has pexels=${!!pexelsKey}, has pixabay=${!!pixabayKey}`);
    const results = await searchUnified(query, keywords, { pexelsKey, pixabayKey, sources, orientation });
    console.log(`[Search] returned ${results.length} results`);
    res.json({ success: true, results });
  } catch (err) {
    console.error('[Search] Error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch videos' });
  }
}

function parseSceneInput(sceneText = '', scenes = []) {
  if (Array.isArray(scenes) && scenes.length > 0) {
    return scenes.map((scene) => String(scene).trim()).filter(Boolean);
  }

  if (typeof sceneText !== 'string' || !sceneText.trim()) {
    return [];
  }

  return sceneText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .map((line) => line.replace(/^scene\s*\d+\s*[:.-]?\s*/i, '').trim())
    .filter(Boolean);
}

async function searchSceneVideos(req, res, next) {
  try {
    const { sceneText = '', scenes = [], source, orientation } = req.body || {};
    const sceneQueries = parseSceneInput(sceneText, scenes);

    if (!sceneQueries.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one scene is required',
      });
    }

    const pexelsKey = req.headers['x-pexels-key'] || req.headers['x-pexels-key'.toLowerCase()];
    const pixabayKey = req.headers['x-pixabay-key'] || req.headers['x-pixabay-key'.toLowerCase()];
    const sources = normalizeSourcesParam(source);

    console.log(`[Scene Search] scenes=${sceneQueries.length}, source=${sources.join(',')}, orientation=${orientation}, has pexels=${!!pexelsKey}, has pixabay=${!!pixabayKey}`);

    const results = await searchScenes(sceneQueries, { pexelsKey, pixabayKey, sources, orientation });
    res.json({ success: true, scenes: results });
  } catch (err) {
    console.error('[Scene Search] Error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch scene videos' });
  }
}

module.exports = { searchVideos, searchSceneVideos };
