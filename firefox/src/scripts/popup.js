/* ───────────────────────────────────────────────
   TouchLock – Popup Script
   ─────────────────────────────────────────────── */

const PROMO_URL    = 'https://raw.githubusercontent.com/mathinraj/mathinraj/main/promotions/promos.json';
const SELF_ID      = 'touchlock';
const RATE_ITEM_ID = '__rate__';
const REMIND_DAYS  = 2;
const IDLE_SNOOZE_MS = 60 * 60 * 1000;

const REVIEW_URLS = {
  chrome:  'https://chromewebstore.google.com/detail/jajgeiifpgdfnphjklcogipefkfdacdl/reviews',
  edge:    'https://microsoftedge.microsoft.com/addons/detail/aibbojojoeamjgikgailflpbhdpcjgln',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/reviews/'
};

const STORE_URLS = {
  chrome:  'https://chromewebstore.google.com/detail/jajgeiifpgdfnphjklcogipefkfdacdl',
  edge:    'https://microsoftedge.microsoft.com/addons/detail/aibbojojoeamjgikgailflpbhdpcjgln',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/'
};

function getReviewUrl() {
  return REVIEW_URLS[TOUCHLOCK_STORE] || 'https://touchlock.vercel.app/rate.html';
}

function getStoreUrl() {
  return STORE_URLS[TOUCHLOCK_STORE] || 'https://touchlock.vercel.app/#install';
}

document.addEventListener('DOMContentLoaded', async () => {
  const badge       = document.getElementById('status-badge');
  const setupNeeded = document.getElementById('setup-needed');
  const actions     = document.getElementById('actions');
  const btnLock     = document.getElementById('btn-lock');
  const btnSetup    = document.getElementById('btn-setup');
  const btnSettings = document.getElementById('btn-settings');
  const btnWhatsNew = document.getElementById('btn-whats-new');

  chrome.runtime.sendMessage({ action: 'popupOpened' }, () => void chrome.runtime.lastError);

  chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      badge.querySelector('.label').textContent = 'Error';
      return;
    }

    if (!res.setupComplete) {
      badge.querySelector('.label').textContent = 'Not configured';
      setupNeeded.classList.remove('hidden');
      return;
    }

    if (res.isLocked) {
      badge.classList.add('locked');
      badge.querySelector('.label').textContent = 'Locked';
      actions.classList.remove('hidden');
      btnLock.disabled = true;
      btnLock.style.opacity = '0.5';
    } else {
      badge.classList.add('unlocked');
      badge.querySelector('.label').textContent = 'Unlocked';
      actions.classList.remove('hidden');
      initSiteCard();
      initIdleCard();
    }
  });

  btnLock.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'lock' }, () => window.close());
  });

  btnSetup.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };
  btnSettings.addEventListener('click', openSettings);
  document.getElementById('btn-settings-icon').addEventListener('click', openSettings);

  btnWhatsNew.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/whats-new.html') });
    window.close();
  });

  document.getElementById('btn-rate-now').addEventListener('click', async () => {
    await chrome.storage.local.set({ rated: true });
    chrome.tabs.create({ url: getReviewUrl() });
    window.close();
  });

  document.getElementById('btn-rate-later').addEventListener('click', async () => {
    const remindAt = Date.now() + (REMIND_DAYS * 24 * 60 * 60 * 1000);
    await chrome.storage.local.set({ remindRateAfter: remindAt });
    document.getElementById('rate-prompt').classList.add('hidden');
  });

  document.getElementById('btn-update').addEventListener('click', () => {
    chrome.tabs.create({ url: getStoreUrl() });
    window.close();
  });

  await showUpdateBanner();
  loadBanner();
});

async function initSiteCard() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab && normalizeSiteHost(toHttpUrl(tab.url) || '');
  if (!host) return;

  const card    = document.getElementById('site-card');
  const hostEl  = document.getElementById('site-card-host');
  const stateEl = document.getElementById('site-card-state');
  const btn     = document.getElementById('btn-site-action');

  const { lockedSites, siteLockSettings } = await chrome.storage.local.get(['lockedSites', 'siteLockSettings']);
  const sites = Array.isArray(lockedSites) ? lockedSites : [];
  const settings = getSiteLockSettings(siteLockSettings);
  const site = findLockedSite(sites, tab.url, settings.includeSubdomains);

  card.classList.remove('hidden');
  document.getElementById('btn-settings').classList.add('hidden');
  document.getElementById('btn-settings-icon').classList.remove('hidden');

  if (!site) {
    hostEl.textContent = host;
    stateEl.textContent = 'Not locked';
    btn.innerHTML = 'Lock this site <span class="pro-badge">PRO</span>';
    btn.addEventListener('click', async () => {
      if (sites.length >= MAX_LOCKED_SITES) {
        stateEl.textContent = `Limit of ${MAX_LOCKED_SITES} sites reached`;
        return;
      }
      await chrome.storage.local.set({ lockedSites: [...sites, createSiteEntry(sites, host)] });
      window.close();
    });
    return;
  }

  hostEl.textContent = site.host;
  const grants = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSiteGrants' }, (res) => {
      resolve((!chrome.runtime.lastError && res && res.grants) || {});
    });
  });

  if (grants[site.id]) {
    stateEl.textContent = 'Unlocked for now';
    stateEl.classList.add('unlocked');
    btn.textContent = 'Lock now';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'relockSite', siteId: site.id }, () => window.close());
    });
  } else {
    stateEl.textContent = 'Locked';
    btn.classList.add('hidden');
  }
}

