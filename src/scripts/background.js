/* ───────────────────────────────────────────────
   TouchLock – Background Service Worker (MV3)
   ─────────────────────────────────────────────── */

// Firefox loads these through manifest background.scripts instead.
if (typeof importScripts === 'function') {
  importScripts('site-lock-shared.js', 'bio-policy.js', 'site-lock-bg.js');
}

const LOCK_URL     = chrome.runtime.getURL('src/pages/lock.html');
const RECOVERY_URL = chrome.runtime.getURL('src/pages/recovery.html');
const OPTIONS_URL  = chrome.runtime.getURL('src/pages/options.html');
const WELCOME_URL  = chrome.runtime.getURL('src/pages/welcome.html');
const AUTH_URL     = chrome.runtime.getURL('src/pages/auth.html');

// ── Helpers ──────────────────────────────────────

function isLockUrl(url) {
  return url && url.startsWith(LOCK_URL);
}

function isAllowedWhileLocked(url) {
  return url && (
    url.startsWith(LOCK_URL) ||
    url.startsWith(RECOVERY_URL)
  );
}

// Pages that may load in a tab while locked; anything else is held behind the lock screen.
function mayLoadWhileLocked(url) {
  return isAllowedWhileLocked(url) || url.startsWith(AUTH_URL) || url.startsWith(SITE_LOCK_URL);
}

// The address a held lock tab returns to on unlock, or null for a plain lock tab.
function heldReturnUrl(tabUrl) {
  const i = tabUrl ? tabUrl.indexOf('#') : -1;
  if (i === -1) return null;
  try {
    const url = new URL(decodeHashUrl(tabUrl.slice(i + 1)));
    return ['javascript:', 'data:', 'blob:'].includes(url.protocol) ? null : url.href;
  } catch (_) {
    return null;
  }
}

async function holdTab(tabId, url) {
  try {
    await chrome.tabs.update(tabId, { url: `${LOCK_URL}#${url}` });
  } catch (_) {
    try { await chrome.tabs.remove(tabId); } catch (_) {}
  }
}

// Sends held tabs back to their pages; closes plain lock tabs unless keepPlain.
async function releaseLockTabs({ keepPlain }) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isLockUrl(tab.url)) continue;
    const target = heldReturnUrl(tab.url);
    try {
      if (target) await chrome.tabs.update(tab.id, { url: target });
      else if (!keepPlain) await chrome.tabs.remove(tab.id);
    } catch (_) {
      if (!keepPlain) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
    }
  }
}

async function getIsLocked() {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  return isLocked === true;
}

async function isSetupComplete() {
  const { setupComplete } = await chrome.storage.local.get('setupComplete');
  return setupComplete === true;
}

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Lock / Unlock ────────────────────────────────

async function lockBrowser() {
  await chrome.storage.local.set({ isLocked: true });
  await setBrowserLockRule(true);
  await onBrowserLocking();

  const windows = await chrome.windows.getAll({ populate: true });

  for (const win of windows) {
    if (win.type !== 'normal') continue;

    const hasLockTab = win.tabs.some(t => isLockUrl(t.url) || isLockUrl(t.pendingUrl));
    if (!hasLockTab) {
      try {
        await chrome.tabs.create({ windowId: win.id, url: LOCK_URL, active: true });
      } catch (_) {}
    }
  }

  // Inject content overlay on all non-lock tabs (visual safety net)
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isLockUrl(tab.url)) {
      injectOverlay(tab.id);
    }
  }
}

async function unlockBrowser() {
  await chrome.storage.local.set({ isLocked: false });
  await setBrowserLockRule(false);

  const { unlockCount } = await chrome.storage.local.get('unlockCount');
  await chrome.storage.local.set({ unlockCount: (unlockCount || 0) + 1 });

  await restoreLockFullscreen();

  await releaseLockTabs({ keepPlain: false });

  // Remove content overlays from remaining tabs
  const remaining = await chrome.tabs.query({});
  for (const tab of remaining) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'unlock' });
    } catch (_) {}
  }

  await onBrowserUnlocked();

  // Handle pending update redirect from lock screen
  const { pendingUpdateUrl } = await chrome.storage.local.get('pendingUpdateUrl');
  if (pendingUpdateUrl) {
    await chrome.storage.local.remove('pendingUpdateUrl');
    chrome.tabs.create({ url: pendingUpdateUrl });
  }
}

