/* ───────────────────────────────────────────────
   TouchLock – Welcome Page Script
   ─────────────────────────────────────────────── */

document.getElementById('btn-setup').addEventListener('click', () => {
  chrome.tabs.update({ url: chrome.runtime.getURL('src/pages/options.html') });
});
