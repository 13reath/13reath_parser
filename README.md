# FunPay Parser for /en/ links

Anonymous FunPay profile parser with Tor support. Extracts offer data in English.

---

## 📥 How to Download from GitHub

### Method 1: Download ZIP (easiest)

1. Go to the project page: `https://github.com/13reath/funpay-parser`
2. Click the green **Code** button (top right)
3. Select **Download ZIP**
4. Extract the archive to any folder

### Method 2: Using Git

```bash
git clone https://github.com/YOUR_USERNAME/funpay-parser.git
cd funpay-parser
```

---

## 🔧 Installation

### Step 1: Install Node.js

1. Download from: https://nodejs.org/
2. Get the **LTS version** (recommended)
3. Install with default settings
4. Verify installation:
    ```bash
    node -v
    ```
    You should see a version number (e.g., `v20.10.0`)

### Step 2: Install Tor Browser

1. Download from: https://www.torproject.org/download/
2. Install Tor Browser
3. The parser will automatically find it in common locations

### Step 3: Install Dependencies

1. Open the project folder
2. In the address bar type `cmd` and press Enter (Windows) or open Terminal (Mac/Linux)
3. Run:
    ```bash
    npm install
    ```
4. Wait for installation (2-5 minutes)

---

## 🚀 Usage

### Quick Start

1. **Launch Tor Browser** (required!)

    - Open Tor Browser
    - Wait for Tor network connection
    - You can minimize it, but DON'T CLOSE

2. **Run the parser:**

    ```bash
    node parser.js
    ```

3. **Follow the prompts:**

    ```
    Enter FunPay profile URL: https://funpay.com/users/12132677/
    Enter category filter (e.g., "Dota 2", or press Enter for all): Dota 2
    ```

4. **Wait for results**
    - Parser will open automated browser
    - Collect data from all offers
    - Save results to `results/` folder

---

## 📁 Output Files

Results are saved in the `results/` folder:

```
results/
├── Parser_Dota_2_EN_2025-11-14.json  ← Timestamped result
└── latest_en.json                     ← Latest result (overwritten)
```

### JSON Structure

```json
[
    {
        "link": "https://funpay.com/en/lots/offer?id=12345",
        "title": "Dota 2 Account Calibration",
        "description": "Account calibration from 11500mmr 90%+ winrate. Reliability and anonymity guaranteed...",
        "price": "17.55 €"
    },
    {
        "link": "https://funpay.com/en/lots/offer?id=12346",
        "title": "MMR Boost 1000-7000",
        "description": "Professional MMR boosting service...",
        "price": "25.00 €"
    }
]
```

---

## 🎯 Features

-   ✅ **Anonymous Parsing** - Uses Tor network for privacy
-   ✅ **Category Filter** - Parse specific game categories
-   ✅ **Auto Tor Detection** - Finds Tor Browser automatically
-   ✅ **Clean Output** - Structured JSON format
-   ✅ **Fast** - Optimized 500ms delays
-   ✅ **Cross-platform** - Works on Windows, Mac, Linux

---

## ❓ FAQ

### Parser won't start

**Problem:** `node: command not found`

-   **Solution:** Install Node.js (see Step 1)

**Problem:** `Failed to establish Tor connection`

-   **Solution:** Launch Tor Browser and wait for connection

**Problem:** `Tor Browser not found`

-   **Solution:** Parser searches common locations. If not found, install Tor Browser properly.

### How does category filter work?

Filter by game name (case-insensitive, partial match):

-   `Dota 2` → only Dota 2 offers
-   `CS:GO` → only CS:GO offers
-   `dota` → anything containing "dota"
-   _(empty)_ → parse ALL offers

### Can I parse multiple profiles?

Yes! After parsing completes:

```
Continue parsing another profile? (y/n):
```

Type `y` for another profile, `n` to exit.

### Why do I need Tor?

Tor provides:

-   **Anonymity** - Hides your real IP address
-   **Privacy** - Encrypted connection
-   **Safety** - Prevents tracking

