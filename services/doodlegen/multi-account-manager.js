/**
 * Multi-Account Manager — one Google session per parallel worker slot.
 *
 * Each account gets its own Chrome profile dir + cookies file so sessions
 * are fully isolated. Internally reuses the same Puppeteer + session-API
 * logic as the single-account TokenManager.
 */

const puppeteer    = require('puppeteer-core');
const fetch        = require('node-fetch');
const fs           = require('fs');
const path         = require('path');
const EventEmitter = require('events');

const CHROME_PATH  = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ACCOUNTS_DIR = path.join(__dirname, '.accounts');
const FLOW_URL     = 'https://labs.google/fx/vi/tools/flow';
const SESSION_URL  = 'https://labs.google/fx/api/auth/session';
const REFRESH_MS   = 45 * 60 * 1000;
const UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE_ARGS    = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run', '--no-default-browser-check',
    '--disable-infobars', '--window-size=1280,800',
];
const IGNORE_ARGS  = ['--enable-automation', '--enable-blink-features=IdleDetection'];

// ─── per-account helpers ─────────────────────────────────────────────────────

function profileDir(id)  { return path.join(ACCOUNTS_DIR, id, 'chrome-profile'); }
function cookiesFile(id) { return path.join(ACCOUNTS_DIR, id, 'cookies.json'); }
function metaFile(id)    { return path.join(ACCOUNTS_DIR, id, 'meta.json'); }

function clearLock(id) {
    const dir = profileDir(id);
    ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].forEach(f => {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });
}

async function saveCookies(page, id) {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send('Network.getAllCookies');
    const keep = cookies.filter(c => c.domain.includes('google') || c.domain.includes('labs'));
    fs.mkdirSync(path.dirname(cookiesFile(id)), { recursive: true });
    fs.writeFileSync(cookiesFile(id), JSON.stringify(keep, null, 2));
    return keep;
}

async function fetchSession(id) {
    const cFile = cookiesFile(id);
    if (!fs.existsSync(cFile)) return null;
    let cookies;
    try { cookies = JSON.parse(fs.readFileSync(cFile, 'utf8')); } catch { return null; }
    if (!cookies?.length) return null;
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    try {
        const res = await fetch(SESSION_URL, {
            headers: { Cookie: cookieStr, 'User-Agent': UA, Accept: 'application/json', Referer: FLOW_URL },
        });
        if (!res.ok) {
            console.log(`[Account:${id}] Session API ${res.status}:`, await res.text().catch(() => ''));
            return null;
        }
        const data = await res.json();
        const token     = data.accessToken || data.access_token || data.token;
        const projectId = data.projectId   || data.project_id;
        if (!token?.startsWith('ya29')) {
            console.log(`[Account:${id}] Session API no token:`, JSON.stringify(data).slice(0, 300));
            return null;
        }
        return { token, projectId };
    } catch (e) {
        console.log(`[Account:${id}] fetchSession error:`, e.message);
        return null;
    }
}

// Poll the session API until a token arrives (handles labs.google onboarding delay on fresh profiles)
async function fetchSessionWithRetry(id, maxWaitMs = 30000) {
    const interval = 3000;
    const attempts = Math.ceil(maxWaitMs / interval);
    for (let i = 0; i < attempts; i++) {
        const session = await fetchSession(id);
        if (session?.token) return session;
        if (i < attempts - 1) await new Promise(r => setTimeout(r, interval));
    }
    return null;
}

// Pull email/name from the Google userinfo endpoint using the bearer token
async function fetchUserInfo(token) {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
        });
        if (!res.ok) return null;
        const d = await res.json();
        return { email: d.email, name: d.name, picture: d.picture };
    } catch { return null; }
}

// ─── Account class ────────────────────────────────────────────────────────────

class Account extends EventEmitter {
    constructor(id) {
        super();
        this.id         = id;
        this.token      = null;
        this.tokenAge   = 0;
        this.projectId  = null;
        this.status     = 'idle';   // idle | logging_in | ready | refreshing | error | login_needed
        this.statusMsg  = '';
        this.userInfo   = null;     // { email, name, picture }
        this._busy      = false;
        this._timer     = null;

        // Restore persisted meta
        const mf = metaFile(id);
        if (fs.existsSync(mf)) {
            try { Object.assign(this, JSON.parse(fs.readFileSync(mf, 'utf8'))); } catch (_) {}
        }
    }

    toJSON() {
        return {
            id:        this.id,
            status:    this.status,
            statusMsg: this.statusMsg,
            userInfo:  this.userInfo,
            tokenAge:  this.tokenAge,
            projectId: this.projectId,
            hasToken:  !!this.token,
        };
    }

