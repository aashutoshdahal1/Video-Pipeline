/**
 * Vibes Account Manager — one Meta/Facebook session per slot.
 *
 * vibes.ai only supports "Sign in with Meta". Each account gets its own
 * Chrome profile + cookies file. The meta_session cookie is extracted after
 * login and revalidated via GET /api/auth/me.
 */

const puppeteer    = require("puppeteer-core");
const fetch        = require("node-fetch");
const fs           = require("fs");
const path         = require("path");
const EventEmitter = require("events");

const CHROME_PATH   = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VACCTS_DIR    = path.join(__dirname, ".vibes-accounts");
const VIBES_URL     = "https://vibes.ai";
const AUTH_ME_URL   = "https://vibes.ai/api/auth/me";
const REFRESH_MS    = 45 * 60 * 1000;
const UA            = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASE_ARGS  = [
    "--disable-blink-features=AutomationControlled",
    "--no-first-run", "--no-default-browser-check",
    "--disable-infobars", "--window-size=1280,800",
];
const IGNORE_ARGS = ["--enable-automation", "--enable-blink-features=IdleDetection"];

// per-account helpers

function profileDir(id)  { return path.join(VACCTS_DIR, id, "chrome-profile"); }
function cookiesFile(id) { return path.join(VACCTS_DIR, id, "cookies.json"); }
function metaFile(id)    { return path.join(VACCTS_DIR, id, "meta.json"); }

function clearLock(id) {
    const dir = profileDir(id);
    ["SingletonLock", "SingletonSocket", "SingletonCookie"].forEach(f => {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });
}

async function saveVibesCookies(page, id) {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send("Network.getAllCookies");
    const keep = cookies.filter(c => c.domain.includes("vibes.ai") || c.domain.includes("facebook") || c.domain.includes("meta"));
    fs.mkdirSync(path.dirname(cookiesFile(id)), { recursive: true });
    fs.writeFileSync(cookiesFile(id), JSON.stringify(keep, null, 2));
    return keep;
}

function buildCookieStr(id) {
    const cf = cookiesFile(id);
    if (!fs.existsSync(cf)) return null;
    try {
        const cookies = JSON.parse(fs.readFileSync(cf, "utf8"));
        const vibesCookies = cookies.filter(c => c.domain && c.domain.includes("vibes"));
        if (!vibesCookies.length) return null;
        return vibesCookies.map(c => c.name + "=" + c.value).join("; ");
    } catch { return null; }
}

