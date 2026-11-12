/* ───────────────────────────────────────────────
   TouchLock – Duress PIN page
   Writes duressConfig; the background erases the
   chosen data when the duress PIN is entered.
   ─────────────────────────────────────────────── */

const PERMISSION_TEXT = {
  history: 'read and change your browsing history',
  browsingData: 'clear your browsing data'
};

document.addEventListener('DOMContentLoaded', initDuress);

async function initDuress() {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  if (isLocked === true) {
    location.replace(chrome.runtime.getURL('src/pages/lock.html'));
    return;
  }

  const statusEl    = document.getElementById('duress-status');
  const noPinNote   = document.getElementById('no-pin-note');
  const modeInputs  = document.querySelectorAll('input[name="duress-mode"]');
  const sitesCard   = document.getElementById('sites-card');
  const siteInput   = document.getElementById('duress-site-input');
  const btnAddSite  = document.getElementById('btn-add-duress-site');
  const btnAddLocked = document.getElementById('btn-add-locked');
  const sitesMsg    = document.getElementById('sites-msg');
  const siteList    = document.getElementById('duress-site-list');
  const siteEmpty   = document.getElementById('duress-site-empty');
  const pinStep     = document.getElementById('pin-step');
  const pinHint     = document.getElementById('pin-hint');
  const pinKeepHint = document.getElementById('pin-keep-hint');
  const pin1        = document.getElementById('duress-pin1');
  const pin2        = document.getElementById('duress-pin2');
  const permText    = document.getElementById('perm-text');
  const confirmBox  = document.getElementById('duress-confirm');
  const msg         = document.getElementById('duress-msg');
  const btnSave     = document.getElementById('btn-save-duress');
  const btnOff      = document.getElementById('btn-off-duress');
  const lastUsed    = document.getElementById('last-used');

  const data = await chrome.storage.local.get([
    'duressConfig', 'pinHash', 'pinSalt', 'pinLength', 'lockedSites', 'duressLastUsedAt'
  ]);
  const pinLength = data.pinLength || 6;
  const hasPin = !!data.pinHash;
  const lockedHosts = Array.isArray(data.lockedSites) ? data.lockedSites.map(s => s.host) : [];
  let config = getDuressConfig(data.duressConfig);
  let sites = [...config.sites];
  let matchesRealPin = { value: '', matches: false };

  pin1.maxLength = pinLength;
  pin2.maxLength = pinLength;
  pinHint.textContent = `Use ${pinLength} digits, the same as your real PIN, so nobody can tell them apart. It must be different from your real PIN.`;
  modeInputs.forEach((input) => { input.checked = input.value === config.mode; });

  modeInputs.forEach(input => input.addEventListener('change', render));
  btnAddSite.addEventListener('click', () => addSites([siteInput.value]));
  siteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSites([siteInput.value]); });
  btnAddLocked.addEventListener('click', () => addSites(lockedHosts));
  pin1.addEventListener('input', checkAgainstRealPin);
  btnSave.addEventListener('click', onSave);
  btnOff.addEventListener('click', onTurnOff);

  render();

  function selectedMode() {
    return document.querySelector('input[name="duress-mode"]:checked').value;
  }

  function render() {
    const mode = selectedMode();
    modeInputs.forEach(input => input.closest('.choice').classList.toggle('selected', input.checked));

    const siteMode = mode !== 'everything';
    sitesCard.classList.toggle('hidden', !siteMode);
    pinStep.textContent = siteMode ? '3' : '2';
    permText.textContent = DURESS_MODES[mode].map(p => PERMISSION_TEXT[p]).join(' and ');

    siteList.textContent = '';
    for (const host of sites) siteList.appendChild(renderSite(host));
    siteEmpty.classList.toggle('hidden', sites.length > 0);
    btnAddLocked.classList.toggle('hidden', !lockedHosts.some(h => !sites.includes(h)));

    setStatus(config.enabled ? 'On' : 'Off', config.enabled ? 'green' : 'gray');
    btnSave.textContent = config.enabled ? 'Save changes' : 'Turn on duress PIN';
    btnOff.classList.toggle('hidden', !config.enabled);
    pinKeepHint.classList.toggle('hidden', !config.enabled);

    noPinNote.classList.toggle('hidden', hasPin);
    btnSave.disabled = !hasPin;

    lastUsed.textContent = data.duressLastUsedAt
      ? `Last used ${new Date(data.duressLastUsedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
      : '';
  }

  function renderSite(host) {
    const li = document.createElement('li');
    li.className = 'site-item';

    const avatar = document.createElement('span');
    avatar.className = 'site-avatar';
    avatar.textContent = host.charAt(0).toUpperCase();

    const name = document.createElement('span');
    name.className = 'site-item-host';
    name.textContent = host;

    const remove = document.createElement('button');
    remove.className = 'site-btn site-btn--remove';
    remove.setAttribute('aria-label', `Remove ${host}`);
    remove.title = 'Remove';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      sites = sites.filter(h => h !== host);
      render();
      if (config.enabled) showMsg(sitesMsg, 'Click "Save changes" to apply.', 'success');
    });

    li.append(avatar, name, remove);
    return li;
  }

  function addSites(values) {
    let added = 0;
    for (const value of values) {
      const host = normalizeSiteHost(value);
      if (!host) {
        if (values.length === 1) showMsg(sitesMsg, 'That doesn\'t look like a website address.', 'error');
        continue;
      }
      if (sites.includes(host) || sites.length >= MAX_LOCKED_SITES) continue;
      sites.push(host);
      added++;
    }
    if (added) {
      siteInput.value = '';
      showMsg(sitesMsg, config.enabled ? 'Click "Save changes" to apply.' : '', 'success');
    }
    render();
  }

  async function checkAgainstRealPin() {
    const value = pin1.value.trim();
    const matches = hasPin && value.length === pinLength && (await sha256(value, data.pinSalt)) === data.pinHash;
    if (pin1.value.trim() === value) matchesRealPin = { value, matches };
  }

  // Permission prompts only work straight from a click, so every check that
  // can run synchronously happens before the request.
  function onSave() {
    const mode = selectedMode();
    const p1 = pin1.value.trim();
    const p2 = pin2.value.trim();
    const newPin = !config.enabled || p1 || p2;

    if (mode !== 'everything' && !sites.length) return showMsg(msg, 'Add at least one site to erase.', 'error');
    if (newPin) {
      if (!/^\d+$/.test(p1) || p1.length !== pinLength) {
        return showMsg(msg, `Your duress PIN must be exactly ${pinLength} digits.`, 'error');
      }
      if (p1 !== p2) return showMsg(msg, 'The two duress PINs don\'t match.', 'error');
      if (matchesRealPin.value === p1 && matchesRealPin.matches) {
        return showMsg(msg, 'Your duress PIN must be different from your real PIN.', 'error');
      }
    }
    if (!confirmBox.checked) return showMsg(msg, 'Tick the box to confirm you understand.', 'error');

    chrome.permissions.request({ permissions: DURESS_MODES[mode] }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        showMsg(msg, 'TouchLock needs this permission to erase data. Nothing was changed.', 'error');
        return;
      }
      finishSave(mode, newPin ? p1 : null);
    });
  }

  async function finishSave(mode, newPin) {
    const wasEnabled = config.enabled;
    if (!(await requireAuth(wasEnabled ? 'Changing your duress PIN' : 'Turning on a duress PIN'))) {
      dropPermissions(wasEnabled ? DURESS_MODES[config.mode] : []);
      return;
    }

    const next = {
      enabled: true,
      mode,
      sites: [...sites],
      pinLength,
      pinHash: config.pinHash,
      pinSalt: config.pinSalt
    };
    if (newPin) {
      const { pinHash, pinSalt } = await chrome.storage.local.get(['pinHash', 'pinSalt']);
      if ((await sha256(newPin, pinSalt)) === pinHash) {
        showMsg(msg, 'Your duress PIN must be different from your real PIN.', 'error');
        dropPermissions(wasEnabled ? DURESS_MODES[config.mode] : []);
        return;
      }
      next.pinSalt = crypto.randomUUID();
      next.pinHash = await sha256(newPin, next.pinSalt);
    }

    await chrome.storage.local.set({ duressConfig: next });
    config = getDuressConfig(next);
    dropPermissions(DURESS_MODES[mode]);

    pin1.value = '';
    pin2.value = '';
    confirmBox.checked = false;
    showMsg(sitesMsg, '', 'success');
    render();
    showMsg(msg, wasEnabled ? 'Duress PIN updated.' : 'Duress PIN is on. Entering it will erase the data you chose, then unlock.', 'success');
  }

  async function onTurnOff() {
    if (!(await requireAuth('Turning off your duress PIN'))) return;
    const next = { enabled: false, mode: selectedMode(), sites: [...sites] };
    await chrome.storage.local.set({ duressConfig: next });
    config = getDuressConfig(next);
    dropPermissions([]);
    render();
    showMsg(msg, 'Duress PIN is off. TouchLock no longer has permission to erase browsing data.', 'success');
  }

  function dropPermissions(keep) {
    const remove = DURESS_ALL_PERMISSIONS.filter(p => !keep.includes(p));
    if (remove.length) chrome.permissions.remove({ permissions: remove }, () => void chrome.runtime.lastError);
  }

  function setStatus(text, color) {
    statusEl.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = `dot ${color}`;
    const label = document.createElement('span');
    label.textContent = text;
    statusEl.append(dot, label);
  }
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}

async function sha256(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
