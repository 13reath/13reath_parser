"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const socks_proxy_agent_1 = require("socks-proxy-agent");
const readline = __importStar(require("readline"));
const TOR_PROXY_HOST = '127.0.0.1';
const TOR_PROXY_PORT = 9150;
const RESULTS_DIR = path.join(__dirname, 'results');
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR);
}
function findTorBrowserPath() {
    const platform = os.platform();
    const possiblePaths = [];
    if (platform === 'win32') {
        const drives = ['C:', 'D:', 'E:'];
        const locations = [
            '\\Users\\' + os.userInfo().username + '\\Desktop\\Tor Browser\\Browser\\firefox.exe',
            '\\Program Files\\Tor Browser\\Browser\\firefox.exe',
            '\\Program Files (x86)\\Tor Browser\\Browser\\firefox.exe',
        ];
        drives.forEach((drive) => {
            locations.forEach((loc) => possiblePaths.push(drive + loc));
        });
    }
    else if (platform === 'darwin') {
        possiblePaths.push('/Applications/Tor Browser.app/Contents/MacOS/firefox');
    }
    else {
        possiblePaths.push('/usr/bin/tor-browser');
        possiblePaths.push(path.join(os.homedir(), '.local/share/torbrowser/tbb/x86_64/tor-browser/Browser/firefox'));
    }
    for (const torPath of possiblePaths) {
        if (fs.existsSync(torPath)) {
            console.log(`Tor Browser found: ${torPath}`);
            return torPath;
        }
    }
    throw new Error('Tor Browser not found');
}
async function startTorBrowser() {
    return new Promise((resolve, reject) => {
        try {
            const torPath = findTorBrowserPath();
            console.log('Starting Tor Browser...');
            const torProcess = (0, child_process_1.exec)(`"${torPath}"`, (error) => {
                if (error && error.code !== 0) {
                    console.error('Tor Browser error:', error);
                }
            });
            setTimeout(() => {
                console.log('Tor Browser started');
                resolve(torProcess);
            }, 8000);
        }
        catch (error) {
            reject(error);
        }
    });
}
async function checkTorConnection() {
    try {
        const agent = new socks_proxy_agent_1.SocksProxyAgent(`socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`);
        console.log('Checking Tor...');
        const response = await axios_1.default.get('https://check.torproject.org/api/ip', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000,
        });
        if (response.data?.IsTor === true) {
            console.log('Tor OK! IP:', response.data.IP);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Tor check error:', error.message);
        return false;
    }
}
async function parseOfferLocale(page, offerId, locale) {
    const localePrefix = locale === 'en' ? '/en' : '';
    const url = `https://funpay.com${localePrefix}/lots/offer?id=${offerId}`;
    console.log(`  [${locale.toUpperCase()}] ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
        const selectExists = await page.$('select');
        if (selectExists) {
            await page.select('select', await page.evaluate(() => {
                const select = document.querySelector('select');
                if (!select)
                    return '';
                const options = select.querySelectorAll('option');
                for (let opt of options) {
                    if (opt.value && opt.value !== '')
                        return opt.value;
                }
                return '';
            }));
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    catch (e) { }
    const data = await page.evaluate(() => {
        const result = { title: '', description: '', price: '' };
        const paramItems = document.querySelectorAll('.param-item');
        paramItems.forEach((item) => {
            const h5 = item.querySelector('h5');
            const div = item.querySelector('div');
            if (h5 && div) {
                const titleText = h5.textContent?.trim().toLowerCase() || '';
                const content = div.textContent?.trim() || '';
                if (titleText.includes('short description') ||
                    titleText.includes('краткое описание')) {
                    if (!result.title)
                        result.title = content;
                }
                else if (titleText.includes('range') || titleText.includes('диапазон')) {
                    if (!result.title)
                        result.title = content;
                }
                else if (titleText.includes('detailed description') ||
                    titleText.includes('full description') ||
                    titleText.includes('подробное описание') ||
                    titleText.includes('полное описание')) {
                    result.description = content;
                }
            }
        });
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/^(от|from)\s+[\d.,]+\s*[₽€$]/i)) {
                result.price = text;
                break;
            }
        }
        return result;
    });
    data.description = data.description.replace(/\s+/g, ' ').trim();
    if (data.price) {
        const priceMatch = data.price.match(/[\d.,]+\s*[₽€$]/);
        if (priceMatch)
            data.price = priceMatch[0];
    }
    console.log(`  [${locale.toUpperCase()}] ${data.title.substring(0, 40)} | ${data.price}`);
    return data;
}
async function parseOffer(page, offerId) {
    console.log(`\n=== Offer ID: ${offerId} ===`);
    const ru = await parseOfferLocale(page, offerId, 'ru');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const en = await parseOfferLocale(page, offerId, 'en');
    return {
        link: `https://funpay.com/lots/offer?id=${offerId}`,
        ru,
        en,
    };
}
async function parseFunpay(url, categoryFilter = null) {
    let browser = null;
    let torProcess = null;
    try {
        torProcess = await startTorBrowser();
        const isTorConnected = await checkTorConnection();
        if (!isTorConnected)
            throw new Error('Tor connection failed');
        console.log('Launching browser...');
        browser = await puppeteer_1.default.launch({
            headless: false,
            args: [
                `--proxy-server=socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        // Нормализуем URL - всегда используем /en/ версию для сбора ID
        const normalizedUrl = url.replace('/users/', '/en/users/');
        console.log(`Loading: ${normalizedUrl}`);
        await page.goto(normalizedUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        const offerData = await page.evaluate((filter) => {
            const data = { offerIds: [], availableCategories: [] };
            const offerBlocks = document.querySelectorAll('.offer');
            offerBlocks.forEach((block) => {
                const titleElement = block.querySelector('.offer-list-title h3 a');
                if (!titleElement)
                    return;
                const categoryName = titleElement.textContent?.trim() || '';
                data.availableCategories.push(categoryName);
                if (filter && !categoryName.toLowerCase().includes(filter.toLowerCase()))
                    return;
                const offerItems = block.querySelectorAll('.tc-item');
                offerItems.forEach((item) => {
                    const href = item.getAttribute('href') || '';
                    const match = href.match(/id=(\d+)/);
                    if (match)
                        data.offerIds.push(match[1]);
                });
            });
            return data;
        }, categoryFilter);
        if (offerData.offerIds.length === 0) {
            console.log('No offers found!');
            console.log('Available:', offerData.availableCategories.join(', '));
            return { success: false };
        }
        console.log(`Found ${offerData.offerIds.length} offers`);
        const parsedOffers = [];
        for (let i = 0; i < offerData.offerIds.length; i++) {
            console.log(`\n[${i + 1}/${offerData.offerIds.length}]`);
            const offer = await parseOffer(page, offerData.offerIds[i]);
            parsedOffers.push(offer);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const timestamp = new Date().toISOString().split('T')[0];
        const category = categoryFilter || 'all';
        const fileName = `Parser_${category}_${timestamp}.json`;
        const filePath = path.join(RESULTS_DIR, fileName);
        fs.writeFileSync(filePath, JSON.stringify(parsedOffers, null, 2));
        console.log(`\n✅ Saved: ${filePath}`);
        return { success: true, filePath, count: parsedOffers.length };
    }
    catch (error) {
        console.error('Error:', error.message);
        return { success: false };
    }
    finally {
        if (browser)
            await browser.close();
        if (torProcess)
            torProcess.kill();
    }
}
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function prompt() {
    rl.question('FunPay URL (or "exit"): ', async (url) => {
        if (url.toLowerCase() === 'exit') {
            rl.close();
            return;
        }
        if (!url.includes('funpay.com/users/') && !url.includes('funpay.com/en/users/')) {
            console.log('Invalid URL!');
            prompt();
            return;
        }
        rl.question('Category filter (or Enter for all): ', async (category) => {
            const filter = category.trim() || null;
            const result = await parseFunpay(url, filter);
            if (result.success) {
                console.log(`\n✅ Done! ${result.count} offers`);
            }
            rl.question('\nContinue? (y/n): ', (answer) => {
                if (answer.toLowerCase() === 'y') {
                    prompt();
                }
                else {
                    rl.close();
                }
            });
        });
    });
}
console.log('=== FunPay Parser (RU/EN) ===\n');
prompt();
