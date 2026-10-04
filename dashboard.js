// Medex BD Medicine Harvester - Dashboard Logic

let cachedMedicines = [];
let cachedSkipped = [];
let currentState = null;

document.addEventListener('DOMContentLoaded', () => {
  // Elements - Header & Status
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  const liveStatusText = document.getElementById('liveStatusText');
  const topMedCount = document.getElementById('topMedCount');
  const topSkipCount = document.getElementById('topSkipCount');
  const tabMedCount = document.getElementById('tabMedCount');
  const tabSkipCount = document.getElementById('tabSkipCount');
  const exportMedTopBtn = document.getElementById('exportMedTopBtn');
  const exportSkipTopBtn = document.getElementById('exportSkipTopBtn');

  // Controls
  const dashStartId = document.getElementById('dashStartId');
  const dashEndId = document.getElementById('dashEndId');
  const dashDelayMs = document.getElementById('dashDelayMs');
  const dashDelaySlider = document.getElementById('dashDelaySlider');
  const dashEnableJitter = document.getElementById('dashEnableJitter');
  const dashEnableCooldown = document.getElementById('dashEnableCooldown');
  const dashCooldownSeconds = document.getElementById('dashCooldownSeconds');
  const dashCooldownEvery = document.getElementById('dashCooldownEvery');
  const dashAutoRetryCaptcha = document.getElementById('dashAutoRetryCaptcha');
  const dashCooldownBanner = document.getElementById('dashCooldownBanner');
  const dashCooldownCounter = document.getElementById('dashCooldownCounter');
  const dashSkipRestBtn = document.getElementById('dashSkipRestBtn');

  const dashStartBtn = document.getElementById('dashStartBtn');
  const dashPauseBtn = document.getElementById('dashPauseBtn');
  const dashStopBtn = document.getElementById('dashStopBtn');
  const dashResetDbBtn = document.getElementById('dashResetDbBtn');
  const startBtnLabel = document.getElementById('startBtnLabel');

  // Metrics
  const dashScrapedVal = document.getElementById('dashScrapedVal');
  const dashSkippedVal = document.getElementById('dashSkippedVal');
  const progressText = document.getElementById('progressText');
  const progressBarFill = document.getElementById('progressBarFill');
  const dashCurrentId = document.getElementById('dashCurrentId');
  const currentTargetLink = document.getElementById('currentTargetLink');

  // Logs
  const logStream = document.getElementById('logStream');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  // Tables & Search
  const medSearchInput = document.getElementById('medSearchInput');
  const skipSearchInput = document.getElementById('skipSearchInput');
  const medicinesTableBody = document.getElementById('medicinesTableBody');
  const skippedTableBody = document.getElementById('skippedTableBody');
  const refreshTableBtn = document.getElementById('refreshTableBtn');
  const refreshSkipTableBtn = document.getElementById('refreshSkipTableBtn');
  const exportMedTableBtn = document.getElementById('exportMedTableBtn');
  const exportSkipTableBtn = document.getElementById('exportSkipTableBtn');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Modal
  const detailModal = document.getElementById('detailModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalBrandTitle = document.getElementById('modalBrandTitle');
  const modalBodyContent = document.getElementById('modalBodyContent');

  // Sync Delay Slider with Number Input
  dashDelaySlider.addEventListener('input', () => {
    dashDelayMs.value = dashDelaySlider.value;
  });
  dashDelayMs.addEventListener('input', () => {
    dashDelaySlider.value = dashDelayMs.value;
  });

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (targetId === 'tabMedicines') loadMedicinesData();
      if (targetId === 'tabSkipped') loadSkippedData();
    });
  });

  // Log helper
  function addLog(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timeStr = new Date().toLocaleTimeString();
    entry.textContent = `[${timeStr}] ${text}`;
    logStream.appendChild(entry);
    logStream.scrollTop = logStream.scrollHeight;
  }

  clearLogsBtn.addEventListener('click', () => {
    logStream.innerHTML = '';
  });

  // State Render
  function renderState(state) {
    if (!state) return;
    currentState = state;

    dashScrapedVal.textContent = (state.scrapedCount || 0).toLocaleString();
    dashSkippedVal.textContent = (state.skippedCount || 0).toLocaleString();
    topMedCount.textContent = (state.scrapedCount || 0).toLocaleString();
    topSkipCount.textContent = (state.skippedCount || 0).toLocaleString();
    tabMedCount.textContent = (state.scrapedCount || 0).toLocaleString();
    tabSkipCount.textContent = (state.skippedCount || 0).toLocaleString();

    dashCurrentId.textContent = state.currentId || 1;
    const url = `https://medex.com.bd/brands/${state.currentId || 1}`;
    currentTargetLink.href = url;
    currentTargetLink.textContent = url;

    // Progress Bar
    const start = state.startId || 1;
    const end = state.endId || 40000;
    const cur = state.currentId || 1;
    const totalSpan = Math.max(1, end - start);
    const progressSpan = Math.max(0, cur - start);
    const pct = Math.min(100, Math.round((progressSpan / totalSpan) * 100));
    progressText.textContent = `${pct}% (ID ${cur} of ${end})`;
    progressBarFill.style.width = `${pct}%`;

    // Sync input values from state only if user is not actively typing/focused
    if (document.activeElement !== dashEndId && state.endId !== undefined) {
      dashEndId.value = state.endId;
    }
    if (document.activeElement !== dashStartId && !state.isRunning && !state.isPaused) {
      dashStartId.value = state.currentId || state.startId || 1;
    }
    if (document.activeElement !== dashDelayMs && !state.isRunning) {
      dashDelayMs.value = state.delayMs || 1800;
      dashDelaySlider.value = state.delayMs || 1800;
    }

    // Cooldown Banner & Status Pill
    liveStatusBadge.className = 'status-pill';

    if (state.isCoolingDown) {
      liveStatusBadge.classList.add('status-paused');
      liveStatusText.textContent = `🧘 Rest in progress (${state.cooldownRemaining}s)`;
      dashCooldownBanner.classList.remove('hidden');
      dashCooldownCounter.textContent = `${state.cooldownRemaining}s remaining (protecting IP session from bot detection)...`;
    } else {
      dashCooldownBanner.classList.add('hidden');
      if (state.isRunning) {
        liveStatusBadge.classList.add('status-running');
        liveStatusText.textContent = state.statusMessage || `Scraping ID ${cur}...`;
      } else if (state.isPaused) {
        if (state.statusMessage && state.statusMessage.toLowerCase().includes('captcha')) {
          liveStatusBadge.classList.add('status-captcha');
        } else {
          liveStatusBadge.classList.add('status-paused');
        }
        liveStatusText.textContent = state.statusMessage || 'Paused';
      } else {
        liveStatusBadge.classList.add('status-idle');
        liveStatusText.textContent = state.statusMessage || 'Ready to start';
      }
    }

    // Button & Input states - End ID is always editable at any time!
    dashEndId.disabled = false;

    if (state.isRunning || state.isCoolingDown) {
      dashStartBtn.disabled = true;
      startBtnLabel.textContent = 'Running...';
      dashPauseBtn.disabled = false;
      dashStopBtn.disabled = false;
      dashStartId.disabled = true;
      dashDelayMs.disabled = true;
      dashDelaySlider.disabled = true;
      dashEnableJitter.disabled = true;
      dashEnableCooldown.disabled = true;
    } else if (state.isPaused) {
      dashStartBtn.disabled = false;
      startBtnLabel.textContent = 'Resume';
      dashPauseBtn.disabled = true;
      dashStopBtn.disabled = false;
      dashStartId.disabled = false;
      dashDelayMs.disabled = false;
      dashDelaySlider.disabled = false;
      dashEnableJitter.disabled = false;
      dashEnableCooldown.disabled = false;
    } else {
      dashStartBtn.disabled = false;
      startBtnLabel.textContent = 'Start Scraping';
      dashPauseBtn.disabled = true;
      dashStopBtn.disabled = true;
      dashStartId.disabled = false;
      dashDelayMs.disabled = false;
      dashDelaySlider.disabled = false;
      dashEnableJitter.disabled = false;
      dashEnableCooldown.disabled = false;
    }
  }

  // Live End ID change listener
  dashEndId.addEventListener('input', () => {
    const val = parseInt(dashEndId.value, 10);
    if (!isNaN(val) && val >= 1) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        endId: val
      });
      // Update progress bar immediately
      const start = (currentState && currentState.startId) || 1;
      const cur = (currentState && currentState.currentId) || 1;
      const totalSpan = Math.max(1, val - start);
      const progressSpan = Math.max(0, cur - start);
      const pct = Math.min(100, Math.round((progressSpan / totalSpan) * 100));
      progressText.textContent = `${pct}% (ID ${cur} of ${val})`;
      progressBarFill.style.width = `${pct}%`;
    }
  });

  // Live Start ID change listener
  dashStartId.addEventListener('input', () => {
    const val = parseInt(dashStartId.value, 10);
    if (!isNaN(val) && val >= 1) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        startId: val
      });
    }
  });

  // Skip rest in dashboard
  dashSkipRestBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SKIP_COOLDOWN' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Fetch state from background
  function fetchState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (resp) => {
      if (resp && resp.state) {
        renderState(resp.state);
      }
    });
  }

  // Background state broadcasts
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) {
      renderState(message.state);
      if (message.state.statusMessage) {
        const msg = message.state.statusMessage;
        if (msg.includes('Scraped')) addLog(msg, 'success');
        else if (msg.includes('Skipped')) addLog(msg, 'warning');
        else if (msg.includes('Rest')) addLog(msg, 'info');
        else if (msg.includes('Rate check') || msg.includes('Captcha')) addLog(msg, 'danger');
      }
    }
  });

  // Start / Resume button
  dashStartBtn.addEventListener('click', () => {
    const startId = parseInt(dashStartId.value, 10) || 1;
    const endId = parseInt(dashEndId.value, 10) || 40000;
    const delayMs = parseInt(dashDelayMs.value, 10) || 1800;
    const enableJitter = dashEnableJitter.checked;
    const enableCooldown = dashEnableCooldown.checked;
    const cooldownEvery = parseInt(dashCooldownEvery.value, 10) || 150;
    const cooldownSeconds = parseInt(dashCooldownSeconds.value, 10) || 45;
    const autoRetryOnCaptcha = dashAutoRetryCaptcha.checked;

    addLog(`Initiating traversal from ID ${startId} to ${endId} (Base Delay: ${delayMs}ms, Jitter: ${enableJitter ? 'ON' : 'OFF'}, Rest: ${enableCooldown ? `${cooldownSeconds}s/${cooldownEvery}` : 'OFF'})...`, 'info');

    if (currentState && currentState.isPaused) {
      chrome.runtime.sendMessage({
        type: 'RESUME_SCRAPER',
        options: { currentId: startId, endId, delayMs, enableJitter, enableCooldown, cooldownEvery, cooldownSeconds, autoRetryOnCaptcha }
      }, (resp) => {
        if (resp && resp.state) renderState(resp.state);
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'START_SCRAPER',
        options: { startId, currentId: startId, endId, delayMs, enableJitter, enableCooldown, cooldownEvery, cooldownSeconds, autoRetryOnCaptcha }
      }, (resp) => {
        if (resp && resp.state) renderState(resp.state);
      });
    }
  });

  // Pause
  dashPauseBtn.addEventListener('click', () => {
    addLog('Pausing scraper...', 'warning');
    chrome.runtime.sendMessage({ type: 'PAUSE_SCRAPER' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Stop
  dashStopBtn.addEventListener('click', () => {
    addLog('Stopping scraper.', 'danger');
    chrome.runtime.sendMessage({ type: 'STOP_SCRAPER' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Reset database
  dashResetDbBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to completely erase all scraped data and skipped logs?')) {
      chrome.runtime.sendMessage({ type: 'RESET_DATABASE' }, (resp) => {
        if (resp && resp.success) {
          addLog('Database completely cleared.', 'danger');
          cachedMedicines = [];
          cachedSkipped = [];
          renderMedicinesTable([]);
          renderSkippedTable([]);
          fetchState();
        }
      });
    }
  });

  // IndexedDB direct connection for fast UI table rendering
  function openDirectDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('MedexScraperDB', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Load scraped medicines from IndexedDB
  async function loadMedicinesData() {
    try {
      const db = await openDirectDB();
      const tx = db.transaction('medicines', 'readonly');
      const store = tx.objectStore('medicines');
      const req = store.getAll();

      req.onsuccess = () => {
        cachedMedicines = req.result || [];
        filterAndRenderMedicines();
      };
    } catch (err) {
      console.error('Failed to load medicines from DB:', err);
    }
  }

  // Load skipped IDs from IndexedDB
  async function loadSkippedData() {
    try {
      const db = await openDirectDB();
      const tx = db.transaction('skipped', 'readonly');
      const store = tx.objectStore('skipped');
      const req = store.getAll();

      req.onsuccess = () => {
        cachedSkipped = req.result || [];
        filterAndRenderSkipped();
      };
    } catch (err) {
      console.error('Failed to load skipped from DB:', err);
    }
  }

  // Filter medicines table
  function filterAndRenderMedicines() {
    const q = (medSearchInput.value || '').trim().toLowerCase();
    let list = cachedMedicines;
    if (q) {
      list = list.filter(m =>
        (m.brand_name && m.brand_name.toLowerCase().includes(q)) ||
        (m.generic_name && m.generic_name.toLowerCase().includes(q)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(q)) ||
        String(m.id).includes(q)
      );
    }
    renderMedicinesTable(list);
  }

  // Render medicines table
  function renderMedicinesTable(medicines) {
    if (!medicines || medicines.length === 0) {
      medicinesTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-state">No medicines found matching criteria.</td>
        </tr>
      `;
      return;
    }

    // Limit to latest 300 for crisp DOM performance if list is huge
    const displayList = medicines.slice(-300).reverse();

    medicinesTableBody.innerHTML = displayList.map(m => `
      <tr>
        <td><strong>#${m.id}</strong></td>
        <td><strong>${escapeHtml(m.brand_name || 'N/A')}</strong></td>
        <td><span class="badge badge-form">${escapeHtml(m.dosage_form || '-')}</span></td>
        <td>${escapeHtml(m.generic_name || '-')}</td>
        <td>${escapeHtml(m.strength || '-')}</td>
        <td>${escapeHtml(m.manufacturer || '-')}</td>
        <td>${m.unit_price ? '৳ ' + escapeHtml(m.unit_price) : '-'}</td>
        <td>${m.strip_price ? '৳ ' + escapeHtml(m.strip_price) : '-'}</td>
        <td><span class="badge ${m.availability && m.availability.includes('unavailable') ? 'badge-red' : 'badge-green'}">${escapeHtml(m.availability || 'Available')}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm view-med-btn" data-id="${m.id}">Details</button>
        </td>
      </tr>
    `).join('');

    // Attach click handlers to view details
    medicinesTableBody.querySelectorAll('.view-med-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const item = cachedMedicines.find(x => x.id === id);
        if (item) showMedicineModal(item);
      });
    });
  }

  // Filter skipped table
  function filterAndRenderSkipped() {
    const q = (skipSearchInput.value || '').trim().toLowerCase();
    let list = cachedSkipped;
    if (q) {
      list = list.filter(s =>
        String(s.id).includes(q) ||
        (s.reason && s.reason.toLowerCase().includes(q))
      );
    }
    renderSkippedTable(list);
  }

  // Render skipped table
  function renderSkippedTable(skippedList) {
    if (!skippedList || skippedList.length === 0) {
      skippedTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">No skipped records.</td>
        </tr>
      `;
      return;
    }

    const displayList = skippedList.slice(-300).reverse();

    skippedTableBody.innerHTML = displayList.map(s => `
      <tr>
        <td><strong style="color: #fbbf24;">ID #${s.id}</strong></td>
        <td><a href="${s.url}" target="_blank" class="url-truncate">${escapeHtml(s.url)}</a></td>
        <td><span class="badge badge-red">${escapeHtml(s.reason || 'Skipped')}</span></td>
        <td>${s.timestamp ? new Date(s.timestamp).toLocaleString() : '-'}</td>
      </tr>
    `).join('');
  }

  // Modal Details
  function showMedicineModal(med) {
    modalBrandTitle.textContent = `${med.brand_name || 'Medicine'} (${med.strength || ''} ${med.dosage_form || ''})`;

    const sections = [
      { title: 'Overview', text: `Generic: ${med.generic_name || 'N/A'} | Manufacturer: ${med.manufacturer || 'N/A'} | Unit Price: ৳ ${med.unit_price || 'N/A'} | Strip: ৳ ${med.strip_price || 'N/A'} | Pack Info: ${med.pack_size_info || 'N/A'}` },
      { title: 'Indications', text: med.indications },
      { title: 'Pharmacology', text: med.pharmacology },
      { title: 'Dosage & Administration', text: med.dosage_administration },
      { title: 'Interaction', text: med.interaction },
      { title: 'Contraindications', text: med.contraindications },
      { title: 'Side Effects', text: med.side_effects },
      { title: 'Pregnancy & Lactation', text: med.pregnancy_lactation },
      { title: 'Precautions & Warnings', text: med.precautions },
      { title: 'Overdose Effects', text: med.overdose_effects },
      { title: 'Therapeutic Class', text: med.therapeutic_class },
      { title: 'Storage Conditions', text: med.storage_conditions },
      { title: 'Live Source URL', text: med.url }
    ];

    modalBodyContent.innerHTML = sections.map(sec => `
      <div class="detail-section">
        <h4>${sec.title}</h4>
        <p>${sec.text ? escapeHtml(sec.text) : '<em>None specified</em>'}</p>
      </div>
    `).join('');

    detailModal.classList.remove('hidden');
  }

  modalCloseBtn.addEventListener('click', () => detailModal.classList.add('hidden'));
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) detailModal.classList.add('hidden');
  });

  // Search input listeners
  medSearchInput.addEventListener('input', filterAndRenderMedicines);
  skipSearchInput.addEventListener('input', filterAndRenderSkipped);
  refreshTableBtn.addEventListener('click', loadMedicinesData);
  refreshSkipTableBtn.addEventListener('click', loadSkippedData);

  // Export handlers
  function triggerExport(type) {
    chrome.runtime.sendMessage({ type: 'EXPORT_CSV', exportType: type }, (resp) => {
      if (resp && !resp.success) {
        alert(resp.error || 'Failed to export CSV.');
      } else {
        addLog(`Exported ${type} CSV successfully.`, 'success');
      }
    });
  }

  exportMedTopBtn.addEventListener('click', () => triggerExport('medicines'));
  exportMedTableBtn.addEventListener('click', () => triggerExport('medicines'));
  exportSkipTopBtn.addEventListener('click', () => triggerExport('skipped'));
  exportSkipTableBtn.addEventListener('click', () => triggerExport('skipped'));

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Periodic polling
  fetchState();
  loadMedicinesData();
  setInterval(() => {
    fetchState();
    // Periodically refresh active table if scraper is running
    if (currentState && currentState.isRunning) {
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) {
        const id = activeTab.getAttribute('data-tab');
        if (id === 'tabMedicines') loadMedicinesData();
        if (id === 'tabSkipped') loadSkippedData();
      }
    }
  }, 2000);
});