async function validateSession(id) {
    const cookieStr = buildCookieStr(id);
    if (!cookieStr) return null;
    try {
        const res = await fetch(AUTH_ME_URL, {
            headers: {
                "Cookie":          cookieStr,
                "User-Agent":      UA,
                "Accept":          "application/json",
                "Referer":         VIBES_URL,
                "sec-fetch-dest":  "empty",
                "sec-fetch-mode":  "cors",
                "sec-fetch-site":  "same-origin",
            },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const userId = data.user && (data.user.id || data.user.abraUserId) || data.id;
        const name   = data.user && (data.user.name || data.user.username) || data.name;
        const email  = data.user && data.user.email;
        if (!userId) return null;
        return { userId, name, email, cookieStr };
    } catch { return null; }
}

// VibesAccount class

class VibesAccount extends EventEmitter {
    constructor(id) {
        super();
        this.id         = id;
        this.cookieStr  = null;
        this.cookieAge  = 0;
        this.status     = "idle";
        this.statusMsg  = "";
        this.userInfo   = null;
        this._busy      = false;
        this._timer     = null;

        const mf = metaFile(id);
        if (fs.existsSync(mf)) {
            try { Object.assign(this, JSON.parse(fs.readFileSync(mf, "utf8"))); } catch (_) {}
        }
        this.cookieStr = null;
    }

    toJSON() {
        return {
            id:         this.id,
            status:     this.status,
            statusMsg:  this.statusMsg,
            userInfo:   this.userInfo,
            cookieAge:  this.cookieAge,
            hasCookie:  !!this.cookieStr,
        };
    }

    _saveMeta() {
        const mf = metaFile(this.id);
        fs.mkdirSync(path.dirname(mf), { recursive: true });
        fs.writeFileSync(mf, JSON.stringify({
            status:    this.status,
            statusMsg: this.statusMsg,
            userInfo:  this.userInfo,
            cookieAge: this.cookieAge,
        }));
    }

    _setStatus(status, msg) {
        this.status    = status;
        this.statusMsg = msg;
        this._saveMeta();
        this.emit("change", this.toJSON());
    }

    _saveCookie(session) {
        this.cookieStr = session.cookieStr;
        this.cookieAge = Date.now();
        this.userInfo  = { userId: session.userId, name: session.name, email: session.email };
        const label    = session.name || session.email || session.userId;
        this._setStatus("ready", "Ready — " + label);
        this.emit("cookie", this.cookieStr);
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
        this._setStatus("logging_in", "Opening Chrome — sign in with Meta on vibes.ai…");
        console.log("[VibesAccount:" + this.id + "] Chrome opening — sign in with Meta.");

        clearLock(this.id);
        fs.mkdirSync(profileDir(this.id), { recursive: true });
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath:  CHROME_PATH,
                headless:        false,
                defaultViewport: null,
                userDataDir:     profileDir(this.id),
                args:            BASE_ARGS,
                ignoreDefaultArgs: IGNORE_ARGS,
            });

            const page = (await browser.pages())[0] || await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, "webdriver", { get: () => false });
            });

            this._setStatus("logging_in", "Waiting for login…");
            await page.goto(VIBES_URL, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
            await this._clickSignInWithMeta(page);

            // Poll via CDP — meta_session is HttpOnly so document.cookie cannot see it
            const cdpDetect = await page.createCDPSession();
            let detected = false;
            const deadline = Date.now() + 300000;
            while (Date.now() < deadline) {
                try {
                    const { cookies } = await cdpDetect.send("Network.getAllCookies");
                    if (cookies.some(c => c.name === "meta_session" && c.domain.includes("vibes"))) {
                        detected = true;
                        console.log("[VibesAccount:" + this.id + "] meta_session cookie detected");
                        break;
                    }
                } catch (_) {}
                const loggedIn = await page.evaluate(() =>
                    !!document.querySelector('[aria-label="Profile"]') ||
                    !!document.querySelector('a[href*="/profile"]') ||
                    !!document.querySelector('[data-testid="avatar"]')
                ).catch(() => false);
                if (loggedIn) { detected = true; break; }
                await new Promise(r => setTimeout(r, 2000));
            }

            await new Promise(r => setTimeout(r, 1500));
            await saveVibesCookies(page, this.id);
            await browser.close();
            await browser.close();
            this._busy = false;

            const session = await validateSession(this.id);
            if (session) {
                this._saveCookie(session);
            } else {
                const cs = buildCookieStr(this.id);
                if (cs) {
                    this.cookieStr = cs;
                    this.cookieAge = Date.now();
                    this._setStatus("ready", "Logged in (session unverified)");
                } else {
                    this._setStatus("error", "Logged in but meta_session not found — try Re-auth");
                }
            }
        } catch (e) {
            console.error("[VibesAccount:" + this.id + "] Login error:", e.message);
            this._setStatus("error", "Login failed: " + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async _clickSignInWithMeta(page) {
        try {
            await page.waitForFunction(() => {
                const els = Array.from(document.querySelectorAll("button,a,[role=button]"));
                return els.some(el => el.textContent && el.textContent.toLowerCase().includes("sign in with meta"));
            }, { timeout: 8000, polling: 800 }).catch(() => {});

            await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll("button,a,[role=button]"));
                const btn = els.find(el => el.textContent && el.textContent.toLowerCase().includes("sign in with meta"));
                if (btn) btn.click();
            });
            console.log("[VibesAccount:" + this.id + "] Clicked Sign in with Meta");
        } catch (_) {}
    }

    async _refresh() {
        if (this._busy) return;
        this._busy = true;
        this._setStatus("refreshing", "Checking session…");

        const session = await validateSession(this.id);
        if (session) {
            this._saveCookie(session);
            this._busy = false;
            return;
        }

        if (!fs.existsSync(cookiesFile(this.id))) {
            this._setStatus("login_needed", "No session — click Sign in");
            this._busy = false;
            return;
        }

        console.log("[VibesAccount:" + this.id + "] Session invalid, headless re-establish…");
        clearLock(this.id);
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                headless:       "new",
                userDataDir:    profileDir(this.id),
                args:           [...BASE_ARGS, "--no-sandbox", "--disable-gpu"],
                ignoreDefaultArgs: IGNORE_ARGS,
            });
            const page = await browser.newPage();
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, "webdriver", { get: () => false });
            });
            await page.goto(VIBES_URL, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 5000));
            await saveVibesCookies(page, this.id);
            await browser.close();
            this._busy = false;

            const session2 = await validateSession(this.id);
            if (session2) {
                this._saveCookie(session2);
            } else {
                this._setStatus("login_needed", "Session expired — click Sign in again");
                try { fs.rmSync(path.join(VACCTS_DIR, this.id), { recursive: true, force: true }); } catch (_) {}
            }
        } catch (e) {
            console.error("[VibesAccount:" + this.id + "] Refresh error:", e.message);
            this._setStatus("error", "Refresh failed: " + e.message);
            if (browser) await browser.close().catch(() => {});
            this._busy = false;
        }
    }

    async forceLogin() {
        if (this._timer) clearInterval(this._timer);
        this._busy = false;
        this.cookieStr = null;
        try { fs.rmSync(path.join(VACCTS_DIR, this.id), { recursive: true, force: true }); } catch (_) {}
        await this._login();
        this._scheduleRefresh();
    }

    markExpired(cookieStr) {
        if (this.cookieStr !== cookieStr) return;
        console.log("[VibesAccount:" + this.id + "] Session rejected (401) — triggering refresh");
        this.cookieStr = null;
        this._setStatus("refreshing", "Session expired (401) — refreshing…");
        if (!this._busy) this._refresh().catch(e => console.error("[VibesAccount:" + this.id + "] Auto-refresh error:", e.message));
    }

    destroy() {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
    }
}

