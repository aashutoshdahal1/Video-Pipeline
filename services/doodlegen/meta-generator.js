/**
 * Meta AI video/image generator via Puppeteer DOM automation.
 * Reverse-engineered from the "Meta AI Automator" Chrome extension.
 *
 * Key techniques (from extension source):
 *  1. Override document.visibilityState → "visible" so tab never suspends
 *  2. React-compatible textarea injection via HTMLTextAreaElement.prototype nativeInputValueSetter
 *  3. Poll for div[data-testid="generated-video"] → data-video-url (direct fbcdn CDN link)
 *  4. No GraphQL, no network interception — pure DOM automation
 */

const puppeteer = require('puppeteer-core');
const fs        = require('fs');
const path      = require('path');
const https     = require('https');
const http      = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const META_URL    = 'https://meta.ai/vibes';
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ─── Cookie loading ───────────────────────────────────────────────────────────
function loadCookies(cookiesPath) {
    const raw  = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.cookies || []);
    return list.map(c => ({
        name:     c.name,
        value:    c.value,
        domain:   (c.domain || 'meta.ai').replace(/^\./, ''),
        path:     c.path || '/',
        secure:   c.secure ?? false,
        httpOnly: c.httpOnly ?? c.http_only ?? false,
        sameSite: normalizeSameSite(c.sameSite),
        ...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
    }));
}

function normalizeSameSite(v) {
    const m = { strict:'Strict', lax:'Lax', none:'None', no_restriction:'None', unspecified:'Lax' };
    return m[(v||'').toLowerCase()] || 'Lax';
}

// ─── Cookie string → array ────────────────────────────────────────────────────
function parseCookieString(str) {
    return str.split(';').map(p => {
        const [name, ...rest] = p.trim().split('=');
        return { name: name.trim(), value: rest.join('=').trim(), domain: 'meta.ai', path: '/' };
    }).filter(c => c.name && c.value);
}

// ─── File download ────────────────────────────────────────────────────────────
function downloadUrl(url, dest) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file  = fs.createWriteStream(dest);
        proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode !== 200) {
                file.close();
                return reject(new Error(`HTTP ${res.statusCode} downloading video`));
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', err => { file.close(); reject(err); });
    });
}

// ─── Main generate function ───────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {'video'|'image'} opts.type
 * @param {string}  opts.prompt
 * @param {string}  opts.cookiesPath  path to cookies.json (or cookie string)
 * @param {boolean} [opts.headless]   default true
 * @param {function} [opts.log]       (msg) => void
 * @returns {Promise<string>}  absolute path to downloaded file
 */
