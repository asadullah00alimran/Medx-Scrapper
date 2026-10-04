// Medex BD Medicine Scraper - Content Script with Human Interaction Simulation

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractSectionText(selector) {
  const elem = document.querySelector(selector);
  if (!elem) return '';
  return cleanText(elem.innerText || elem.textContent);
}

function isCaptchaPage() {
  const title = (document.title || '').toLowerCase();
  const url = window.location.href.toLowerCase();
  const bodyText = (document.body ? document.body.innerText : '').toLowerCase();

  return (
    url.includes('/captcha-challenge') ||
    url.includes('/security-check') ||
    title.includes('security check') ||
    title.includes('just a moment') ||
    title.includes('attention required') ||
    bodyText.includes('verify you are human') ||
    bodyText.includes('checking your browser') ||
    bodyText.includes('enable javascript and cookies')
  );
}

function isBrandPage() {
  const url = window.location.href;
  const brandElem = document.querySelector('h1.page-heading-1-l.brand, .brand-header, h1.brand');
  const genericElem = document.querySelector('div[title="Generic Name"]');

  const isBrandUrl = /\/brands\/\d+/.test(url);
  return isBrandUrl && (brandElem !== null || genericElem !== null);
}

// Simulate human presence before extracting data
function simulateHumanActivity() {
  try {
    // Subtle realistic scroll
    const scrollAmount = Math.floor(Math.random() * 250) + 100;
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });

    // Subtle synthetic mouse movement
    const evt = new MouseEvent('mousemove', {
      clientX: Math.floor(Math.random() * 300) + 100,
      clientY: Math.floor(Math.random() * 300) + 100,
      bubbles: true
    });
    document.dispatchEvent(evt);
  } catch (e) {
    // Non-critical
  }
}

function extractMedicineData() {
  const url = window.location.href;
  const idMatch = url.match(/\/brands\/(\d+)/);
  const brandId = idMatch ? parseInt(idMatch[1], 10) : null;

  // 1. Brand name
  let brandName = '';
  const brandElem = document.querySelector('h1.page-heading-1-l.brand, h1.brand');
  if (brandElem) {
    const clone = brandElem.cloneNode(true);
    clone.querySelectorAll('small, span, .h1-subtitle').forEach(el => el.remove());
    brandName = cleanText(clone.textContent);
  }

  // 2. Dosage Form
  let dosageForm = '';
  const dosageSubtitle = document.querySelector('.h1-subtitle');
  const dosageIcon = document.querySelector('.dosage-icon');
  if (dosageSubtitle) {
    dosageForm = cleanText(dosageSubtitle.textContent);
  } else if (dosageIcon) {
    dosageForm = dosageIcon.getAttribute('title') || dosageIcon.getAttribute('alt') || '';
  }

  // 3. Generic Name & Link
  let genericName = '';
  let genericUrl = '';
  const genericLink = document.querySelector('div[title="Generic Name"] a');
  if (genericLink) {
    genericName = cleanText(genericLink.textContent);
    genericUrl = genericLink.href || '';
  }

  // 4. Strength
  let strength = '';
  const strengthElem = document.querySelector('div[title="Strength"]');
  if (strengthElem) {
    strength = cleanText(strengthElem.textContent);
  }

  // 5. Manufacturer & Link
  let manufacturer = '';
  let manufacturerUrl = '';
  const manufacturerLink = document.querySelector('div[title="Manufactured by"] a');
  if (manufacturerLink) {
    manufacturer = cleanText(manufacturerLink.textContent);
    manufacturerUrl = manufacturerLink.href || '';
  }

  // 6. Pricing & Packaging
  let unitPrice = '';
  let stripPrice = '';
  let packSizeInfo = '';

  const pkgContainer = document.querySelector('.package-container, .packages-wrapper');
  if (pkgContainer) {
    const unitPriceMatches = pkgContainer.innerText.match(/Unit Price:\s*(?:৳|Tk\.?|BDT)?\s*([0-9.,]+)/i);
    if (unitPriceMatches) {
      unitPrice = unitPriceMatches[1].trim();
    }

    const stripPriceMatches = pkgContainer.innerText.match(/Strip Price:\s*(?:৳|Tk\.?|BDT)?\s*([0-9.,]+)/i);
    if (stripPriceMatches) {
      stripPrice = stripPriceMatches[1].trim();
    }

    const packSizeElem = pkgContainer.querySelector('.pack-size-info');
    if (packSizeElem) {
      packSizeInfo = cleanText(packSizeElem.textContent);
    }
  }

  // 7. Availability
  let availability = 'Available';
  const flagElem = document.querySelector('.sp-flag');
  if (flagElem) {
    availability = cleanText(flagElem.textContent);
  }

  // 8. Medical Details & Sections
  const indications = extractSectionText('#indications + .ac-body, #indications ~ .ac-body');
  const pharmacology = extractSectionText('#mode_of_action + .ac-body, #mode_of_action ~ .ac-body');
  const dosageAdministration = extractSectionText('#dosage + .ac-body, #dosage ~ .ac-body');
  const interaction = extractSectionText('#interaction + .ac-body, #interaction ~ .ac-body');
  const contraindications = extractSectionText('#contraindications + .ac-body, #contraindications ~ .ac-body');
  const sideEffects = extractSectionText('#side_effects + .ac-body, #side_effects ~ .ac-body');
  const pregnancyLactation = extractSectionText('#pregnancy_cat + .ac-body, #pregnancy_cat ~ .ac-body');
  const precautions = extractSectionText('#precautions + .ac-body, #precautions ~ .ac-body');
  const overdoseEffects = extractSectionText('#overdose_effects + .ac-body, #overdose_effects ~ .ac-body');
  const therapeuticClass = extractSectionText('#drug_classes + .ac-body, #drug_classes ~ .ac-body');
  const storageConditions = extractSectionText('#storage_conditions + .ac-body, #storage_conditions ~ .ac-body');

  return {
    id: brandId,
    brand_name: brandName,
    dosage_form: dosageForm,
    generic_name: genericName,
    generic_url: genericUrl,
    strength: strength,
    manufacturer: manufacturer,
    manufacturer_url: manufacturerUrl,
    unit_price: unitPrice,
    strip_price: stripPrice,
    pack_size_info: packSizeInfo,
    availability: availability,
    indications: indications,
    pharmacology: pharmacology,
    dosage_administration: dosageAdministration,
    interaction: interaction,
    contraindications: contraindications,
    side_effects: sideEffects,
    pregnancy_lactation: pregnancyLactation,
    precautions: precautions,
    overdose_effects: overdoseEffects,
    therapeutic_class: therapeuticClass,
    storage_conditions: storageConditions,
    url: url,
    scraped_at: new Date().toISOString()
  };
}