// VibesAccountManager

class VibesAccountManager extends EventEmitter {
    constructor() {
        super();
        this.accounts = new Map();
        this._rrCursor = 0;
        this._loadPersisted();
    }

    _loadPersisted() {
        if (!fs.existsSync(VACCTS_DIR)) return;
        const ids = fs.readdirSync(VACCTS_DIR).filter(f => {
            try { return fs.statSync(path.join(VACCTS_DIR, f)).isDirectory(); } catch { return false; }
        });
        for (const id of ids) {
            const acct = new VibesAccount(id);
            this._wire(acct);
            this.accounts.set(id, acct);
            validateSession(id).then(session => {
                if (session) {
                    acct._saveCookie(session);
                    acct._scheduleRefresh();
                } else {
                    const cs = buildCookieStr(id);
                    if (cs) {
                        acct.cookieStr = cs;
                        acct.cookieAge = Date.now();
                        acct._setStatus("ready", "Ready (offline restore)");
                        acct._scheduleRefresh();
                    } else {
                        acct._setStatus("login_needed", "Session expired — click Sign in");
                    }
                }
            });
        }
    }

    _wire(acct) {
        acct.on("change", data => this.emit("account:change", data));
    }

    _nextId() {
        let n = 1;
        while (this.accounts.has("vacct" + n)) n++;
        return "vacct" + n;
    }

    async addAccount() {
        const id   = this._nextId();
        const acct = new VibesAccount(id);
        this._wire(acct);
        this.accounts.set(id, acct);
        this.emit("account:change", acct.toJSON());
        acct.start();
        return id;
    }

    async removeAccount(id) {
        const acct = this.accounts.get(id);
        if (!acct) return;
        acct.destroy();
        this.accounts.delete(id);
        try { fs.rmSync(path.join(VACCTS_DIR, id), { recursive: true, force: true }); } catch (_) {}
        this.emit("account:removed", id);
    }

    getAccounts() {
        return [...this.accounts.values()].map(a => a.toJSON());
    }

    getCookies() {
        return [...this.accounts.values()]
            .filter(a => a.cookieStr)
            .map(a => ({ id: a.id, cookieStr: a.cookieStr }));
    }

    nextCookie() {
        const ready = [...this.accounts.values()].filter(a => a.cookieStr);
        if (!ready.length) return null;
        const acct = ready[this._rrCursor % ready.length];
        this._rrCursor++;
        return { id: acct.id, cookieStr: acct.cookieStr };
    }

    markExpired(cookieStr) {
        for (const acct of this.accounts.values()) {
            if (acct.cookieStr === cookieStr) { acct.markExpired(cookieStr); return; }
        }
    }

    async forceLogin(id) {
        const acct = this.accounts.get(id);
        if (acct) await acct.forceLogin();
    }
}

module.exports = new VibesAccountManager();
