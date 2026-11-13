/* ───────────────────────────────────────────────
   TouchLock – Meet the Developer page
   ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  if (await redirectIfLocked()) return;
  document.getElementById('dev-version').textContent = chrome.runtime.getManifest().version;
});
