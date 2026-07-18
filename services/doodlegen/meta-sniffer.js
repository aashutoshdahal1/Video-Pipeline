/**
 * Meta AI video generation sniffer.
 * Uses Chrome DevTools Protocol (CDP) — completely invisible to page JS.
 * Run: node meta-sniffer.js
 *
 * Steps:
 *  1. Chrome opens to meta.ai/vibes
 *  2. Type your prompt and click Generate as normal
 *  3. This script captures the exact GraphQL request and prints it
 *  4. Press Ctrl+C when done
 */

const puppeteer = require('puppeteer-core');
const fs        = require('fs');
const path      = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const META_URL    = 'https://meta.ai/create';
const OUT_FILE    = path.join(__dirname, 'meta-captured.json');

// Paste your cookies here from the Proxyman curl (just the cookie string)
const COOKIE_STRING = 'datr=br84auBXyTATsHheQwQlhru_; rd_challenge=Q_6hBQPM5U99-xtW8PRrVo-70IUKMd9WML5MCPb84bbbn-04C0yiGEyhN619_7O6KqJz3g693QuFyjzmns198CqQCS_SZBDg4tl0SMHKJKXW-A0a99HI-mUZvO4AXOQ; dpr=2; theme=%7B%22connectorsDismissed%22%3Atrue%7D; ecto_1_sess=8496f004-c130-40f2-9086-21fc375aee61.v1%3AhghF4BqA5POtxcF9Fr1q-a1bp-cRm-e3OSZ5ipVHhbX_WNoX5r8pXh0v9HduNQvoYb6fq1HAlrTOLJnTx2e8koIjWpsUIKlnJXPvCAu4F2gbUQpXOt9-1na_OncRRn1Lwyss7OSeoEJIyFXoceRt3xBhUA5RA2zBYobRfyMlgOdNenwWbtyQjBTAnkGp5DJeSaWsAb_9NigJh_yISjtP9DgD6jbv7MXcYk9bPP54u5FaqP9byPKBuXlIXNOK3VmpcEDoI2Zf4xGBwkd_WkZxM9SwcIiBBHsIB4AMoIOoZjG1iiR-hpEcbxXPg2-RePiorvf9O36Jx6fI_45_6xwVvO1PiEdbVX0OXczQnq8hpg_dSzryvzOko7quc80lTo5HBr8iU87H59ppwIgZpjgMy8OKRSovSKh_kfRjHqUSdM4Bj2efRHL9NFuS-krNhobQTIVogYca6h8OmA_gtXKpSb4_NBj5ASgiEtWBCwN8cPrgzqCWGQUXOPF-mDbFCekPUULGSF2h%3Ar6zZoFj51Vn93QNi%3AJJvcFMWCR1c59ncgf9n-Mg._OiNf86qQjRDqtgYxfEfZTj6w7BSpc-23yeI4tenkQ4; wd=1440x784';

function parseCookieString(str) {
    return str.split(';').map(p => {
        const [name, ...rest] = p.trim().split('=');
        return { name: name.trim(), value: rest.join('=').trim(), domain: 'meta.ai', path: '/' };
    }).filter(c => c.name);
}

(async () => {
    console.log('Launching Chrome (no DevTools UI — page cannot detect this)...');

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        defaultViewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,900',
        ],
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    // Stealth
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        delete window.__playwright;
        delete window.__puppeteer;
    });

    // Inject cookies
    const cookies = parseCookieString(COOKIE_STRING);
    await page.setCookie(...cookies);

    // ── CDP Network monitoring — invisible to page JS ──────────────────────────
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');

    const captured = [];
    const tryDocId = (body) => { try { return JSON.parse(body).doc_id || '?'; } catch { return '?'; } };

    const requestMap = {};

    // Capture EVERY graphql request — no filtering
    cdp.on('Network.requestWillBeSent', (ev) => {
        const url = ev.request.url;
        if (!url.includes('meta.ai/api/graphql')) return;
        const body = ev.request.postData || '';
        requestMap[ev.requestId] = { url, headers: ev.request.headers, body };
        console.log(`\n[REQ #${ev.requestId.slice(-4)}] doc_id: ${tryDocId(body)} | body(${body.length}): ${body.slice(0, 120)}`);
    });

    // Capture response bodies too
    cdp.on('Network.responseReceived', async (ev) => {
        if (!ev.response.url.includes('meta.ai/api/graphql')) return;
        const id = ev.requestId;
        try {
            await new Promise(r => setTimeout(r, 300));
            const resp = await cdp.send('Network.getResponseBody', { requestId: id });
            const body = resp.body || '';
            const req  = requestMap[id] || {};
            console.log(`\n═══════════════════════════════════════════════════`);
            console.log(`✅ COMPLETE  req#${id.slice(-4)}`);
            console.log(`REQUEST  body: ${req.body || '(none)'}`);
            console.log(`RESPONSE body: ${body.slice(0, 600)}`);
            console.log(`═══════════════════════════════════════════════════`);
            captured.push({ url: ev.response.url, reqBody: req.body, resBody: body, headers: req.headers });
            fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
        } catch (_) {}
    });

    console.log('Navigating to meta.ai/vibes...');
    await page.goto(META_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('\n──────────────────────────────────────────────────────');
    console.log('✅ Page loaded. Now:');
    console.log('   1. Type your video prompt in the box');
    console.log('   2. Click Generate');
    console.log('   3. Watch this terminal — the captured request will print here');
    console.log('   Press Ctrl+C to exit when done.');
    console.log('──────────────────────────────────────────────────────\n');

    // Keep alive until Ctrl+C
    await new Promise(() => {});
})().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