// ── Lock-screen fullscreen ───────────────────────
// lockFullscreenWindows maps windowId → state to restore on unlock. Only windows
// TouchLock itself put into fullscreen are listed, so a user's own fullscreen
// (F11) is left alone.

let fullscreenChain = Promise.resolve();

function enterLockFullscreen(windowId) {
  fullscreenChain = fullscreenChain.then(async () => {
    const { fullscreenLock, lockFullscreenWindows } =
      await chrome.storage.local.get(['fullscreenLock', 'lockFullscreenWindows']);
    if (fullscreenLock !== true || !(await getIsLocked())) return;

    const win = await chrome.windows.get(windowId);
    if (win.state === 'fullscreen') return;

    const map = lockFullscreenWindows || {};
    map[windowId] = win.state === 'minimized' ? 'normal' : win.state;
    await chrome.storage.local.set({ lockFullscreenWindows: map });
    await chrome.windows.update(windowId, { focused: true });
    await chrome.windows.update(windowId, { state: 'fullscreen' });
  }).catch(() => {});
  return fullscreenChain;
}

function restoreLockFullscreen() {
  fullscreenChain = fullscreenChain.then(async () => {
    const { lockFullscreenWindows } = await chrome.storage.local.get('lockFullscreenWindows');
    await chrome.storage.local.remove(['lockFullscreenWindows', 'savedWindowStates']);
    for (const [id, prevState] of Object.entries(lockFullscreenWindows || {})) {
      try {
        const win = await chrome.windows.get(Number(id));
        if (win.state === 'fullscreen') {
          await chrome.windows.update(win.id, { state: prevState || 'maximized' });
        }
      } catch (_) {}
    }
  }).catch(() => {});
  return fullscreenChain;
}

// Esc exits extension-initiated fullscreen; while locked, put the window back.
if (chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener(async (win) => {
    if (win.state === 'fullscreen' || !(await getIsLocked())) return;
    const { fullscreenLock, lockFullscreenWindows } =
      await chrome.storage.local.get(['fullscreenLock', 'lockFullscreenWindows']);
    if (fullscreenLock !== true || !lockFullscreenWindows || !(win.id in lockFullscreenWindows)) return;
    try { await chrome.windows.update(win.id, { state: 'fullscreen' }); } catch (_) {}
  });
}

// Window IDs change across restarts. If the previous session ended while locked
// in fullscreen (savedWindowStates is the pre-1.4.1 marker for that), the browser
// reopens those windows fullscreen; claim them so unlock brings them back out.
async function adoptRestoredFullscreen() {
  const { lockFullscreenWindows, savedWindowStates } =
    await chrome.storage.local.get(['lockFullscreenWindows', 'savedWindowStates']);
  if (!lockFullscreenWindows && !savedWindowStates) return;

  const adopted = {};
  for (const win of await chrome.windows.getAll()) {
    if (win.type === 'normal' && win.state === 'fullscreen') adopted[win.id] = 'maximized';
  }
  await chrome.storage.local.remove('savedWindowStates');
  await chrome.storage.local.set({ lockFullscreenWindows: adopted });
}

async function injectOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'lock' });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['src/scripts/content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId, allFrames: true },
        files: ['src/styles/content.css']
      });
      await chrome.tabs.sendMessage(tabId, { action: 'lock' });
    } catch (_e) { /* restricted page */ }
  }
}

// ── PIN verification ─────────────────────────────

