/**
 * Token Manager — labs.google session-based auth
 *
 * How it works (matches VEO3 AI Studio exactly):
 *   1. First run: opens Chrome for Google login, navigates to labs.google,
 *      saves the session cookies to disk.
 *   2. Every refresh: calls GET https://labs.google/fx/api/auth/session with
 *      saved cookies — response contains {accessToken, projectId} directly.
 *      No page load, no DOM interaction, no network interception needed.
 *   3. If session cookies are expired: launches headless Chrome to re-establish
 *      the labs.google session, re-saves cookies, then calls session API again.
 */

const puppeteer    = require('puppeteer-core');
const fetch        = require('node-fetch');
const fs           = require('fs');
const path         = require('path');
const EventEmitter = require('events');

const CHROME_PATH  = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR  = path.join(__dirname, '.chrome-session');
const COOKIES_FILE = path.join(__dirname, '.google-cookies.json');
const FLOW_URL     = 'https://labs.google/fx/vi/tools/flow';
const SESSION_URL  = 'https://labs.google/fx/api/auth/session';
const REFRESH_MS   = 45 * 60 * 1000;  // 45 min (token lasts ~50 min)
const UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--window-size=1280,800',
];
const IGNORE_ARGS = ['--enable-automation', '--enable-blink-features=IdleDetection'];

function clearLock() {
    ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].forEach(f => {
        try { fs.unlinkSync(path.join(PROFILE_DIR, f)); } catch (_) {}
    });
}

// Call labs.google session API with saved cookies — returns {token, projectId} or null
async function fetchSessionDirect() {
    if (!fs.existsSync(COOKIES_FILE)) return null;
    let cookies;
    try { cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8')); }
    catch { return null; }
    if (!cookies?.length) return null;

    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    try {
        const response = await fetch(SESSION_URL, {
            headers: {
                'Cookie':     cookieStr,
                'User-Agent': UA,
                'Accept':     'application/json',
                'Referer':    FLOW_URL,
            },
        });
        if (!response.ok) {
            console.log(`[TokenManager] Session API returned ${response.status}`);
            return null;
        }
        const data = await response.json();
        const token     = data.accessToken || data.access_token || data.token;
        const projectId = data.projectId   || data.project_id;
        if (!token || !token.startsWith('ya29')) {
            console.log('[TokenManager] Session API: no valid token in response', JSON.stringify(data).slice(0, 200));
            return null;
        }
        return { token, projectId };
    } catch (e) {
        console.log('[TokenManager] Session API fetch error:', e.message);
        return null;
    }
}

// Extract and save Google + labs.google cookies from a Puppeteer page
async function saveCookies(page) {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send('Network.getAllCookies');
    const keep = cookies.filter(c =>
        c.domain.includes('google') || c.domain.includes('labs')
    );
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(keep, null, 2));
    console.log(`[TokenManager] Saved ${keep.length} session cookies`);
    return keep;
}

