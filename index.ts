import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as readline from 'readline';

const TOR_PROXY_HOST = '127.0.0.1';
const TOR_PROXY_PORT = 9150;
const RESULTS_DIR = path.join(__dirname, 'results');

if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR);
}

interface OfferData {
    title: string;
    description: string;
    price: string;
}

interface ParsedOffer {
    link: string;
    ru: OfferData;
    en: OfferData;
}

function findTorBrowserPath(): string {
    const platform = os.platform();
    const possiblePaths: string[] = [];

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
    } else if (platform === 'darwin') {
        possiblePaths.push('/Applications/Tor Browser.app/Contents/MacOS/firefox');
    } else {
        possiblePaths.push('/usr/bin/tor-browser');
        possiblePaths.push(
            path.join(
                os.homedir(),
                '.local/share/torbrowser/tbb/x86_64/tor-browser/Browser/firefox'
            )
        );
    }

    for (const torPath of possiblePaths) {
        if (fs.existsSync(torPath)) {
            console.log(`Tor Browser found: ${torPath}`);
            return torPath;
        }
    }
    throw new Error('Tor Browser not found');
}

async function startTorBrowser(): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            const torPath = findTorBrowserPath();
            console.log('Starting Tor Browser...');
            const torProcess = exec(`"${torPath}"`, (error) => {
                if (error && error.code !== 0) {
                    console.error('Tor Browser error:', error);
                }
            });
            setTimeout(() => {
                console.log('Tor Browser started');
                resolve(torProcess);
            }, 8000);
        } catch (error) {
            reject(error);
        }
    });
}

async function checkTorConnection(): Promise<boolean> {
    try {
        const agent = new SocksProxyAgent(`socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`);
        console.log('Checking Tor...');
        const response = await axios.get('https://check.torproject.org/api/ip', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000,
        });
        if (response.data?.IsTor === true) {
            console.log('Tor OK! IP:', response.data.IP);
            return true;
        }
        return false;
    } catch (error: any) {
        console.error('Tor check error:', error.message);
        return false;
    }
}

