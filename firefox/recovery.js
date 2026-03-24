/* ───────────────────────────────────────────────
   TouchLock – Recovery Page
   Picks 2 random questions from the 3 stored,
   verifies hashed answers, then resets credentials.
   ─────────────────────────────────────────────── */

(async function init() {
  const noSqSection   = document.getElementById('no-sq');
  const formSection   = document.getElementById('sq-form');
  const successEl     = document.getElementById('sq-success');
  const errorEl       = document.getElementById('error');
  const btnVerify     = document.getElementById('btn-verify');

  const labels  = [document.getElementById('q-label-1'), document.getElementById('q-label-2')];
  const inputs  = [document.getElementById('q-answer-1'), document.getElementById('q-answer-2')];

  // Load stored questions
  const { securityQuestions, securityQuestionsConfigured } =
    await chrome.storage.local.get(['securityQuestions', 'securityQuestionsConfigured']);

  if (!securityQuestionsConfigured || !securityQuestions || securityQuestions.length < 3) {
    noSqSection.style.display = 'block';
    return;
  }

  // Pick 2 random from the 3 stored
  const shuffled = [...securityQuestions].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 2);

  labels[0].textContent = chosen[0].questionText;
  labels[1].textContent = chosen[1].questionText;
  formSection.style.display = 'block';

  inputs[0].addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputs[1].focus();
  });
  inputs[1].addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verify();
  });

  btnVerify.addEventListener('click', verify);
  setTimeout(() => inputs[0].focus(), 100);

  async function verify() {
    const a1 = inputs[0].value.trim();
    const a2 = inputs[1].value.trim();

    if (!a1 || !a2) {
      showError('Please answer both questions.');
      return;
    }

    btnVerify.disabled = true;
    btnVerify.textContent = 'Verifying…';

    const hash1 = await hashValue(a1.toLowerCase(), chosen[0].answerSalt);
    const hash2 = await hashValue(a2.toLowerCase(), chosen[1].answerSalt);

    const match1 = hash1 === chosen[0].answerHash;
    const match2 = hash2 === chosen[1].answerHash;

    if (match1 && match2) {
      // Reset all credentials, unlock, redirect to setup
      await chrome.storage.local.remove([
        'pinHash', 'pinSalt',
        'webauthnCredentialId', 'webauthnRegistered',
        'securityQuestions', 'securityQuestionsConfigured',
        'setupComplete'
      ]);
      await chrome.storage.local.set({ isLocked: false });

      // Notify background to clean up lock tabs / overlays
      chrome.runtime.sendMessage({ action: 'recoveryComplete' });

      formSection.style.display = 'none';
      document.getElementById('subtitle').textContent = '';
      successEl.style.display = 'block';
      successEl.innerHTML = `
        <div class="success-icon">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Identity Verified</h2>
        <p style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:20px">
          Your credentials have been cleared. Redirecting to setup…
        </p>
      `;

      setTimeout(() => {
        window.location.href = chrome.runtime.getURL('options.html');
      }, 2000);

    } else {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verify & Reset';
      showError('One or both answers are incorrect. Please try again.');
      inputs.forEach(i => i.value = '');
      inputs[0].focus();
    }
  }

  function showError(text) {
    errorEl.textContent = text;
    errorEl.classList.add('visible');
    setTimeout(() => errorEl.classList.remove('visible'), 4000);
  }
})();

async function hashValue(value, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + value);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
