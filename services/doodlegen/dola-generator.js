/**
 * Dola.com video/image generator via Playwright browser automation.
 *
 * Mirrors the logic from Ryiys Unlimited Creator Studio (reverse-engineered):
 *  1. Reads cookies.json and injects them into a private Chromium context
 *  2. Navigates to https://dola.com/chat/
 *  3. Clicks the appropriate skill button, types the prompt, submits
 *  4. Polls the chat DOM for a result URL (video: ~2–4 min, image: ~1–2 min)
 *  5. Downloads the file (handles both http and blob: URLs)
 *  6. Returns the local file path
 *
 * Requires: puppeteer-core + a Chromium installation (or system Chrome).
 * The caller is responsible for passing a status callback for live log streaming.
 */

const puppeteer = require('puppeteer-core');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const https     = require('https');
const http      = require('http');

const CHROME_PATH   = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOLA_CHAT_URL = 'https://dola.com/chat/';
const OUTPUTS_DIR   = path.join(__dirname, 'outputs');

// Skill button selectors — data-skill-id first (most stable), text fallback
// Puppeteer does NOT support :visible or :has-text() — use plain CSS only
const VIDEO_SKILL_SELS = [
    'button[data-skill-id="skill_bar_button_17"]',
    '[data-skill-id="skill_bar_button_17"]',
];
const IMAGE_SKILL_SELS = [
    'button[data-skill-id="skill_bar_button_3"]',
    '[data-skill-id="skill_bar_button_3"]',
];

// Prompt field selectors — no :visible, no :has-text
const PROMPT_FIELD_SELS = [
    'div[contenteditable="true"]',
    '[data-slate-editor="true"]',
    '[role="textbox"]',
    'textarea[placeholder="Message..."]',
    'textarea',
];

const ASPECT_LABELS = { '16:9': '16:9', '9:16': '9:16' };

if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ─── Cookie loading ───────────────────────────────────────────────────────────

function loadCookies(cookiesPath) {
    const raw = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    // Support both flat array and { cookies, origins } storage-state format
    const list = Array.isArray(raw) ? raw : (raw.cookies || []);
    return list.map(c => ({
        name:     c.name,
        value:    c.value,
        domain:   c.domain?.replace(/^\./, '') || 'dola.com',
        path:     c.path || '/',
        secure:   c.secure ?? false,
        httpOnly: c.httpOnly ?? c.http_only ?? false,
        sameSite: normalizeSameSite(c.sameSite),
        expires:  c.expirationDate ? Math.floor(c.expirationDate) : undefined,
    }));
}

function normalizeSameSite(v) {
    if (!v) return 'Lax';
    const m = { 'strict':'Strict','lax':'Lax','none':'None','no_restriction':'None','unspecified':'Lax' };
    return m[String(v).toLowerCase()] || 'Lax';
}

// ─── File download helpers ────────────────────────────────────────────────────

function downloadUrl(url, dest) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file  = fs.createWriteStream(dest);
        proto.get(url, res => {
            if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', err => { file.close(); reject(err); });
    });
}

async function downloadBlob(page, blobUrl, dest) {
    const b64 = await page.evaluate(async (url) => {
        const res   = await fetch(url);
        const blob  = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
        });
    }, blobUrl);
    // b64 is "data:<mime>;base64,<data>"
    const base64 = b64.split(',')[1];
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}   opts.type         'video' | 'image'
 * @param {string}   opts.prompt
 * @param {string}   opts.cookiesPath  path to cookies.json
 * @param {string}   [opts.aspect]     '16:9' | '9:16'
 * @param {boolean}  [opts.headless]   default true
 * @param {function} [opts.log]        (msg: string) => void  — live status updates
 * @returns {Promise<string>}  absolute path to saved file
 */
