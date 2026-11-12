/* ───────────────────────────────────────────────
   TouchLock – Helpers shared by Settings and its
   sub-pages (lock behavior, locked sites, duress).
   ─────────────────────────────────────────────── */

const DEFAULT_SHORTCUT = { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, key: 'L', code: 'KeyL' };

// Sub-pages are extension pages too; while locked they belong behind the lock screen.
async function redirectIfLocked() {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  if (isLocked !== true) return false;
  window.location.replace(chrome.runtime.getURL('src/pages/lock.html'));
  return true;
}

function setStatus(el, text, color) {
  el.querySelector('.dot').className = `dot ${color}`;
  el.querySelector('span:last-child').textContent = text;
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function formatShortcut(sc) {
  const parts = [];
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  if (sc.ctrlKey)  parts.push('Ctrl');
  if (sc.altKey)   parts.push(isMac ? 'Option' : 'Alt');
  if (sc.shiftKey) parts.push('Shift');
  if (sc.metaKey)  parts.push(isMac ? 'Cmd' : 'Win');
  parts.push(sc.key);
  return parts.join(' + ');
}

function isReservedShortcut(combo, key) {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const c = isMac ? combo.metaKey : combo.ctrlKey;
  const s = combo.shiftKey;
  const a = combo.altKey;
  const k = key.toUpperCase();
  const mod = isMac ? 'Cmd' : 'Ctrl';

  if (c && !s && !a) {
    const reserved = ['S','P','Z','X','C','V','A','F','H','J','N','T','W','R','L','D','G','E','K','O','U','B','Q'];
    if (reserved.includes(k)) return `${mod}+${k} is reserved by the browser.`;
    if (/^[1-9]$/.test(k)) return `${mod}+${k} is used for tab switching.`;
  }

  if (c && s && !a) {
    const reserved = ['T','N','I','J','B','R','P','D','M','O'];
    if (reserved.includes(k)) return `${mod}+Shift+${k} is reserved by the browser.`;
  }

  if (!isMac && a && !c && !s && !combo.metaKey) {
    if (k === 'F4') return 'Alt+F4 closes the window.';
  }

  if (/^F\d{1,2}$/.test(k)) {
    const fNum = parseInt(k.slice(1), 10);
    if (fNum >= 1 && fNum <= 12 && !a && !s) return `${k} is reserved by the browser.`;
  }

  if (isMac && a && !combo.ctrlKey && !combo.metaKey) {
    return 'Option key produces special characters on Mac, which may interfere with text fields. Use Ctrl + key instead.';
  }

  return null;
}
