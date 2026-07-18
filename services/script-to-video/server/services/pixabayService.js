const axios = require('axios');

const PIXABAY_BASE = 'https://pixabay.com/api/videos/';

async function searchPixabay(query, per_page = 15, key) {
  const apiKey = key || process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error('Pixabay API key not configured');
  const searchUrl = `${PIXABAY_BASE}?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${per_page}`;
  const searchRes = await axios.get(searchUrl, { timeout: 8000 });
  const hits = Array.isArray(searchRes.data?.hits) ? searchRes.data.hits : [];

  const sourceHits = hits.length > 0 ? hits : [];
  const finalHits = sourceHits.length > 0 ? sourceHits : null;

  const normalize = (items = []) => items.map(h => ({
    source: 'pixabay',
    title: h.tags || h.id.toString(),
    thumbnail: h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg` : (h.userImageURL || ''),
    videoUrl: (h.videos && h.videos.medium && h.videos.medium.url) || '',
    duration: h.duration ? String(h.duration) : '',
    tags: h.tags ? h.tags.split(',').map(s => s.trim()) : [],
    description: h.tags || ''
  }));

  if (finalHits) {
    return normalize(finalHits);
  }

  // Relax the query by using popular order if the search returns nothing.
  const popularUrl = `${PIXABAY_BASE}?key=${apiKey}&order=popular&per_page=${per_page}`;
  const popularRes = await axios.get(popularUrl, { timeout: 8000 });
  const popularHits = Array.isArray(popularRes.data?.hits) ? popularRes.data.hits : [];
  return normalize(popularHits);
}

module.exports = { searchPixabay };