    _saveMeta() {
        const mf = metaFile(this.id);
        fs.mkdirSync(path.dirname(mf), { recursive: true });
        fs.writeFileSync(mf, JSON.stringify({
            status:    this.status,
            statusMsg: this.statusMsg,
            userInfo:  this.userInfo,
            tokenAge:  this.tokenAge,
            projectId: this.projectId,
        }));
    }

    _setStatus(status, msg) {
        this.status    = status;
        this.statusMsg = msg;
        this._saveMeta();
        this.emit('change', this.toJSON());
    }

    _saveToken(token, projectId) {
        this.token    = token;
        this.tokenAge = Date.now();
        if (projectId) this.projectId = projectId;
        this._setStatus('ready', `Ready — refreshed at ${new Date().toLocaleTimeString()}`);
        this.emit('token', token);
        // Fetch user info in background (non-blocking)
        fetchUserInfo(token).then(info => {
            if (info) {
                this.userInfo = info;
                this._saveMeta();
                this.emit('change', this.toJSON());
            }
        });
    }

    async start() {
        if (fs.existsSync(cookiesFile(this.id))) {
            await this._refresh();
        } else {
            await this._login();
        }
        this._scheduleRefresh();
    }

    _scheduleRefresh() {
        if (this._timer) clearInterval(this._timer);
        this._timer = setInterval(() => this._refresh(), REFRESH_MS);
    }

