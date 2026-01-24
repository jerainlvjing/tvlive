const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;
const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/jerainlvjing/tvlive@main/mfc1.mp4';

app.use(cors());

const _0x1a = "aHR0cHM6Ly9hcGktZWRnZS5teWZyZWVjYW1zLmNvbS";
const _0x2b = "9taXNzbWZjP2xpbWl0PTEwMDA=";

function getTargetConfig() {
    return Buffer.from(_0x1a + _0x2b, 'base64').toString('utf-8');
}

let globalBrowser = null;

async function initBrowser() {
    if (!globalBrowser) {
        globalBrowser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--mute-audio'
            ]
        });
    }
    return globalBrowser;
}

initBrowser();

app.get('/api/list', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    
    try {
        const hiddenApiUrl = getTargetConfig();
        const response = await axios.get(hiddenApiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });

        const users = response.data?.result?.rankings?.users || [];
        const videos = [];

        users.forEach(user => {
            if (user.is_online_now === true) {
                const userId = String(user.user_id); 
                const username = user.username;      
                const prefix = userId.substring(0, 3);
                
                videos.push({
                    vod_id: userId,
                    vod_name: username, 
                    vod_pic: `https://img.mfcimg.com/photos2/${prefix}/${userId}/avatar.300x300.jpg`,
                    vod_remarks: `Rank: ${user.rank}`
                });
            }
        });

        console.log(`[List] Count: ${videos.length}`);
        res.json({ code: 200, data: videos });

    } catch (error) {
        console.error('[List Error]', error.message);
        res.json({ code: 500, msg: 'Error', data: [] });
    }
});

app.get('/api/play', async (req, res) => {
    const target = req.query.id; 
    if (!target) return res.json({ code: 200, url: FALLBACK_URL });

    let page = null;
    try {
        const browser = await initBrowser();
        page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            const url = req.url();

            if (url.includes('.m3u8') || url.includes('mfc_')) {
                req.continue();
                return;
            }

            if (type === 'script' || type === 'xhr' || type === 'fetch' || type === 'document') {
                req.continue();
                return;
            }

            req.abort();
        });

        let foundUrl = '';
        const snifferPromise = new Promise(resolve => {
            const handler = (req) => {
                if (req.url().includes('.m3u8') && req.url().includes('mfc_')) {
                    foundUrl = req.url();
                    resolve(req.url());
                }
            };
            page.on('request', handler);
            setTimeout(() => resolve(FALLBACK_URL), 12000); 
        });

        console.log(`[Play] Sniffing: ${target}`);
        
        page.goto(`https://www.myfreecams.com/#${target}`, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
        }).catch(e => {});

        const result = await snifferPromise;

        if (result && result !== FALLBACK_URL) {
            console.log(`[Success] URL: ${result}`);
            res.json({ code: 200, url: result });
        } else {
            console.log(`[Fail] Fallback`);
            res.json({ code: 200, url: FALLBACK_URL });
        }

    } catch (error) {
        console.error('[Play Error]', error.message);
        if (error.message && error.message.includes('closed')) globalBrowser = null;
        res.json({ code: 200, url: FALLBACK_URL });
    } finally {
        if (page) await page.close();
    }
});

app.listen(PORT, () => {
    console.log(`MFC Server running at http://0.0.0.0:${PORT}`);
});