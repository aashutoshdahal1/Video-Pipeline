const API_BASE = process.env.SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://localhost:5005';

const sampleScript = `
A drone glides over misty mountains as the sun rises.
A lone hiker walks through a dark forest at dawn.
`;

const sampleClip = {
  source: 'pexels',
  title: 'Smoke Test Clip',
  thumbnail: 'https://example.com/thumb.jpg',
  videoUrl: 'https://example.com/video.mp4',
  duration: '0:12',
  tags: ['smoke', 'test'],
  relevanceScore: 10,
};

function logStep(label, ok, details = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}${details ? ` - ${details}` : ''}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function main() {
  const failures = [];
  console.log(`Running smoke test against ${API_BASE}`);

  const health = await request('/api/health');
  if (health.response.ok && health.data.ok) {
    logStep('health endpoint', true, `port=${health.data.port}`);
  } else {
    logStep('health endpoint', false, JSON.stringify(health.data));
    failures.push('health endpoint');
  }

  const config = await request('/api/debug/config');
  const hasMongo = !!config.data.mongo;
  const hasPexels = !!config.data.pexelsKey;
  const hasPixabay = !!config.data.pixabayKey;
  if (config.response.ok) {
    logStep('debug config endpoint', true, `mongo=${hasMongo}, pexels=${hasPexels}, pixabay=${hasPixabay}`);
  } else {
    logStep('debug config endpoint', false, JSON.stringify(config.data));
    failures.push('debug config endpoint');
  }

  const processed = await request('/api/script/process', {
    method: 'POST',
    body: JSON.stringify({ script: sampleScript }),
  });

  const keywords = Array.isArray(processed.data.keywords) ? processed.data.keywords : [];
  const scenes = Array.isArray(processed.data.scenes) ? processed.data.scenes : [];
  if (processed.response.ok && processed.data.success && keywords.length > 0 && scenes.length > 0) {
    logStep('script processing', true, `${keywords.length} keywords, ${scenes.length} scenes`);
  } else {
    logStep('script processing', false, JSON.stringify(processed.data));
    failures.push('script processing');
  }

  const searchQuery = scenes[0] || 'forest dawn';
  const searchUrl = `/api/videos/search?query=${encodeURIComponent(searchQuery)}${keywords.length ? `&keywords=${encodeURIComponent(keywords.join(','))}` : ''}`;
  const search = await request(searchUrl);
  if (search.response.ok && search.data.success && Array.isArray(search.data.results)) {
    const resultCount = search.data.results.length;
    const note = hasPexels || hasPixabay ? `${resultCount} results` : `${resultCount} results (expected empty without API keys)`;
    logStep('video search', true, note);
  } else {
    logStep('video search', false, JSON.stringify(search.data));
    failures.push('video search');
  }

  const sceneSearch = await request('/api/videos/search/scenes', {
    method: 'POST',
    body: JSON.stringify({
      scenes: [
        'Man walking in forest at night',
        'Close-up of mysterious glowing object',
        'Man shocked reaction',
      ],
    }),
  });

  const sceneResults = Array.isArray(sceneSearch.data?.scenes) ? sceneSearch.data.scenes : [];
  const sceneShapeOk = sceneSearch.response.ok && sceneSearch.data.success && sceneResults.length === 3 && sceneResults.every((scene) => typeof scene.scene === 'string' && Array.isArray(scene.results));
  if (sceneShapeOk) {
    logStep('scene-by-scene search', true, `${sceneResults.length} grouped scenes`);
  } else {
    logStep('scene-by-scene search', false, JSON.stringify(sceneSearch.data));
    failures.push('scene-by-scene search');
  }

  const save = await request('/api/saved', {
    method: 'POST',
    body: JSON.stringify(sampleClip),
  });
  const savedId = save.data?.item?._id;
  if (save.response.ok && save.data.success && savedId) {
    logStep('save video', true, `id=${savedId}`);
  } else {
    logStep('save video', false, JSON.stringify(save.data));
    failures.push('save video');
  }

  const list = await request('/api/saved');
  const listedItems = Array.isArray(list.data.items) ? list.data.items : [];
  const savedExists = listedItems.some((item) => item._id === savedId);
  if (list.response.ok && list.data.success && savedExists) {
    logStep('list saved videos', true, `${listedItems.length} items`);
  } else {
    logStep('list saved videos', false, JSON.stringify(list.data));
    failures.push('list saved videos');
  }

  const del = await request(`/api/saved/${savedId}`, { method: 'DELETE' });
  if (del.response.ok && del.data.success) {
    logStep('delete saved video', true, `id=${savedId}`);
  } else {
    logStep('delete saved video', false, JSON.stringify(del.data));
    failures.push('delete saved video');
  }

  const finalList = await request('/api/saved');
  const deletedGone = Array.isArray(finalList.data.items) ? !finalList.data.items.some((item) => item._id === savedId) : false;
  if (finalList.response.ok && deletedGone) {
    logStep('post-delete verification', true);
  } else {
    logStep('post-delete verification', false, JSON.stringify(finalList.data));
    failures.push('post-delete verification');
  }

  console.log('');
  if (failures.length) {
    console.error(`Smoke test failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