    async _login() {
        if (this._busy) return;
        this._busy = true;
        this._setStatus('logging_in', 'Opening Chrome — sign into Google…');
        console.log(`[Account:${this.id}] Chrome is opening — sign into Google.`);

        clearLock(this.id);
        fs.mkdirSync(profileDir(this.id), { recursive: true });
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                headless:        false,
                defaultViewport: null,
                userDataDir:     profileDir(this.id),
                args:            BASE_ARGS,
                ignoreDefaultArgs: IGNORE_ARGS,
            });

            const page = (await browser.pages())[0] || await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            this._setStatus('logging_in', 'Waiting for Google login…');
            await page.goto('https://accounts.google.com/signin', {
                waitUntil: 'domcontentloaded', timeout: 15000,
            }).catch(() => {});

            // Wait for login completion (up to 5 min)
            await page.waitForFunction(() => {
                const h = window.location.hostname;
                return h === 'myaccount.google.com' ||
                       document.title.toLowerCase().includes('my account') ||
                       !!document.querySelector('[data-ogsr-up]') ||
                       !!document.querySelector('a[href*="SignOutOptions"]');
            }, { timeout: 300000, polling: 2000 }).catch(() => {});

            this._setStatus('logging_in', 'Establishing labs.google session…');
            // Navigate to the flow page; on a fresh profile labs.google may show
            // consent/onboarding screens before issuing a session token.
            await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});

            // Dismiss common onboarding / "Accept" dialogs automatically
            for (let attempt = 0; attempt < 3; attempt++) {
                await new Promise(r => setTimeout(r, 3000));
                const clicked = await page.evaluate(() => {
                    const btnTexts = ['Accept', 'Continue', 'Got it', 'I agree', 'Agree', 'Allow'];
                    for (const el of document.querySelectorAll('button, [role="button"]')) {
                        if (btnTexts.some(t => el.textContent.trim().startsWith(t))) {
                            el.click(); return true;
                        }
                    }
                    return false;
                }).catch(() => false);
                if (clicked) {
                    console.log(`[Account:${this.id}] Dismissed onboarding dialog (attempt ${attempt + 1})`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            await saveCookies(page, this.id);

            // Poll for token while browser is still open (handles slow session init)
            this._setStatus('logging_in', 'Waiting for session token…');
            let session = await fetchSessionWithRetry(this.id, 30000);

            // If still no token, reload the flow page and try once more
            if (!session?.token) {
                console.log(`[Account:${this.id}] No token yet — reloading flow page…`);
                await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                await new Promise(r => setTimeout(r, 5000));
                await saveCookies(page, this.id);
                session = await fetchSessionWithRetry(this.id, 20000);
            }

            await browser.close();
            this._busy = false;

            if (session?.token) {
                this._saveToken(session.token, session.projectId);
            } else {
                this._setStatus('error', 'Logged in but could not get a session token — try Re-auth');
            }
        } catch (e) {
            console.error(`[Account:${this.id}] Login error:`, e.message);
            this._setStatus('error', 'Login failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async _refresh() {
        if (this._busy) return;
        this._busy = true;
        this._setStatus('refreshing', 'Refreshing token…');

        const session = await fetchSession(this.id);
        if (session?.token) {
            this._saveToken(session.token, session.projectId || this.projectId);
            this._busy = false;
            return;
        }

        // Cookies expired — headless re-establish
        console.log(`[Account:${this.id}] Cookies expired, launching headless Chrome…`);
        clearLock(this.id);
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                headless:        'new',
                userDataDir:     profileDir(this.id),
                args:            [...BASE_ARGS, '--no-sandbox', '--disable-gpu'],
                ignoreDefaultArgs: IGNORE_ARGS,
            });
            const page = await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
            await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 5000));
            await saveCookies(page, this.id);
            await browser.close();
            this._busy = false;

            const session2 = await fetchSessionWithRetry(this.id, 20000);
            if (session2?.token) {
                this._saveToken(session2.token, session2.projectId || this.projectId);
            } else {
                this._setStatus('login_needed', 'Session expired — click Sign in again');
                fs.rmSync(path.join(ACCOUNTS_DIR, this.id), { recursive: true, force: true });
            }
        } catch (e) {
            console.error(`[Account:${this.id}] Refresh error:`, e.message);
            this._setStatus('error', 'Refresh failed: ' + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async forceLogin() {
        if (this._timer) clearInterval(this._timer);
        this._busy = false;
        this.token = null;
        try { fs.rmSync(path.join(ACCOUNTS_DIR, this.id), { recursive: true, force: true }); } catch (_) {}
        await this._login();
        this._scheduleRefresh();
    }

    // Called when a 401 is received — clears token and triggers background refresh.
    markExpired(token) {
        if (this.token !== token) return;
        console.log(`[Account:${this.id}] Token rejected by API (401) — triggering immediate refresh`);
        this.token = null;
        this._setStatus('refreshing', 'Token expired (401) — refreshing…');
        if (!this._busy) this._refresh().catch(e => console.error(`[Account:${this.id}] Auto-refresh error:`, e.message));
    }

    destroy() {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
    }
}

// ─── MultiAccountManager ─────────────────────────────────────────────────────

class MultiAccountManager extends EventEmitter {
    constructor() {
        super();
        this.accounts = new Map(); // id → Account
        this._loadPersisted();
    }

    _loadPersisted() {
        if (!fs.existsSync(ACCOUNTS_DIR)) return;
        const ids = fs.readdirSync(ACCOUNTS_DIR).filter(f => {
            try { return fs.statSync(path.join(ACCOUNTS_DIR, f)).isDirectory(); } catch { return false; }
        });
        for (const id of ids) {
            const acct = new Account(id);
            this._wire(acct);
            this.accounts.set(id, acct);
            // Start silent refresh in background (no browser popup)
            fetchSession(id).then(session => {
                if (session?.token) {
                    acct._saveToken(session.token, session.projectId);
                    acct._scheduleRefresh();
                } else if (fs.existsSync(cookiesFile(id))) {
                    acct._refresh().then(() => acct._scheduleRefresh());
                }
            });
        }
    }

    _wire(acct) {
        acct.on('change', data => this.emit('account:change', data));
    }

    _nextId() {
        let n = 1;
        while (this.accounts.has(`acct${n}`)) n++;
        return `acct${n}`;
    }

    // Add a new account slot and immediately open Chrome for login
    async addAccount() {
        const id   = this._nextId();
        const acct = new Account(id);
        this._wire(acct);
        this.accounts.set(id, acct);
        this.emit('account:change', acct.toJSON());
        acct.start(); // non-blocking — opens Chrome window
        return id;
    }

    async removeAccount(id) {
        const acct = this.accounts.get(id);
        if (!acct) return;
        acct.destroy();
        this.accounts.delete(id);
        try { fs.rmSync(path.join(ACCOUNTS_DIR, id), { recursive: true, force: true }); } catch (_) {}
        this.emit('account:removed', id);
    }

    getAccounts() {
        return [...this.accounts.values()].map(a => a.toJSON());
    }

    // Return all live tokens from logged-in accounts (for tokensToTry)
    getTokens() {
        return [...this.accounts.values()]
            .map(a => a.token)
            .filter(Boolean);
    }

    // Notify the account that owns this token that it was rejected (401).
    markExpired(token) {
        for (const acct of this.accounts.values()) {
            if (acct.token === token) { acct.markExpired(token); return; }
        }
    }

    async forceLogin(id) {
        const acct = this.accounts.get(id);
        if (!acct) return;
        acct.forceLogin();
    }
}

module.exports = new MultiAccountManager();