async function checkPin(pin) {
  const { pinHash, pinSalt, pinLength } = await chrome.storage.local.get(['pinHash', 'pinSalt', 'pinLength']);
  if (!pinHash || !pinSalt) return { success: false, error: 'PIN not configured.' };

  const expectedLen = pinLength || 6;
  if (typeof pin !== 'string' || pin.length !== expectedLen) return { success: false, error: 'Incorrect PIN.' };

  const hash = await hashPin(pin, pinSalt);
  if (hash !== pinHash) return { success: false, error: 'Incorrect PIN.' };

  await chrome.storage.local.set({ lastPinUnlockAt: Date.now() });
  return { success: true };
}

async function verifyPin(pin) {
  const result = await checkPin(pin);
  if (result.success) await unlockBrowser();
  return result;
}

// ── Idle detection (auto-lock on inactivity) ────
// chrome.idle only fires when the state changes, so once a playing video or a
// snooze defers the lock, an alarm keeps rechecking until it can lock.

const IDLE_RECHECK_ALARM = 'idle-recheck';

async function applyIdleSettings() {
  const { idleLockEnabled, idleLockTimeout } = await chrome.storage.local.get([
    'idleLockEnabled', 'idleLockTimeout'
  ]);

  if (idleLockEnabled) {
    const seconds = idleLockTimeout || 300;
    chrome.idle.setDetectionInterval(seconds);
  } else {
    await clearIdleDeferral();
  }
}

async function clearIdleDeferral() {
  await chrome.alarms.clear(IDLE_RECHECK_ALARM);
  await chrome.storage.local.remove(['idleStartedAt', 'idleMediaSeenAt']);
}

// Runs in each frame. Returns the frame's hostname if it shows a playing video.
function playingVideoHost() {
  const pip = document.pictureInPictureElement;
  if (document.visibilityState !== 'visible' && !pip) return null;
  const playing = Array.from(document.querySelectorAll('video')).some(v =>
    !v.paused && !v.ended && v.readyState > 2 &&
    // Muted looping videos are page decoration, like hero banners.
    !(v.muted && v.loop) &&
    (v === pip || (v.clientWidth >= 200 && v.clientHeight >= 112)));
  return playing ? location.hostname : null;
}

async function isMediaPlaying(settings) {
  const tabs = (await chrome.tabs.query({})).filter(t =>
    (t.active || t.audible) && !t.discarded && toHttpUrl(t.url));

  for (const tab of tabs) {
    const tabHost = new URL(tab.url).hostname;
    const heard = tab.audible && !(tab.mutedInfo && tab.mutedInfo.muted);
    if (settings.includeAudio && heard && idleMediaCoversHost(settings, tabHost)) return true;

    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: playingVideoHost
      });
    } catch (_) {
      continue;
    }
    const covered = results.some(r => r.result &&
      (idleMediaCoversHost(settings, tabHost) || idleMediaCoversHost(settings, r.result)));
    if (covered) return true;
  }
  return false;
}

