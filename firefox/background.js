/* ───────────────────────────────────────────────
   TouchLock – Background Script (Firefox MV3 Event Page)
   ─────────────────────────────────────────────── */

const LOCK_URL     = chrome.runtime.getURL('lock.html');
const RECOVERY_URL = chrome.runtime.getURL('recovery.html');
const OPTIONS_URL  = chrome.runtime.getURL('options.html');

// ── Helpers ──────────────────────────────────────

function isLockUrl(url) {
  return url && url.startsWith(LOCK_URL);
}

function isAllowedWhileLocked(url) {
  return url && (
    url.startsWith(LOCK_URL) ||
    url.startsWith(RECOVERY_URL) ||
    url.startsWith(OPTIONS_URL)
  );
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

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isLockUrl(tab.url)) {
      injectOverlay(tab.id);
    }
  }
}

async function unlockBrowser() {
  await chrome.storage.local.set({ isLocked: false });

  const allTabs = await chrome.tabs.query({});
  const lockTabIds = allTabs.filter(t => isLockUrl(t.url)).map(t => t.id);
  if (lockTabIds.length > 0) {
    try { await chrome.tabs.remove(lockTabIds); } catch (_) {}
  }

  const remaining = await chrome.tabs.query({});
  for (const tab of remaining) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'unlock' });
    } catch (_) {}
  }
}

async function injectOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'lock' });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId, allFrames: true },
        files: ['content.css']
      });
      await chrome.tabs.sendMessage(tabId, { action: 'lock' });
    } catch (_e) { /* restricted page (about:, etc.) */ }
  }
}

// ── PIN verification ─────────────────────────────

async function verifyPin(pin) {
  const { pinHash, pinSalt } = await chrome.storage.local.get(['pinHash', 'pinSalt']);
  if (!pinHash || !pinSalt) return { success: false, error: 'PIN not configured.' };

  const hash = await hashPin(pin, pinSalt);
  if (hash === pinHash) {
    await unlockBrowser();
    return { success: true };
  }
  return { success: false, error: 'Incorrect PIN.' };
}

// ── Idle detection (auto-lock on inactivity) ────

async function applyIdleSettings() {
  const { idleLockEnabled, idleLockTimeout } = await chrome.storage.local.get([
    'idleLockEnabled', 'idleLockTimeout'
  ]);

  if (idleLockEnabled) {
    const seconds = idleLockTimeout || 300;
    chrome.idle.setDetectionInterval(seconds);
  }
}

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState !== 'idle' && newState !== 'locked') return;

  const { idleLockEnabled, setupComplete } = await chrome.storage.local.get([
    'idleLockEnabled', 'setupComplete'
  ]);

  if (!idleLockEnabled || !setupComplete) return;
  if (await getIsLocked()) return;

  await lockBrowser();
});

// ── Lifecycle events ─────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      isLocked: false,
      setupComplete: false,
      lockOnStartup: true,
      idleLockEnabled: false,
      idleLockTimeout: 300
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
  applyIdleSettings();
});

chrome.runtime.onStartup.addListener(async () => {
  applyIdleSettings();

  const { lockOnStartup } = await chrome.storage.local.get('lockOnStartup');
  if (lockOnStartup === false) return;

  if (await isSetupComplete()) {
    await lockBrowser();
  }
});

// ── Tab guards (profile-level lock) ─────────────

function findGuardTab(tabs) {
  return tabs.find(t => isLockUrl(t.url))
      || tabs.find(t => isAllowedWhileLocked(t.url));
}

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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!(await getIsLocked())) return;
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
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
        await unlockBrowser();
        sendResponse({ success: true });
        break;
      }

      case 'openRecovery': {
        chrome.tabs.create({ url: RECOVERY_URL, active: true });
        sendResponse({ success: true });
        break;
      }

      case 'openBiometricAuth': {
        chrome.windows.create({
          url: chrome.runtime.getURL('auth.html'),
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

      case 'recoveryComplete': {
        await chrome.storage.local.set({ isLocked: false });
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