async function clearPageData(page: Page) {
    // Очищаем все cookies
    const cookies = await page.cookies();
    if (cookies.length > 0) {
        await page.deleteCookie(...cookies);
    }

    // Очищаем localStorage и sessionStorage при загрузке новой страницы
    await page.evaluateOnNewDocument(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

async function parseOfferLocale(
    page: Page,
    offerId: string,
    locale: 'ru' | 'en'
): Promise<OfferData> {
    // Очищаем все данные перед загрузкой
    await clearPageData(page);

    // Устанавливаем заголовки в зависимости от языка
    if (locale === 'en') {
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });
    } else {
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ru-RU,ru;q=0.9',
        });
    }

    // Формируем URL в зависимости от языка
    const url =
        locale === 'en'
            ? `https://funpay.com/en/lots/offer?id=${offerId}`
            : `https://funpay.com/lots/offer?id=${offerId}`;

    console.log(`  [${locale.toUpperCase()}] ${url}`);

    // Переходим на страницу
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Проверяем и принудительно переключаем язык если нужно
    const languageSwitched = await page.evaluate((targetLocale) => {
        // Проверяем текущий язык по URL или контенту
        const isEnglish = window.location.pathname.startsWith('/en');
        const needEnglish = targetLocale === 'en';

        if (needEnglish !== isEnglish) {
            // Ищем переключатель языка
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.getAttribute('href') || '';

                // Для переключения на английский
                if (needEnglish && (href.includes('/en/') || href === '/en')) {
                    (link as HTMLElement).click();
                    return true;
                }

                // Для переключения на русский
                if (
                    !needEnglish &&
                    !href.includes('/en/') &&
                    (href === '/' || href.includes('/ru'))
                ) {
                    (link as HTMLElement).click();
                    return true;
                }
            }
        }
        return false;
    }, locale);

    // Если язык был переключен, ждем загрузки
    if (languageSwitched) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Обработка селекта если есть
    try {
        const selectExists = await page.$('select');
        if (selectExists) {
            await page.select(
                'select',
                await page.evaluate(() => {
                    const select = document.querySelector('select');
                    if (!select) return '';
                    const options = select.querySelectorAll('option');
                    for (let opt of options) {
                        if (opt.value && opt.value !== '') return opt.value;
                    }
                    return '';
                })
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    } catch (e) {}

    // Парсим данные
    const data = await page.evaluate(() => {
        const result = { title: '', description: '', price: '' };

        const paramItems = document.querySelectorAll('.param-item');
        paramItems.forEach((item) => {
            const h5 = item.querySelector('h5');
            const div = item.querySelector('div');
            if (h5 && div) {
                const titleText = h5.textContent?.trim().toLowerCase() || '';
                const content = div.textContent?.trim() || '';

                if (
                    titleText.includes('short description') ||
                    titleText.includes('краткое описание')
                ) {
                    if (!result.title) result.title = content;
                } else if (titleText.includes('range') || titleText.includes('диапазон')) {
                    if (!result.title) result.title = content;
                } else if (
                    titleText.includes('detailed description') ||
                    titleText.includes('full description') ||
                    titleText.includes('подробное описание') ||
                    titleText.includes('полное описание')
                ) {
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
        if (priceMatch) data.price = priceMatch[0];
    }

    console.log(`  [${locale.toUpperCase()}] ${data.title.substring(0, 40)} | ${data.price}`);
    return data;
}

async function parseOffer(pageRu: Page, pageEn: Page, offerId: string): Promise<ParsedOffer> {
    console.log(`\n=== Offer ID: ${offerId} ===`);

    const ru = await parseOfferLocale(pageRu, offerId, 'ru');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const en = await parseOfferLocale(pageEn, offerId, 'en');

    return {
        link: `https://funpay.com/lots/offer?id=${offerId}`,
        ru,
        en,
    };
}

async function parseFunpay(url: string, categoryFilter: string | null = null) {
    let browserRu: Browser | null = null;
    let browserEn: Browser | null = null;
    let torProcess: any = null;

    try {
        torProcess = await startTorBrowser();
        const isTorConnected = await checkTorConnection();
        if (!isTorConnected) throw new Error('Tor connection failed');

        console.log('Launching 2 browsers (RU + EN)...');

        // Браузер для РУССКОГО с опциями для чистого состояния
        browserRu = await puppeteer.launch({
            headless: false,
            args: [
                `--proxy-server=socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-web-security',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-features=OutOfBlinkCors',
                '--incognito',
            ],
        });

        // Браузер для АНГЛИЙСКОГО с опциями для чистого состояния
        browserEn = await puppeteer.launch({
            headless: false,
            args: [
                `--proxy-server=socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-web-security',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-features=OutOfBlinkCors',
                '--incognito',
            ],
        });

        const pageRu = await browserRu.newPage();
        await pageRu.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Очищаем данные для русской страницы
        await clearPageData(pageRu);
        await pageRu.setExtraHTTPHeaders({
            'Accept-Language': 'ru-RU,ru;q=0.9',
        });

        const pageEn = await browserEn.newPage();
        await pageEn.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Очищаем данные для английской страницы
        await clearPageData(pageEn);
        await pageEn.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });

        // RU версия
        const urlRu = url.replace('/en/users/', '/users/');
        console.log(`[RU Browser] Loading: ${urlRu}`);
        await pageRu.goto(urlRu, { waitUntil: 'networkidle2', timeout: 60000 });

        // EN версия
        const urlEn = url.replace('/users/', '/en/users/');
        console.log(`[EN Browser] Loading: ${urlEn}`);
        await pageEn.goto(urlEn, { waitUntil: 'networkidle2', timeout: 60000 });

        const offerData = await pageRu.evaluate((filter: string | null) => {
            const data = { offerIds: [] as string[], availableCategories: [] as string[] };
            const offerBlocks = document.querySelectorAll('.offer');

            offerBlocks.forEach((block) => {
                const titleElement = block.querySelector('.offer-list-title h3 a');
                if (!titleElement) return;

                const categoryName = titleElement.textContent?.trim() || '';
                data.availableCategories.push(categoryName);

                if (filter && !categoryName.toLowerCase().includes(filter.toLowerCase())) return;

                const offerItems = block.querySelectorAll('.tc-item');
                offerItems.forEach((item) => {
                    const href = item.getAttribute('href') || '';
                    const match = href.match(/id=(\d+)/);
                    if (match) data.offerIds.push(match[1]);
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

        const parsedOffers: ParsedOffer[] = [];
        for (let i = 0; i < offerData.offerIds.length; i++) {
            console.log(`\n[${i + 1}/${offerData.offerIds.length}]`);
            const offer = await parseOffer(pageRu, pageEn, offerData.offerIds[i]);
            parsedOffers.push(offer);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const category = categoryFilter || 'all';
        const fileName = `Parser_${category}_${timestamp}.json`;
        const filePath = path.join(RESULTS_DIR, fileName);

        fs.writeFileSync(filePath, JSON.stringify(parsedOffers, null, 2));
        console.log(`\n✅ Saved: ${filePath}`);

        return { success: true, filePath, count: parsedOffers.length };
    } catch (error: any) {
        console.error('Error:', error.message);
        return { success: false };
    } finally {
        if (browserRu) await browserRu.close();
        if (browserEn) await browserEn.close();
        if (torProcess) torProcess.kill();
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
                } else {
                    rl.close();
                }
            });
        });
    });
}

console.log('=== FunPay Parser (RU/EN) ===\n');
prompt();
