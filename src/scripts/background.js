/* ───────────────────────────────────────────────
   TouchLock – Background Service Worker (MV3)
   ─────────────────────────────────────────────── */

const LOCK_URL     = chrome.runtime.getURL('src/pages/lock.html');
const RECOVERY_URL = chrome.runtime.getURL('src/pages/recovery.html');
const OPTIONS_URL  = chrome.runtime.getURL('src/pages/options.html');
const WELCOME_URL  = chrome.runtime.getURL('src/pages/welcome.html');

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

  // Open a lock tab in every open window
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

  const { unlockCount } = await chrome.storage.local.get('unlockCount');
  await chrome.storage.local.set({ unlockCount: (unlockCount || 0) + 1 });

  // Close all lock tabs
  const allTabs = await chrome.tabs.query({});
  const lockTabIds = allTabs.filter(t => isLockUrl(t.url)).map(t => t.id);
  if (lockTabIds.length > 0) {
    try { await chrome.tabs.remove(lockTabIds); } catch (_) {}
  }

  // Remove content overlays from remaining tabs
  const remaining = await chrome.tabs.query({});
  for (const tab of remaining) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'unlock' });
    } catch (_) {}
  }

  // Handle pending update redirect from lock screen
  const { pendingUpdateUrl } = await chrome.storage.local.get('pendingUpdateUrl');
  if (pendingUpdateUrl) {
    await chrome.storage.local.remove('pendingUpdateUrl');
    chrome.tabs.create({ url: pendingUpdateUrl });
  }
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

async function verifyPin(pin) {
  const { pinHash, pinSalt, pinLength } = await chrome.storage.local.get(['pinHash', 'pinSalt', 'pinLength']);
  if (!pinHash || !pinSalt) return { success: false, error: 'PIN not configured.' };

  const expectedLen = pinLength || 6;
  if (pin.length !== expectedLen) return { success: false, error: 'Incorrect PIN.' };

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

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      isLocked: false,
      setupComplete: false,
      lockOnStartup: true,
      idleLockEnabled: false,
      idleLockTimeout: 300
    });
    chrome.tabs.create({ url: WELCOME_URL });
  }

  if (details.reason === 'update') {
    await chrome.storage.local.set({
      showWhatsNew: true,
      updatedFrom: details.previousVersion,
      updatedTo: chrome.runtime.getManifest().version
    });
  }

  applyIdleSettings();
  checkForUpdate();
});

chrome.runtime.onStartup.addListener(async () => {
  applyIdleSettings();
  checkForUpdate();

  const { lockOnStartup } = await chrome.storage.local.get('lockOnStartup');
  if (lockOnStartup === false) return;

  if (await isSetupComplete()) {
    await lockBrowser();
  }
});

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

      case 'openUrl': {
        chrome.tabs.create({ url: msg.url });
        sendResponse({ success: true });
        break;
      }

      case 'recoveryComplete': {
        await chrome.storage.local.set({ isLocked: false });
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
