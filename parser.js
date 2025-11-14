const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { exec } = require('child_process');
const path = require('path');
const readline = require('readline');
const os = require('os');

const TOR_PROXY_HOST = '127.0.0.1';
const TOR_PROXY_PORT = 9150;

const RESULTS_DIR = path.join(__dirname, 'results');
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function findTorBrowserPath() {
    const platform = os.platform();
    const possiblePaths = [];

    if (platform === 'win32') {
        const drives = ['C:', 'D:', 'E:'];
        const locations = [
            '\\Users\\' + os.userInfo().username + '\\Desktop\\Tor Browser\\Browser\\firefox.exe',
            '\\Program Files\\Tor Browser\\Browser\\firefox.exe',
            '\\Program Files (x86)\\Tor Browser\\Browser\\firefox.exe',
            '\\Tor Browser\\Browser\\firefox.exe',
        ];

        drives.forEach((drive) => {
            locations.forEach((loc) => {
                possiblePaths.push(drive + loc);
            });
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

    throw new Error('Tor Browser not found. Please install it or specify path manually.');
}

async function startTorBrowser() {
    return new Promise((resolve, reject) => {
        try {
            const torPath = findTorBrowserPath();
            console.log('Starting Tor Browser...');

            const torProcess = exec(`"${torPath}"`, (error) => {
                if (error && error.code !== 0) {
                    console.error('Tor Browser launch error:', error);
                }
            });

            setTimeout(() => {
                console.log('Tor Browser started, waiting for connection...');
                resolve(torProcess);
            }, 8000);
        } catch (error) {
            reject(error);
        }
    });
}

async function checkTorConnection() {
    try {
        const agent = new SocksProxyAgent(`socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`);

        console.log('Checking Tor connection...');
        const response = await axios.get('https://check.torproject.org/api/ip', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000,
        });

        if (response.data && response.data.IsTor === true) {
            console.log('Tor connection established!');
            console.log(`IP: ${response.data.IP}`);
            return true;
        } else {
            console.log('Tor connection failed.');
            return false;
        }
    } catch (error) {
        console.error('Tor connection check error:', error.message);
        return false;
    }
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9а-яё\-_]/gi, '_');
}

