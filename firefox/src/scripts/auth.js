/* ───────────────────────────────────────────────
   TouchLock – Biometric Auth Page
   Runs inside a popup window under the extension
   origin so WebAuthn RP ID matches registration.
   ─────────────────────────────────────────────── */

const statusEl  = document.getElementById('status');
const retryBtn  = document.getElementById('retry-btn');

retryBtn.addEventListener('click', authenticate);

authenticate();

async function authenticate() {
  retryBtn.style.display = 'none';
  statusEl.innerHTML = '<div class="spinner"></div> Waiting for biometric verification…';
  statusEl.className = '';

  try {
    const { webauthnCredentialId, webauthnRegistered } =
      await chrome.storage.local.get(['webauthnCredentialId', 'webauthnRegistered']);

    if (!webauthnRegistered || !webauthnCredentialId) {
      fail('No biometric credential registered. Please register in Settings first.');
      return;
    }

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
      statusEl.innerHTML = '&#10003; Authenticated successfully!';
      statusEl.className = 'success';

      chrome.runtime.sendMessage({ action: 'biometricUnlock' }, () => {
        setTimeout(() => window.close(), 600);
      });
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      fail('Verification cancelled or timed out.');
    } else {
      fail(`Authentication failed: ${err.message}`);
    }
  }
}

function fail(msg) {
  statusEl.textContent = msg;
  statusEl.className = 'error';
  retryBtn.style.display = 'block';
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
