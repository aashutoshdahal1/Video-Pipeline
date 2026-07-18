const VEO_AJAX = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const VEO_PAGE = 'https://veoaifree.com/veo-video-generator/';

// Rotate user agents so each request looks like a different device to the origin
const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Samsung Galaxy S24) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; OnePlus 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
];

function pickUA(attempt) {
  return USER_AGENTS[attempt % USER_AGENTS.length];
}

async function fetchNonce(ua) {
  const r = await fetch(VEO_PAGE, { headers: { 'user-agent': ua } });
  const html = await r.text();
  const m = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
  return m ? m[1] : '594d6156aa';
}

async function parseResponse(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function headers(ua) {
  return {
    'user-agent': ua,
    'origin': 'https://veoaifree.com',
    'referer': VEO_PAGE,
    'x-requested-with': 'XMLHttpRequest',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/nonce') {
      return json({ nonce: await fetchNonce(pickUA(0)) });
    }

    if (request.method === 'POST' && url.pathname === '/generate') {
      const { prompt, aspectRatio = 'landscape', quality = '720p', attempt = 0 } = await request.json();
      if (!prompt) return json({ error: 'prompt required' }, 400);

      const ua = pickUA(attempt);
      const nonce = await fetchNonce(ua);
      const veoAspect = aspectRatio === 'portrait'
        ? 'VIDEO_ASPECT_RATIO_PORTRAIT'
        : 'VIDEO_ASPECT_RATIO_LANDSCAPE';

      const r = await fetch(VEO_AJAX, {
        method: 'POST',
        headers: headers(ua),
        body: new URLSearchParams({
          action: 'veo_video_generator', nonce,
          prompt: prompt.trim(), totalVariations: '1',
          aspectRatio: veoAspect, video_quality: quality,
          actionType: 'full-video-generate',
        }).toString(),
      });
      const data = await parseResponse(r);
      if (/limit reached|maximum allowance|rate.?limit/i.test(JSON.stringify(data))) {
        return json({ error: 'rate-limited', data }, 429);
      }
      return json({ ok: true, data, nonce });
    }

    if (request.method === 'POST' && url.pathname === '/poll') {
      const { sceneData, nonce = '594d6156aa', attempt = 0 } = await request.json();
      if (!sceneData) return json({ error: 'sceneData required' }, 400);
      const ua = pickUA(attempt);
      const r = await fetch(VEO_AJAX, {
        method: 'POST',
        headers: headers(ua),
        body: new URLSearchParams({
          action: 'veo_video_generator', nonce,
          sceneData: String(sceneData), actionType: 'final-video-results',
        }).toString(),
      });
      const data = await parseResponse(r);
      const mp4 = JSON.stringify(data).match(/https?:\/\/[^"']+\.mp4/i);
      return json({ ok: true, data, videoUrl: mp4 ? mp4[0] : null });
    }

    return json({ error: 'not found' }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