async function generate({ type = 'video', prompt, cookiesPath, headless = true, log = () => {}, onNetwork = null }) {
    if (!prompt) throw new Error('prompt is required');

    // Load cookies — support both file path and raw cookie string
    let cookies;
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        cookies = loadCookies(cookiesPath);
    } else if (cookiesPath && cookiesPath.includes('=')) {
        cookies = parseCookieString(cookiesPath);
    } else {
        throw new Error(`Cookie file not found: ${cookiesPath}`);
    }

    log('Launching Chromium...');
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: headless ? 'new' : false,
        defaultViewport: { width: 1280, height: 900 },
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-sandbox',
            '--disable-gpu',
            '--window-size=1280,900',
        ],
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    });

    const page = await browser.newPage();

    // ── CDP Network monitoring (captures all requests/responses without DevTools) ─
    if (onNetwork) {
        const cdp = await page.createCDPSession();
        await cdp.send('Network.enable');

        const pendingRequests = new Map(); // requestId → { url, method, headers, postData }

        cdp.on('Network.requestWillBeSent', ev => {
            const { requestId, request, type: rType } = ev;
            pendingRequests.set(requestId, {
                url:      request.url,
                method:   request.method,
                headers:  request.headers,
                postData: request.postData || null,
                type:     rType,
            });
            onNetwork({
                kind:     'request',
                id:       requestId,
                url:      request.url,
                method:   request.method,
                headers:  request.headers,
                postData: request.postData || null,
                resType:  rType,
                ts:       Date.now(),
            });
        });

        cdp.on('Network.responseReceived', ev => {
            const { requestId, response } = ev;
            const req = pendingRequests.get(requestId) || {};
            onNetwork({
                kind:        'response',
                id:          requestId,
                url:         response.url,
                status:      response.status,
                statusText:  response.statusText,
                headers:     response.headers,
                mimeType:    response.mimeType,
                method:      req.method,
                postData:    req.postData,
                ts:          Date.now(),
            });
        });

        cdp.on('Network.loadingFailed', ev => {
            onNetwork({
                kind:  'failed',
                id:    ev.requestId,
                error: ev.errorText,
                ts:    Date.now(),
            });
            pendingRequests.delete(ev.requestId);
        });

        cdp.on('Network.loadingFinished', ev => {
            pendingRequests.delete(ev.requestId);
        });
    }

    // ── Stealth + visibility override (critical — from alwaysActive.js) ────────
    await page.evaluateOnNewDocument(() => {
        // Hide automation
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        delete window.__playwright;
        delete window.__puppeteer_evaluation_script__;

        // Override visibilityState so meta.ai never thinks tab is hidden
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        Object.defineProperty(document, 'hidden', { get: () => false });
        document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    });

    try {
        // Inject cookies
        log('Injecting session cookies...');
        await page.setCookie(...cookies);

        // Navigate
        log('Navigating to meta.ai/create...');
        await page.goto(META_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Wait for textarea
        log('Waiting for composer input...');
        const TEXTAREA_SEL = 'textarea[data-testid="composer-input"]';
        await page.waitForSelector(TEXTAREA_SEL, { timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));

        // Log all visible buttons so we can identify the correct selectors on /vibes
        const pageButtons = await page.evaluate(() => {
            return [...document.querySelectorAll('button, [role="button"], [role="tab"], input[type="submit"]')]
                .map(el => ({
                    tag: el.tagName,
                    text: el.textContent.trim().slice(0, 60),
                    label: el.getAttribute('aria-label') || '',
                    testid: el.getAttribute('data-testid') || '',
                    type: el.getAttribute('type') || '',
                    disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
                }))
                .filter(b => b.text || b.label || b.testid);
        });
        log('Buttons on page: ' + JSON.stringify(pageButtons));

        // Inject prompt using React's native setter (from extension — the ONLY reliable method)
        log('Injecting prompt text...');
        const injected = await page.evaluate((sel, text) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            el.focus();
            // React-compatible injection
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;
            if (nativeSetter) {
                nativeSetter.call(el, text);
            } else {
                el.value = text;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value.includes(text.substring(0, 20));
        }, TEXTAREA_SEL, prompt);

        if (!injected) throw new Error('Failed to inject prompt text into textarea');
        log('Prompt injected.');
        await new Promise(r => setTimeout(r, 400));

        // Snapshot existing tile hrefs BEFORE submitting
        const preExistingHrefs = await page.evaluate(() => {
            return [...document.querySelectorAll('a[aria-label="View media"]')]
                .map(a => a.getAttribute('href'))
                .filter(Boolean);
        });
        log(`Pre-submit tile count: ${preExistingHrefs.length}`);

        // Submit: first try clicking a visible generate/send button; fall back to Enter on textarea.
        // Pressing Enter on the raw textarea triggers the chat pipeline, not the video pipeline.
        log('Looking for generate/send button...');
        const btnClicked = await page.evaluate((sel) => {
            // Ranked selector list — first match wins
            const buttonSelectors = [
                'button[data-testid="send-message-button"]',
                'button[data-testid="generate-button"]',
                'button[aria-label="Generate video"]',
                'button[aria-label="Generate"]',
                'button[aria-label="Send message"]',
                'button[type="submit"]',
            ];
            for (const bSel of buttonSelectors) {
                const btn = document.querySelector(bSel);
                if (btn && !btn.disabled) { btn.click(); return bSel; }
            }
            // Last resort: any non-disabled <button> near the composer
            const composer = document.querySelector(sel);
            if (composer) {
                const form = composer.closest('form') || composer.closest('[role="form"]') || composer.parentElement;
                if (form) {
                    const btn = [...form.querySelectorAll('button')].find(b => !b.disabled);
                    if (btn) { btn.click(); return 'nearest-button'; }
                }
            }
            return null;
        }, TEXTAREA_SEL);

        if (btnClicked) {
            log(`Clicked submit button: ${btnClicked}`);
        } else {
            log('No button found — falling back to Enter keydown on textarea');
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (!el) return;
                el.focus();
                el.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                    bubbles: true, cancelable: true,
                }));
            }, TEXTAREA_SEL);
        }

        log('Submitted. Watching for navigation to prompt page...');

        // Wait for the URL to change from /create → /prompt/{id} (meta.ai navigates after submit)
        const navTimeout = 30000;
        const navStart = Date.now();
        let promptUrl = null;
        while (Date.now() - navStart < navTimeout) {
            await new Promise(r => setTimeout(r, 800));
            const cur = page.url();
            if (cur.includes('/prompt/') || cur.includes('/conversations/')) {
                promptUrl = cur;
                break;
            }
        }

        // Also baseline any video URLs already on the page before generation completes
        const preExistingVideoUrls = new Set();

        if (promptUrl) {
            log(`Page navigated to: ${promptUrl}`);
            // Re-baseline tile hrefs AND video URLs on the NEW prompt page
            await new Promise(r => setTimeout(r, 1500));
            const promptSnapshot = await page.evaluate(() => {
                const hrefs = [...document.querySelectorAll('a[aria-label="View media"]')]
                    .map(a => a.getAttribute('href'))
                    .filter(Boolean);
                const videoUrls = [
                    ...[...document.querySelectorAll('div[data-testid="generated-video"]')]
                        .map(el => el.getAttribute('data-video-url')).filter(Boolean),
                    ...[...document.querySelectorAll('video[src]')]
                        .map(v => v.src).filter(s => s && s.includes('fbcdn')),
                ];
                return { hrefs, videoUrls };
            });
            log(`Post-nav baseline: ${promptSnapshot.hrefs.length} tile hrefs, ${promptSnapshot.videoUrls.length} existing video URLs`);
            preExistingHrefs.length = 0;
            promptSnapshot.hrefs.forEach(h => preExistingHrefs.push(h));
            promptSnapshot.videoUrls.forEach(u => preExistingVideoUrls.add(u));
        } else {
            log('Page did not navigate — still on create page (will poll here)');
            // Baseline existing videos on the create page too
            const existing = await page.evaluate(() =>
                [...document.querySelectorAll('div[data-testid="generated-video"]')]
                    .map(el => el.getAttribute('data-video-url')).filter(Boolean)
            );
            existing.forEach(u => preExistingVideoUrls.add(u));
        }

        // Check for toast error right after submit
        const toastError = await page.evaluate(() => {
            const toast = document.querySelector('li[data-sonner-toast]');
            return toast ? toast.textContent.trim().slice(0, 120) : null;
        });
        if (toastError) log(`Toast detected: ${toastError}`);

        log(`Waiting for ${type} generation (~1–3 min)...`);

        // Poll using tile href identity
        const timeoutMs = type === 'video' ? 4 * 60 * 1000 : 2 * 60 * 1000;
        const started   = Date.now();
        let resultUrl   = null;

        while (Date.now() - started < timeoutMs) {
            await new Promise(r => setTimeout(r, 5000));
            const elapsed = Math.round((Date.now() - started) / 1000);

            // Find newly appeared tiles (by href identity, skipping pre-existing video URLs)
            const newTileResult = await page.evaluate((preHrefs, preVideoUrls, mediaType) => {
                const allLinks = [...document.querySelectorAll('a[aria-label="View media"]')];
                for (const link of allLinks) {
                    const href = link.getAttribute('href');
                    if (!href || preHrefs.includes(href)) continue;

                    const wrapper = link.closest('div[class*="group/media-item"]') || link.parentElement;
                    const isLoading = wrapper && !!wrapper.querySelector('div[data-testid="ecto-sand-loader"]');
                    if (isLoading) return { loading: true, href };

                    if (mediaType === 'video') {
                        const videoEl = wrapper && wrapper.querySelector('div[data-testid="generated-video"]');
                        const url = videoEl && videoEl.getAttribute('data-video-url');
                        if (url && url.startsWith('http') && !preVideoUrls.includes(url)) return { url, href };
                        const vid = wrapper && wrapper.querySelector('video[src]');
                        if (vid && vid.src && vid.src.includes('fbcdn') && !preVideoUrls.includes(vid.src)) return { url: vid.src, href };
                    } else {
                        const img = wrapper && wrapper.querySelector('img[data-testid="generated-image"]');
                        if (img && img.src && img.src.startsWith('http')) return { url: img.src, href };
                    }
                }

                // Fallback: scan the whole page for a NEW generated video element
                if (mediaType === 'video') {
                    const vEls = [...document.querySelectorAll('div[data-testid="generated-video"]')];
                    for (const el of vEls) {
                        const u = el.getAttribute('data-video-url');
                        if (u && u.startsWith('http') && !preVideoUrls.includes(u)) return { url: u, href: 'prompt-page-video' };
                    }
                    const rawVids = [...document.querySelectorAll('video[src]')];
                    for (const v of rawVids) {
                        if (v.src && v.src.includes('fbcdn') && !preVideoUrls.includes(v.src)) return { url: v.src, href: 'prompt-page-raw' };
                    }
                }
                return null;
            }, preExistingHrefs, [...preExistingVideoUrls], type);

            if (newTileResult) {
                if (newTileResult.loading) {
                    log(`New tile still generating... (${elapsed}s elapsed)`);
                } else if (newTileResult.url) {
                    resultUrl = newTileResult.url;
                    log(`${type} ready: ${resultUrl.slice(0, 80)}...`);
                    break;
                }
            } else {
                log(`Waiting for ${type} tile... (${elapsed}s elapsed)`);
            }
        }

        if (!resultUrl) throw new Error(`Timeout: no ${type} appeared after ${Math.round(timeoutMs / 60000)} minutes`);

        // Download
        const ext  = type === 'video' ? '.mp4' : '.jpg';
        const name = `meta_${type}_${Date.now()}${ext}`;
        const dest = path.join(OUTPUTS_DIR, name);
        log(`Downloading ${type}...`);
        await downloadUrl(resultUrl, dest);
        const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
        log(`Done! Saved as ${name} (${sizeMb} MB)`);
        return dest;

    } finally {
        await browser.close().catch(() => {});
        log('Browser closed.');
    }
}

module.exports = { generate, OUTPUTS_DIR };
