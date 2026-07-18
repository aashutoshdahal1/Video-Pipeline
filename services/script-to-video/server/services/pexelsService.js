const axios = require('axios');

const PEXELS_BASE = 'https://api.pexels.com/videos/search';
const PEXELS_POPULAR_BASE = 'https://api.pexels.com/videos/popular';

async function searchPexels(query, per_page = 15, key, orientation = null) {
  const apiKey = key || process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('Pexels API key not configured');
  const headers = { Authorization: apiKey };
  
  // orientation: 'landscape' (16:9), 'portrait' (9:16), or 'square'

  const pickBestVideoFile = (videoFiles = []) => {
    if (!Array.isArray(videoFiles) || videoFiles.length === 0) return null;
    // Choose the highest resolution representation available.
    return videoFiles
      .slice()
      .sort((a, b) => {
        const aW = Number(a?.width) || 0;
        const aH = Number(a?.height) || 0;
        const bW = Number(b?.width) || 0;
        const bH = Number(b?.height) || 0;
        const aArea = aW * aH;
        const bArea = bW * bH;
        if (bArea !== aArea) return bArea - aArea;
        // Tie-breaker: pick higher fps if present, otherwise keep order.
        const aFps = Number(a?.fps) || 0;
        const bFps = Number(b?.fps) || 0;
        return bFps - aFps;
      })[0];
  };

  const normalize = (videos = []) => videos.map(v => {
    const best = pickBestVideoFile(v.video_files || []);
    return ({
    source: 'pexels',
    title: v.user && v.user.name ? `${v.user.name} - ${v.id}` : v.id.toString(),
    thumbnail: v.image || (v.video_pictures && v.video_pictures[0] && v.video_pictures[0].picture) || '',
    videoUrl: (best && best.link) || '',
    duration: v.duration ? String(v.duration) : '',
    tags: (v.tags && v.tags.map(t => t.name)) || [],
    description: v.description || ''
    });
  });

  const orientationParam = orientation ? `&orientation=${encodeURIComponent(orientation)}` : '';
  const searchUrl = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=${per_page}${orientationParam}`;
  const searchRes = await axios.get(searchUrl, { headers, timeout: 8000 });
  const searchVideos = Array.isArray(searchRes.data?.videos) ? normalize(searchRes.data.videos) : [];
  if (searchVideos.length > 0) return searchVideos;

  // If the exact query is too narrow, fall back to popular videos so the UI still shows results.
  const popularUrl = `${PEXELS_POPULAR_BASE}?per_page=${per_page}`;
  const popularRes = await axios.get(popularUrl, { headers, timeout: 8000 });
  return Array.isArray(popularRes.data?.videos) ? normalize(popularRes.data.videos) : [];
}

module.exports = { searchPexels };