async function parseOffer(page, offerId) {
    const results = {
        link: `https://funpay.com/en/lots/offer?id=${offerId}`,
        title: '',
        description: '',
        price: '',
    };

    try {
        const url = `https://funpay.com/en/lots/offer?id=${offerId}`;
        console.log(`\n=== Parsing: ${url} ===`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
            const selectExists = await page.$('select');
            if (selectExists) {
                await page.select(
                    'select',
                    await page.evaluate(() => {
                        const select = document.querySelector('select');
                        const options = select.querySelectorAll('option');
                        for (let opt of options) {
                            if (opt.value && opt.value !== '') {
                                return opt.value;
                            }
                        }
                        return '';
                    })
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        } catch (e) {}

        const data = await page.evaluate(() => {
            const data = {
                title: '',
                description: '',
                price: '',
            };

            const paramItems = document.querySelectorAll('.param-item');
            paramItems.forEach((item) => {
                const h5 = item.querySelector('h5');
                const div = item.querySelector('div');

                if (h5 && div) {
                    const titleText = h5.textContent.trim().toLowerCase();
                    const content = div.textContent.trim();

                    if (titleText.includes('short description')) {
                        if (!data.title) data.title = content;
                    } else if (titleText.includes('range')) {
                        if (!data.title) data.title = content;
                    } else if (
                        titleText.includes('detailed description') ||
                        titleText.includes('full description')
                    ) {
                        data.description = content;
                    }
                }
            });

            const allElements = document.querySelectorAll('*');
            for (let el of allElements) {
                const text = el.textContent.trim();
                if (text.match(/^(от|from)\s+[\d.,]+\s*[₽€$]/i)) {
                    data.price = text;
                    break;
                }
            }

            return data;
        });

        results.title = data.title;
        results.description = data.description.replace(/\s+/g, ' ').trim();
        results.price = data.price;

        if (results.price) {
            const priceMatch = results.price.match(/[\d.,]+\s*[₽€$]/);
            if (priceMatch) {
                results.price = priceMatch[0];
            }
        }

        console.log('Title:', results.title.substring(0, 50));
        console.log('Description:', results.description.substring(0, 50));
        console.log('Price:', results.price);
    } catch (error) {
        console.error(`Error parsing offer ${offerId}:`, error.message);
        results.error = error.message;
    }

    return results;
}

async function parseFunpay(url, categoryFilter = null) {
    let browser = null;
    let torProcess = null;

    try {
        torProcess = await startTorBrowser();

        const isTorConnected = await checkTorConnection();
        if (!isTorConnected) {
            throw new Error('Failed to establish Tor connection');
        }

        console.log('Launching browser with Tor proxy...');
        browser = await puppeteer.launch({
            headless: false,
            args: [
                `--proxy-server=socks5://${TOR_PROXY_HOST}:${TOR_PROXY_PORT}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
            ],
        });

        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        console.log(`Loading profile: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        console.log('Page loaded. Collecting offer IDs...');
        const offerData = await page.evaluate((filter) => {
            const data = {
                offerIds: [],
                availableCategories: [],
            };

            const offerBlocks = document.querySelectorAll('.offer');

            offerBlocks.forEach((block) => {
                const titleElement = block.querySelector('.offer-list-title h3 a');
                if (!titleElement) return;

                const categoryName = titleElement.textContent.trim();
                data.availableCategories.push(categoryName);

                if (filter && !categoryName.toLowerCase().includes(filter.toLowerCase())) {
                    return;
                }

                const offerItems = block.querySelectorAll('.tc-item');
                offerItems.forEach((item) => {
                    const href = item.getAttribute('href') || '';
                    const match = href.match(/id=(\d+)/);
                    if (match) {
                        data.offerIds.push(match[1]);
                    }
                });
            });

            return data;
        }, categoryFilter);

        if (categoryFilter) {
            console.log(`\nAvailable categories: ${offerData.availableCategories.join(', ')}`);
            console.log(`Filter applied: "${categoryFilter}"`);
        }

        if (offerData.offerIds.length === 0) {
            console.log('\nNo offers found with this filter!');
            if (categoryFilter) {
                console.log(`Available categories: ${offerData.availableCategories.join(', ')}`);
            }
            return {
                success: false,
                error: 'No offers found',
                availableCategories: offerData.availableCategories,
            };
        }

        console.log(`Found ${offerData.offerIds.length} offers. Starting parsing...`);

        const parsedOffers = [];

        for (let i = 0; i < offerData.offerIds.length; i++) {
            console.log(
                `\nProcessing offer ${i + 1}/${offerData.offerIds.length} (ID: ${
                    offerData.offerIds[i]
                })`
            );
            const offerDataParsed = await parseOffer(page, offerData.offerIds[i]);
            parsedOffers.push(offerDataParsed);

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const category = categoryFilter ? sanitizeFilename(categoryFilter) : 'all';

        const jsonFilePath = path.join(RESULTS_DIR, `Parser_${category}_EN_${timestamp}.json`);

        console.log(`\nParsing complete. Saving to ${jsonFilePath}...`);
        fs.writeFileSync(jsonFilePath, JSON.stringify(parsedOffers, null, 2));
        console.log(`Data saved to ${jsonFilePath}`);

        const latestJsonPath = path.join(RESULTS_DIR, 'latest_en.json');
        fs.writeFileSync(latestJsonPath, JSON.stringify(parsedOffers, null, 2));
        console.log(`Latest copy saved to ${latestJsonPath}`);

        return {
            success: true,
            filePath: jsonFilePath,
            offersCount: parsedOffers.length,
        };
    } catch (error) {
        console.error('Script error:', error);
        return {
            success: false,
            error: error.message,
        };
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }

        if (torProcess) {
            torProcess.kill();
            console.log('Tor Browser closed.');
        }
    }
}

function promptForUrl() {
    rl.question('Enter FunPay profile URL (or "exit" to quit): ', async (url) => {
        if (url.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        if (
            !url.startsWith('https://funpay.com/users/') &&
            !url.startsWith('https://funpay.com/en/users/')
        ) {
            console.log(
                'Error: URL must start with "https://funpay.com/users/" or "https://funpay.com/en/users/"'
            );
            promptForUrl();
            return;
        }

        const normalizedUrl = url.replace(
            'https://funpay.com/users/',
            'https://funpay.com/en/users/'
        );

        rl.question(
            'Enter category filter (e.g., "Dota 2", or press Enter for all): ',
            async (category) => {
                const categoryFilter = category.trim() || null;

                console.log(`Starting profile parsing: ${normalizedUrl}`);
                if (categoryFilter) {
                    console.log(`Category filter: ${categoryFilter}`);
                }

                const result = await parseFunpay(normalizedUrl, categoryFilter);

                if (result.success) {
                    console.log('Parsing completed successfully!');
                    console.log(`JSON file: ${result.filePath}`);
                    console.log(`Offers parsed: ${result.offersCount}`);
                } else {
                    console.log(`Parsing error: ${result.error}`);
                    if (result.availableCategories && result.availableCategories.length > 0) {
                        console.log(`\nAvailable categories on this profile:`);
                        result.availableCategories.forEach((cat) => console.log(`  - ${cat}`));
                    }
                }

                rl.question('Continue parsing another profile? (y/n): ', (answer) => {
                    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                        promptForUrl();
                    } else {
                        rl.close();
                    }
                });
            }
        );
    });
}

console.log('=== FunPay Parser EN by 13reath ===');
console.log('Results will be saved to:', RESULTS_DIR);
promptForUrl();

rl.on('close', () => {
    console.log('Program terminated.');
    process.exit(0);
});
    