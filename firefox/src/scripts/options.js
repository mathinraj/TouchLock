/* ───────────────────────────────────────────────
   TouchLock – Options Page Script
   (PIN setup + WebAuthn + Security Questions)
   ─────────────────────────────────────────────── */

// ── EmailJS Configuration ────────────────────
// Sign up at https://www.emailjs.com (free tier: 200 emails/month)
// 1. Create a service (e.g., Gmail) → copy Service ID
// 2. Create a template with variables: {{from_email}}, {{category}}, {{message}}, {{timestamp}}, {{version}}
// 3. Copy your Public Key from Account > API Keys
const EMAILJS_SERVICE_ID  = 'service_em2o2a6';   // ← Replace with your EmailJS service ID
const EMAILJS_TEMPLATE_ID = 'template_6595ut4';  // ← Replace with your EmailJS template ID
const EMAILJS_PUBLIC_KEY  = 'R2Yro3gG1FbXS9fJm';   // ← Replace with your EmailJS public key

const SECURITY_QUESTIONS = [
  { id: 1,  text: 'What is the name of your first pet?' },
  { id: 2,  text: 'What was the name of your first school?' },
  { id: 3,  text: 'In what city were you born?' },
  { id: 4,  text: 'What was your childhood nickname?' },
  { id: 6,  text: 'What is the name of your favorite childhood friend?' },
  { id: 9,  text: 'What was the name of your first animal or toy?' },
  { id: 10, text: 'What is your favorite sports team?' },
  { id: 13, text: 'What was the name of your first employer?' },
  { id: 14, text: 'In what city did you have your first job?' }
];