async function idleLockOrDefer() {
  const data = await chrome.storage.local.get([
    'idleLockEnabled', 'idleLockTimeout', 'setupComplete',
    'idleStartedAt', 'idleMediaSeenAt', 'idleSnoozeUntil', 'idleMediaSettings'
  ]);
  if (!data.idleLockEnabled || !data.setupComplete || await getIsLocked()) {
    await clearIdleDeferral();
    return;
  }

  const now = Date.now();
  const timeoutMs = (data.idleLockTimeout || 300) * 1000;
  const settings = getIdleMediaSettings(data.idleMediaSettings);
  const idleStartedAt = data.idleStartedAt || now - timeoutMs;
  const pastLimit = settings.maxMinutes > 0 && now - idleStartedAt >= settings.maxMinutes * 60000;

  let defer = data.idleSnoozeUntil > now;
  if (!defer && settings.enabled && !pastLimit) {
    if (await isMediaPlaying(settings)) {
      await chrome.storage.local.set({ idleMediaSeenAt: now });
      defer = true;
    } else {
      // After playback stops, wait a full idle timeout before locking.
      defer = now - (data.idleMediaSeenAt || 0) < timeoutMs;
    }
  }

  if (defer) {
    chrome.alarms.create(IDLE_RECHECK_ALARM, { delayInMinutes: 1 });
    return;
  }
  await clearIdleDeferral();
  await lockBrowser();
}

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    await clearIdleDeferral();
    return;
  }

  const { idleLockEnabled, idleLockTimeout, setupComplete } = await chrome.storage.local.get([
    'idleLockEnabled', 'idleLockTimeout', 'setupComplete'
  ]);

  if (!idleLockEnabled || !setupComplete) return;
  if (await getIsLocked()) return;

  if (newState === 'locked') {
    await clearIdleDeferral();
    await lockBrowser();
    return;
  }

  await chrome.storage.local.set({
    idleStartedAt: Date.now() - (idleLockTimeout || 300) * 1000,
    idleMediaSeenAt: 0
  });
  await idleLockOrDefer();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== IDLE_RECHECK_ALARM) return;
  const { idleLockTimeout } = await chrome.storage.local.get('idleLockTimeout');
  const state = await chrome.idle.queryState(Math.max(15, idleLockTimeout || 300));
  if (state === 'active') {
    await clearIdleDeferral();
    return;
  }
  await idleLockOrDefer();
});

// ── Remote version check ─────────────────────────

const VERSIONS_URL = 'https://raw.githubusercontent.com/mathinraj/mathinraj/main/promotions/versions.json';

async function checkForUpdate() {
  try {
    const res = await fetch(VERSIONS_URL, { cache: 'no-cache' });
    const versions = await res.json();
    const latest = versions.touchlock;
    if (!latest) return;

    const current = chrome.runtime.getManifest().version;
    if (isNewerVersion(latest, current)) {
      await chrome.storage.local.set({ updateAvailable: true, latestVersion: latest });
    } else {
      await chrome.storage.local.remove(['updateAvailable', 'latestVersion']);
    }
  } catch (_) {}
}

function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// ── Lifecycle events ─────────────────────────────

function browserName() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  return 'chrome';
}

chrome.runtime.setUninstallURL(
  `https://touchlock.vercel.app/uninstall.html?v=${chrome.runtime.getManifest().version}&b=${browserName()}`
);

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      isLocked: false,
      setupComplete: false,
      lockOnStartup: true,
      fullscreenLock: false,
      fullscreenOffMigrated: true,
      idleLockEnabled: false,
      idleLockTimeout: 300,
      showPinToToolbar: true
    });

    // Set a badge to draw attention to the extension icon in the toolbar
    try {
      chrome.action.setBadgeText({ text: 'PIN' });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
      chrome.action.setBadgeTextColor({ color: '#ffffff' });
    } catch (_) {}

    chrome.tabs.create({ url: WELCOME_URL });
  }

  if (details.reason === 'update') {
    await chrome.storage.local.set({
      showWhatsNew: true,
      updatedFrom: details.previousVersion,
      updatedTo: chrome.runtime.getManifest().version
    });

    // Fullscreen could leave windows stuck in fullscreen before 1.4.1; turn it
    // off once so affected users aren't forced back into it.
    const { fullscreenOffMigrated } = await chrome.storage.local.get('fullscreenOffMigrated');
    if (!fullscreenOffMigrated) {
      await chrome.storage.local.set({ fullscreenLock: false, fullscreenOffMigrated: true });
    }
    if (await getIsLocked()) await adoptRestoredFullscreen();
  }

  applyIdleSettings();
  checkForUpdate();
  reconcileSiteLocks();
  if (details.reason !== 'install') syncPinBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  applyIdleSettings();
  checkForUpdate();
  reconcileSiteLocks();
  syncPinBadge();
  await adoptRestoredFullscreen();

  const { lockOnStartup } = await chrome.storage.local.get('lockOnStartup');
  if (lockOnStartup === false && !(await getIsLocked())) return;

  if (await isSetupComplete()) {
    await lockBrowser();
  }
});

