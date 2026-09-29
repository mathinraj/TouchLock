/* ───────────────────────────────────────────────
   TouchLock – Popup Script
   ─────────────────────────────────────────────── */

const PROMO_URL = 'https://raw.githubusercontent.com/mathinraj/mathinraj/main/promotions/promos.json';
const SELF_ID   = 'touchlock';

document.addEventListener('DOMContentLoaded', async () => {
  const badge       = document.getElementById('status-badge');
  const setupNeeded = document.getElementById('setup-needed');
  const actions     = document.getElementById('actions');
  const btnLock     = document.getElementById('btn-lock');
  const btnSetup    = document.getElementById('btn-setup');
  const btnSettings = document.getElementById('btn-settings');
  const btnWhatsNew = document.getElementById('btn-whats-new');

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
    }
  });

  btnLock.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'lock' }, () => window.close());
  });

  btnSetup.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  btnWhatsNew.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/whats-new.html') });
    window.close();
  });

  loadPromo();
});

async function loadPromo() {
  const banner = document.getElementById('promo-banner');
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
  if (!promos.length) {
    banner.style.display = 'none';
    return;
  }

  const { promoIndex } = await chrome.storage.local.get('promoIndex');
  const idx = (typeof promoIndex === 'number') ? promoIndex % promos.length : 0;
  const promo = promos[idx];

  const iconEl = document.getElementById('promo-icon');
  const logoEl = document.getElementById('promo-logo');

  if (promo.logo) {
    logoEl.src = promo.logo;
    logoEl.classList.remove('hidden');
    iconEl.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = ''; });
  } else {
    logoEl.classList.add('hidden');
    iconEl.childNodes[0].textContent = promo.icon;
  }

  document.getElementById('promo-name').textContent = promo.name;
  document.getElementById('promo-desc').textContent = promo.desc;
  banner.href = promo.url;

  await chrome.storage.local.set({ promoIndex: (idx + 1) % promos.length });
}