const DEFAULT_SHORTCUT = { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, key: 'L', code: 'KeyL' };
const MIN_PIN = 4;
const MAX_PIN = 10;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { isLocked } = await chrome.storage.local.get('isLocked');
  if (isLocked === true) {
    window.location.replace(chrome.runtime.getURL('src/pages/lock.html'));
    return;
  }

  const pin1          = document.getElementById('pin1');
  const pin2          = document.getElementById('pin2');
  const btnSavePin    = document.getElementById('btn-save-pin');
  const pinMsg        = document.getElementById('pin-msg');
  const pinStatus     = document.getElementById('pin-status');
  const pinStrFill    = document.getElementById('pin-strength-fill');
  const pinStrLabel   = document.getElementById('pin-strength-label');

  const btnRegBio     = document.getElementById('btn-register-bio');
  const btnRemoveBio  = document.getElementById('btn-remove-bio');
  const bioMsg        = document.getElementById('bio-msg');
  const bioStatus     = document.getElementById('bio-status');

  const sqSelects     = [1, 2, 3].map(i => document.getElementById(`sq-select-${i}`));
  const sqAnswers     = [1, 2, 3].map(i => document.getElementById(`sq-answer-${i}`));
  const btnSaveSQ     = document.getElementById('btn-save-sq');
  const sqMsg         = document.getElementById('sq-msg');
  const sqStatus      = document.getElementById('sq-status');

  const toggleStartup = document.getElementById('toggle-startup');
  const toggleIdle    = document.getElementById('toggle-idle');
  const idleField     = document.getElementById('idle-timeout-field');
  const idleTimeout   = document.getElementById('idle-timeout');
  const btnSaveLock   = document.getElementById('btn-save-lock');
  const lockMsg       = document.getElementById('lock-msg');
  const lockStatus    = document.getElementById('lock-status');

  const shortcutDisplay   = document.getElementById('shortcut-display');
  const btnRecordShortcut = document.getElementById('btn-record-shortcut');
  const shortcutRecording = document.getElementById('shortcut-recording');
  const btnCancelShortcut = document.getElementById('btn-cancel-shortcut');

  const frEmail       = document.getElementById('fr-email');
  const frCategory    = document.getElementById('fr-category');
  const frMessage     = document.getElementById('fr-message');
  const btnSendFR     = document.getElementById('btn-send-fr');
  const frMsg         = document.getElementById('fr-msg');

  const btnReset      = document.getElementById('btn-reset');

  const btnWhatsNew   = document.getElementById('btn-whats-new');
  const whatsNewDot   = document.getElementById('whats-new-dot');

  populateQuestionDropdowns();
  await loadLockSettings();
  await loadShortcut();
  await loadWhatsNew();
  await loadRateBanner();
  await refreshStatus();

  // ── PIN strength indicator ──────────────────

  pin1.addEventListener('input', () => {
    const len = pin1.value.replace(/\D/g, '').length;
    const { level, label } = getPinStrength(len);
    if (len === 0) {
      pinStrFill.style.width = '0';
      pinStrFill.removeAttribute('data-level');
      pinStrLabel.textContent = '';
      pinStrLabel.removeAttribute('data-level');
    } else {
      pinStrFill.setAttribute('data-level', level);
      pinStrLabel.setAttribute('data-level', level);
      pinStrLabel.textContent = label;
    }
  });

  // ── Save PIN ─────────────────────────────────

  btnSavePin.addEventListener('click', async () => {
    const p1 = pin1.value.trim();
    const p2 = pin2.value.trim();

    if (!/^\d+$/.test(p1) || p1.length < MIN_PIN || p1.length > MAX_PIN) {
      showMsg(pinMsg, `PIN must be ${MIN_PIN}–${MAX_PIN} digits.`, 'error');
      return;
    }
    if (p1 !== p2) {
      showMsg(pinMsg, 'PINs do not match.', 'error');
      return;
    }

    const salt = crypto.randomUUID();
    const hash = await hashValue(p1, salt);

    await chrome.storage.local.set({
      pinHash: hash,
      pinSalt: salt,
      pinLength: p1.length,
      setupComplete: true
    });

    pin1.value = '';
    pin2.value = '';
    pinStrFill.style.width = '0';
    pinStrFill.removeAttribute('data-level');
    pinStrLabel.textContent = '';
    pinStrLabel.removeAttribute('data-level');
    showMsg(pinMsg, 'PIN saved successfully.', 'success');
    await refreshStatus();
  });

  // ── Save Security Questions ────────────────

  btnSaveSQ.addEventListener('click', async () => {
    const selectedIds = sqSelects.map(s => s.value);
    const answers     = sqAnswers.map(a => a.value.trim());

    if (selectedIds.some(id => !id)) {
      showMsg(sqMsg, 'Please select all 3 questions.', 'error');
      return;
    }

    const uniqueIds = new Set(selectedIds);
    if (uniqueIds.size < 3) {
      showMsg(sqMsg, 'Each question must be different.', 'error');
      return;
    }

    if (answers.some(a => a.length < 2)) {
      showMsg(sqMsg, 'Each answer must be at least 2 characters.', 'error');
      return;
    }

    const stored = [];
    for (let i = 0; i < 3; i++) {
      const q = SECURITY_QUESTIONS.find(q => String(q.id) === selectedIds[i]);
      const salt = crypto.randomUUID();
      const hash = await hashValue(answers[i].toLowerCase(), salt);
      stored.push({
        questionId: q.id,
        questionText: q.text,
        answerHash: hash,
        answerSalt: salt
      });
    }

    await chrome.storage.local.set({
      securityQuestions: stored,
      securityQuestionsConfigured: true
    });

    sqAnswers.forEach(a => a.value = '');
    showMsg(sqMsg, 'Security questions saved successfully.', 'success');
    await refreshStatus();
  });

  // ── Register Biometrics ──────────────────────

  btnRegBio.addEventListener('click', async () => {
    if (!window.PublicKeyCredential) {
      showMsg(bioMsg, 'WebAuthn is not supported in this browser.', 'error');
      return;
    }

    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      showMsg(bioMsg, 'No platform authenticator found (Touch ID / Windows Hello).', 'error');
      return;
    }

    try {
      showMsg(bioMsg, 'Waiting for biometric verification…', 'success');

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'TouchLock Extension',
            id: getRpId()
          },
          user: {
            id: userId,
            name: 'touchlock-user',
            displayName: 'TouchLock User'
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' },
            { alg: -257, type: 'public-key' }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      const credentialId = bufferToBase64(credential.rawId);

      await chrome.storage.local.set({
        webauthnCredentialId: credentialId,
        webauthnRegistered: true,
        setupComplete: true
      });

      showMsg(bioMsg, 'Biometric credential registered successfully!', 'success');
      await refreshStatus();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showMsg(bioMsg, 'Registration cancelled or timed out.', 'error');
      } else {
        showMsg(bioMsg, `Registration failed: ${err.message}`, 'error');
      }
    }
  });

  // ── Remove Biometric ─────────────────────────

  btnRemoveBio.addEventListener('click', async () => {
    await chrome.storage.local.remove(['webauthnCredentialId', 'webauthnRegistered']);
    showMsg(bioMsg, 'Biometric credential removed.', 'success');
    await refreshStatus();
  });

  // ── Lock Behavior Settings ──────────────────

  toggleIdle.addEventListener('change', () => {
    idleField.style.display = toggleIdle.checked ? 'block' : 'none';
  });

  btnSaveLock.addEventListener('click', async () => {
    await chrome.storage.local.set({
      lockOnStartup: toggleStartup.checked,
      idleLockEnabled: toggleIdle.checked,
      idleLockTimeout: parseInt(idleTimeout.value, 10)
    });

    chrome.runtime.sendMessage({ action: 'updateIdleSettings' });

    showMsg(lockMsg, 'Lock settings saved.', 'success');
    await refreshStatus();
  });

  async function loadLockSettings() {
    const data = await chrome.storage.local.get([
      'lockOnStartup', 'idleLockEnabled', 'idleLockTimeout'
    ]);

    toggleStartup.checked = data.lockOnStartup !== false;
    toggleIdle.checked = data.idleLockEnabled === true;
    idleField.style.display = toggleIdle.checked ? 'block' : 'none';

    if (data.idleLockTimeout) {
      idleTimeout.value = String(data.idleLockTimeout);
    }
  }

  // ── Keyboard Shortcut ─────────────────────────

  const openBrowserShortcuts = document.getElementById('open-browser-shortcuts');

  async function loadShortcut() {
    const { lockShortcut } = await chrome.storage.local.get('lockShortcut');
    const sc = lockShortcut || DEFAULT_SHORTCUT;
    shortcutDisplay.textContent = formatShortcut(sc);
  }

  openBrowserShortcuts.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof browser !== 'undefined' && browser.commands && browser.commands.openShortcutSettings) {
      browser.commands.openShortcutSettings();
    } else {
      chrome.tabs.create({ url: 'about:addons' });
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

    if (typeof browser !== 'undefined' && browser.commands && browser.commands.update) {
      const parts = [];
      if (newShortcut.ctrlKey)  parts.push('MacCtrl');
      if (newShortcut.altKey)   parts.push('Alt');
      if (newShortcut.shiftKey) parts.push('Shift');
      if (newShortcut.metaKey)  parts.push('Command');
      parts.push(newShortcut.key);
      browser.commands.update({
        name: 'lock-browser',
        shortcut: parts.join('+')
      }).catch(() => {});
    }

    stopRecording();
    showMsg(lockMsg, 'Shortcut saved!', 'success');
  }

  function stopRecording() {
    document.removeEventListener('keydown', captureShortcut);
    shortcutRecording.classList.add('hidden');
    btnRecordShortcut.classList.remove('hidden');
  }

  // ── What's New ─────────────────────────────────

  async function loadWhatsNew() {
    const { showWhatsNew } = await chrome.storage.local.get('showWhatsNew');
    if (showWhatsNew) {
      whatsNewDot.classList.remove('hidden');
    }
  }

  btnWhatsNew.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/whats-new.html') });
    whatsNewDot.classList.add('hidden');
    chrome.storage.local.set({ showWhatsNew: false });
  });

  // ── Rate Banner ────────────────────────────────

  async function loadRateBanner() {
    const data = await chrome.storage.local.get(['rated', 'remindRateAfter', 'unlockCount']);
    if (data.rated) return;

    const count = data.unlockCount || 0;
    if (count < 20) return;

    if (data.remindRateAfter && Date.now() < data.remindRateAfter) return;

    const banner     = document.getElementById('rate-banner');
    const btnRate    = document.getElementById('opt-rate-now');
    const btnLater   = document.getElementById('opt-rate-later');

    banner.classList.remove('hidden');
    btnRate.href = getReviewUrl();

    btnRate.addEventListener('click', async () => {
      await chrome.storage.local.set({ rated: true });
      banner.classList.add('hidden');
    });

    btnLater.addEventListener('click', async () => {
      const remindAt = Date.now() + (2 * 24 * 60 * 60 * 1000);
      await chrome.storage.local.set({ remindRateAfter: remindAt });
      banner.classList.add('hidden');
    });
  }

  // ── Feature Request (collapsible + EmailJS) ─

  const frToggle  = document.getElementById('fr-toggle');
  const frBody    = document.getElementById('fr-body');
  const frChevron = document.getElementById('fr-chevron');

  frToggle.addEventListener('click', () => {
    const isOpen = frBody.classList.toggle('expanded');
    frChevron.classList.toggle('open', isOpen);
  });

  const roadmapToggle  = document.getElementById('roadmap-toggle');
  const roadmapBody    = document.getElementById('roadmap-body');
  const roadmapChevron = document.getElementById('roadmap-chevron');

  roadmapToggle.addEventListener('click', () => {
    const isOpen = roadmapBody.classList.toggle('expanded');
    roadmapChevron.classList.toggle('open', isOpen);
  });

  btnSendFR.addEventListener('click', async () => {
    const message = frMessage.value.trim();

    if (message.length < 10) {
      showMsg(frMsg, 'Please enter at least 10 characters describing your request.', 'error');
      return;
    }

    btnSendFR.disabled = true;
    btnSendFR.textContent = 'Sending…';

    try {
      const payload = {
        service_id:  EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id:     EMAILJS_PUBLIC_KEY,
        template_params: {
          from_email: frEmail.value.trim() || 'Not provided',
          category:   frCategory.value,
          message:    message,
          timestamp:  new Date().toISOString(),
          version:    chrome.runtime.getManifest().version
        }
      };

      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showMsg(frMsg, 'Thank you! Your request has been sent.', 'success');
        frEmail.value = '';
        frMessage.value = '';
        frCategory.value = 'feature';
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err) {
      showMsg(frMsg, 'Failed to send. Please try again later.', 'error');
    }

    btnSendFR.disabled = false;
    btnSendFR.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Send Request`;
  });

  // ── Reset All ────────────────────────────────

  btnReset.addEventListener('click', async () => {
    if (!confirm('This will erase your PIN, biometric credentials, and security questions. Continue?')) return;

    await chrome.storage.local.clear();
    showMsg(pinMsg, '', '');
    showMsg(bioMsg, '', '');
    showMsg(sqMsg, '', '');
    showMsg(lockMsg, '', '');
    pin1.value = '';
    pin2.value = '';
    sqAnswers.forEach(a => a.value = '');
    sqSelects.forEach(s => s.value = '');
    await loadLockSettings();
    await refreshStatus();
    showMsg(pinMsg, 'All data has been reset.', 'success');
  });

  // ── Helpers ──────────────────────────────────

  function populateQuestionDropdowns() {
    sqSelects.forEach(sel => {
      SECURITY_QUESTIONS.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.text;
        sel.appendChild(opt);
      });
    });

    // When a question is selected, disable it in the other dropdowns
    sqSelects.forEach((sel, idx) => {
      sel.addEventListener('change', () => syncDropdowns());
    });
  }

  function syncDropdowns() {
    const selectedValues = sqSelects.map(s => s.value);

    sqSelects.forEach((sel, idx) => {
      const options = sel.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return;
        const takenElsewhere = selectedValues.some(
          (v, i) => i !== idx && v === opt.value
        );
        opt.disabled = takenElsewhere;
      });
    });
  }

  async function refreshStatus() {
    const data = await chrome.storage.local.get([
      'pinHash', 'webauthnRegistered', 'securityQuestionsConfigured', 'setupComplete',
      'lockOnStartup', 'idleLockEnabled', 'idleLockTimeout'
    ]);

    if (data.pinHash) {
      setStatus(pinStatus, 'PIN configured', 'green');
    } else {
      setStatus(pinStatus, 'Not configured', 'gray');
    }

    if (data.webauthnRegistered) {
      setStatus(bioStatus, 'Biometric registered', 'green');
      btnRemoveBio.classList.remove('hidden');
    } else {
      setStatus(bioStatus, 'Not registered', 'gray');
      btnRemoveBio.classList.add('hidden');
    }

    if (data.securityQuestionsConfigured) {
      setStatus(sqStatus, '3 questions configured', 'green');
    } else {
      setStatus(sqStatus, 'Not configured', 'gray');
    }

    const parts = [];
    if (data.lockOnStartup !== false) parts.push('Startup lock ON');
    else parts.push('Startup lock OFF');
    if (data.idleLockEnabled) {
      const mins = Math.floor((data.idleLockTimeout || 300) / 60);
      parts.push(`Idle lock: ${mins}m`);
    }
    setStatus(lockStatus, parts.join(' · '), data.lockOnStartup !== false || data.idleLockEnabled ? 'green' : 'gray');
  }
}

// ── Utility functions ─────────────────────────

function getRpId() {
  return location.hostname || location.host;
}

async function hashValue(value, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + value);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function setStatus(el, text, color) {
  el.querySelector('.dot').className = `dot ${color}`;
  el.querySelector('span:last-child').textContent = text;
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}

function getPinStrength(length) {
  if (length <= 4)  return { level: 'weak',   label: 'Weak' };
  if (length <= 5)  return { level: 'fair',   label: 'Fair' };
  if (length <= 7)  return { level: 'good',   label: 'Good' };
  return                    { level: 'strong', label: 'Strong' };
}

function formatShortcut(sc) {
  const parts = [];
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  if (sc.ctrlKey)  parts.push(isMac ? 'Ctrl' : 'Ctrl');
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

function getReviewUrl() {
  const ua = navigator.userAgent;
  if (typeof browser !== 'undefined' && browser.runtime) {
    return 'https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/reviews/';
  }
  if (ua.includes('Edg/')) {
    return 'https://microsoftedge.microsoft.com/addons/detail/aibbojojoeamjgikgailflpbhdpcjgln';
  }
  if (ua.includes('Chrome/')) {
    return 'https://chromewebstore.google.com/detail/jajgeiifpgdfnphjklcogipefkfdacdl/reviews';
  }
  return 'https://touchlock.vercel.app/rate.html';
}