// ── "PIN" toolbar badge ──────────────────────
// The badge asks new users to pin TouchLock. It must go away once they do,
// even if the welcome page that watches for pinning is already closed.

async function dismissPinPrompt() {
  await chrome.storage.local.set({ showPinToToolbar: false });
  try { await chrome.action.setBadgeText({ text: '' }); } catch (_) {}
}

async function isPinnedToToolbar() {
  try {
    const settings = await chrome.action.getUserSettings();
    return settings.isOnToolbar === true;
  } catch (_) {
    return false;
  }
}

async function syncPinBadge() {
  const { showPinToToolbar } = await chrome.storage.local.get('showPinToToolbar');
  if (showPinToToolbar !== true || await isPinnedToToolbar()) await dismissPinPrompt();
}

if (chrome.action.onUserSettingsChanged) {
  chrome.action.onUserSettingsChanged.addListener((settings) => {
    if (settings.isOnToolbar) dismissPinPrompt();
  });
}

// ── Keyboard shortcut (quick lock) ───────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'lock-browser') return;
  if (!(await isSetupComplete())) return;
  if (await getIsLocked()) return;
  await lockBrowser();
});

// ── Tab guards (profile-level lock) ─────────────

// Finds the best "guard" tab (lock or recovery) to redirect to in a window
function findGuardTab(tabs) {
  return tabs.find(t => isLockUrl(t.url))
      || tabs.find(t => isAllowedWhileLocked(t.url));
}

// Guard 1: When user switches to a non-allowed tab, force them back.
// When unlocked, clear any stale overlay the tab may have missed.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!(await getIsLocked())) {
    try {
      await chrome.tabs.sendMessage(activeInfo.tabId, { action: 'unlock' });
    } catch (_) {}
    return;
  }

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (isAllowedWhileLocked(tab.url) || isAllowedWhileLocked(tab.pendingUrl)) return;

    const windowTabs = await chrome.tabs.query({ windowId: activeInfo.windowId });
    const guard = findGuardTab(windowTabs);
    if (guard) {
      chrome.tabs.update(guard.id, { active: true });
    } else {
      chrome.tabs.create({ windowId: activeInfo.windowId, url: LOCK_URL, active: true });
    }
  } catch (_) {}
});

// Guard 2: When a new tab is created, redirect focus to guard tab
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!(await getIsLocked())) return;
  if (isAllowedWhileLocked(tab.url) || isAllowedWhileLocked(tab.pendingUrl)) return;

  try {
    const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
    const guard = findGuardTab(windowTabs);
    if (guard) {
      chrome.tabs.update(guard.id, { active: true });
    }
  } catch (_) {}
});

// Guard 3: When a tab finishes loading, ensure guard tab is active + overlay injected
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!(await getIsLocked())) return;

  // Any navigation away while locked (including the lock tab's own address bar
  // and browser pages like chrome://extensions) is sent straight back.
  if (changeInfo.url && !mayLoadWhileLocked(changeInfo.url)) {
    await holdTab(tabId, changeInfo.url);
    return;
  }

  if (changeInfo.status !== 'complete') return;

  if (isAllowedWhileLocked(tab.url)) return;

  injectOverlay(tabId);

  try {
    const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
    const guard = findGuardTab(windowTabs);
    if (guard) {
      chrome.tabs.update(guard.id, { active: true });
    } else {
      chrome.tabs.create({ windowId: tab.windowId, url: LOCK_URL, active: true });
    }
  } catch (_) {}
});

// Guard 4: If a guard tab is closed while locked, re-create a lock tab
chrome.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
  if (!(await getIsLocked())) return;
  if (removeInfo.isWindowClosing) return;

  try {
    const windowTabs = await chrome.tabs.query({ windowId: removeInfo.windowId });
    const hasGuard = windowTabs.some(t => isAllowedWhileLocked(t.url));
    if (!hasGuard) {
      chrome.tabs.create({ windowId: removeInfo.windowId, url: LOCK_URL, active: true });
    }
  } catch (_) {}
});

