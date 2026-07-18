/**
 * Quick diagnostic: navigate to dola.com/chat, dump all buttons + take screenshot.
 * Run: node dola-debug.js
 */
const puppeteer = require('puppeteer-core');
const fs        = require('fs');
const path      = require('path');

const CHROME_PATH   = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COOKIES_FILE  = path.join(__dirname, 'cookies.json');
const DOLA_CHAT_URL = 'https://dola.com/chat/';

(async () => {
    const raw  = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.cookies || []);
    const cookies = list.map(c => ({
        name:     c.name,
        value:    c.value,
        domain:   (c.domain || 'dola.com').replace(/^\./, ''),
        path:     c.path || '/',
        secure:   c.secure ?? false,
        httpOnly: c.httpOnly ?? c.http_only ?? false,
    }));

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        defaultViewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = await browser.newPage();
    await page.setCookie(...cookies);

    console.log('Navigating to dola.com/chat...');
    await page.goto(DOLA_CHAT_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    await page.screenshot({ path: path.join(__dirname, 'dola-debug.png'), fullPage: false });
    console.log('Screenshot saved: dola-debug.png');

    const info = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('button, [role="button"]').forEach(el => {
            results.push({
                tag:      el.tagName,
                id:       el.id || '',
                text:     el.textContent?.trim().slice(0, 60) || '',
                dataAttrs: Object.fromEntries(
                    [...el.attributes]
                        .filter(a => a.name.startsWith('data-'))
                        .map(a => [a.name, a.value])
                ),
                visible: el.getBoundingClientRect().width > 0,
            });
        });
        return results;
    });

    console.log('\n=== All buttons on page ===');
    info.forEach((b, i) => {
        if (b.text || Object.keys(b.dataAttrs).length) {
            console.log(`[${i}] text="${b.text}" data=${JSON.stringify(b.dataAttrs)} visible=${b.visible}`);
        }
    });

    const skillBar = await page.evaluate(() => {
        const el = document.querySelector('[data-skill-id]');
        return el ? el.outerHTML.slice(0, 1000) : 'no data-skill-id elements found';
    });
    console.log('\n=== data-skill-id element ===\n', skillBar);

    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'dola-debug.html'), html);
    console.log('\nFull HTML saved: dola-debug.html');

    await browser.close();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
