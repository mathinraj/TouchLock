/* ───────────────────────────────────────────────
   TouchLock – Full-Page Lock Screen
   Runs as an extension page → same origin as
   registration, so WebAuthn works directly here.
   ─────────────────────────────────────────────── */

(async function init() {
  const pinInput      = document.getElementById('pin-input');
  const pinBtn        = document.getElementById('btn-pin');
  const bioBtn        = document.getElementById('btn-bio');
  const dots          = document.getElementById('pin-dots');
  const errorEl       = document.getElementById('error');
  const bioAutoStatus = document.getElementById('bio-auto-status');
  const subtitleEl    = document.getElementById('subtitle');
  const pinSection    = document.getElementById('pin-section');

  const forgotLink    = document.getElementById('forgot-link');

  const { webauthnRegistered, webauthnCredentialId, securityQuestionsConfigured } =
    await chrome.storage.local.get(['webauthnRegistered', 'webauthnCredentialId', 'securityQuestionsConfigured']);

  const hasBiometrics = !!(webauthnRegistered && webauthnCredentialId);

  if (!hasBiometrics) {
    bioBtn.style.display = 'none';
    bioBtn.previousElementSibling.style.display = 'none'; // hide divider
    subtitleEl.textContent = 'Enter your 6-digit PIN to unlock';
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
  bioBtn.addEventListener('click', triggerBiometrics);

  // ── Auto-trigger biometrics if registered ──

  if (hasBiometrics) {
    bioAutoStatus.style.display = 'flex';
    subtitleEl.textContent = 'Verifying your identity…';
    setTimeout(() => triggerBiometrics(true), 400);
  } else {
    setTimeout(() => pinInput.focus(), 100);
  }

  // ── PIN submission ─────────────────────────

  function submitPin() {
    const pin = pinInput.value.trim();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      showError('Please enter a 6-digit PIN.');
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

  async function triggerBiometrics(isAutoTrigger) {
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
        }
      });

      if (assertion) {
        chrome.runtime.sendMessage({ action: 'biometricUnlock' }, () => showSuccess());
      }
    } catch (err) {
      bioAutoStatus.style.display = 'none';
      subtitleEl.textContent = 'Enter your 6-digit PIN or use biometrics to unlock';

      if (isAutoTrigger) {
        pinInput.focus();
      } else {
        showError(
          err.name === 'NotAllowedError'
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
