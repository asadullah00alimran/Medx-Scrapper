# Medex BD Medicine Scraper (Chrome Extension)

A powerful, resilient, and automated Google Chrome / Chromium extension (Manifest V3) designed to sequentially scrape medicine data from [Medex Bangladesh](https://medex.com.bd) (`https://medex.com.bd/brands/<id>`).

It traverses medicine IDs incrementally (e.g., from ID `1` up to `40000+`), automatically detects and skips missing/404 pages without halting, prevents bot-detection through humanized jitter and smart batch cooling, and exports the data into two separate, properly formatted UTF-8 CSV files.

---

## 🌟 Key Highlights

- **Sequential ID Traversal**: Traverses dynamic brand URLs starting from your chosen **Start ID** up to your **End ID**.
- **Missing / 404 ID Auto-Skipper**: Non-existent or deleted medicine IDs are automatically logged into `medex_skipped_ids.csv` with status reasons and timestamp, while the scraper advances smoothly to the next ID.
- **Smart Anti-Detection (Prevents CAPTCHA)**:
  - **Random Jitter**: Introduces realistic human-like random delays (`+300ms to 1100ms`) on top of the base delay to bypass rate-limit patterns.
  - **Batch Auto-Rest**: Automatically pauses for a configurable cooldown period (e.g., 45s rest every 150 requests) to protect your IP reputation.
  - **Human Activity Simulation**: Injects smooth scrolling and synthetic mouse movement before parsing the DOM.
  - **Auto-Backoff & Retry**: If a Cloudflare challenge occurs, the scraper auto-rests for 35 seconds before retrying the ID automatically.
- **Persistent IndexedDB Storage**: Scraped medicines and skipped records are saved continuously into local browser IndexedDB. Zero data loss even if the browser crashes, computer restarts, or tabs are closed.
- **Dual UTF-8 CSV Export**:
  - `medex_medicines_[date].csv`: Full 25-column dataset with UTF-8 BOM encoding (opens cleanly in Microsoft Excel, Google Sheets, LibreOffice without broken Bengali characters).
  - `medex_skipped_ids_[date].csv`: Full log of missing or skipped IDs.
- **Dedicated Live Tab Dashboard**: In addition to the quick-access extension popup, features a full-screen interactive dashboard (`dashboard.html`) with real-time logs, live searchable tables, detail preview modals, and on-the-fly configuration.

---

## 📦 Installation & Setup Guide

### 1. Clone the Repository

Open your terminal or command prompt (Git Bash, PowerShell, or macOS Terminal) and clone the repository:

```bash
git clone https://github.com/your-username/medx-scraper.git
cd medx-scraper
```

*(Optional)* If you want to regenerate the extension PNG icons locally:
```bash
node generate_icons.js
```

---

### 2. Load the Extension into Your Browser

This extension works on any Chromium-based browser: **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, or **Vivaldi**.

#### For Google Chrome / Brave:
1. Open Google Chrome and enter `chrome://extensions/` in the URL address bar.
2. In the top right corner, switch on **"Developer mode"**.
3. Click the **"Load unpacked"** button in the top left corner.
4. Browse to and select the cloned `medx-scraper` folder (e.g., `E:\Laravel\medx-scraper`).
5. The extension **"Medex BD Medicine Scraper"** is now loaded and ready!

#### For Microsoft Edge:
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. In the left sidebar, turn on **"Developer mode"**.
3. Click **"Load unpacked"**.
4. Select the `medx-scraper` directory.

---

## 🚀 How to Use

### Method A: Quick Extension Popup
1. Click the **puzzle piece icon** (🧩) on your browser's toolbar and pin **Medex BD Scraper**.
2. Click the Medex icon to open the popup.
3. Configure your scraping parameters:
   - **Start ID**: The initial ID to scrape from (e.g., `1`).
   - **End ID**: The target upper limit (e.g., `500`, `25000`, `40000`). *Can be adjusted anytime on-the-fly!*
   - **Base Delay**: Recommended `1800ms - 2500ms`.
   - **Human Random Delay (+Jitter)**: Check to add random variation between requests.
   - **Batch Rest**: Check to enable auto-rest (default 45s rest every 150 items).
4. Click **Start Scraping**.
5. The extension will automatically open a controlled Medex tab and begin traversal.
6. Click **Pause**, **Resume**, or **Stop** whenever needed.
7. Click **Medicines CSV** or **Skipped IDs CSV** to download your files.

---

### Method B: Full Live Dashboard (Recommended for Large Batches)
For large-scale scraping (thousands of items), open the full-screen Dashboard:
1. In the popup, click the **Dashboard icon** (top right) or the **"Live Dashboard Tab"** link at the bottom.
2. Or directly bookmark: `chrome-extension://<EXTENSION_ID>/dashboard.html`
3. **Dashboard Capabilities**:
   - **Live Progress & Metrics**: Track processed counts, current speed, and real-time progress percentage bar.
   - **Activity Log Console**: Color-coded live stream showing each scraped medicine, skipped ID, and cooldown countdown.
   - **Searchable Medicine Table**: Filter scraped products in real-time by Brand Name, Generic Name, or Manufacturer.
   - **Product Detail Modal**: Click "Details" on any row to inspect all 12+ medical sections in a modal dialog.
   - **Skipped Table**: Inspect every non-existent ID along with the HTTP/404 reason.
   - **Instant CSV Downloads**: Export both CSVs with record counters directly from the navbar.

---

## 📊 CSV Export Schema & Fields

### 1. `medex_medicines_[date].csv` (Scraped Medicines)

| # | Column Header | Description | Example Value |
|---|---|---|---|
| 1 | `id` | Medicine ID | `32410` |
| 2 | `brand_name` | Commercial brand name | `Tizabet` |
| 3 | `dosage_form` | Formulation type | `Capsule` / `Tablet` / `Syrup` |
| 4 | `generic_name` | Active pharmaceutical generic name | `Fenofibrate` |
| 5 | `strength` | Dosage strength | `200 mg` |
| 6 | `manufacturer` | Manufacturing pharmaceutical company | `ACI Limited` |
| 7 | `unit_price` | Single unit price in BDT | `7.02` |
| 8 | `strip_price` | Full strip price in BDT | `70.20` |
| 9 | `pack_size_info` | Packaging breakdown | `(3 x 10: ৳ 210.60)` |
| 10 | `availability` | Market availability status | `Available` / `This medicine is unavailable` |
| 11 | `indications` | Approved therapeutic indications | `Hyperlipidemias of type lla, llb...` |
| 12 | `pharmacology` | Mechanism of action & pharmacokinetics | `Fenofibrate is rapidly hydrolyzed...` |
| 13 | `dosage_administration` | Administration guide & dosages | `Initial dose is 200 mg per day...` |
| 14 | `interaction` | Drug-drug interactions | `Potentiates effects of warfarin...` |
| 15 | `contraindications` | Conditions where medicine must be avoided | `Severe renal or hepatic impairment...` |
| 16 | `side_effects` | Documented adverse reactions | `Gastro-intestinal, nausea, headache...` |
| 17 | `pregnancy_lactation` | Safety during pregnancy and breastfeeding | `Not recommended for pregnant women` |
| 18 | `precautions` | Clinical warnings & lab monitoring | `Special care needed in renal disease...` |
| 19 | `overdose_effects` | Overdose symptoms and management | `General supportive care indicated...` |
| 20 | `therapeutic_class` | Pharmacological therapeutic classification | `Fibrates` |
| 21 | `storage_conditions` | Recommended storage temperature & light | `Do not store above 30°C. Keep away from light` |
| 22 | `generic_url` | Medex URL for the generic | `https://medex.com.bd/generics/454/fenofibrate` |
| 23 | `manufacturer_url` | Medex URL for the manufacturer | `https://medex.com.bd/companies/2/aci-limited/brands` |
| 24 | `url` | Full canonical medicine URL | `https://medex.com.bd/brands/32410/tizabet-200-mg-capsule` |
| 25 | `scraped_at` | Timestamp of extraction | `2026-10-04T07:18:00.000Z` |

---

### 2. `medex_skipped_ids_[date].csv` (Missing / Skipped IDs)

| # | Column Header | Description |
|---|---|---|
| 1 | `id` | The medicine ID that was skipped |
| 2 | `url` | The URL attempted (`https://medex.com.bd/brands/<id>`) |
| 3 | `reason` | Cause of skip (`Brand page not found or missing brand elements (404/redirect)`, `Timeout`, etc.) |
| 4 | `timestamp` | Time when the skip was logged |

---

## 🗂 Project Structure

```
medx-scraper/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js         # Service worker, queue orchestrator, IndexedDB manager & CSV generator
├── content.js            # Page DOM parser, human interaction simulation & CAPTCHA detector
├── popup.html            # Extension popup layout
├── popup.css             # Modern dark-theme popup styles
├── popup.js              # Popup user interaction controller
├── dashboard.html        # Full-screen live control dashboard
├── dashboard.css         # Dashboard styles with responsive tables & modals
├── dashboard.js          # Dashboard controller, live search, and detail modal viewer
├── generate_icons.js     # Script to generate extension PNG icons (16x16, 48x48, 128x128)
├── icons/                # Extension icon assets
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # Complete documentation and setup manual
```

---

## 💡 Best Practices for Reliable Scraping

1. **Keep Default Delays**: Medex implements Cloudflare rate-limiting. A base delay of `1800ms - 2500ms` with **Human Jitter enabled** delivers consistent scraping without rate-limit challenges.
2. **Keep Batch Rest Enabled**: The default setting (45-second rest every 150 requests) resets the server's rolling window and protects against IP bans.
3. **Use the Dashboard Tab**: Unlike popups which close when clicking outside, keeping `dashboard.html` open ensures the browser won't throttle or disrupt your scraping session.
4. **Export in Batches**: You can click **Export CSV** at any point during scraping to download progress without stopping the scraper.

---

## ⚖️ License & Disclaimer

This tool is created for educational and personal research purposes only. Please respect the website's terms of service, server load, and privacy policy.
