const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tokenManager = require('./token-manager');
const multiAccountManager = require('./multi-account-manager');
const dolaGenerator = require('./dola-generator');
const metaGenerator = require('./meta-generator');
const vibesAccountManager = require('./vibes-account-manager');
const app = express();

// Allow fetch from https://labs.google → http://localhost (Private Network Access)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: '50mb' }));
// Serve index.html with no-cache so browser always gets the latest version
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static(__dirname, { etag: false, lastModified: false }));

const FALLBACK_PROJECT_ID = '35ddd682-f1a0-4ee8-915f-110843f84c81';
const BASE = 'https://aisandbox-pa.googleapis.com';

// Use project ID captured from intercepted requests — falls back to hardcoded only if not yet known
function getProjectId() { return tokenManager.projectId || FALLBACK_PROJECT_ID; }

const BYPASS = {
    token: 'android_bypass',
    applicationType: 'RECAPTCHA_APPLICATION_TYPE_ANDROID'
};

const ASPECT_IMAGE = {
    '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    '1:1':  'IMAGE_ASPECT_RATIO_SQUARE'
};

const ASPECT_VIDEO = {
    '16:9': 'VIDEO_ASPECT_RATIO_LANDSCAPE',
    '9:16': 'VIDEO_ASPECT_RATIO_PORTRAIT'
};

function clientCtx() {
    return {
        recaptchaContext: BYPASS,
        projectId: getProjectId(),
        tool: 'PINHOLE',
        sessionId: `;${Date.now()}`
    };
}

function imageHeaders(token) {
    const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-browser-channel': 'stable',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/fx/vi/tools/flow',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    };
}

function videoHeaders(token) {
    const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Authorization': auth,
        'Accept': '*/*',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'x-browser-channel': 'stable',
    };
}

function extractImageUrl(data) {
    const str = JSON.stringify(data);
    const cdnMatch = str.match(/https:\/\/flow-content\.google[^"\\]*/);
    if (cdnMatch) return cdnMatch[0];
    const keys = ['fifeUrl', 'uri', 'downloadUrl', 'signedUrl', 'imageUrl', 'mediaUrl', 'url'];
    for (const k of keys) {
        const m = str.match(new RegExp(`"${k}"\\s*:\\s*"(https://[^"\\\\]*)"`));
        if (m) return m[1];
    }
    const anyUrl = str.match(/https:\/\/[^"\\]*\.(png|jpg|jpeg|webp)[^"\\]*/i);
    if (anyUrl) return anyUrl[0];
    return null;
}

function extractMediaIds(data) {
    const ids = [];
    // Real video response: { media: [{ name: "uuid", ... }] }
    if (data?.media) {
        for (const m of data.media) {
            const name = m?.name || m?.mediaId;
            if (name && /^[a-f0-9-]{36}$/i.test(name)) ids.push(name);
        }
    }
    // Image response: { generatedMedia: [{ media: { name } }] }
    if (data?.generatedMedia) {
        for (const m of data.generatedMedia) {
            const name = m?.media?.name || m?.name;
            if (name) ids.push(name);
        }
    }
    if (ids.length) return [...new Set(ids)];
    // Fallback: scan for any UUID in the response
    const str = JSON.stringify(data);
    const matches = [...str.matchAll(/"name"\s*:\s*"([a-f0-9-]{36})"/g)];
    for (const m of matches) ids.push(m[1]);
    return [...new Set(ids)];
}

// ─── TOKEN RESOLUTION ────────────────────────────────────────────────────────
// Priority: multi-account workers > auto token-manager > manual UI tokens
async function tokensToTry(manualTokens) {
    const workerTokens = multiAccountManager.getTokens();
    const auto   = tokenManager.getToken();
    const manual = (manualTokens || []).filter(Boolean);
    const list   = [...workerTokens];
    if (auto && !list.includes(auto)) list.push(auto);
    for (const t of manual) if (!list.includes(t)) list.push(t);
    return list;
}

// Notify the owning manager when a token receives a 401 so it refreshes immediately.
function notifyExpired(token, statusCode) {
    if (statusCode !== 401) return;
    multiAccountManager.markExpired(token);
    if (tokenManager.getToken() === token) tokenManager.markExpired(token);
}

// ─── AUTH / TOKEN MANAGER ENDPOINTS ──────────────────────────────────────────
app.get('/auth/status', (req, res) => {
    const { status, msg, tokenAge } = tokenManager.getStatus();
    const hasToken = !!tokenManager.getToken();
    const ageMin = tokenAge ? Math.round((Date.now() - tokenAge) / 60000) : null;
    res.json({ status, msg, hasToken, ageMin, expiresIn: ageMin !== null ? Math.max(0, 50 - ageMin) : null, projectId: tokenManager.projectId });
});

app.post('/auth/login', async (req, res) => {
    res.json({ ok: true, msg: 'Login window opening...' });
    tokenManager.forceLogin().catch(e => console.error('Login error:', e.message));
});

app.post('/auth/logout', (req, res) => {
    const cookiesFile = path.join(__dirname, '.google-cookies.json');
    if (fs.existsSync(cookiesFile)) fs.unlinkSync(cookiesFile);
    res.json({ ok: true });
});

app.post('/auth/refresh', (req, res) => {
    res.json({ ok: true, msg: 'Refresh started...' });
    tokenManager._refreshToken().catch(e => console.error('Refresh error:', e.message));
});

// Bookmarklet token receiver (fallback if Puppeteer fails)
app.post('/auth/token', (req, res) => {
    const { token } = req.body;
    if (!token || !token.startsWith('ya29')) return res.status(400).json({ error: 'Invalid token' });
    tokenManager.token = token;
    tokenManager.tokenAge = Date.now();
    tokenManager._setStatus('ready', `Manual token received at ${new Date().toLocaleTimeString()}`);
    console.log('[TokenManager] Manual token received via bookmarklet');
    res.json({ ok: true });
});

// ─── MULTI-ACCOUNT (PARALLEL WORKERS) ────────────────────────────────────────

// SSE stream — push account state changes to the UI in real time
const accountSseClients = new Set();
app.get('/api/accounts/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
    accountSseClients.add(send);
    // Send current snapshot immediately
    send({ type: 'snapshot', accounts: multiAccountManager.getAccounts() });

    req.on('close', () => accountSseClients.delete(send));
});

multiAccountManager.on('account:change', data => {
    accountSseClients.forEach(send => send({ type: 'update', account: data }));
});
multiAccountManager.on('account:removed', id => {
    accountSseClients.forEach(send => send({ type: 'removed', id }));
});

app.get('/api/accounts', (req, res) => {
    res.json({ accounts: multiAccountManager.getAccounts() });
});

// Open Chrome for a new Google account login
app.post('/api/accounts/add', async (req, res) => {
    const id = await multiAccountManager.addAccount();
    res.json({ ok: true, id });
});

app.delete('/api/accounts/:id', async (req, res) => {
    await multiAccountManager.removeAccount(req.params.id);
    res.json({ ok: true });
});

app.post('/api/accounts/:id/login', async (req, res) => {
    await multiAccountManager.forceLogin(req.params.id);
    res.json({ ok: true });
});

// ─── LEGACY ENDPOINT ─────────────────────────────────────────────────────────
app.get('/generate', (req, res) => res.redirect('/'));
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.json({}));

