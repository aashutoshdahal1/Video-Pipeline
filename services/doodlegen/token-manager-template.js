/**
 * Generic Auto Token Harvester
 * Works for any website that uses short-lived bearer tokens.
 *
 * USAGE:
 *   1. Fill in the CONFIG block below for your target site
 *   2. npm install puppeteer-core
 *   3. node token-manager-template.js   ← test it standalone
 *      OR require it in your server:    const tm = require('./token-manager-template')
 */

const puppeteer = require('puppeteer-core');
const fs        = require('fs');
const path      = require('path');
const EventEmitter = require('events');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — only this block changes between projects
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
    // Full path to Chrome on this machine
    chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    // Linux:   '/usr/bin/google-chrome'

    // Where to save the Chrome profile (login state, cookies, localStorage)
    profileDir: path.join(__dirname, '.chrome-session'),

    // Where to save a small file that marks "user has logged in at least once"
    cookiesFile: path.join(__dirname, '.session-cookies.json'),

    // The page to open after login that will make an API call
    targetUrl: 'https://labs.google/fx/vi/tools/flow',

    // The login page to open on first run (leave as '' to skip — user navigates manually)
    loginUrl: 'https://accounts.google.com/signin',

    // How to detect that the user has finished logging in.
    // Return true from this function when login is complete.
    // Runs in the browser context (no Node.js APIs available inside).
    loginSuccessCheck: () => {
        const h = window.location.hostname;
        return h === 'myaccount.google.com' ||
               document.title.toLowerCase().includes('my account') ||
               !!document.querySelector('[data-ogsr-up]');
    },

    // The API domain whose requests carry the token we want to capture.
    // Used as a URL pattern filter — wildcards (*) are supported.
    interceptPattern: '*aisandbox-pa.googleapis.com*',

    // How to extract the token from the Authorization header.
    // Return the raw token string, or null if this request isn't the one we want.
    extractToken: (authHeader) => {
        if (!authHeader) return null;
        const token = authHeader.replace(/^Bearer /i, '').trim();
        return token.startsWith('ya29.') ? token : null;
    },

    // After the target page loads, run this to trigger an API call.
    // Runs in the browser context. Return true if the trigger worked.
    // Set to null if the page's own activity is enough (no click needed).
    triggerAction: async (page) => {
        // Fill a text input and click a button — adjust selectors for your site
        await page.evaluate(() => {
            const inputs = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')];
            const input = inputs.find(el => el.offsetParent !== null);
            if (input) {
                input.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, 'test prompt');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 1000));
        return page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const btn = btns.find(b =>
                !b.disabled &&
                b.offsetParent !== null &&
                /generate|create|run|submit/i.test(b.textContent + (b.getAttribute('aria-label') || ''))
            );
            if (btn) { btn.click(); return true; }
            return false;
        });
    },

    // How long (ms) before the token expires and needs refreshing.
    // Set to slightly less than the actual TTL.
    refreshIntervalMs: 50 * 60 * 1000,  // 50 minutes

    // How long to wait for an API call to fire after triggerAction (ms)
    captureTimeoutMs: 30 * 1000,        // 30 seconds

    // How long to wait for the user to log in manually (ms)
    loginTimeoutMs: 5 * 60 * 1000,      // 5 minutes
};
// ─────────────────────────────────────────────────────────────────────────────
// END CONFIG — do not edit below this line unless you know what you're doing
// ─────────────────────────────────────────────────────────────────────────────

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
        try { fs.unlinkSync(path.join(CONFIG.profileDir, f)); } catch (_) {}
    });
}

async function launchBrowser(headless) {
    clearLock();
    const browser = await puppeteer.launch({
        executablePath: CONFIG.chromePath,
        headless: headless ? 'new' : false,
        defaultViewport: null,
        userDataDir: CONFIG.profileDir,
        args: [...BASE_ARGS, ...(headless ? ['--no-sandbox', '--disable-gpu'] : [])],
        ignoreDefaultArgs: IGNORE_ARGS,
    });
    const pages = await browser.pages();
    const page  = pages[0] || await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    return { browser, page };
}

async function attachInterceptor(page) {
    let captured = null;

    // CDP Fetch — catches fetch() + XHR + everything
    const cdp = await page.createCDPSession();
    await cdp.send('Fetch.enable', {
        patterns: [{ urlPattern: CONFIG.interceptPattern, requestStage: 'Request' }]
    });
    cdp.on('Fetch.requestPaused', async ev => {
        const auth  = ev.request.headers['Authorization'] || ev.request.headers['authorization'] || '';
        const token = CONFIG.extractToken(auth);
        if (!captured && token) {
            captured = token;
            console.log(`[TokenManager] Token captured (…${token.slice(-6)})`);
        }
        await cdp.send('Fetch.continueRequest', { requestId: ev.requestId }).catch(() => {});
    });

    // Fallback: classic request interception
    await page.setRequestInterception(true);
    page.on('request', req => {
        const auth  = req.headers()['authorization'] || '';
        const token = CONFIG.extractToken(auth);
        if (!captured && token) captured = token;
        req.continue().catch(() => {});
    });

    return { getToken: () => captured };
}