async function generate({ type = 'video', prompt, cookiesPath, aspect = '16:9', headless = true, log = () => {} }) {
    if (!prompt)      throw new Error('prompt is required');
    if (!cookiesPath) throw new Error('cookiesPath is required');
    if (!fs.existsSync(cookiesPath)) throw new Error(`Cookie file not found: ${cookiesPath}`);

    log('Launching Chromium browser context...');
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: headless ? 'new' : false,
        defaultViewport: { width: 1280, height: 800 },
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-gpu',
        ],
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    try {
        // Inject session cookies
        log(`Injecting session cookies from ${path.basename(cookiesPath)}...`);
        const cookies = loadCookies(cookiesPath);
        await page.setCookie(...cookies);

        // Navigate to Dola chat
        log('Navigating to dola.com chat page...');
        await page.goto(DOLA_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('body', { timeout: 20000 });
        await new Promise(r => setTimeout(r, 3000));

        // Dismiss cookie/consent banners (best-effort)
        try {
            const banner = await page.$('[class*="cookie"], [class*="consent"]');
            if (banner) { await banner.click(); log('Dismissed cookie consent banner.'); }
        } catch (_) {}

        // Click the skill button
        const skillName = type === 'video' ? 'Create Video' : 'Create Image';
        log(`Locating '${skillName}' skill button...`);

        // Helper: find any clickable element by text content (buttons, menu items, divs)
        const findBtnByText = async (text) => {
            const handle = await page.evaluateHandle((t) => {
                const sel = 'button, [role="button"], [role="menuitem"], [role="option"], li, a';
                const all = [...document.querySelectorAll(sel)];
                return all.find(el => {
                    const txt = el.textContent.trim().toLowerCase();
                    return txt === t.toLowerCase() || txt.startsWith(t.toLowerCase());
                }) || null;
            }, text);
            const el = handle.asElement();
            if (!el) return null;
            const box = await el.boundingBox();
            return box && box.width > 0 ? el : null;
        };

        // Helper: find by text anywhere in the DOM (for deeply nested labels like the More menu)
        const findAnyByText = async (text) => {
            const handle = await page.evaluateHandle((t) => {
                // Walk all elements, find the smallest one whose trimmed textContent matches
                const all = [...document.querySelectorAll('*')];
                let best = null;
                for (const el of all) {
                    const txt = el.textContent.trim();
                    if (txt === t && el.children.length <= 2) {
                        // Prefer the outermost clickable ancestor
                        let node = el;
                        while (node.parentElement) {
                            const p = node.parentElement;
                            const tag = p.tagName.toLowerCase();
                            const role = p.getAttribute('role') || '';
                            if (tag === 'button' || role === 'button' || role === 'menuitem' || role === 'option') {
                                node = p;
                            } else {
                                break;
                            }
                        }
                        best = node;
                        break;
                    }
                }
                return best;
            }, text);
            const el = handle.asElement();
            if (!el) return null;
            const box = await el.boundingBox();
            return box && box.width > 0 ? el : null;
        };

        // Step 1: try direct data-skill-id selectors first
        const skillSels = type === 'video' ? VIDEO_SKILL_SELS : IMAGE_SKILL_SELS;
        let skillBtn = null;
        for (const sel of skillSels) {
            try { skillBtn = await page.waitForSelector(sel, { timeout: 3000 }); if (skillBtn) break; }
            catch (_) {}
        }

        // Step 2: try text scan without expanding
        if (!skillBtn) skillBtn = await findBtnByText(skillName);

        // Step 3: skill is hidden behind "More" — click it then search again
        if (!skillBtn) {
            log(`'${skillName}' not visible, clicking 'More' to expand skill list...`);
            const moreBtn = await findBtnByText('More');
            if (moreBtn) {
                await moreBtn.click();
                await new Promise(r => setTimeout(r, 1500));
                // Try data-skill-id selectors again
                for (const sel of skillSels) {
                    try { skillBtn = await page.waitForSelector(sel, { timeout: 3000 }); if (skillBtn) break; }
                    catch (_) {}
                }
                // Try button/role text scan
                if (!skillBtn) skillBtn = await findBtnByText(skillName);
                // Try deep DOM scan — handles nested divs like <div class="truncate"><div>Create Video</div></div>
                if (!skillBtn) skillBtn = await findAnyByText(skillName);
            }
        }

        if (!skillBtn) throw new Error(`Could not locate '${skillName}' skill button. Is dola.com loaded and logged in?`);
        log(`Skill button found. Clicking '${skillName}'...`);
        await skillBtn.click();
        await new Promise(r => setTimeout(r, 3000));

        // Find and fill prompt field
        log('Locating prompt entry field...');
        let promptField = null;
        for (const sel of PROMPT_FIELD_SELS) {
            try {
                const el = await page.waitForSelector(sel, { timeout: 4000 });
                if (!el) continue;
                // Puppeteer visibility check: element must have non-zero dimensions
                const box = await el.boundingBox();
                if (box && box.width > 0 && box.height > 0) { promptField = el; break; }
            } catch (_) {}
        }
        if (!promptField) {
            // Final fallback: grab first visible contenteditable or textarea via evaluate
            promptField = await page.evaluateHandle(() => {
                const candidates = [
                    ...document.querySelectorAll('div[contenteditable="true"], textarea, [role="textbox"]')
                ];
                return candidates.find(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                }) || null;
            });
            if (!promptField || !(await promptField.asElement())) promptField = null;
        }
        if (!promptField) throw new Error('No visible prompt field found on the page.');
        log('Prompt field focused. Entering prompt...');
        await promptField.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(prompt, { delay: 25 });
        log('Prompt text typed.');

        // Set aspect ratio for video if not default
        if (type === 'video' && aspect !== '16:9') {
            try {
                const aspectLabel = ASPECT_LABELS[aspect] || aspect;
                log(`Setting aspect ratio to ${aspectLabel}...`);
                for (const sel of [
                    `[role='menuitem']:has-text('${aspectLabel}')`,
                    `[role='menuitemradio']:has-text('${aspectLabel}')`,
                    `button:has-text('${aspectLabel}')`,
                    `text=${aspectLabel}`,
                ]) {
                    try {
                        const el = await page.$(sel);
                        if (el) { await el.click(); log(`Aspect ratio set to ${aspectLabel}.`); break; }
                    } catch (_) {}
                }
            } catch (_) { log('Aspect ratio option not found, using default.'); }
        }

        // Submit
        log('Locating and clicking submit button...');
        let submitted = false;
        for (const sel of [
            'button[type="submit"]',
            'button[aria-label*="send"]',
            'button[aria-label*="Send"]',
            '[data-testid*="send"]',
        ]) {
            try {
                const btn = await page.$(sel);
                if (btn) {
                    const box = await btn.boundingBox();
                    if (box && box.width > 0) { await btn.click(); submitted = true; log('Submit button clicked.'); break; }
                }
            } catch (_) {}
        }
        if (!submitted) {
            log('Submit button not found. Using keyboard Enter fallback...');
            await page.keyboard.press('Enter');
        }

        // Poll DOM for result
        const timeoutMs = type === 'video' ? 5 * 60 * 1000 : 2.5 * 60 * 1000;
        const pollMs    = 5000;
        const started   = Date.now();
        log(`Prompt submitted. Polling chat DOM for ${type} creation (est. ${type === 'video' ? '2–4' : '1–2'} min)...`);

        let resultUrl = null;
        while (Date.now() - started < timeoutMs) {
            await new Promise(r => setTimeout(r, pollMs));
            const elapsed = Math.round((Date.now() - started) / 1000);

            resultUrl = await page.evaluate((mediaType) => {
                const selector = mediaType === 'video' ? 'video[src]' : 'img[src]';
                const elements = [...document.querySelectorAll(selector)];
                for (const el of elements) {
                    const src = el.src || el.getAttribute('src');
                    if (!src) continue;
                    if (mediaType === 'video' && (src.startsWith('http') || src.startsWith('blob:'))) return src;
                    if (mediaType === 'image' && (src.startsWith('http') || src.startsWith('blob:')) && !src.includes('avatar') && !src.includes('logo')) return src;
                }
                // Fallback: anchor tags with download
                const links = [...document.querySelectorAll('a[href][download], a[href*=".mp4"], a[href*=".jpg"], a[href*=".png"]')];
                for (const a of links) {
                    const href = a.href;
                    if (href && href.startsWith('http')) return href;
                }
                return null;
            }, type);

            if (resultUrl) {
                log(`Detected new ${type} link: ${resultUrl.slice(0, 80)}...`);
                break;
            }
            log(`Still waiting for ${type}... (${elapsed}s elapsed)`);
        }

        if (!resultUrl) throw new Error(`Timeout reached. The ${type} was not detected in the chat DOM after ${Math.round(timeoutMs / 60000)} minutes.`);

        // Download the file
        const ext  = type === 'video' ? '.mp4' : '.jpg';
        const name = `${type}_${Date.now()}${ext}`;
        const dest = path.join(OUTPUTS_DIR, name);

        log(`Downloading ${type} file...`);
        if (resultUrl.startsWith('blob:')) {
            log('Evaluating secure in-browser download stream...');
            await downloadBlob(page, resultUrl, dest);
        } else {
            await downloadUrl(resultUrl, dest);
        }

        const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
        log(`Successfully downloaded ${type} (${sizeMb} MB). Saved as: ${name}`);

        return dest;
    } finally {
        await browser.close().catch(() => {});
        log('Browser context closed.');
    }
}

module.exports = { generate, OUTPUTS_DIR };
