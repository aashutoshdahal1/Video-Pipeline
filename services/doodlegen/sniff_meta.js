const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: false,
        defaultViewport: null,
        args: ['--disable-blink-features=AutomationControlled','--window-size=1280,900'],
        ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = (await browser.pages())[0] || await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');

    cdp.on('Network.requestWillBeSent', ev => {
        const url = ev.request.url;
        const method = ev.request.method;
        if (method !== 'POST') return;
        if (url.includes('meta.') || url.includes('facebook.') || url.includes('instagram.') || url.includes('llama') || url.includes('ai.meta')) {
            console.log('\n=== URL:', url);
            console.log('=== Headers (auth):', ev.request.headers['authorization'] || ev.request.headers['x-fb-friendly-name'] || '(none)');
            if (ev.request.postData) {
                console.log('=== BODY:', ev.request.postData.slice(0, 3000));
            }
        }
    });

    await page.goto('https://www.meta.ai/vibes', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('\n\n=== READY — Create a video on meta.ai/vibes ===\n');
    await new Promise(() => {});
})();
