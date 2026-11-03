/* ───────────────────────────────────────────────
   TouchLock – Re-authentication for sensitive
   settings changes (credentials, locked sites,
   reset). Anyone at an unlocked browser could
   otherwise switch protection off.
   ─────────────────────────────────────────────── */

const REAUTH_GRACE_MS = 2 * 60 * 1000;
let reauthUntil = 0;
let reauthDialog = null;

// Resolves true when the user proved it's them (or nothing is set up yet).
async function requireAuth(reason) {
  const { pinHash, pinLength, webauthnRegistered, webauthnCredentialId } =
    await chrome.storage.local.get(['pinHash', 'pinLength', 'webauthnRegistered', 'webauthnCredentialId']);

  const hasBio = !!(webauthnRegistered && webauthnCredentialId);
  if (!pinHash && !hasBio) return true;
  if (Date.now() < reauthUntil) return true;

  const ok = await showReauthDialog(reason, {
    hasPin: !!pinHash,
    pinLength: pinLength || 6,
    credentialId: hasBio ? webauthnCredentialId : null
  });
  if (ok) reauthUntil = Date.now() + REAUTH_GRACE_MS;
  return ok;
}

function buildReauthDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'reauth-overlay hidden';
  overlay.innerHTML = `
    <div class="reauth-card" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <div class="reauth-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 class="reauth-title" id="reauth-title">Confirm it's you</h3>
      <p class="reauth-reason" id="reauth-reason"></p>
      <input type="password" class="reauth-pin" id="reauth-pin" inputmode="numeric"
             pattern="[0-9]*" maxlength="10" autocomplete="off" placeholder="Enter your PIN">
      <div class="msg" id="reauth-msg"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="reauth-cancel">Cancel</button>
        <button class="btn btn-primary" id="reauth-confirm">Confirm</button>
      </div>
      <button class="btn btn-secondary reauth-bio" id="reauth-bio">Use biometrics instead</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function showReauthDialog(reason, { hasPin, pinLength, credentialId }) {
  if (!reauthDialog) reauthDialog = buildReauthDialog();

  const overlay    = reauthDialog;
  const reasonEl   = overlay.querySelector('#reauth-reason');
  const pinInput   = overlay.querySelector('#reauth-pin');
  const msgEl      = overlay.querySelector('#reauth-msg');
  const btnConfirm = overlay.querySelector('#reauth-confirm');
  const btnCancel  = overlay.querySelector('#reauth-cancel');
  const btnBio     = overlay.querySelector('#reauth-bio');

  reasonEl.textContent = `${reason} requires your ${hasPin ? 'PIN' : 'biometrics'}.`;
  pinInput.value = '';
  pinInput.maxLength = pinLength;
  pinInput.classList.toggle('hidden', !hasPin);
  btnConfirm.classList.toggle('hidden', !hasPin);
  btnBio.classList.toggle('hidden', !credentialId);
  btnBio.textContent = hasPin ? 'Use biometrics instead' : 'Verify with biometrics';
  msgEl.textContent = '';
  msgEl.className = 'msg';
  overlay.classList.remove('hidden');
  if (hasPin) setTimeout(() => pinInput.focus(), 50);

  return new Promise((resolve) => {
    function close(result) {
      overlay.classList.add('hidden');
      btnConfirm.removeEventListener('click', confirmPin);
      btnCancel.removeEventListener('click', cancel);
      btnBio.removeEventListener('click', useBiometrics);
      pinInput.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEscape, true);
      resolve(result);
    }

    function fail(text) {
      msgEl.textContent = text;
      msgEl.className = 'msg error';
    }

    function confirmPin() {
      const pin = pinInput.value.trim();
      if (!/^\d+$/.test(pin)) { fail('Enter your PIN.'); return; }
      btnConfirm.disabled = true;
      chrome.runtime.sendMessage({ action: 'checkPin', pin }, (res) => {
        btnConfirm.disabled = false;
        if (!chrome.runtime.lastError && res && res.success) {
          close(true);
        } else {
          pinInput.value = '';
          pinInput.focus();
          fail('Incorrect PIN.');
        }
      });
    }

    async function useBiometrics() {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId: WEBAUTHN_RP_ID,
            allowCredentials: [{
              id: base64ToBuffer(credentialId),
              type: 'public-key',
              transports: ['internal']
            }],
            userVerification: 'required',
            timeout: 60000
          }
        });
        if (assertion) close(true);
      } catch (err) {
        fail(err.name === 'NotAllowedError' ? 'Verification cancelled or timed out.' : 'Biometric verification failed.');
      }
    }

    function cancel() { close(false); }
    function onKey(e) { if (e.key === 'Enter') confirmPin(); }
    function onBackdrop(e) { if (e.target === overlay) close(false); }
    function onEscape(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(false);
    }

    btnConfirm.addEventListener('click', confirmPin);
    btnCancel.addEventListener('click', cancel);
    btnBio.addEventListener('click', useBiometrics);
    pinInput.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEscape, true);
  });
}