// Fetch the video project ID via flowCreationAgent/sessions (exact URL labs.google uses)
async function fetchProjectIdDirect() {
    if (!fs.existsSync(COOKIES_FILE)) return null;
    let cookies;
    try { cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8')); }
    catch { return null; }
    if (!cookies?.length) return null;

    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Method 1: flowCreationAgent/sessions — body contains the real video projectId
    try {
        const res = await fetch('https://aisandbox-pa.googleapis.com/v1/flowCreationAgent/sessions', {
            method: 'POST',
            headers: {
                'Cookie':          cookieStr,
                'User-Agent':      UA,
                'Accept':          'application/json',
                'Content-Type':    'application/json',
                'Origin':          'https://labs.google',
                'Referer':         FLOW_URL,
                'x-browser-channel': 'stable',
            },
            body: JSON.stringify({}),
        });
        const text = await res.text();
        const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (m) { console.log('[TokenManager] Project ID from flowCreationAgent:', m[0]); return m[0]; }
    } catch (e) {
        console.log('[TokenManager] flowCreationAgent error:', e.message);
    }

    // Method 2: tRPC searchUserProjects fallback
    const input = encodeURIComponent(JSON.stringify({
        json: { pageSize: 10, toolName: 'PINHOLE', cursor: null },
        meta: { values: { cursor: ['undefined'] } }
    }));
    try {
        const res = await fetch(`https://labs.google/fx/api/trpc/project.searchUserProjects?input=${input}`, {
            headers: { 'Cookie': cookieStr, 'User-Agent': UA, 'Accept': 'application/json', 'Referer': FLOW_URL },
        });
        if (!res.ok) return null;
        const text = await res.text();
        const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (m) { console.log('[TokenManager] Project ID from tRPC direct:', m[0]); return m[0]; }
    } catch (e) {
        console.log('[TokenManager] tRPC direct error:', e.message);
    }
    return null;
}

// Extract project ID from labs.google page DOM (VEO3 exact method)
async function extractProjectIdFromPage(page) {
    try {
        const result = await page.evaluate(() => {
            // 1. __NEXT_DATA__ script tag
            const nextScript = document.getElementById('__NEXT_DATA__');
            if (nextScript) {
                try {
                    const ndStr = JSON.stringify(JSON.parse(nextScript.textContent));
                    const m = ndStr.match(/"projectId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i);
                    if (m) return m[1];
                } catch (_) {}
            }
            // 2. Any script tag
            for (const s of document.querySelectorAll('script')) {
                const text = s.textContent || '';
                if (text.length > 100000) continue;
                const m = text.match(/"projectId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i);
                if (m) return m[1];
            }
            // 3. Links containing /project/
            for (const a of document.querySelectorAll('a[href*="/project/"]')) {
                const m = a.href.match(/\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                if (m) return m[1];
            }
            return null;
        });
        if (result) console.log('[TokenManager] Project ID from page DOM:', result);
        return result;
    } catch (e) {
        console.log('[TokenManager] DOM project ID scan error:', e.message);
        return null;
    }
}

// Try tRPC to get or create the project ID (VEO3 primary method)
async function fetchProjectIdViaTRPC(page) {
    try {
        const result = await page.evaluate(async () => {
            const url = '/fx/api/trpc/project.searchUserProjects?input=' +
                encodeURIComponent(JSON.stringify({
                    json: { pageSize: 10, toolName: 'PINHOLE', cursor: null },
                    meta: { values: { cursor: ['undefined'] } }
                }));
            const res = await fetch(url, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) return null;
            const data = await res.json();
            const str = JSON.stringify(data);
            const m = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            return m ? m[0] : null;
        });
        if (result) console.log('[TokenManager] Project ID from tRPC:', result);
        return result;
    } catch (e) {
        return null;
    }
}

// ─── TokenManager class ───────────────────────────────────────────────────────

class TokenManager extends EventEmitter {
    constructor() {
        super();
        this.token      = null;
        this.tokenAge   = 0;
        this.projectId  = null;
        this.refreshTimer = null;
        this.status     = 'idle';
        this.statusMsg  = '';
        this._busy      = false;
    }

    getToken()  { return this.token; }
    getStatus() {
        return {
            status:    this.status,
            msg:       this.statusMsg,
            tokenAge:  this.tokenAge,
            projectId: this.projectId,
        };
    }

    async start() {
        if (fs.existsSync(COOKIES_FILE)) {
            await this._refreshToken();
        } else {
            await this._doLogin();
        }
        this._scheduleRefresh();
    }

    _scheduleRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this._refreshToken(), REFRESH_MS);
    }

    // ── ONE-TIME LOGIN ─────────────────────────────────────────────────────────
    async _doLogin() {
        if (this._busy) return;
        this._busy = true;
        this._setStatus('login_needed', 'Opening Chrome for Google login...');
        console.log('\n[TokenManager] Chrome is opening — sign into Google. Window closes automatically.\n');

        clearLock();
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                headless:        false,
                defaultViewport: null,
                userDataDir:     PROFILE_DIR,
                args:            BASE_ARGS,
                ignoreDefaultArgs: IGNORE_ARGS,
            });

            const page = (await browser.pages())[0] || await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            this._setStatus('logging_in', 'Waiting for Google login...');
            await page.goto('https://accounts.google.com/signin', {
                waitUntil: 'domcontentloaded', timeout: 15000,
            }).catch(() => {});

            // Wait for login to complete
            await page.waitForFunction(() => {
                const h = window.location.hostname;
                return h === 'myaccount.google.com' ||
                       document.title.toLowerCase().includes('my account') ||
                       !!document.querySelector('[data-ogsr-up]') ||
                       !!document.querySelector('a[href*="SignOutOptions"]');
            }, { timeout: 300000, polling: 2000 }).catch(() => {});

            // Navigate to labs.google to establish the labs session cookie
            this._setStatus('logging_in', 'Establishing labs.google session...');
            console.log('[TokenManager] Loading labs.google to create session cookie...');
            await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 4000));

            await saveCookies(page);
            const domProjectId = await fetchProjectIdViaTRPC(page) || await extractProjectIdFromPage(page);

            await browser.close();
            this._busy = false;

            // Call session API — response has token + projectId directly
            const session = await fetchSessionDirect();
            if (session?.token) {
                this._saveToken(session.token, session.projectId || domProjectId);
            } else {
                this._setStatus('error', 'Logged in but session API returned no token — try refreshing');
                console.warn('[TokenManager] Session API returned nothing after login. Try clicking Refresh.');
            }
        } catch (e) {
            console.error('[TokenManager] Login error:', e.message);
            this._setStatus('error', 'Login failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    // ── AUTO REFRESH ───────────────────────────────────────────────────────────
    async _refreshToken() {
        if (this._busy) return;
        this._busy = true;
        this._setStatus('refreshing', 'Refreshing token...');
        console.log('[TokenManager] Calling session API...');

        // Step 1: Direct API call — no browser needed if cookies are still valid
        const session = await fetchSessionDirect();
        if (session?.token) {
            console.log('[TokenManager] Token refreshed via session API (no browser launch)');
            // Fetch project ID directly if not already captured
            const projectId = session.projectId || this.projectId || await fetchProjectIdDirect();
            this._saveToken(session.token, projectId);
            this._busy = false;
            return;
        }

        // Step 2: Cookies are expired — headless Chrome to re-establish session
        console.log('[TokenManager] Session cookies expired, launching headless Chrome...');
        clearLock();
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                headless:        'new',
                userDataDir:     PROFILE_DIR,
                args:            [...BASE_ARGS, '--no-sandbox', '--disable-gpu'],
                ignoreDefaultArgs: IGNORE_ARGS,
            });

            const page = await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            console.log('[TokenManager] Loading labs.google to refresh session cookies...');
            await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 4000));

            await saveCookies(page);

            // Extract project ID from the live page while browser is still open
            const domProjectId = await fetchProjectIdViaTRPC(page) || await extractProjectIdFromPage(page);

            await browser.close();
            this._busy = false;

            // Try session API again with freshly saved cookies
            const session2 = await fetchSessionDirect();
            if (session2?.token) {
                console.log('[TokenManager] Token refreshed after cookie re-establish');
                this._saveToken(session2.token, session2.projectId || domProjectId);
            } else {
                console.warn('[TokenManager] Session fully expired — need re-login');
                this._setStatus('login_needed', 'Session expired — click Login');
                if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
            }
        } catch (e) {
            console.error('[TokenManager] Headless refresh error:', e.message);
            this._setStatus('error', 'Refresh failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async forceLogin() {
        this._busy = false;
        if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
        try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (_) {}
        this.token = null;
        clearLock();
        await this._doLogin();
    }

    // Called when a 401 is received — clears token and triggers background refresh.
    markExpired(token) {
        if (this.token !== token) return;
        console.log('[TokenManager] Token rejected by API (401) — triggering immediate refresh');
        this.token = null;
        this._setStatus('refreshing', 'Token expired (401) — refreshing…');
        if (!this._busy) this._refreshToken().catch(e => console.error('[TokenManager] Auto-refresh error:', e.message));
    }

    _saveToken(token, projectId) {
        this.token    = token;
        this.tokenAge = Date.now();
        if (projectId) {
            this.projectId = projectId;
            console.log(`[TokenManager] Project ID: ${projectId}`);
        }
        this._setStatus('ready', `Token ready — refreshed at ${new Date().toLocaleTimeString()}`);
        console.log('[TokenManager] ✓ Token ready (~50 min)');
        this.emit('token', token);
    }

    _setStatus(status, msg) {
        this.status    = status;
        this.statusMsg = msg;
        this.emit('status', { status, msg });
    }
}

module.exports = new TokenManager();
