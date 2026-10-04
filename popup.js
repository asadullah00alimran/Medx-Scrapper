// Medex BD Medicine Scraper - Popup Logic

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const skipRestBtn = document.getElementById('skipRestBtn');
  const scrapedCount = document.getElementById('scrapedCount');
  const skippedCount = document.getElementById('skippedCount');
  const currentIdDisplay = document.getElementById('currentIdDisplay');
  const progressPct = document.getElementById('progressPct');

  const startIdInput = document.getElementById('startId');
  const endIdInput = document.getElementById('endId');
  const delayMsInput = document.getElementById('delayMs');
  const enableJitterInput = document.getElementById('enableJitter');
  const enableCooldownInput = document.getElementById('enableCooldown');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');

  const exportMedicinesBtn = document.getElementById('exportMedicinesBtn');
  const exportSkippedBtn = document.getElementById('exportSkippedBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');

  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const launchDashboardFooter = document.getElementById('launchDashboardFooter');

  let currentState = null;

  // Render State to UI
  function renderState(state) {
    if (!state) return;
    currentState = state;

    scrapedCount.textContent = (state.scrapedCount || 0).toLocaleString();
    skippedCount.textContent = (state.skippedCount || 0).toLocaleString();
    currentIdDisplay.textContent = state.currentId || 1;
    progressPct.textContent = `Target: ${state.endId || 40000}`;

    if (document.activeElement !== endIdInput && state.endId !== undefined) {
      endIdInput.value = state.endId;
    }
    if (document.activeElement !== startIdInput && !state.isRunning && !state.isPaused) {
      startIdInput.value = state.currentId || state.startId || 1;
    }
    if (document.activeElement !== delayMsInput && !state.isRunning) {
      delayMsInput.value = state.delayMs || 1800;
    }
    if (!state.isRunning && !state.isPaused) {
      if (state.enableJitter !== undefined) enableJitterInput.checked = state.enableJitter;
      if (state.enableCooldown !== undefined) enableCooldownInput.checked = state.enableCooldown;
    }

    // Status Banner class & text
    statusBanner.className = 'status-banner';
    skipRestBtn.classList.add('hidden');

    if (state.isCoolingDown) {
      statusBanner.classList.add('status-cooldown');
      statusText.textContent = `🧘 Rest: ${state.cooldownRemaining}s remaining...`;
      skipRestBtn.classList.remove('hidden');
    } else if (state.isRunning) {
      statusBanner.classList.add('status-running');
      statusText.textContent = state.statusMessage || `Scraping ID ${state.currentId}...`;
    } else if (state.isPaused) {
      if (state.statusMessage && state.statusMessage.toLowerCase().includes('captcha')) {
        statusBanner.classList.add('status-captcha');
      } else {
        statusBanner.classList.add('status-paused');
      }
      statusText.textContent = state.statusMessage || 'Paused';
    } else {
      statusBanner.classList.add('status-idle');
      statusText.textContent = state.statusMessage || 'Ready to start';
    }

    // Buttons - End ID is always editable at any time!
    endIdInput.disabled = false;

    if (state.isRunning || state.isCoolingDown) {
      startBtn.disabled = true;
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="9"/>
        </svg>
        <span>Running...</span>
      `;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      startIdInput.disabled = true;
      delayMsInput.disabled = true;
      enableJitterInput.disabled = true;
      enableCooldownInput.disabled = true;
    } else if (state.isPaused) {
      startBtn.disabled = false;
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Resume</span>
      `;
      pauseBtn.disabled = true;
      stopBtn.disabled = false;
      startIdInput.disabled = false;
      delayMsInput.disabled = false;
      enableJitterInput.disabled = false;
      enableCooldownInput.disabled = false;
    } else {
      startBtn.disabled = false;
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Start Scraping</span>
      `;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      startIdInput.disabled = false;
      delayMsInput.disabled = false;
      enableJitterInput.disabled = false;
      enableCooldownInput.disabled = false;
    }
  }

  // Live End ID change listener in popup
  endIdInput.addEventListener('input', () => {
    const val = parseInt(endIdInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', endId: val });
      progressPct.textContent = `Target: ${val}`;
    }
  });

  // Live Start ID change listener in popup
  startIdInput.addEventListener('input', () => {
    const val = parseInt(startIdInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', startId: val });
    }
  });

  // Request state from background
  function fetchState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (response && response.state) {
        renderState(response.state);
      }
    });
  }

  // Listen for broadcast updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) {
      renderState(message.state);
    }
  });

  // Skip rest button
  skipRestBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SKIP_COOLDOWN' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Start / Resume Click
  startBtn.addEventListener('click', () => {
    const startId = parseInt(startIdInput.value, 10) || 1;
    const endId = parseInt(endIdInput.value, 10) || 40000;
    const delayMs = parseInt(delayMsInput.value, 10) || 1800;
    const enableJitter = enableJitterInput.checked;
    const enableCooldown = enableCooldownInput.checked;

    if (currentState && currentState.isPaused) {
      chrome.runtime.sendMessage({
        type: 'RESUME_SCRAPER',
        options: { currentId: startId, endId, delayMs, enableJitter, enableCooldown }
      }, (resp) => {
        if (resp && resp.state) renderState(resp.state);
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'START_SCRAPER',
        options: { startId, currentId: startId, endId, delayMs, enableJitter, enableCooldown }
      }, (resp) => {
        if (resp && resp.state) renderState(resp.state);
      });
    }
  });

  // Pause Click
  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_SCRAPER' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Stop Click
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_SCRAPER' }, (resp) => {
      if (resp && resp.state) renderState(resp.state);
    });
  });

  // Export Medicines CSV
  exportMedicinesBtn.addEventListener('click', () => {
    exportMedicinesBtn.disabled = true;
    exportMedicinesBtn.textContent = 'Generating...';

    chrome.runtime.sendMessage({ type: 'EXPORT_CSV', exportType: 'medicines' }, (resp) => {
      exportMedicinesBtn.disabled = false;
      exportMedicinesBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Medicines CSV</span>
      `;
      if (resp && !resp.success) {
        alert(resp.error || 'Failed to export CSV. No data found?');
      }
    });
  });

  // Export Skipped CSV
  exportSkippedBtn.addEventListener('click', () => {
    exportSkippedBtn.disabled = true;
    exportSkippedBtn.textContent = 'Generating...';

    chrome.runtime.sendMessage({ type: 'EXPORT_CSV', exportType: 'skipped' }, (resp) => {
      exportSkippedBtn.disabled = false;
      exportSkippedBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Skipped IDs CSV</span>
      `;
      if (resp && !resp.success) {
        alert(resp.error || 'Failed to export Skipped CSV. No data found?');
      }
    });
  });

  // Clear database
  clearDataBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all scraped and skipped records from the database? This cannot be undone.')) {
      chrome.runtime.sendMessage({ type: 'RESET_DATABASE' }, (resp) => {
        if (resp && resp.success) {
          fetchState();
        }
      });
    }
  });

  // Open Full Dashboard
  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  };

  openDashboardBtn.addEventListener('click', openDashboard);
  launchDashboardFooter.addEventListener('click', openDashboard);

  // Initial state fetch
  fetchState();
  setInterval(fetchState, 1000);
});