// ─── TokenManager ─────────────────────────────────────────────────────────────

class TokenManager extends EventEmitter {
    constructor() {
        super();
        this.token     = null;
        this.tokenAge  = 0;
        this.status    = 'idle';
        this.statusMsg = '';
        this._busy     = false;
        this._timer    = null;
    }

    getToken()  { return this.token; }
    getStatus() { return { status: this.status, msg: this.statusMsg, tokenAge: this.tokenAge }; }

    async start() {
        if (fs.existsSync(CONFIG.cookiesFile)) {
            await this._refresh();
        } else {
            await this._login();
        }
        this._timer = setInterval(() => this._refresh(), CONFIG.refreshIntervalMs);
    }

    async _login() {
        if (this._busy) return;
        this._busy = true;
        this._set('login_needed', 'Opening Chrome for login...');
        console.log('\n[TokenManager] Chrome opening — log in. Window closes automatically.\n');

        let browser;
        try {
            const { browser: b, page } = await launchBrowser(false);
            browser = b;

            if (CONFIG.loginUrl) {
                await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
            this._set('logging_in', 'Waiting for login...');
            await page.waitForFunction(CONFIG.loginSuccessCheck, {
                timeout: CONFIG.loginTimeoutMs, polling: 2000
            }).catch(() => {});

            const interceptor = await attachInterceptor(page);
            this._set('logging_in', 'Loading target page...');
            await page.goto(CONFIG.targetUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));

            if (!interceptor.getToken() && CONFIG.triggerAction) {
                await CONFIG.triggerAction(page).catch(() => {});
                await new Promise(r => setTimeout(r, CONFIG.captureTimeoutMs));
            }

            // Save cookies as "logged in" marker
            const cdp = await page.createCDPSession();
            const { cookies } = await cdp.send('Network.getAllCookies');
            fs.writeFileSync(CONFIG.cookiesFile, JSON.stringify(cookies, null, 2));

            await browser.close();
            this._busy = false;

            const token = interceptor.getToken();
            if (token) {
                this._saveToken(token);
            } else {
                await this._refresh();
            }
        } catch (e) {
            console.error('[TokenManager] Login error:', e.message);
            this._set('error', 'Login failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async _refresh() {
        if (this._busy) return;
        this._busy = true;
        this._set('refreshing', 'Auto-refreshing token...');
        console.log('[TokenManager] Headless refresh...');

        let browser;
        try {
            const { browser: b, page } = await launchBrowser(true);
            browser = b;

            const interceptor = await attachInterceptor(page);
            await page.goto(CONFIG.targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 4000));

            if (!interceptor.getToken() && CONFIG.triggerAction) {
                await CONFIG.triggerAction(page).catch(() => {});
                await new Promise(r => setTimeout(r, CONFIG.captureTimeoutMs));
            }

            await browser.close();
            this._busy = false;

            const token = interceptor.getToken();
            if (token) {
                this._saveToken(token);
            } else {
                console.warn('[TokenManager] Session expired — re-login needed');
                this._set('login_needed', 'Session expired — please log in again');
                if (fs.existsSync(CONFIG.cookiesFile)) fs.unlinkSync(CONFIG.cookiesFile);
                try { fs.rmSync(CONFIG.profileDir, { recursive: true, force: true }); } catch (_) {}
                await this._login();
            }
        } catch (e) {
            console.error('[TokenManager] Refresh error:', e.message);
            this._set('error', 'Refresh failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async forceLogin() {
        this._busy = false;
        this.token = null;
        if (fs.existsSync(CONFIG.cookiesFile)) fs.unlinkSync(CONFIG.cookiesFile);
        try { fs.rmSync(CONFIG.profileDir, { recursive: true, force: true }); } catch (_) {}
        await this._login();
    }

    _saveToken(token) {
        this.token    = token;
        this.tokenAge = Date.now();
        this._set('ready', `Token ready at ${new Date().toLocaleTimeString()}`);
        console.log('[TokenManager] ✓ Token ready');
        this.emit('token', token);
    }

    _set(status, msg) {
        this.status    = status;
        this.statusMsg = msg;
        this.emit('status', { status, msg });
    }
}

const tokenManager = new TokenManager();
module.exports = tokenManager;

// ─── Standalone test ──────────────────────────────────────────────────────────
// Run:  node token-manager-template.js
if (require.main === module) {
    tokenManager.on('status', ({ status, msg }) => console.log(`[${status}] ${msg}`));
    tokenManager.on('token',  (t) => console.log(`Token: …${t.slice(-10)}`));
    tokenManager.start().catch(console.error);
}
