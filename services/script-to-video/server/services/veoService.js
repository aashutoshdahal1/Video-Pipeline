const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ── Proxy pool ──────────────────────────────────────────────────────────────
// Populate VEO_PROXIES in .env as a comma-separated list of proxy URLs:
//   VEO_PROXIES=http://user:pass@host1:port,http://user:pass@host2:port
// If empty, requests go direct (rate-limited after 1 video).
function getProxies() {
  const raw = process.env.VEO_PROXIES || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

let proxyIndex = 0;

function nextProxy() {
  const proxies = getProxies();
  if (!proxies.length) return null;
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex++;
  return proxy;
}

// ── Nonce refresh ───────────────────────────────────────────────────────────
// The page embeds a nonce in the HTML. We fetch a fresh one each time so the
// request looks like it comes from a real browser session.
async function fetchNonce(axiosConfig) {
  try {
    const resp = await axios.get('https://veoaifree.com/veo-video-generator/', {
      ...axiosConfig,
      timeout: 15000,
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    const match = resp.data.match(/nonce['":\s]+['"]([a-f0-9]+)['"]/i);
    return match ? match[1] : '594d6156aa'; // fallback to known nonce
  } catch {
    return '594d6156aa';
  }
}

// ── Main API call helper ────────────────────────────────────────────────────
async function veoRequest(params, proxyUrl) {
  const axiosConfig = { timeout: 60000 };

  if (proxyUrl) {
    axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
    axiosConfig.proxy = false; // disable axios default proxy handling
  }

  const nonce = await fetchNonce(axiosConfig);

  const body = new URLSearchParams({ nonce, ...params }).toString();

  const resp = await axios.post(
    'https://veoaifree.com/wp-admin/admin-ajax.php',
    body,
    {
      ...axiosConfig,
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://veoaifree.com',
        'referer': 'https://veoaifree.com/veo-video-generator/',
        'x-requested-with': 'XMLHttpRequest',
      },
    }
  );

  return resp.data;
}

// ── Poll for final results ──────────────────────────────────────────────────
async function pollResults(sceneData, proxyUrl, maxAttempts = 30, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await veoRequest(
      { action: 'veo_video_generator', sceneData: String(sceneData), actionType: 'final-video-results' },
      proxyUrl
    );

    // Response is either { success, videoUrl } or { status: 'processing' } or raw HTML
    if (data && typeof data === 'object') {
      if (data.videoUrl || data.video_url) {
        return data.videoUrl || data.video_url;
      }
      if (data.status === 'complete' || data.success) {
        // Try to find a video URL anywhere in the response
        const str = JSON.stringify(data);
        const match = str.match(/https?:\/\/[^"']+\.mp4/i);
        if (match) return match[0];
      }
      if (data.status === 'failed' || data.error) {
        throw new Error(`Veo generation failed: ${data.error || data.message || 'unknown'}`);
      }
    }

    // If response is a string/HTML, scan for mp4 URL
    if (typeof data === 'string') {
      const match = data.match(/https?:\/\/[^"'\s]+\.mp4/i);
      if (match) return match[0];
    }

    // Still processing — wait and retry
    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error('Veo video generation timed out — video not ready after polling');
}

// ── Public entry point ──────────────────────────────────────────────────────
async function generateVeoVideo({ prompt, aspectRatio = 'landscape', quality = '720p' }) {
  const proxy = nextProxy();
  console.log(`[VEO] Generating video | proxy=${proxy || 'direct'} | aspect=${aspectRatio}`);

  const veoAspect = aspectRatio === 'portrait'
    ? 'VIDEO_ASPECT_RATIO_PORTRAIT'
    : 'VIDEO_ASPECT_RATIO_LANDSCAPE';

  // Step 1: submit generation job
  const initData = await veoRequest(
    {
      action: 'veo_video_generator',
      prompt,
      totalVariations: '1',
      aspectRatio: veoAspect,
      video_quality: quality,
      actionType: 'full-video-generate',
    },
    proxy
  );

  console.log('[VEO] Init response:', JSON.stringify(initData).slice(0, 300));

  // Extract sceneData id
  let sceneData = null;
  if (initData && typeof initData === 'object') {
    sceneData = initData.sceneData || initData.scene_data || initData.id || initData.data?.sceneData;
  }
  if (!sceneData && typeof initData === 'string') {
    const m = initData.match(/sceneData['":\s]+(\d+)/i);
    if (m) sceneData = m[1];
  }

  if (!sceneData) {
    throw new Error(`Veo init did not return sceneData. Response: ${JSON.stringify(initData).slice(0, 200)}`);
  }

  console.log(`[VEO] sceneData=${sceneData} — polling for result...`);

  // Step 2: poll for the finished video URL
  const videoUrl = await pollResults(sceneData, proxy);
  console.log(`[VEO] Video ready: ${videoUrl}`);

  return { videoUrl, sceneData };
}

module.exports = { generateVeoVideo };
