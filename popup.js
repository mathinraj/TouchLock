/* ───────────────────────────────────────────────
   TouchLock – Popup Script
   ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  const badge       = document.getElementById('status-badge');
  const setupNeeded = document.getElementById('setup-needed');
  const actions     = document.getElementById('actions');
  const btnLock     = document.getElementById('btn-lock');
  const btnSetup    = document.getElementById('btn-setup');
  const btnSettings = document.getElementById('btn-settings');

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
});