---

## 🛠️ Technical Details

**What the parser does:**

1. Connects to Tor network (SOCKS5 proxy on port 9150)
2. Opens FunPay profile page
3. Collects offer IDs from profile
4. For each offer:
    - Opens English version (`/en/lots/offer?id=...`)
    - Extracts title, description, price
    - Saves to JSON
5. Creates timestamped file + latest.json

**Technologies:**

-   **Node.js** - Runtime environment
-   **Puppeteer** - Browser automation
-   **Tor Browser** - Anonymization
-   **Axios** - HTTP requests
-   **SOCKS proxy** - Tor connection

**Parsing Logic:**

-   **Title**: "Short Description" or "Range" field
-   **Description**: "Detailed Description" field
-   **Price**: First price found (format: `17.55 €`)

---

## 📝 File Structure

```
funpay-parser/
├── parser_en.js          # Main parser script
├── package.json          # Dependencies
├── README.md            # This file
├── node_modules/        # Installed packages (after npm install)
└── results/             # Output folder (auto-created)
    ├── Parser_category_EN_date.json
    └── latest_en.json
```

---

## 💡 Usage Examples

### Parse all offers from a profile:

```bash
node parser_en.js
# URL: https://funpay.com/users/12132677/
# Category: (press Enter)
```

### Parse only Dota 2 offers:

```bash
node parser_en.js
# URL: https://funpay.com/users/12132677/
# Category: Dota 2
```

### Parse from EN URL (auto-normalizes):

```bash
node parser_en.js
# URL: https://funpay.com/en/users/12132677/
# Category: (works fine!)
```

---

## 🔒 Privacy & Legal

**Privacy:**

-   Parser uses Tor for anonymous access
-   No data is stored except parsed results
-   Your IP is hidden from FunPay

**Legal:**

-   Parser only collects **public** information
-   No authentication required
-   Respects FunPay's public data
-   For personal use only

**Disclaimer:**
This tool is for educational purposes. Use responsibly and respect FunPay's terms of service.

---

## 🐛 Troubleshooting

### "ECONNREFUSED" error

-   **Cause:** Tor Browser not running or not connected
-   **Fix:** Launch Tor Browser and wait for "Connected to Tor" message

### Parsing stops halfway

-   **Cause:** Network timeout or Tor connection lost
-   **Fix:** Restart Tor Browser and run parser again

### Empty results

-   **Cause:** Wrong category filter or no offers found
-   **Fix:** Check available categories in console output

### "Cannot find module" error

-   **Cause:** Dependencies not installed
-   **Fix:** Run `npm install` in project folder

---

## 📊 Performance

-   **Speed:** ~2-3 seconds per offer (including 500ms delay)
-   **Memory:** ~100-150 MB RAM usage
-   **Network:** Depends on Tor connection speed
-   **Tor overhead:** ~2x slower than direct connection

**Example timing for 50 offers:**

-   Connection: 10 seconds
-   Parsing: ~2 minutes
-   Total: ~2.5 minutes

---

## 🔄 Updates

**v1.0.0** (Current)

-   Initial release
-   English version parsing
-   Tor integration
-   Category filtering
-   Auto Tor detection

---

## 📧 Support

If you have issues:

1. Check Tor Browser is running
2. Verify Node.js is installed (`node -v`)
3. Reinstall dependencies: `npm install`
4. Check console output for errors

---

## 📜 License

MIT License

**Author:** 13reath

**Made with ❤️ for the community**

---

## 🙏 Acknowledgments

-   Tor Project for anonymization
-   Puppeteer team for browser automation
-   FunPay for the platform

---

## 🚀 Quick Command Reference

```bash
# Install dependencies
npm install

# Run parser
node parser_en.js

# Check Node.js version
node -v

# View results
cat results/latest_en.json

# On Windows (view results)
type results\latest_en.json
```

---

**Happy parsing! 🎮**