async function initIdleCard() {
  const { idleLockEnabled } = await chrome.storage.local.get('idleLockEnabled');
  if (!idleLockEnabled) return;

  const card    = document.getElementById('idle-card');
  const stateEl = document.getElementById('idle-card-state');
  const btn     = document.getElementById('btn-idle-snooze');

  btn.addEventListener('click', async () => {
    const { idleSnoozeUntil } = await chrome.storage.local.get('idleSnoozeUntil');
    if (idleSnoozeUntil > Date.now()) {
      await chrome.storage.local.remove('idleSnoozeUntil');
    } else {
      await chrome.storage.local.set({ idleSnoozeUntil: Date.now() + IDLE_SNOOZE_MS });
    }
    render();
  });

  async function render() {
    const { idleLockTimeout, idleSnoozeUntil } =
      await chrome.storage.local.get(['idleLockTimeout', 'idleSnoozeUntil']);
    if (idleSnoozeUntil > Date.now()) {
      const until = new Date(idleSnoozeUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      stateEl.textContent = `Paused until ${until}`;
      stateEl.classList.add('unlocked');
      btn.textContent = 'Resume';
    } else {
      const mins = Math.floor((idleLockTimeout || 300) / 60);
      stateEl.textContent = `Locks after ${mins >= 60 ? '1 hour' : `${mins} min`} idle`;
      stateEl.classList.remove('unlocked');
      btn.textContent = 'Pause 1 hour';
    }
    card.classList.remove('hidden');
  }

  render();
}

async function showUpdateBanner() {
  const { updateAvailable, latestVersion } = await chrome.storage.local.get(['updateAvailable', 'latestVersion']);
  if (!updateAvailable || !latestVersion) return;

  document.getElementById('update-version').textContent = latestVersion;
  document.getElementById('update-banner').classList.remove('hidden');
}

async function shouldShowRate() {
  const data = await chrome.storage.local.get(['rated', 'remindRateAfter']);
  if (data.rated) return false;
  if (data.remindRateAfter && Date.now() < data.remindRateAfter) return false;
  return true;
}

async function loadBanner() {
  const promoBanner = document.getElementById('promo-banner');
  const ratePrompt  = document.getElementById('rate-prompt');

  let promos;
  try {
    const res = await fetch(PROMO_URL, { cache: 'no-cache' });
    promos = await res.json();
    await chrome.storage.local.set({ cachedPromos: promos });
  } catch (_) {
    const { cachedPromos } = await chrome.storage.local.get('cachedPromos');
    promos = cachedPromos || [];
  }

  promos = promos.filter(p => p.id !== SELF_ID);

  const canRate = await shouldShowRate();
  if (canRate) {
    promos.push({ id: RATE_ITEM_ID });
  }

  if (!promos.length) {
    promoBanner.style.display = 'none';
    return;
  }

  const { promoIndex } = await chrome.storage.local.get('promoIndex');
  const idx = (typeof promoIndex === 'number') ? promoIndex % promos.length : 0;
  const item = promos[idx];

  await chrome.storage.local.set({ promoIndex: (idx + 1) % promos.length });

  if (item.id === RATE_ITEM_ID) {
    promoBanner.style.display = 'none';
    ratePrompt.classList.remove('hidden');
    return;
  }

  ratePrompt.classList.add('hidden');

  const iconEl = document.getElementById('promo-icon');
  const logoEl = document.getElementById('promo-logo');

  if (item.logo) {
    logoEl.src = item.logo;
    logoEl.classList.remove('hidden');
    iconEl.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = ''; });
  } else {
    logoEl.classList.add('hidden');
    iconEl.childNodes[0].textContent = item.icon;
  }

  document.getElementById('promo-name').textContent = item.name;
  document.getElementById('promo-desc').textContent = item.desc;
  promoBanner.href = item.url;
}
