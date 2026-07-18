const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5005';

function getClientHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const pex = localStorage.getItem('pexels_key');
  const pix = localStorage.getItem('pixabay_key');
  if (pex) headers['x-pexels-key'] = pex;
  if (pix) headers['x-pixabay-key'] = pix;
  return headers;
}

async function postJSON(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getClientHeaders(),
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getJSON(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: getClientHeaders() });
  return res.json();
}

export async function processScript(script: string) {
  return postJSON('/api/script/process', { script });
}

export async function searchVideos(query: string, keywords: string[] = []) {
  const kws = keywords.join(',');
  const q = `${encodeURIComponent(query)}${kws ? `&keywords=${encodeURIComponent(kws)}` : ''}`;
  return getJSON(`/api/videos/search?query=${q}`);
}

export async function searchVideosWithSource(query: string, keywords: string[] = [], source: 'all' | 'pexels' | 'pixabay' = 'all', orientation: 'landscape' | 'portrait' | null = null) {
  const kws = keywords.join(',');
  let q = `${encodeURIComponent(query)}${kws ? `&keywords=${encodeURIComponent(kws)}` : ''}&source=${encodeURIComponent(source)}`;
  if (orientation) {
    q += `&orientation=${encodeURIComponent(orientation)}`;
  }
  return getJSON(`/api/videos/search?query=${q}`);
}

export async function searchSceneVideos(sceneText: string, scenes: string[] = [], source: 'all' | 'pexels' | 'pixabay' = 'all', orientation: 'landscape' | 'portrait' | null = null) {
  return postJSON('/api/videos/search/scenes', { sceneText, scenes, source, orientation });
}

export async function saveClip(clip: any) {
  return postJSON('/api/saved', clip);
}

export async function listSaved() {
  return getJSON('/api/saved');
}

export async function deleteSaved(id: string) {
  return fetch(`${API_BASE}/api/saved/${id}`, { method: 'DELETE' }).then(r => r.json());
}

export async function generateVeoVideo(prompt: string, aspectRatio: 'landscape' | 'portrait' = 'landscape', quality: '720p' | '1080p' = '720p') {
  return postJSON('/api/veo/generate', { prompt, aspectRatio, quality });
}

export default { processScript, searchVideos, searchVideosWithSource, searchSceneVideos, saveClip, listSaved, deleteSaved, generateVeoVideo };