// Guard 5: New windows while locked get a lock tab
chrome.windows.onCreated.addListener(async (window) => {
  if (!(await getIsLocked())) return;
  if (window.type !== 'normal') return;

  setTimeout(async () => {
    try {
      const windowTabs = await chrome.tabs.query({ windowId: window.id });
      const hasGuard = windowTabs.some(t => isAllowedWhileLocked(t.url));
      if (!hasGuard) {
        chrome.tabs.create({ windowId: window.id, url: LOCK_URL, active: true });
      }
    } catch (_) {}
  }, 250);
});

// ── Message router ───────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const siteResponse = await handleSiteLockMessage(msg, sender, checkPin);
    if (siteResponse !== undefined) {
      sendResponse(siteResponse);
      return;
    }

    switch (msg.action) {

      case 'getState': {
        const locked = await getIsLocked();
        const setup  = await isSetupComplete();
        sendResponse({ isLocked: locked, setupComplete: setup });
        break;
      }

      case 'lock': {
        if (await isSetupComplete()) {
          await lockBrowser();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Setup not complete.' });
        }
        break;
      }

      case 'verifyPin': {
        const result = await verifyPin(msg.pin);
        sendResponse(result);
        break;
      }

      case 'biometricUnlock': {
        if (!(await biometricAllowedNow())) {
          sendResponse({ success: false, pinRequired: true, error: 'Enter your PIN to unlock.' });
          break;
        }
        await unlockBrowser();
        sendResponse({ success: true });
        break;
      }

      case 'openRecovery': {
        chrome.tabs.create({ url: RECOVERY_URL, active: true });
        sendResponse({ success: true });
        break;
      }

      case 'lockFullscreen': {
        if (sender.tab && isLockUrl(sender.url)) await enterLockFullscreen(sender.tab.windowId);
        sendResponse({ success: true });
        break;
      }

      case 'openBiometricAuth': {
        chrome.windows.create({
          url: chrome.runtime.getURL('src/pages/auth.html'),
          type: 'popup',
          width: 420,
          height: 380,
          focused: true
        });
        sendResponse({ success: true });
        break;
      }

      case 'updateIdleSettings': {
        await applyIdleSettings();
        sendResponse({ success: true });
        break;
      }

      case 'updateShortcut': {
        sendResponse({ success: true });
        break;
      }

      case 'lockFromShortcut': {
        if (await isSetupComplete() && !(await getIsLocked())) {
          await lockBrowser();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false });
        }
        break;
      }

      case 'getPinLength': {
        const { pinLength } = await chrome.storage.local.get('pinLength');
        sendResponse({ pinLength: pinLength || 6 });
        break;
      }

      case 'checkPinToToolbar': {
        const { showPinToToolbar } = await chrome.storage.local.get('showPinToToolbar');
        const isPinned = await isPinnedToToolbar();
        if (isPinned) await dismissPinPrompt();
        sendResponse({ show: showPinToToolbar === true && !isPinned, isPinned });
        break;
      }

      case 'dismissPinToToolbar': {
        await dismissPinPrompt();
        sendResponse({ success: true });
        break;
      }

      case 'popupOpened': {
        await syncPinBadge();
        sendResponse({ success: true });
        break;
      }

      case 'openUrl': {
        chrome.tabs.create({ url: msg.url });
        sendResponse({ success: true });
        break;
      }

      case 'recoveryComplete': {
        await chrome.storage.local.set({ isLocked: false });
        await setBrowserLockRule(false);
        await restoreLockFullscreen();
        await releaseLockTabs({ keepPlain: true });
        // Remove content overlays from all tabs
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'unlock' });
          } catch (_) {}
        }
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ error: 'Unknown action.' });
    }
  })();
  return true;
});
