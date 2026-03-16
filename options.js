/* ───────────────────────────────────────────────
   TouchLock – Options Page Script
   (PIN setup + WebAuthn + Security Questions)
   ─────────────────────────────────────────────── */

const SECURITY_QUESTIONS = [
  { id: 1,  text: 'What is the name of your first pet?' },
  { id: 2,  text: 'What was the name of your first school?' },
  { id: 3,  text: 'In what city were you born?' },
  { id: 4,  text: 'What was your childhood nickname?' },
  { id: 6,  text: 'What is the name of your favorite childhood friend?' },
  { id: 9,  text: 'What was the name of your first stuffed animal or toy?' },
  { id: 10, text: 'What is your favorite sports team?' },
  { id: 13, text: 'What was the name of your first employer?' },
  { id: 14, text: 'In what city did you have your first job?' }
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const pin1          = document.getElementById('pin1');
  const pin2          = document.getElementById('pin2');
  const btnSavePin    = document.getElementById('btn-save-pin');
  const pinMsg        = document.getElementById('pin-msg');
  const pinStatus     = document.getElementById('pin-status');

  const btnRegBio     = document.getElementById('btn-register-bio');
  const btnRemoveBio  = document.getElementById('btn-remove-bio');
  const bioMsg        = document.getElementById('bio-msg');
  const bioStatus     = document.getElementById('bio-status');

  const sqSelects     = [1, 2, 3].map(i => document.getElementById(`sq-select-${i}`));
  const sqAnswers     = [1, 2, 3].map(i => document.getElementById(`sq-answer-${i}`));
  const btnSaveSQ     = document.getElementById('btn-save-sq');
  const sqMsg         = document.getElementById('sq-msg');
  const sqStatus      = document.getElementById('sq-status');

  const btnReset      = document.getElementById('btn-reset');

  populateQuestionDropdowns();
  await refreshStatus();

  // ── Save PIN ─────────────────────────────────

  btnSavePin.addEventListener('click', async () => {
    const p1 = pin1.value.trim();
    const p2 = pin2.value.trim();

    if (!/^\d{6}$/.test(p1)) {
      showMsg(pinMsg, 'PIN must be exactly 6 digits.', 'error');
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
      setupComplete: true
    });

    pin1.value = '';
    pin2.value = '';
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

  // ── Reset All ────────────────────────────────

  btnReset.addEventListener('click', async () => {
    if (!confirm('This will erase your PIN, biometric credentials, and security questions. Continue?')) return;

    await chrome.storage.local.clear();
    showMsg(pinMsg, '', '');
    showMsg(bioMsg, '', '');
    showMsg(sqMsg, '', '');
    pin1.value = '';
    pin2.value = '';
    sqAnswers.forEach(a => a.value = '');
    sqSelects.forEach(s => s.value = '');
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
      'pinHash', 'webauthnRegistered', 'securityQuestionsConfigured', 'setupComplete'
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