// Function to inspect page and send report to background
function checkAndReportPage() {
  if (isCaptchaPage()) {
    chrome.runtime.sendMessage({
      type: 'SCRAPE_PAGE_STATUS',
      status: 'captcha',
      url: window.location.href,
      message: 'Cloudflare / Captcha security check detected.'
    }).catch(() => {});
    return;
  }

  const url = window.location.href;
  const idMatch = url.match(/\/brands\/(\d+)/);
  const brandId = idMatch ? parseInt(idMatch[1], 10) : null;

  if (!isBrandPage()) {
    chrome.runtime.sendMessage({
      type: 'SCRAPE_PAGE_STATUS',
      status: 'skipped',
      id: brandId,
      url: url,
      reason: 'Brand page not found or missing brand elements (404/redirect)'
    }).catch(() => {});
    return;
  }

  // Simulate human activity first
  simulateHumanActivity();

  // Short random delay (250-450ms) to ensure DOM elements have painted
  const randomDelay = Math.floor(Math.random() * 200) + 250;
  setTimeout(() => {
    const data = extractMedicineData();
    chrome.runtime.sendMessage({
      type: 'SCRAPE_PAGE_STATUS',
      status: 'success',
      id: data.id || brandId,
      data: data
    }).catch(() => {});
  }, randomDelay);
}

// Listen for direct extraction requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_PAGE_NOW') {
    if (isCaptchaPage()) {
      sendResponse({ status: 'captcha', message: 'Captcha detected' });
    } else if (!isBrandPage()) {
      sendResponse({ status: 'skipped', reason: 'Not a valid brand page' });
    } else {
      sendResponse({ status: 'success', data: extractMedicineData() });
    }
  }
  return true;
});

// Run with humanized offset
setTimeout(checkAndReportPage, 500);