app.post('/generate', async (req, res) => {
    const { prompt, apiKeys, aspect } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const candidates = await tokensToTry(apiKeys);
    if (!candidates.length) return res.status(401).json({ error: 'No token available. Server is logging in...' });

    for (const token of candidates) {
        try {
            const payload = {
                clientContext: clientCtx(),
                mediaGenerationContext: { batchId: crypto.randomUUID() },
                useNewMedia: true,
                requests: [{
                    clientContext: clientCtx(),
                    imageModelName: 'HARBOR_SEAL',
                    imageAspectRatio: ASPECT_IMAGE[aspect] || 'IMAGE_ASPECT_RATIO_LANDSCAPE',
                    structuredPrompt: { parts: [{ text: prompt }] },
                    seed: Math.floor(Math.random() * 1000000),
                    imageInputs: []
                }]
            };
            const response = await fetch(
                `${BASE}/v1/projects/${getProjectId()}/flowMedia:batchGenerateImages`,
                { method: 'POST', headers: imageHeaders(token), body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (!response.ok) { console.log(`Token ...${token.slice(-6)} failed: ${data?.error?.message}`); notifyExpired(token, response.status); continue; }
            const imageUrl = extractImageUrl(data);
            if (!imageUrl) continue;
            return res.json({ imageUrl });
        } catch (err) { continue; }
    }
    res.status(502).json({ error: 'All tokens failed' });
});

// ─── IMAGE GENERATION ─────────────────────────────────────────────────────────
app.post('/api/generate/image', async (req, res) => {
    const { prompt, tokens, aspect, count = 1, referenceImageId } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const candidates = await tokensToTry(tokens);
    if (!candidates.length) return res.status(401).json({ error: 'No token available. Server is logging in...' });

    for (const token of candidates) {
        try {
            const imageInputs = referenceImageId
                ? [{ imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE', name: referenceImageId }]
                : [];
            const requests = Array.from({ length: Math.min(count, 4) }, () => ({
                clientContext: clientCtx(),
                imageModelName: 'HARBOR_SEAL',
                imageAspectRatio: ASPECT_IMAGE[aspect] || 'IMAGE_ASPECT_RATIO_LANDSCAPE',
                structuredPrompt: { parts: [{ text: prompt }] },
                seed: Math.floor(Math.random() * 900000) + 100000,
                imageInputs
            }));
            const payload = {
                clientContext: clientCtx(),
                mediaGenerationContext: { batchId: crypto.randomUUID() },
                useNewMedia: true,
                requests
            };
            const response = await fetch(
                `${BASE}/v1/projects/${getProjectId()}/flowMedia:batchGenerateImages`,
                { method: 'POST', headers: imageHeaders(token), body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (!response.ok) { console.log(`Image ...${token.slice(-6)} failed:`, data?.error?.message); notifyExpired(token, response.status); continue; }

            const urls = [];
            if (data?.generatedMedia) {
                for (const m of data.generatedMedia) { const u = extractImageUrl(m); if (u) urls.push(u); }
            }
            if (!urls.length) { const u = extractImageUrl(data); if (u) urls.push(u); }
            if (!urls.length) continue;
            return res.json({ urls });
        } catch (e) { console.error('Image error:', e.message); }
    }
    res.status(502).json({ error: 'All tokens failed for image generation' });
});

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
app.post('/api/upload/image', async (req, res) => {
    const { tokens, imageBase64, mimeType = 'image/jpeg', fileName = 'upload.jpg' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Missing image' });
    const candidates = await tokensToTry(tokens);
    if (!candidates.length) return res.status(401).json({ error: 'No token available.' });

    for (const token of candidates) {
        try {
            const payload = {
                clientContext: { tool: 'PINHOLE', projectId: getProjectId() },
                imageBytes: imageBase64, isUserUploaded: true, isHidden: false, mimeType, fileName
            };
            const response = await fetch(
                `${BASE}/v1/projects/${getProjectId()}/flowMedia:uploadImage`,
                { method: 'POST', headers: imageHeaders(token), body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (!response.ok) { notifyExpired(token, response.status); continue; }
            const mediaId = data?.media?.name || data?.media?.imageId || data?.media?.id;
            if (mediaId) return res.json({ mediaId });
        } catch (e) { console.error('Upload error:', e.message); }
    }
    res.status(502).json({ error: 'Upload failed' });
});

// ─── IMAGE UPSCALE ────────────────────────────────────────────────────────────
app.post('/api/upscale/image', async (req, res) => {
    const { tokens, mediaId, resolution = '2k' } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'Missing mediaId' });
    const candidates = await tokensToTry(tokens);
    if (!candidates.length) return res.status(401).json({ error: 'No token available.' });

    const resMap = { '2k': 'UPSAMPLE_IMAGE_RESOLUTION_2K', '4k': 'UPSAMPLE_IMAGE_RESOLUTION_4K' };
    for (const token of candidates) {
        try {
            const payload = { mediaId, targetResolution: resMap[resolution] || resMap['2k'], clientContext: clientCtx() };
            const response = await fetch(
                `${BASE}/v1/projects/${getProjectId()}/flowMedia:upsampleImage`,
                { method: 'POST', headers: imageHeaders(token), body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (!response.ok) { notifyExpired(token, response.status); continue; }
            if (data?.encodedImage) return res.json({ imageData: data.encodedImage });
            const url = extractImageUrl(data);
            if (url) return res.json({ imageUrl: url });
        } catch (e) { console.error('Upscale error:', e.message); }
    }
    res.status(502).json({ error: 'Upscale failed' });
});

// ─── VIDEO GENERATION ─────────────────────────────────────────────────────────
// Real endpoint (captured from labs.google network traffic):
//   POST /v1/video:batchAsyncGenerateVideoText  (no /projects/ in path)
// Poll: POST /v1/video:batchCheckAsyncVideoGenerationStatus
app.post('/api/generate/video', async (req, res) => {
    const { prompt, tokens, aspect = '16:9', duration = 8, mode = 't2v', startImageId, endImageId } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const candidates = await tokensToTry(tokens);
    if (!candidates.length) return res.status(401).json({ error: 'No token available.' });

    const pid = getProjectId();
    const isI2V = mode === 'i2v' && startImageId;
    const endpoint = isI2V ? 'batchAsyncGenerateVideoStartImage' : 'batchAsyncGenerateVideoText';

    for (const token of candidates) {
        try {
            const batchId = crypto.randomUUID();
            // Payload structure from live labs.google network capture:
            // - mediaGenerationContext: only batchId + audioFailurePreference
            // - clientContext: projectId, tool, userPaygateTier, sessionId, recaptchaContext
            // - requests[0]: aspectRatio, textInput (object), videoModelKey, seed, metadata,
            //                startImage (i2v only)
            // - useV2ModelConfig: true
            const requestEntry = {
                aspectRatio: ASPECT_VIDEO[aspect] || 'VIDEO_ASPECT_RATIO_LANDSCAPE',
                textInput: { structuredPrompt: { parts: [{ text: prompt }] } },
                videoModelKey: isI2V ? 'abra_i2v_8s' : 'veo3_fast',
                seed: Math.floor(Math.random() * 99999),
                metadata: {},
            };
            if (isI2V) {
                requestEntry.startImage = { mediaId: startImageId, cropCoordinates: null };
                if (endImageId) requestEntry.endImage = { mediaId: endImageId, cropCoordinates: null };
            }
            const payload = {
                mediaGenerationContext: {
                    batchId,
                    audioFailurePreference: 'BLOCK_SILENCED_VIDEOS',
                },
                clientContext: {
                    projectId: pid,
                    tool: 'PINHOLE',
                    userPaygateTier: 'PAYGATE_TIER_NOT_PAID',
                    sessionId: `;${Date.now()}`,
                    recaptchaContext: BYPASS,
                },
                requests: [requestEntry],
                useV2ModelConfig: true,
            };
            const response = await fetch(
                `${BASE}/v1/video:${endpoint}`,
                { method: 'POST', headers: videoHeaders(token), body: JSON.stringify(payload) }
            );
            const rawText = await response.text();
            let data;
            try { data = JSON.parse(rawText); }
            catch {
                console.error(`Video ...${token.slice(-6)} non-JSON (${response.status}):`, rawText.slice(0, 400));
                continue;
            }
            if (!response.ok) {
                console.log(`Video ...${token.slice(-6)} failed (${response.status}):`, data?.error?.message || JSON.stringify(data).slice(0, 300));
                notifyExpired(token, response.status);
                continue;
            }
            const mediaIds = extractMediaIds(data);
            if (!mediaIds.length) {
                console.log('Video: no mediaIds in response:', JSON.stringify(data).slice(0, 300));
                continue;
            }
            return res.json({ mediaIds, token, projectId: pid });
        } catch (e) { console.error('Video submit error:', e.message); }
    }
    res.status(502).json({ error: 'All tokens failed for video generation' });
});

// ─── VIDEO POLL ───────────────────────────────────────────────────────────────
app.post('/api/poll/video', async (req, res) => {
    const { token, mediaIds } = req.body;
    const resolved = token || tokenManager.getToken();
    if (!resolved || !mediaIds?.length) return res.status(400).json({ error: 'Missing token or mediaIds' });

    const pid = getProjectId();
    try {
        // Real poll format: { media: [{ name: uuid, projectId: uuid }] }
        const payload = { media: mediaIds.map(name => ({ name, projectId: pid })) };
        const response = await fetch(
            `${BASE}/v1/video:batchCheckAsyncVideoGenerationStatus`,
            { method: 'POST', headers: videoHeaders(resolved), body: JSON.stringify(payload) }
        );
        const rawText = await response.text();
        let data;
        try { data = JSON.parse(rawText); }
        catch { return res.status(502).json({ error: 'Poll non-JSON: ' + rawText.slice(0, 200) }); }
        if (!response.ok) return res.status(response.status).json(data);
        const results = (data?.media || []).map(item => {
            const state = item?.mediaMetadata?.mediaStatus?.state;
            const genStatus = item?.mediaMetadata?.mediaStatus?.mediaGenerationStatus
                           || item?.mediaMetadata?.mediaGenerationStatus
                           || state;
            const id = item?.name || item?.mediaId || item?.id;
            const done   = genStatus === 'SUCCESSFUL' || state === 'SUCCESSFUL';
            const failed = ['FAILED', 'ERROR', 'CANCELLED'].some(s => genStatus === s || state === s);
            const error  = item?.failureReason || item?.error?.message;
            const downloadUrl = extractImageUrl(item)
                             || item?.mediaMetadata?.downloadUri
                             || item?.mediaMetadata?.mediaStatus?.downloadUri;
            return { id, genStatus, done, failed, error, downloadUrl };
        });
        return res.json({ results });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── VIDEO DOWNLOAD PROXY ─────────────────────────────────────────────────────
app.get('/api/download/video', async (req, res) => {
    const { url } = req.query;
    const tkn = tokenManager.getToken();
    const authHeader = req.headers['authorization'] || (tkn ? `Bearer ${tkn}` : null);
    if (!url || !authHeader) return res.status(400).json({ error: 'Missing url or token' });

    try {
        const response = await fetch(url, { headers: { 'Authorization': authHeader } });
        if (!response.ok) return res.status(response.status).json({ error: 'Download failed' });
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        response.body.pipe(res);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DOLA.COM GENERATOR ───────────────────────────────────────────────────────
// Serve the outputs folder so the browser can play/download generated files
app.use('/outputs', express.static(dolaGenerator.OUTPUTS_DIR));

// GET /api/dola/cookies-status — check which cookie files exist in the project dir
app.get('/api/dola/cookies-status', (req, res) => {
    const candidates = ['cookies.json', 'dola-cookies.json', '.dola-cookies.json'];
    const found = candidates
        .map(f => path.join(__dirname, f))
        .filter(p => fs.existsSync(p))
        .map(p => path.basename(p));
    res.json({ found, default: found[0] || null });
});

// POST /api/dola/generate  — browser-automation video or image via dola.com
// Body: { type: 'video'|'image', prompt, aspect, headless, cookiesFile }
// Response: SSE stream of log lines, then a final JSON line: {"done":true,"filePath":"...","url":"..."}
app.post('/api/dola/generate', async (req, res) => {
    const { type = 'video', prompt, aspect = '16:9', headless = true, cookiesFile = 'cookies.json' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const cookiesPath = path.isAbsolute(cookiesFile)
        ? cookiesFile
        : path.join(__dirname, cookiesFile);

    if (!fs.existsSync(cookiesPath)) {
        return res.status(400).json({ error: `Cookie file not found: ${cookiesFile}. Upload your cookies.json to the DoodleGen folder.` });
    }

    // Use SSE so the frontend gets live log lines during the 2–4 min wait
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const filePath = await dolaGenerator.generate({
            type,
            prompt,
            aspect,
            headless,
            cookiesPath,
            log: (msg) => {
                console.log(`[Dola] ${msg}`);
                send({ log: msg });
            },
        });

        const fileName = path.basename(filePath);
        send({ done: true, filePath, url: `/outputs/${fileName}`, fileName });
    } catch (e) {
        console.error('[Dola] Error:', e.message);
        send({ error: e.message });
    } finally {
        res.end();
    }
});

// ─── META AI GENERATOR ────────────────────────────────────────────────────────
// GET /api/meta/cookies-status
app.get('/api/meta/cookies-status', (req, res) => {
    const candidates = ['meta-cookies.json', 'meta_cookies.json', 'cookies.json'];
    const found = candidates
        .map(f => path.join(__dirname, f))
        .filter(p => fs.existsSync(p))
        .map(p => path.basename(p));
    res.json({ found, default: found[0] || null });
});

// POST /api/meta/generate — SSE stream, same pattern as Dola
app.post('/api/meta/generate', async (req, res) => {
    const { type = 'video', prompt, headless = true, cookiesFile = 'meta-cookies.json' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const cookiesPath = path.isAbsolute(cookiesFile)
        ? cookiesFile
        : path.join(__dirname, cookiesFile);

    if (!fs.existsSync(cookiesPath)) {
        return res.status(400).json({ error: `Cookie file not found: ${cookiesFile}. Save your meta.ai cookies as meta-cookies.json in the DoodleGen folder.` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const filePath = await metaGenerator.generate({
            type, prompt, headless, cookiesPath,
            log:       (msg) => { console.log(`[Meta] ${msg}`); send({ log: msg }); },
            onNetwork: (ev)  => send({ network: ev }),
        });
        const fileName = path.basename(filePath);
        send({ done: true, filePath, url: `/outputs/${fileName}`, fileName });
    } catch (e) {
        console.error('[Meta] Error:', e.message);
        send({ error: e.message });
    } finally {
        res.end();
    }
});

// ─── VIBES.AI GENERATOR ──────────────────────────────────────────────────────
// Proxies to https://vibes.ai/api/generate/videos using a saved session cookie.
// Save your vibes.ai cookies as vibes-cookies.json in the project folder.
//
// Cookie format (one of):
//   JSON array (EditThisCookie etc):  [{ "name": "meta_session", "value": "..." }, ...]
//   Plain string:  "cookie_ack=true; meta_session=..."

function loadVibesCookieStr(cookiesFile) {
    const cookiesPath = require('path').isAbsolute(cookiesFile)
        ? cookiesFile
        : require('path').join(__dirname, cookiesFile);
    if (!require('fs').existsSync(cookiesPath)) return null;
    const raw = require('fs').readFileSync(cookiesPath, 'utf8').trim();
    if (!raw.startsWith('[') && !raw.startsWith('{')) return raw;
    try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr.map(c => c.name + '=' + c.value).join('; ');
    } catch { return null; }
}

app.get('/api/vibes/cookies-status', (req, res) => {
    const candidates = ['vibes-cookies.json', 'vibes_cookies.json'];
    const found = candidates
        .map(f => path.join(__dirname, f))
        .filter(p => fs.existsSync(p))
        .map(p => path.basename(p));
    res.json({ found, default: found[0] || null });
});

// POST /api/vibes/generate/videos
// Body: same shape as vibes.ai's own body (inputs, config, batchId, projectId, ...)
// plus optional cookiesFile (default: vibes-cookies.json)
app.post('/api/vibes/generate/videos', async (req, res) => {
    const { cookiesFile = 'vibes-cookies.json', useAccountManager = false, preferAccountId = null, ...vibesBody } = req.body;

    // Build ordered list of cookies to try: preferred account first, then all other accounts, then file fallback
    const allCookies = vibesAccountManager.getCookies();
    const cookiesToTry = [];
    if (preferAccountId) {
        const preferred = allCookies.find(a => a.id === preferAccountId);
        if (preferred) cookiesToTry.push({ str: preferred.cookieStr, accountId: preferred.id });
    }
    for (const a of allCookies) {
        if (!cookiesToTry.some(c => c.accountId === a.id)) {
            cookiesToTry.push({ str: a.cookieStr, accountId: a.id });
        }
    }
    const fileCookie = loadVibesCookieStr(cookiesFile);
    if (fileCookie && !cookiesToTry.some(c => c.str === fileCookie)) cookiesToTry.push({ str: fileCookie, accountId: null });

    if (!cookiesToTry.length) {
        return res.status(400).json({
            error: 'No vibes.ai session available. Add an account in the Vibes Accounts panel or save vibes-cookies.json in the DoodleGen folder.'
        });
    }

    let lastErrorStatus = 503;
    let lastErrorBody = { error: 'No vibes.ai session available' };

    for (const { str: cookieStr, accountId } of cookiesToTry) {
        console.log('[Vibes] Using', accountId ? 'account manager cookie from ' + accountId : 'file cookie from ' + cookiesFile);
        try {
            const response = await fetch('https://vibes.ai/api/generate/videos', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'accept-language': 'en-US,en;q=0.9',
                    'content-type': 'application/json',
                    'cookie': cookieStr,
                    'origin': 'https://vibes.ai',
                    'referer': vibesBody.projectId
                        ? 'https://vibes.ai/projects/' + vibesBody.projectId
                        : 'https://vibes.ai',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                },
                body: JSON.stringify(vibesBody),
            });

            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();

            if (!response.ok) {
                console.log('[Vibes] Request failed (' + response.status + '):', text.slice(0, 300));
                let parsed = null;
                try { parsed = JSON.parse(text); } catch (_) {}
                lastErrorStatus = response.status;
                lastErrorBody = parsed || { error: text.slice(0, 300) };

                if (response.status === 401) {
                    vibesAccountManager.markExpired(cookieStr);
                    continue; // try next account — session expired
                }
                // 400 (content policy), 429 (rate limit), 500 (generation failed) —
                // all may be account-specific; try the next account before giving up.
                if (response.status === 400 || response.status === 429 || response.status === 500) {
                    continue;
                }
                // Other errors are not account-specific — surface immediately.
                return res.status(response.status).json(lastErrorBody);
            }

            if (contentType.includes('application/json')) {
                try {
                    const parsed = JSON.parse(text);
                    if (accountId) parsed.usedAccountId = accountId;
                    return res.json(parsed);
                } catch (_) {}
            }
            res.setHeader('Content-Type', contentType || 'text/plain');
            return res.send(text);
        } catch (e) {
            console.error('[Vibes] Proxy error:', e.message);
            lastErrorBody = { error: e.message };
        }
    }
    // All accounts exhausted — return the actual last error, not a generic session message
    res.status(lastErrorStatus).json(lastErrorBody);
});

// POST /api/vibes/poll — polls vibes.ai generation batch status
// Uses the real endpoint: GET https://vibes.ai/api/generation-batches/:batchId
app.post('/api/vibes/poll', async (req, res) => {
    const { batchId, cookiesFile = 'vibes-cookies.json', projectId = '', accountId = null } = req.body;
    if (!batchId) return res.status(400).json({ error: 'Missing batchId' });

    // Build ordered list of cookies to try: specific accountId first, then round-robin, then file
    const pollCookies = [];
    if (accountId) {
        const accts = vibesAccountManager.getCookies();
        const found = accts.find(a => a.id === accountId);
        if (found) pollCookies.push({ str: found.cookieStr, id: accountId });
    }
    const acctCookie = vibesAccountManager.nextCookie();
    if (acctCookie && !pollCookies.some(c => c.str === acctCookie.cookieStr)) {
        pollCookies.push({ str: acctCookie.cookieStr, id: acctCookie.id });
    }
    const fileCookie = loadVibesCookieStr(cookiesFile);
    if (fileCookie && !pollCookies.some(c => c.str === fileCookie)) {
        pollCookies.push({ str: fileCookie, id: null });
    }
    if (!pollCookies.length) return res.status(400).json({ error: 'No vibes.ai session available' });

    for (const { str: cookieStr, id: usedId } of pollCookies) {
        try {
            const response = await fetch('https://vibes.ai/api/generation-batches/' + encodeURIComponent(batchId), {
                method: 'GET',
                headers: {
                    'accept': 'application/json, */*',
                    'cookie': cookieStr,
                    'origin': 'https://vibes.ai',
                    'referer': projectId ? 'https://vibes.ai/projects/' + projectId : 'https://vibes.ai',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                },
            });
            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();
            if (!response.ok) {
                console.log('[Vibes Poll] Failed (' + response.status + ') via', usedId || 'file', ':', text.slice(0, 200));
                if (response.status === 401) vibesAccountManager.markExpired(cookieStr);
                continue;
            }
            if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(text);
                    console.log('[Vibes Poll] keys:', Object.keys(parsed).join(', '), '| preview:', text.slice(0, 400));
                    return res.json(parsed);
                } catch (_) {}
            }
            res.setHeader('Content-Type', contentType || 'text/plain');
            return res.send(text);
        } catch (e) {
            console.error('[Vibes Poll] Error:', e.message);
        }
    }
    res.status(401).json({ error: 'All vibes.ai sessions expired. Please re-authenticate.' });
});

// ─── LOCAL IMAGE SAVE ─────────────────────────────────────────────────────────
// POST /api/save/image
// Body: { url, filename, folder }
// Saves image from URL to folder/filename on disk.
// folder can be absolute or relative to home dir (~ supported).
// filename is sanitised the same way as the extension's qt() function.
app.post('/api/save/image', async (req, res) => {
    const https  = require('https');
    const http   = require('http');
    const os     = require('os');

    let { url, filename, folder = 'AutoLabs_meta' } = req.body;
    if (!url || !filename) return res.status(400).json({ error: 'Missing url or filename' });

    // Resolve ~ and relative paths
    if (folder.startsWith('~')) folder = path.join(os.homedir(), folder.slice(1));
    if (!path.isAbsolute(folder)) folder = path.join(os.homedir(), 'Downloads', folder);

    // Sanitise filename exactly like the extension's qt() function
    const sanitised = filename.trim()
        .replace(/[\\/:*?"<>|,]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 80) || `image_${Date.now()}`;
    const finalName = sanitised.endsWith('.png') || sanitised.endsWith('.jpg') || sanitised.endsWith('.webp')
        ? sanitised : `${sanitised}.png`;
    const destDir  = folder;
    const destPath = path.join(destDir, finalName);

    try {
        fs.mkdirSync(destDir, { recursive: true });

        // If it's a data URL, write directly
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) return res.status(400).json({ error: 'Invalid data URL' });
            fs.writeFileSync(destPath, Buffer.from(matches[2], 'base64'));
            return res.json({ ok: true, path: destPath, filename: finalName });
        }

        // Otherwise fetch and pipe to file
        await new Promise((resolve, reject) => {
            const proto   = url.startsWith('https') ? https : http;
            const file    = fs.createWriteStream(destPath);
            const request = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    // follow one redirect
                    const redirProto = response.headers.location.startsWith('https') ? https : http;
                    redirProto.get(response.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, redir => {
                        redir.pipe(file);
                        file.on('finish', () => { file.close(); resolve(); });
                        redir.on('error', reject);
                    });
                    return;
                }
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(destPath, () => {});
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            });
            request.on('error', err => { file.close(); fs.unlink(destPath, () => {}); reject(err); });
        });

        return res.json({ ok: true, path: destPath, filename: finalName });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── LOCAL VIDEO SAVE ────────────────────────────────────────────────────────
// POST /api/save/video
// Body: { url, filename, folder }
// Like /api/save/image but preserves .mp4 extension.
app.post('/api/save/video', async (req, res) => {
    const https = require('https');
    const http  = require('http');
    const os    = require('os');

    let { url, filename, folder = 'Vibes_videos' } = req.body;
    if (!url || !filename) return res.status(400).json({ error: 'Missing url or filename' });

    if (folder.startsWith('~')) folder = path.join(os.homedir(), folder.slice(1));
    if (!path.isAbsolute(folder)) folder = path.join(os.homedir(), 'Downloads', folder);

    const sanitised = filename.trim()
        .replace(/[\\/:*?"<>|,]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 80) || `video_${Date.now()}`;
    const finalName = sanitised.endsWith('.mp4') ? sanitised : `${sanitised}.mp4`;
    const destPath  = path.join(folder, finalName);

    try {
        fs.mkdirSync(folder, { recursive: true });
        await new Promise((resolve, reject) => {
            const proto   = url.startsWith('https') ? https : http;
            const file    = fs.createWriteStream(destPath);
            const request = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const redirProto = response.headers.location.startsWith('https') ? https : http;
                    redirProto.get(response.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, redir => {
                        redir.pipe(file);
                        file.on('finish', () => { file.close(); resolve(); });
                        redir.on('error', reject);
                    });
                    return;
                }
                if (response.statusCode !== 200) {
                    file.close(); fs.unlink(destPath, () => {});
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            });
            request.on('error', err => { file.close(); fs.unlink(destPath, () => {}); reject(err); });
        });
        return res.json({ ok: true, path: destPath, filename: finalName });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── VOICE LIST ───────────────────────────────────────────────────────────────
const VOICES = [
    'Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede',
    'Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba',
    'Despina','Erinome','Algenib','Achernar','Schedar','Gacrux',
    'Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia',
    'Sadaltager','Sulafat','Sheratan','Hadar','Mintaka'
];
app.get('/api/voice/list', (req, res) => res.json({ voices: VOICES }));

// ─── TTS GENERATION ───────────────────────────────────────────────────────────
app.post('/api/generate/voice', async (req, res) => {
    const { text, voice = 'Kore', tokens } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });
    const candidates = await tokensToTry(tokens);
    if (!candidates.length) return res.status(401).json({ error: 'No token available.' });

    for (const token of candidates) {
        try {
            const payload = {
                clientContext: clientCtx(),
                requests: [{
                    dialog: text.slice(0, 450),
                    voicePerformance: '',
                    modelKey: 'gemini_v4s_tts_flow',
                    voiceConfigs: [{ speaker: voice, voice }],
                    generationType: 'PREVIEW'
                }]
            };
            const response = await fetch(
                `${BASE}/v1/flow:batchGenerateAudio`,
                { method: 'POST', headers: videoHeaders(token), body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (!response.ok) { console.log(`TTS ...${token.slice(-6)} failed:`, data?.error?.message); notifyExpired(token, response.status); continue; }
            const mediaId = data?.media?.[0]?.workflows?.[0]?.metadata?.primaryMediaId;
            if (!mediaId) continue;
            const dlResponse = await fetch(`${BASE}/v1/media/${mediaId}:download`, { headers: videoHeaders(token) });
            if (!dlResponse.ok) continue;
            const audioBuffer = await dlResponse.buffer();
            const b64 = audioBuffer.toString('base64');
            const mimeType = audioBuffer[0] === 0x52 ? 'audio/wav' : 'audio/mpeg';
            return res.json({ audioData: b64, mimeType });
        } catch (e) { console.error('TTS error:', e.message); }
    }
    res.status(502).json({ error: 'All tokens failed for TTS' });
});


// ─── VIBES ACCOUNT MANAGER ───────────────────────────────────────────────────

// SSE — push live account state updates
app.get('/api/vibes-accounts/events', (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const send = data => res.write('data: ' + JSON.stringify(data) + '\n\n');

    // Send full current state on connect
    send({ type: 'snapshot', accounts: vibesAccountManager.getAccounts() });

    const onChange   = data => send({ type: 'account:change',   account: data });
    const onRemoved  = id   => send({ type: 'account:removed',  id });

    vibesAccountManager.on('account:change',  onChange);
    vibesAccountManager.on('account:removed', onRemoved);

    req.on('close', () => {
        vibesAccountManager.off('account:change',  onChange);
        vibesAccountManager.off('account:removed', onRemoved);
    });
});

app.get('/api/vibes-accounts', (req, res) => {
    res.json({ accounts: vibesAccountManager.getAccounts() });
});

app.post('/api/vibes-accounts', async (req, res) => {
    const id = await vibesAccountManager.addAccount();
    res.json({ id, msg: 'Chrome opening — sign in with Meta on vibes.ai' });
});

app.delete('/api/vibes-accounts/:id', async (req, res) => {
    await vibesAccountManager.removeAccount(req.params.id);
    res.json({ ok: true });
});

app.post('/api/vibes-accounts/:id/reauth', async (req, res) => {
    await vibesAccountManager.forceLogin(req.params.id);
    res.json({ ok: true, msg: 'Chrome opening for re-authentication' });
});


// ─── VEO AI FREE ─────────────────────────────────────────────────────────────
// No login required. Set VEO_PROXIES=http://user:pass@host:port,...
// to rotate proxies and bypass the per-session rate limit.
let _veoProxyIdx = 0;
function _nextVeoProxy() {
    if (!_veoRuntimeProxies.length) return null;
    return _veoRuntimeProxies[(_veoProxyIdx++) % _veoRuntimeProxies.length];
}
async function _veoRequest(params, proxyUrl, cookie) {
    const headers = {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
        'accept': '*/*', 'origin': 'https://veoaifree.com',
        'referer': 'https://veoaifree.com/veo-video-generator/',
        'x-requested-with': 'XMLHttpRequest',
    };
    if (cookie) headers['cookie'] = cookie;
    const opts = {
        method: 'POST',
        headers,
        body: new URLSearchParams(params).toString(),
    };
    if (proxyUrl) {
        try { const { HttpsProxyAgent } = require('https-proxy-agent'); opts.agent = new HttpsProxyAgent(proxyUrl); } catch (_) {}
    }
    return fetch('https://veoaifree.com/wp-admin/admin-ajax.php', opts);
}
async function _veoSession(proxyUrl) {
    // Returns { nonce, cookie } — fresh session per request to avoid rate limit tracking
    try {
        const fetchOpts = { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36', accept: 'text/html' } };
        if (proxyUrl) { try { const { HttpsProxyAgent } = require('https-proxy-agent'); fetchOpts.agent = new HttpsProxyAgent(proxyUrl); } catch (_) {} }
        const r = await fetch('https://veoaifree.com/veo-video-generator/', fetchOpts);
        const html = await r.text();
        const m = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i) || html.match(/nonce["':\s]+["']([a-f0-9]{8,})["']/i);
        const nonce = m ? m[1] : '594d6156aa';
        // Collect Set-Cookie headers to replay the same session
        const rawCookies = r.headers.raw ? r.headers.raw()['set-cookie'] : null;
        let cookie = '';
        if (rawCookies) {
            cookie = rawCookies.map(c => c.split(';')[0]).join('; ');
        }
        return { nonce, cookie };
    } catch { return { nonce: '594d6156aa', cookie: '' }; }
}
async function _veoNonce(proxyUrl) {
    return (await _veoSession(proxyUrl)).nonce;
}

// Runtime proxy list — overrides VEO_PROXIES env var when set from UI
// Persist Veo config to disk so it survives server restarts
const _veoCfgPath = require('path').join(__dirname, 'veo-config.json');
function _veoLoadCfg() {
    try { return JSON.parse(require('fs').readFileSync(_veoCfgPath, 'utf8')); } catch { return {}; }
}
function _veoSaveCfg(patch) {
    const cfg = _veoLoadCfg();
    require('fs').writeFileSync(_veoCfgPath, JSON.stringify({ ...cfg, ...patch }, null, 2));
}
const _veoCfgInit = _veoLoadCfg();
let _veoRuntimeProxies = _veoCfgInit.proxies || (process.env.VEO_PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);

app.get('/api/veo/proxy-status', (req, res) => {
    res.json({ count: _veoRuntimeProxies.length, proxies: _veoRuntimeProxies });
});

app.post('/api/veo/proxy-set', (req, res) => {
    const { proxies } = req.body;
    if (!Array.isArray(proxies)) return res.status(400).json({ error: 'proxies must be an array' });
    _veoRuntimeProxies = proxies.map(s => s.trim()).filter(Boolean);
    _veoProxyIdx = 0;
    _veoSaveCfg({ proxies: _veoRuntimeProxies });
    console.log('[Veo] Runtime proxies updated:', _veoRuntimeProxies.length);
    res.json({ ok: true, count: _veoRuntimeProxies.length });
});

let _veoWorkerUrl = _veoCfgInit.workerUrl || '';
// Support multiple worker URLs — rotate to get different CF edge IPs
let _veoWorkerUrls = _veoCfgInit.workerUrls || (_veoWorkerUrl ? [_veoWorkerUrl] : []);
let _veoWorkerIdx = 0;
function _nextWorkerUrl() {
    if (!_veoWorkerUrls.length) return _veoWorkerUrl || null;
    return _veoWorkerUrls[(_veoWorkerIdx++) % _veoWorkerUrls.length];
}

app.get('/api/veo/worker', (req, res) => {
    res.json({ url: _veoWorkerUrl, urls: _veoWorkerUrls });
});

app.post('/api/veo/worker', (req, res) => {
    const { url } = req.body;
    _veoWorkerUrl = (url || '').trim().replace(/\/+$/, '');
    // Also accept newline/comma-separated list of worker URLs
    const { urls } = req.body;
    if (urls && Array.isArray(urls)) {
        _veoWorkerUrls = urls.map(u => u.trim().replace(/\/+$/, '')).filter(Boolean);
        _veoWorkerUrl = _veoWorkerUrls[0] || '';
    } else {
        _veoWorkerUrls = _veoWorkerUrl ? [_veoWorkerUrl] : [];
    }
    _veoWorkerIdx = 0;
    _veoSaveCfg({ workerUrl: _veoWorkerUrl, workerUrls: _veoWorkerUrls });
    console.log('[Veo] Worker URL set:', _veoWorkerUrl || '(cleared)');
    res.json({ ok: true, url: _veoWorkerUrl });
});

app.post('/api/veo/generate', async (req, res) => {
    const { prompt, aspectRatio = 'landscape', quality = '720p' } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    const veoAspect = aspectRatio === 'portrait' ? 'VIDEO_ASPECT_RATIO_PORTRAIT' : 'VIDEO_ASPECT_RATIO_LANDSCAPE';

    // Prefer Cloudflare Workers — rotate across all configured worker URLs
    if (_veoWorkerUrls.length) {
        const tried = new Set();
        for (let wi = 0; wi < _veoWorkerUrls.length * 2; wi++) {
            const wUrl = _nextWorkerUrl();
            if (!wUrl) break;
            try {
                const r = await fetch(wUrl + '/generate', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ prompt: prompt.trim(), aspectRatio, quality, attempt: wi }),
                });
                const parsed = await r.json();
                console.log('[Veo Generate] worker', wUrl.split('/')[2], JSON.stringify(parsed).slice(0, 100));
                if (parsed.error === 'rate-limited') {
                    tried.add(wUrl);
                    if (tried.size >= _veoWorkerUrls.length) break; // all workers exhausted
                    continue;
                }
                return res.json({ ok: true, data: parsed.data, nonce: parsed.nonce || '594d6156aa', cookie: '' });
            } catch (e) {
                console.warn('[Veo Generate] worker failed:', e.message);
            }
        }
        console.warn('[Veo Generate] all workers rate-limited, falling back to proxies');
    }

    // Fallback: rotate through configured proxies
    const maxTries = Math.max(1, _veoRuntimeProxies.length || 1);
    let lastErr = null;
    for (let i = 0; i < maxTries; i++) {
        const proxyUrl = _nextVeoProxy();
        try {
            const { nonce, cookie } = await _veoSession(proxyUrl);
            const r = await _veoRequest({ action: 'veo_video_generator', nonce, prompt: prompt.trim(), totalVariations: '1', aspectRatio: veoAspect, video_quality: quality, actionType: 'full-video-generate' }, proxyUrl, cookie);
            const text = await r.text();
            let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
            const parsedStr = JSON.stringify(parsed);
            console.log('[Veo Generate] proxy=' + (proxyUrl || 'direct'), parsedStr.slice(0, 200));
            if (/limit reached|maximum allowance|rate.?limit/i.test(parsedStr)) {
                lastErr = new Error('rate-limited');
                continue;
            }
            return res.json({ ok: true, data: parsed, nonce, cookie });
        } catch (e) {
            console.warn('[Veo Generate] proxy attempt ' + (i+1) + ' failed:', e.message);
            lastErr = e;
        }
    }
    res.status(500).json({ error: lastErr ? lastErr.message : 'All proxies failed — add a Cloudflare Worker URL or fresh proxies' });
});

// Download video immediately — veoaifree.com URLs expire in ~60s
async function _veoDownloadNow(remoteUrl, sceneData) {
    const fs = require('fs');
    const nodePath = require('path');
    const dir = nodePath.join(__dirname, 'outputs', 'veo');
    fs.mkdirSync(dir, { recursive: true });
    const fname = 'veo_' + sceneData + '_' + Date.now() + '.mp4';
    const dest = nodePath.join(dir, fname);
    try {
        const r = await fetch(remoteUrl, {
            headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36', 'referer': 'https://veoaifree.com/' }
        });
        if (!r.ok) { console.warn('[Veo] download failed:', r.status, remoteUrl); return null; }
        const buf = await r.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(buf));
        console.log('[Veo] saved:', fname, Math.round(buf.byteLength / 1024) + 'KB');
        return '/api/veo/local/' + fname;
    } catch (e) { console.warn('[Veo] download error:', e.message); return null; }
}

app.get('/api/veo/local/:fname', (req, res) => {
    const nodePath = require('path');
    const fname = req.params.fname.replace(/[^a-zA-Z0-9_.-]/g, '');
    const file = nodePath.join(__dirname, 'outputs', 'veo', fname);
    if (!require('fs').existsSync(file)) return res.status(404).send('not found');
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.sendFile(file);
});

app.post('/api/veo/poll', async (req, res) => {
    const { sceneData, nonce = '594d6156aa', cookie = '' } = req.body;
    if (!sceneData) return res.status(400).json({ error: 'sceneData required' });
    let rawVideoUrl = null;

    if (_veoWorkerUrl) {
        try {
            const r = await fetch(_veoWorkerUrl + '/poll', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sceneData, nonce }),
            });
            const parsed = await r.json();
            rawVideoUrl = parsed.videoUrl || null;
        } catch (e) { console.warn('[Veo Poll] worker failed:', e.message); }
    }

    if (!rawVideoUrl) {
        const proxyUrl = _nextVeoProxy();
        try {
            const r = await _veoRequest({ action: 'veo_video_generator', nonce, sceneData: String(sceneData), actionType: 'final-video-results' }, proxyUrl, cookie);
            const text = await r.text();
            let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
            const m = JSON.stringify(parsed).match(/https?:\/\/[^"']+\.mp4/i);
            rawVideoUrl = m ? m[0] : null;
        } catch (e) { console.error('[Veo Poll] error:', e.message); return res.status(500).json({ error: e.message }); }
    }

    if (rawVideoUrl) {
        const localUrl = await _veoDownloadNow(rawVideoUrl, sceneData);
        return res.json({ ok: true, videoUrl: localUrl || rawVideoUrl, local: !!localUrl });
    }
    res.json({ ok: true, videoUrl: null });
});

// Proxy/download video from veoaifree.com — URL expires fast so fetch immediately
app.get('/api/veo/video', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('bad url');
    const attempts = [
        { 'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36', 'referer': 'https://veoaifree.com/', 'origin': 'https://veoaifree.com' },
        { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'referer': 'https://veoaifree.com/' },
        { 'user-agent': 'curl/8.0' },
    ];
    for (const hdrs of attempts) {
        try {
            const r = await fetch(url, { headers: hdrs });
            if (!r.ok) { console.warn('[Veo Video] attempt failed:', r.status, url); continue; }
            const ct = r.headers.get('content-type') || 'video/mp4';
            const cl = r.headers.get('content-length');
            res.set('Content-Type', ct);
            res.set('Content-Disposition', 'attachment; filename="veo-video.mp4"');
            res.set('Access-Control-Allow-Origin', '*');
            if (cl) res.set('Content-Length', cl);
            r.body.pipe(res);
            return;
        } catch (e) {
            console.warn('[Veo Video] fetch error:', e.message);
        }
    }
    res.status(404).send('Video not found or expired — veoaifree.com URLs expire within ~60 seconds of generation');
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`DoodleGen running on http://localhost:${PORT}`);
    // Start auto token manager
    tokenManager.on('status', ({ status, msg }) => console.log(`[TokenManager] ${status}: ${msg}`));
    tokenManager.start().catch(e => console.error('[TokenManager] Start error:', e.message));
});
