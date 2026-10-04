// Medex BD Medicine Scraper - Background Service Worker

const DB_NAME = 'MedexScraperDB';
const DB_VERSION = 1;

let dbInstance = null;

// Open IndexedDB
function getDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('medicines')) {
        const medStore = db.createObjectStore('medicines', { keyPath: 'id' });
        medStore.createIndex('generic_name', 'generic_name', { unique: false });
        medStore.createIndex('manufacturer', 'manufacturer', { unique: false });
      }
      if (!db.objectStoreNames.contains('skipped')) {
        db.createObjectStore('skipped', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// Database helper functions
async function saveMedicine(medicine) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medicines', 'readwrite');
    const store = tx.objectStore('medicines');
    store.put(medicine);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSkipped(skippedItem) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('skipped', 'readwrite');
    const store = tx.objectStore('skipped');
    store.put(skippedItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getCounts() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medicines', 'skipped'], 'readonly');
    const medReq = tx.objectStore('medicines').count();
    const skipReq = tx.objectStore('skipped').count();

    tx.oncomplete = () => {
      resolve({
        scrapedCount: medReq.result || 0,
        skippedCount: skipReq.result || 0
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearDatabase() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medicines', 'skipped'], 'readwrite');
    tx.objectStore('medicines').clear();
    tx.objectStore('skipped').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Scraper Runtime Controller State with Smart Anti-Detection
let state = {
  isRunning: false,
  isPaused: false,
  currentId: 1,
  startId: 1,
  endId: 40000,
  delayMs: 1800, // Safe default delay
  enableJitter: true, // Human-like random variation (+400ms to 1200ms)
  enableCooldown: true, // Auto-rest to prevent rate limits
  cooldownEvery: 150, // Rest every 150 items
  cooldownSeconds: 45, // Rest duration in seconds
  autoRetryOnCaptcha: true, // Auto-backoff and retry if challenge appears
  itemsSinceCooldown: 0,
  isCoolingDown: false,
  cooldownRemaining: 0,
  scrapedCount: 0,
  skippedCount: 0,
  statusMessage: 'Ready to start',
  lastActionTime: Date.now(),
  tabId: null,
  recentMedicines: [],
  recentSkipped: []
};

let pageTimeoutTimer = null;
let cooldownInterval = null;
let captchaRetryCount = 0;

// Initialize state from storage
async function initState() {
  const stored = await chrome.storage.local.get(['scraperState']);
  if (stored.scraperState) {
    state = { ...state, ...stored.scraperState, isRunning: false, isPaused: false, isCoolingDown: false };
  }
  try {
    const counts = await getCounts();
    state.scrapedCount = counts.scrapedCount;
    state.skippedCount = counts.skippedCount;
  } catch (err) {
    console.error('Error fetching initial counts:', err);
  }
  syncState();
}

initState();

function syncState() {
  chrome.storage.local.set({ scraperState: state }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state }).catch(() => {});
}

// Scrape Loop Flow
async function startScraping(options = {}) {
  if (options.startId !== undefined) state.startId = parseInt(options.startId, 10);
  if (options.endId !== undefined) state.endId = parseInt(options.endId, 10);
  if (options.delayMs !== undefined) state.delayMs = parseInt(options.delayMs, 10);
  if (options.enableJitter !== undefined) state.enableJitter = !!options.enableJitter;
  if (options.enableCooldown !== undefined) state.enableCooldown = !!options.enableCooldown;
  if (options.cooldownEvery !== undefined) state.cooldownEvery = parseInt(options.cooldownEvery, 10) || 150;
  if (options.cooldownSeconds !== undefined) state.cooldownSeconds = parseInt(options.cooldownSeconds, 10) || 45;
  if (options.autoRetryOnCaptcha !== undefined) state.autoRetryOnCaptcha = !!options.autoRetryOnCaptcha;

  if (options.currentId !== undefined) {
    state.currentId = parseInt(options.currentId, 10);
  } else if (!state.isPaused && state.startId) {
    state.currentId = state.startId;
  }

  state.isRunning = true;
  state.isPaused = false;
  state.isCoolingDown = false;
  clearInterval(cooldownInterval);
  state.statusMessage = `Navigating to Brand ID: ${state.currentId}...`;
  syncState();

  await navigateToNextId();
}

function pauseScraping(reason = 'Paused by user') {
  state.isRunning = false;
  state.isPaused = true;
  state.isCoolingDown = false;
  clearInterval(cooldownInterval);
  state.statusMessage = reason;
  clearTimeout(pageTimeoutTimer);
  syncState();
}

function stopScraping() {
  state.isRunning = false;
  state.isPaused = false;
  state.isCoolingDown = false;
  clearInterval(cooldownInterval);
  state.statusMessage = 'Stopped';
  clearTimeout(pageTimeoutTimer);
  syncState();
}

// Compute calculated humanized delay
function getNextDelay() {
  let delay = state.delayMs || 1800;
  if (state.enableJitter) {
    // Add random human variation (e.g. +300ms to 1100ms)
    const jitter = Math.floor(Math.random() * 800) + 300;
    delay += jitter;
  }
  return delay;
}

// Smart Cooldown Manager
function triggerCooldown(callback) {
  state.isCoolingDown = true;
  state.cooldownRemaining = state.cooldownSeconds || 45;
  state.itemsSinceCooldown = 0;
  clearInterval(cooldownInterval);

  state.statusMessage = `🧘 Smart Rest: Cooling down for ${state.cooldownRemaining}s (protecting IP session from bot detection)...`;
  syncState();

  cooldownInterval = setInterval(() => {
    state.cooldownRemaining -= 1;
    if (state.cooldownRemaining <= 0) {
      clearInterval(cooldownInterval);
      state.isCoolingDown = false;
      state.statusMessage = `Rest completed! Resuming traversal from ID ${state.currentId}...`;
      syncState();
      callback();
    } else {
      state.statusMessage = `🧘 Smart Rest: Cooling down for ${state.cooldownRemaining}s...`;
      syncState();
    }
  }, 1000);
}

function skipCooldown() {
  if (state.isCoolingDown) {
    clearInterval(cooldownInterval);
    state.isCoolingDown = false;
    state.cooldownRemaining = 0;
    state.statusMessage = `Rest skipped by user. Resuming ID ${state.currentId}...`;
    syncState();
    navigateToNextId();
  }
}

async function ensureScraperTab() {
  if (state.tabId) {
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (tab) return state.tabId;
    } catch {
      state.tabId = null;
    }
  }

  const existingTabs = await chrome.tabs.query({ url: '*://medex.com.bd/*' });
  if (existingTabs.length > 0) {
    state.tabId = existingTabs[0].id;
    return state.tabId;
  }

  const newTab = await chrome.tabs.create({
    url: `https://medex.com.bd/brands/${state.currentId}`,
    active: false
  });
  state.tabId = newTab.id;
  return state.tabId;
}

async function navigateToNextId() {
  if (!state.isRunning || state.isPaused || state.isCoolingDown) return;

  if (state.currentId > state.endId) {
    state.isRunning = false;
    state.statusMessage = `Scraping Completed! (Reached ID ${state.endId})`;
    syncState();
    return;
  }

  const targetUrl = `https://medex.com.bd/brands/${state.currentId}`;
  state.statusMessage = `Loading Brand ID: ${state.currentId}...`;
  syncState();

  try {
    const tabId = await ensureScraperTab();
    clearTimeout(pageTimeoutTimer);

    // 16-second timeout watchdog
    pageTimeoutTimer = setTimeout(async () => {
      if (state.isRunning && !state.isPaused && !state.isCoolingDown) {
        console.warn(`Timeout waiting for Brand ID ${state.currentId}`);
        await handleScrapeResult({
          status: 'skipped',
          id: state.currentId,
          url: targetUrl,
          reason: 'Timeout / Page did not respond in 16 seconds'
        });
      }
    }, 16000);

    await chrome.tabs.update(tabId, { url: targetUrl });
  } catch (err) {
    console.error('Error navigating tab:', err);
    state.statusMessage = `Error navigating to ID ${state.currentId}: ${err.message}`;
    syncState();
  }
}

async function handleScrapeResult(result) {
  clearTimeout(pageTimeoutTimer);
  if (!state.isRunning || state.isCoolingDown) return;

  const currentId = state.currentId;

  // Handle Captcha
  if (result.status === 'captcha') {
    if (state.autoRetryOnCaptcha && captchaRetryCount < 2) {
      captchaRetryCount += 1;
      // Auto-cool off for 35s when challenged to let rate-limit window reset
      state.statusMessage = `⚠️ Rate check detected on ID ${currentId}. Resting for 35s before auto-retry (Attempt ${captchaRetryCount}/2)...`;
      syncState();

      triggerCooldown(() => {
        navigateToNextId(); // Retry current ID
      });
      return;
    } else {
      captchaRetryCount = 0;
      pauseScraping('Captcha challenge encountered! Please open the Medex tab, solve the captcha, then click Resume.');
      if (state.tabId) {
        chrome.tabs.update(state.tabId, { active: true }).catch(() => {});
      }
      return;
    }
  }

  captchaRetryCount = 0; // Reset retry counter on normal response

  if (result.status === 'success' && result.data) {
    const med = { ...result.data, id: currentId };
    await saveMedicine(med);
    state.scrapedCount += 1;
    state.recentMedicines.unshift({
      id: med.id,
      name: med.brand_name || 'N/A',
      generic: med.generic_name || 'N/A',
      manufacturer: med.manufacturer || 'N/A',
      time: new Date().toLocaleTimeString()
    });
    if (state.recentMedicines.length > 10) state.recentMedicines.pop();
    state.statusMessage = `Scraped ID ${currentId}: ${med.brand_name || 'Success'}`;
  } else {
    // Skipped
    const skippedRecord = {
      id: currentId,
      url: result.url || `https://medex.com.bd/brands/${currentId}`,
      reason: result.reason || 'Missing or Invalid ID',
      timestamp: new Date().toISOString()
    };
    await saveSkipped(skippedRecord);
    state.skippedCount += 1;
    state.recentSkipped.unshift({
      id: currentId,
      reason: skippedRecord.reason,
      time: new Date().toLocaleTimeString()
    });
    if (state.recentSkipped.length > 10) state.recentSkipped.pop();
    state.statusMessage = `Skipped ID ${currentId} (${skippedRecord.reason})`;
  }

  // Count towards batch cooldown
  state.itemsSinceCooldown += 1;
  state.currentId += 1;
  syncState();

  if (state.currentId > state.endId) {
    state.isRunning = false;
    state.statusMessage = `Finished scraping all IDs up to ${state.endId}!`;
    syncState();
    return;
  }

  // Check if we should trigger batch rest period
  if (state.enableCooldown && state.itemsSinceCooldown >= state.cooldownEvery) {
    triggerCooldown(() => {
      navigateToNextId();
    });
  } else {
    const delay = getNextDelay();
    setTimeout(() => {
      navigateToNextId();
    }, delay);
  }
}

// Convert Array of Objects to CSV String
function arrayToCSV(items, headers) {
  if (!items || items.length === 0) return '';
  const headerKeys = headers.map(h => h.key);
  const headerLabels = headers.map(h => h.label);

  const csvRows = [];
  csvRows.push(headerLabels.map(escapeCSVValue).join(','));

  for (const item of items) {
    const row = headerKeys.map(key => escapeCSVValue(item[key] !== undefined && item[key] !== null ? item[key] : ''));
    csvRows.push(row.join(','));
  }

  // Add UTF-8 BOM
  return '\uFEFF' + csvRows.join('\r\n');
}

function escapeCSVValue(val) {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Download CSV helper
async function exportCSV(type) {
  if (type === 'medicines') {
    const medicines = await getAllRecords('medicines');
    if (medicines.length === 0) {
      throw new Error('No scraped medicine records found to export.');
    }

    const headers = [
      { key: 'id', label: 'Medicine ID' },
      { key: 'brand_name', label: 'Brand Name' },
      { key: 'dosage_form', label: 'Dosage Form' },
      { key: 'generic_name', label: 'Generic Name' },
      { key: 'strength', label: 'Strength' },
      { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'unit_price', label: 'Unit Price (BDT)' },
      { key: 'strip_price', label: 'Strip Price (BDT)' },
      { key: 'pack_size_info', label: 'Pack Size' },
      { key: 'availability', label: 'Availability' },
      { key: 'indications', label: 'Indications' },
      { key: 'pharmacology', label: 'Pharmacology' },
      { key: 'dosage_administration', label: 'Dosage & Administration' },
      { key: 'interaction', label: 'Interaction' },
      { key: 'contraindications', label: 'Contraindications' },
      { key: 'side_effects', label: 'Side Effects' },
      { key: 'pregnancy_lactation', label: 'Pregnancy & Lactation' },
      { key: 'precautions', label: 'Precautions' },
      { key: 'overdose_effects', label: 'Overdose Effects' },
      { key: 'therapeutic_class', label: 'Therapeutic Class' },
      { key: 'storage_conditions', label: 'Storage Conditions' },
      { key: 'generic_url', label: 'Generic URL' },
      { key: 'manufacturer_url', label: 'Manufacturer URL' },
      { key: 'url', label: 'Source URL' },
      { key: 'scraped_at', label: 'Scraped At' }
    ];

    const csvContent = arrayToCSV(medicines, headers);
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const dateStr = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
      url: dataUri,
      filename: `medex_medicines_${dateStr}.csv`,
      saveAs: true
    });
  } else if (type === 'skipped') {
    const skipped = await getAllRecords('skipped');
    if (skipped.length === 0) {
      throw new Error('No skipped ID records found to export.');
    }

    const headers = [
      { key: 'id', label: 'Skipped ID' },
      { key: 'url', label: 'Attempted URL' },
      { key: 'reason', label: 'Skip Reason' },
      { key: 'timestamp', label: 'Timestamp' }
    ];

    const csvContent = arrayToCSV(skipped, headers);
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const dateStr = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
      url: dataUri,
      filename: `medex_skipped_ids_${dateStr}.csv`,
      saveAs: true
    });
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE_STATUS') {
    handleScrapeResult(message);
    sendResponse({ received: true });
    return true;
  }

  if (message.type === 'START_SCRAPER') {
    startScraping(message.options)
      .then(() => sendResponse({ success: true, state }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'PAUSE_SCRAPER') {
    pauseScraping('Paused by user');
    sendResponse({ success: true, state });
    return true;
  }

  if (message.type === 'SKIP_COOLDOWN') {
    skipCooldown();
    sendResponse({ success: true, state });
    return true;
  }

  if (message.type === 'RESUME_SCRAPER') {
    state.isPaused = false;
    state.isCoolingDown = false;
    startScraping({ currentId: state.currentId })
      .then(() => sendResponse({ success: true, state }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'STOP_SCRAPER') {
    stopScraping();
    sendResponse({ success: true, state });
    return true;
  }

  if (message.type === 'RESET_DATABASE') {
    stopScraping();
    clearDatabase().then(() => {
      state.scrapedCount = 0;
      state.skippedCount = 0;
      state.itemsSinceCooldown = 0;
      state.recentMedicines = [];
      state.recentSkipped = [];
      state.statusMessage = 'Database cleared and scraper reset';
      syncState();
      sendResponse({ success: true });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'UPDATE_CONFIG') {
    if (message.endId !== undefined && !isNaN(message.endId)) state.endId = parseInt(message.endId, 10);
    if (message.startId !== undefined && !isNaN(message.startId)) state.startId = parseInt(message.startId, 10);
    if (message.delayMs !== undefined && !isNaN(message.delayMs)) state.delayMs = parseInt(message.delayMs, 10);
    if (message.enableJitter !== undefined) state.enableJitter = !!message.enableJitter;
    if (message.enableCooldown !== undefined) state.enableCooldown = !!message.enableCooldown;
    syncState();
    sendResponse({ success: true, state });
    return true;
  }

  if (message.type === 'GET_STATE') {
    getCounts().then(counts => {
      state.scrapedCount = counts.scrapedCount;
      state.skippedCount = counts.skippedCount;
      sendResponse({ success: true, state });
    }).catch(() => sendResponse({ success: true, state }));
    return true;
  }

  if (message.type === 'EXPORT_CSV') {
    exportCSV(message.exportType)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    sendResponse({ success: true });
    return true;
  }
});
