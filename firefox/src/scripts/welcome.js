/* ───────────────────────────────────────────────
   TouchLock – Welcome Page Script
   ─────────────────────────────────────────────── */

(async function () {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  if (isLocked === true) {
    window.location.replace(chrome.runtime.getURL('src/pages/lock.html'));
    return;
  }

  document.getElementById('btn-setup').addEventListener('click', () => {
    chrome.tabs.update({ url: chrome.runtime.getURL('src/pages/options.html') });
  });
})();
