/* ───────────────────────────────────────────────
   TouchLock – Settings: Locked Sites section
   Writes lockedSites / siteLockSettings to storage;
   the background applies the lock rules.
   ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', initLockedSites);

async function initLockedSites() {
  const input         = document.getElementById('site-input');
  const btnAdd        = document.getElementById('btn-add-site');
  const hint          = document.getElementById('site-hint');
  const msg           = document.getElementById('sites-msg');
  const list          = document.getElementById('site-list');
  const empty         = document.getElementById('site-empty');
  const setupNote     = document.getElementById('sites-setup-note');
  const statusEl      = document.getElementById('sites-status');
  const relockSelect  = document.getElementById('site-relock');
  const toggleSub     = document.getElementById('toggle-site-subdomains');
  const toggleSep     = document.getElementById('toggle-site-separate');

  if (!input) return;

  const defaultHint = hint.textContent;
  let sites = [];
  let settings = getSiteLockSettings();
  let grants = {};
  let enabled = false;

  await load();

  input.addEventListener('input', updateHint);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });
  btnAdd.addEventListener('click', addSite);

  relockSelect.addEventListener('change', () => saveSettings(decodeRelock(relockSelect.value)));
  toggleSub.addEventListener('change', () => saveSettings({ includeSubdomains: toggleSub.checked }));
  toggleSep.addEventListener('change', () => saveSettings({ separateUnlock: toggleSep.checked }));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.lockedSites || changes.siteLockSettings || changes.setupComplete) load();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load();
  });

  async function load() {
    const data = await chrome.storage.local.get(['lockedSites', 'siteLockSettings', 'setupComplete']);
    sites = Array.isArray(data.lockedSites) ? data.lockedSites : [];
    settings = getSiteLockSettings(data.siteLockSettings);
    enabled = data.setupComplete === true;
    grants = await fetchGrants();
    render();
  }

  function fetchGrants() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSiteGrants' }, (res) => {
        resolve((!chrome.runtime.lastError && res && res.grants) || {});
      });
    });
  }

  function render() {
    setupNote.classList.toggle('hidden', enabled);
    input.disabled = !enabled;
    btnAdd.disabled = !enabled;

    list.textContent = '';
    for (const site of sites) list.appendChild(renderSite(site));
    empty.classList.toggle('hidden', sites.length > 0);

    relockSelect.value = encodeRelock(settings);
    toggleSub.checked = settings.includeSubdomains;
    toggleSep.checked = settings.separateUnlock;

    if (!sites.length) {
      setStatus(statusEl, 'No sites', 'gray');
    } else if (!enabled) {
      setStatus(statusEl, 'Paused until setup', 'gray');
    } else {
      setStatus(statusEl, `${sites.length} site${sites.length === 1 ? '' : 's'} locked`, 'green');
    }
    updateHint();
  }

  function renderSite(site) {
    const li = document.createElement('li');
    li.className = 'site-item';

    const avatar = document.createElement('span');
    avatar.className = 'site-avatar';
    avatar.textContent = site.host.charAt(0).toUpperCase();

    const host = document.createElement('span');
    host.className = 'site-item-host';
    host.textContent = site.host;
    host.title = describeSiteMatch(site.host, settings.includeSubdomains);

    const unlocked = enabled && !!grants[site.id];
    const state = document.createElement('span');
    state.className = `site-state ${unlocked ? 'unlocked' : 'locked'}`;
    state.textContent = !enabled ? 'Paused' : unlocked ? 'Unlocked' : 'Locked';

    li.append(avatar, host, state);

    if (unlocked) {
      const relock = document.createElement('button');
      relock.className = 'site-btn';
      relock.textContent = 'Lock now';
      relock.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'relockSite', siteId: site.id }, () => load());
      });
      li.appendChild(relock);
    }

    const remove = document.createElement('button');
    remove.className = 'site-btn site-btn--remove';
    remove.setAttribute('aria-label', `Remove ${site.host}`);
    remove.title = 'Remove';
    remove.textContent = '✕';
    remove.addEventListener('click', () => removeSite(site));
    li.appendChild(remove);

    return li;
  }

  function updateHint() {
    const value = input.value.trim();
    if (!value) {
      hint.textContent = defaultHint;
      hint.classList.remove('error');
      return;
    }
    const host = normalizeSiteHost(value);
    hint.textContent = host
      ? describeSiteMatch(host, settings.includeSubdomains)
      : 'Enter a website like bank.com or https://mail.google.com/';
    hint.classList.toggle('error', !host);
  }

  async function addSite() {
    if (!enabled) return;
    const host = normalizeSiteHost(input.value);
    if (!host) {
      showMsg(msg, 'That doesn\'t look like a website address.', 'error');
      return;
    }
    if (sites.some(s => s.host === host)) {
      showMsg(msg, `${host} is already locked.`, 'error');
      return;
    }
    if (sites.length >= MAX_LOCKED_SITES) {
      showMsg(msg, `You can lock up to ${MAX_LOCKED_SITES} sites.`, 'error');
      return;
    }

    await chrome.storage.local.set({ lockedSites: [...sites, createSiteEntry(sites, host)] });
    input.value = '';
    showMsg(msg, `${host} is now locked. Any open tabs on it were locked too.`, 'success');
  }

  async function removeSite(site) {
    if (!(await requireAuth(`Removing ${site.host} from locked sites`))) return;
    const { lockedSites } = await chrome.storage.local.get('lockedSites');
    const next = (lockedSites || []).filter(s => s.id !== site.id);
    await chrome.storage.local.set({ lockedSites: next });
    showMsg(msg, `${site.host} is no longer locked.`, 'success');
  }

  async function saveSettings(patch) {
    if (!(await requireAuth('Changing locked-site settings'))) {
      render();
      return;
    }
    const { siteLockSettings } = await chrome.storage.local.get('siteLockSettings');
    const next = getSiteLockSettings(Object.assign({}, siteLockSettings, patch));
    await chrome.storage.local.set({ siteLockSettings: next });
    showMsg(msg, 'Locked-site settings saved.', 'success');
  }
}

function encodeRelock(settings) {
  return settings.relockMode === 'timer' ? `timer-${settings.relockMinutes}` : settings.relockMode;
}

function decodeRelock(value) {
  if (value.startsWith('timer-')) {
    return { relockMode: 'timer', relockMinutes: parseInt(value.slice(6), 10) };
  }
  return { relockMode: value };
}
