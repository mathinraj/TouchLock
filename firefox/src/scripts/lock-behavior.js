/* ───────────────────────────────────────────────
   TouchLock – Lock Behavior page
   Auto-saves lock settings; the background applies
   the idle detection.
   ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', initLockBehavior);

async function initLockBehavior() {
  if (await redirectIfLocked()) return;

  const toggleStartup    = document.getElementById('toggle-startup');
  const toggleIdle       = document.getElementById('toggle-idle');
  const toggleFullscreen = document.getElementById('toggle-fullscreen');
  const idleField        = document.getElementById('idle-timeout-field');
  const idleTimeout      = document.getElementById('idle-timeout');
  const videoCard        = document.getElementById('video-card');
  const videoOffNote     = document.getElementById('video-off-note');
  const toggleIdleMedia  = document.getElementById('toggle-idle-media');
  const idleMediaFields  = document.getElementById('idle-media-fields');
  const idleMediaScope   = document.getElementById('idle-media-scope');
  const idleMediaSites   = document.getElementById('idle-media-sites');
  const idleSiteInput    = document.getElementById('idle-site-input');
  const btnAddIdleSite   = document.getElementById('btn-add-idle-site');
  const idleSitesMsg     = document.getElementById('idle-sites-msg');
  const idleSiteList     = document.getElementById('idle-site-list');
  const idleSiteEmpty    = document.getElementById('idle-site-empty');
  const toggleIdleAudio  = document.getElementById('toggle-idle-audio');
  const idleMediaMax     = document.getElementById('idle-media-max');
  const lockMsg          = document.getElementById('lock-msg');

  const shortcutDisplay   = document.getElementById('shortcut-display');
  const btnRecordShortcut = document.getElementById('btn-record-shortcut');
  const shortcutRecording = document.getElementById('shortcut-recording');
  const btnCancelShortcut = document.getElementById('btn-cancel-shortcut');
  const openBrowserShortcuts = document.getElementById('open-browser-shortcuts');

  let idleMediaSiteHosts = [];

  await loadLockSettings();
  await loadShortcut();

  // ── Lock settings (auto-save) ────────────────

  async function saveLockSettings() {
    await chrome.storage.local.set({
      lockOnStartup: toggleStartup.checked,
      idleLockEnabled: toggleIdle.checked,
      idleLockTimeout: parseInt(idleTimeout.value, 10),
      fullscreenLock: toggleFullscreen.checked,
      idleMediaSettings: getIdleMediaSettings({
        enabled: toggleIdleMedia.checked,
        scope: idleMediaScope.value,
        sites: idleMediaSiteHosts,
        includeAudio: toggleIdleAudio.checked,
        maxMinutes: parseInt(idleMediaMax.value, 10)
      })
    });
    chrome.runtime.sendMessage({ action: 'updateIdleSettings' });
    showMsg(lockMsg, 'Saved.', 'success');
  }

  function updateFields() {
    idleField.classList.toggle('hidden', !toggleIdle.checked);
    videoCard.classList.toggle('is-off', !toggleIdle.checked);
    videoOffNote.classList.toggle('hidden', toggleIdle.checked);
    idleMediaFields.classList.toggle('hidden', !toggleIdleMedia.checked);
    idleMediaSites.classList.toggle('hidden', idleMediaScope.value !== 'sites');
  }

  function renderIdleSites() {
    idleSiteList.textContent = '';
    for (const host of idleMediaSiteHosts) {
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
      remove.addEventListener('click', async () => {
        idleMediaSiteHosts = idleMediaSiteHosts.filter(h => h !== host);
        renderIdleSites();
        await saveLockSettings();
      });

      li.append(avatar, name, remove);
      idleSiteList.appendChild(li);
    }
    idleSiteEmpty.classList.toggle('hidden', idleMediaSiteHosts.length > 0);
  }

  async function addIdleSite() {
    const host = normalizeSiteHost(idleSiteInput.value);
    if (!host) {
      showMsg(idleSitesMsg, 'That doesn\'t look like a website address.', 'error');
      return;
    }
    if (idleMediaSiteHosts.includes(host)) {
      showMsg(idleSitesMsg, `${host} is already on the list.`, 'error');
      return;
    }
    if (idleMediaSiteHosts.length >= MAX_LOCKED_SITES) {
      showMsg(idleSitesMsg, `You can add up to ${MAX_LOCKED_SITES} sites.`, 'error');
      return;
    }
    idleMediaSiteHosts = [...idleMediaSiteHosts, host];
    idleSiteInput.value = '';
    renderIdleSites();
    await saveLockSettings();
    showMsg(idleSitesMsg, `Videos on ${host} now keep the browser unlocked.`, 'success');
  }

  const saveAndUpdate = () => { updateFields(); saveLockSettings(); };
  [toggleStartup, toggleFullscreen, idleTimeout, toggleIdleAudio, idleMediaMax]
    .forEach(el => el.addEventListener('change', saveLockSettings));
  [toggleIdle, toggleIdleMedia, idleMediaScope]
    .forEach(el => el.addEventListener('change', saveAndUpdate));
  btnAddIdleSite.addEventListener('click', addIdleSite);
  idleSiteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addIdleSite(); });

  async function loadLockSettings() {
    const data = await chrome.storage.local.get([
      'lockOnStartup', 'idleLockEnabled', 'idleLockTimeout', 'fullscreenLock', 'idleMediaSettings'
    ]);

    toggleStartup.checked = data.lockOnStartup !== false;
    toggleIdle.checked = data.idleLockEnabled === true;
    toggleFullscreen.checked = data.fullscreenLock === true;
    if (data.idleLockTimeout) idleTimeout.value = String(data.idleLockTimeout);

    const media = getIdleMediaSettings(data.idleMediaSettings);
    toggleIdleMedia.checked = media.enabled;
    idleMediaScope.value = media.scope;
    toggleIdleAudio.checked = media.includeAudio;
    idleMediaMax.value = String(media.maxMinutes);
    idleMediaSiteHosts = media.sites;
    renderIdleSites();
    updateFields();
  }

  // ── Keyboard shortcut ────────────────────────
  // Firefox exposes browser.commands, which can open its shortcut settings and
  // apply the shortcut to browser pages too; Chrome needs its own settings page.

  const firefoxCommands = typeof browser !== 'undefined' && browser.commands ? browser.commands : null;

  async function loadShortcut() {
    const { lockShortcut } = await chrome.storage.local.get('lockShortcut');
    shortcutDisplay.textContent = formatShortcut(lockShortcut || DEFAULT_SHORTCUT);
  }

  openBrowserShortcuts.addEventListener('click', (e) => {
    e.preventDefault();
    if (firefoxCommands && firefoxCommands.openShortcutSettings) {
      firefoxCommands.openShortcutSettings();
    } else if (firefoxCommands) {
      chrome.tabs.create({ url: 'about:addons' });
    } else {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    }
  });

  btnRecordShortcut.addEventListener('click', () => {
    shortcutRecording.classList.remove('hidden');
    btnRecordShortcut.classList.add('hidden');
    document.addEventListener('keydown', captureShortcut);
  });

  btnCancelShortcut.addEventListener('click', stopRecording);

  function captureShortcut(e) {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      showMsg(lockMsg, 'Shortcut must include Ctrl, Alt, or Cmd.', 'error');
      return;
    }

    const letterKey = e.code.startsWith('Key') ? e.code.slice(3) : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const combo = { ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, code: e.code };

    const reserved = isReservedShortcut(combo, letterKey);
    if (reserved) {
      showMsg(lockMsg, reserved, 'error');
      return;
    }

    const newShortcut = {
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      key: letterKey,
      code: e.code
    };

    shortcutDisplay.textContent = formatShortcut(newShortcut);
    chrome.storage.local.set({ lockShortcut: newShortcut });

    if (firefoxCommands && firefoxCommands.update) {
      const parts = [];
      if (newShortcut.ctrlKey)  parts.push('MacCtrl');
      if (newShortcut.altKey)   parts.push('Alt');
      if (newShortcut.shiftKey) parts.push('Shift');
      if (newShortcut.metaKey)  parts.push('Command');
      parts.push(newShortcut.key);
      firefoxCommands.update({ name: 'lock-browser', shortcut: parts.join('+') }).catch(() => {});
    }

    stopRecording();
    showMsg(lockMsg, 'Shortcut saved!', 'success');
  }

  function stopRecording() {
    document.removeEventListener('keydown', captureShortcut);
    shortcutRecording.classList.add('hidden');
    btnRecordShortcut.classList.remove('hidden');
  }
}
