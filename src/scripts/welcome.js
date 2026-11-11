/* ───────────────────────────────────────────────
   TouchLock – Welcome Page Script
   ─────────────────────────────────────────────── */

(async function () {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  if (isLocked === true) {
    window.location.replace(chrome.runtime.getURL('src/pages/lock.html'));
    return;
  }

  ['btn-setup', 'btn-setup-bottom'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => {
      chrome.tabs.update({ url: chrome.runtime.getURL('src/pages/options.html') });
    });
  });

  const shortcutKey = document.getElementById('shortcut-key');
  if (/Mac/i.test(navigator.platform)) shortcutKey.textContent = 'Control + L';
  chrome.commands.getAll((cmds) => {
    if (chrome.runtime.lastError) return;
    const lockCmd = cmds.find(c => c.name === 'lock-browser');
    if (lockCmd && lockCmd.shortcut) shortcutKey.textContent = lockCmd.shortcut.replace('MacCtrl', 'Control').split('+').join(' + ');
  });

  // ── Pin-to-toolbar prompt ──────────────────────
  const banner  = document.getElementById('pin-toolbar-banner');
  const dismiss = document.getElementById('pin-toolbar-dismiss');
  const steps   = document.getElementById('pin-toolbar-steps');
  const done    = document.getElementById('pin-toolbar-done');

  chrome.runtime.sendMessage({ action: 'checkPinToToolbar' }, (res) => {
    if (chrome.runtime.lastError || !res) return;

    if (res.isPinned) {
      // Already pinned — show a brief "all good" confirmation then hide
      banner.classList.remove('hidden');
      steps.classList.add('hidden');
      done.classList.remove('hidden');
      setTimeout(() => {
        banner.classList.add('fade-out');
        setTimeout(() => banner.classList.add('hidden'), 400);
      }, 3000);
      return;
    }

    if (res.show) {
      banner.classList.remove('hidden');
      startPinCheck();
    }
  });

  dismiss.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'dismissPinToToolbar' });
    banner.classList.add('fade-out');
    setTimeout(() => banner.classList.add('hidden'), 400);
  });

  // Poll to auto-detect when user pins the extension
  function startPinCheck() {
    const interval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'checkPinToToolbar' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.isPinned) {
          clearInterval(interval);
          steps.classList.add('hidden');
          done.classList.remove('hidden');
          setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.classList.add('hidden'), 400);
          }, 3000);
        }
      });
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  }
})();
