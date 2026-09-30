/* ───────────────────────────────────────────────
   TouchLock – Full-Page Lock Screen
   Runs as an extension page → same origin as
   registration, so WebAuthn works directly here.
   ─────────────────────────────────────────────── */

const STORE_URLS = {
  chrome:  'https://chromewebstore.google.com/detail/jajgeiifpgdfnphjklcogipefkfdacdl',
  edge:    'https://microsoftedge.microsoft.com/addons/detail/aibbojojoeamjgikgailflpbhdpcjgln',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/'
};

let pendingUpdateRedirect = false;

(async function init() {
  const { updateAvailable, latestVersion } = await chrome.storage.local.get(['updateAvailable', 'latestVersion']);
  if (updateAvailable && latestVersion) {
    const corner = document.getElementById('update-corner');
    document.getElementById('update-corner-text').textContent = `v${latestVersion} available — Update now`;
    corner.classList.remove('hidden');

    corner.addEventListener('click', async () => {
      pendingUpdateRedirect = true;
      const store = typeof TOUCHLOCK_STORE !== 'undefined' ? TOUCHLOCK_STORE : 'chrome';
      const url = STORE_URLS[store] || 'https://touchlock.vercel.app/#install';
      await chrome.storage.local.set({ pendingUpdateUrl: url });
      const card = document.querySelector('.card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      document.getElementById('pin-input').focus();
    });
  }

  const pinInput      = document.getElementById('pin-input');
  const pinBtn        = document.getElementById('btn-pin');
  const bioBtn        = document.getElementById('btn-bio');
  const dots          = document.getElementById('pin-dots');
  const errorEl       = document.getElementById('error');
  const bioAutoStatus = document.getElementById('bio-auto-status');
  const subtitleEl    = document.getElementById('subtitle');
  const pinSection    = document.getElementById('pin-section');

  const forgotLink    = document.getElementById('forgot-link');

  const { webauthnRegistered, webauthnCredentialId, securityQuestionsConfigured, pinLength } =
    await chrome.storage.local.get(['webauthnRegistered', 'webauthnCredentialId', 'securityQuestionsConfigured', 'pinLength']);

  const currentPinLength = pinLength || 6;
  const hasBiometrics = !!(webauthnRegistered && webauthnCredentialId);

  pinInput.maxLength = currentPinLength;
  pinInput.placeholder = '•'.repeat(currentPinLength);

  dots.innerHTML = '';
  for (let i = 0; i < currentPinLength; i++) {
    dots.appendChild(document.createElement('span'));
  }

  if (!hasBiometrics) {
    bioBtn.style.display = 'none';
    bioBtn.previousElementSibling.style.display = 'none';
    subtitleEl.textContent = `Enter your ${currentPinLength}-digit PIN to unlock`;
  }

  if (!securityQuestionsConfigured) {
    forgotLink.style.display = 'none';
  }

  // ── PIN dot animation ──────────────────────

  pinInput.addEventListener('input', () => {
    const spans = dots.querySelectorAll('span');
    spans.forEach((s, i) => s.classList.toggle('filled', i < pinInput.value.length));
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  });

  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPin();
  });

  pinBtn.addEventListener('click', submitPin);
  bioBtn.addEventListener('click', () => triggerBiometrics(false, MAX_AUTO_RETRIES));

  // ── Auto-trigger biometrics if registered ──

  if (hasBiometrics) {
    bioAutoStatus.style.display = 'flex';
    subtitleEl.textContent = 'Verifying your identity…';
    setTimeout(() => triggerBiometrics(true, 0), 1000);
  } else {
    setTimeout(() => pinInput.focus(), 100);
  }

  // ── PIN submission ─────────────────────────

  function submitPin() {
    const pin = pinInput.value.trim();
    if (pin.length < 4 || pin.length > 10 || !/^\d+$/.test(pin)) {
      showError(`Please enter your ${currentPinLength}-digit PIN.`);
      return;
    }
    pinBtn.disabled = true;
    pinBtn.textContent = 'Verifying…';

    chrome.runtime.sendMessage({ action: 'verifyPin', pin }, (res) => {
      if (chrome.runtime.lastError || !res) {
        pinBtn.disabled = false;
        pinBtn.textContent = 'Unlock with PIN';
        showError('Communication error. Try again.');
        return;
      }
      if (res.success) {
        showSuccess();
      } else {
        pinBtn.disabled = false;
        pinBtn.textContent = 'Unlock with PIN';
        showError(res.error || 'Incorrect PIN.');
        pinInput.value = '';
        dots.querySelectorAll('span').forEach(s => s.classList.remove('filled'));
        pinInput.focus();
      }
    });
  }

  // ── Biometric authentication ───────────────

  const MAX_AUTO_RETRIES = 2;

  async function triggerBiometrics(isAutoTrigger, retryCount) {
    bioAutoStatus.style.display = 'flex';
    bioAutoStatus.querySelector('span').textContent = 'Waiting for biometric verification…';

    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname || location.host,
          allowCredentials: [{
            id: base64ToBuffer(webauthnCredentialId),
            type: 'public-key',
            transports: ['internal']
          }],
          userVerification: 'required',
          timeout: 60000
        },
        mediation: 'optional'
      });

      if (assertion) {
        chrome.runtime.sendMessage({ action: 'biometricUnlock' }, () => showSuccess());
      }
    } catch (err) {
      const userCancelled = err.name === 'NotAllowedError';

      if (isAutoTrigger && !userCancelled && retryCount < MAX_AUTO_RETRIES) {
        setTimeout(() => triggerBiometrics(true, retryCount + 1), 800);
        return;
      }

      bioAutoStatus.style.display = 'none';
      subtitleEl.textContent = 'Enter your PIN or use biometrics to unlock';

      if (isAutoTrigger) {
        pinInput.focus();
      } else {
        showError(
          userCancelled
            ? 'Verification cancelled or timed out.'
            : `Authentication failed: ${err.message}`
        );
      }
    }
  }

  // ── Helpers ────────────────────────────────

  function showError(text) {
    errorEl.textContent = text;
    errorEl.classList.add('visible');
    setTimeout(() => errorEl.classList.remove('visible'), 3000);
  }

  function showSuccess() {
    document.querySelector('.card').innerHTML = `
      <div class="icon" style="background:linear-gradient(135deg,#34d399,#059669)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h1 class="title" style="margin-top:8px">Unlocked</h1>
      <p class="subtitle">Welcome back!</p>
    `;

    
  }
})();

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
