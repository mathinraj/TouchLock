/* ───────────────────────────────────────────────
   TouchLock – Content Script (lock overlay)
   ─────────────────────────────────────────────── */
(function () {
  if (window.__touchlockLoaded) return;
  window.__touchlockLoaded = true;

  const OVERLAY_ID = 'touchlock-overlay';
  let overlay = null;

  // ── Check state on load ──────────────────────

  try {
    chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.isLocked) showOverlay();
    });
  } catch (_) { /* extension context invalidated */ }

  // ── Listen for lock / unlock from background ─

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'lock') {
      showOverlay();
      sendResponse({ ok: true });
    } else if (msg.action === 'unlock') {
      hideOverlay();
      sendResponse({ ok: true });
    }
  });

  // ── Build overlay ────────────────────────────

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    overlay.innerHTML = `
      <div class="tl-card">
        <div class="tl-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            <circle cx="12" cy="16" r="1"/>
          </svg>
        </div>
        <h1 class="tl-title">Browser Locked</h1>
        <p class="tl-subtitle">Enter your 6-digit PIN or use biometrics to unlock</p>

        <div class="tl-pin-wrap">
          <div class="tl-pin-dots" id="tl-pin-dots">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <input type="password" id="tl-pin-input" class="tl-pin-input"
                 maxlength="6" inputmode="numeric" pattern="[0-9]*"
                 placeholder="••••••" autocomplete="off" />
        </div>

        <div class="tl-error" id="tl-error"></div>

        <button id="tl-pin-btn" class="tl-btn tl-btn-primary">Unlock with PIN</button>

        <div class="tl-divider"><span>or</span></div>

        <button id="tl-bio-btn" class="tl-btn tl-btn-secondary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/>
            <path d="M5 19.5C5.5 18 6 15 6 12c0-3.5 2.5-6 6-6 2 0 3.7 1 4.8 2.5"/>
            <path d="M10 12c0 4-1 8-3 10"/>
            <path d="M14 12c0 2.5-.5 5-1.5 7"/>
            <path d="M18 12c0 1-.5 3-1 4.5"/>
            <path d="M22 12a10 10 0 0 1-2 6"/>
            <path d="M10 12a2 2 0 1 1 4 0"/>
          </svg>
          Unlock with Biometrics
        </button>

        <a id="tl-forgot-link" class="tl-forgot-link" href="#">Forgot PIN?</a>

        <p class="tl-footer">TouchLock – Screen Lock Extension</p>
      </div>
    `;

    const ensureInsert = () => {
      const root = document.documentElement || document.body;
      if (root) root.appendChild(overlay);
    };

    if (document.documentElement) {
      ensureInsert();
    } else {
      document.addEventListener('DOMContentLoaded', ensureInsert);
    }

    // Hide "Forgot PIN?" if SQ not configured
    try {
      chrome.storage.local.get('securityQuestionsConfigured', (data) => {
        if (chrome.runtime.lastError) return;
        const link = overlay.querySelector('#tl-forgot-link');
        if (!data.securityQuestionsConfigured && link) {
          link.style.display = 'none';
        }
      });
    } catch (_) {}

    blockInteraction();
    bindEvents();
  }

  function hideOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) {
      el.classList.add('tl-fade-out');
      setTimeout(() => el.remove(), 300);
    }
    overlay = null;
    unblockInteraction();
  }

  // ── Event bindings ───────────────────────────

  function bindEvents() {
    const pinInput = overlay.querySelector('#tl-pin-input');
    const pinBtn   = overlay.querySelector('#tl-pin-btn');
    const bioBtn   = overlay.querySelector('#tl-bio-btn');
    const dots     = overlay.querySelector('#tl-pin-dots');
    const errorEl  = overlay.querySelector('#tl-error');

    pinInput.addEventListener('input', () => {
      const len = pinInput.value.length;
      const spans = dots.querySelectorAll('span');
      spans.forEach((s, i) => s.classList.toggle('filled', i < len));
      errorEl.textContent = '';
    });

    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPin();
    });

    const forgotLink = overlay.querySelector('#tl-forgot-link');

    pinBtn.addEventListener('click', submitPin);
    bioBtn.addEventListener('click', requestBiometric);
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openRecovery' });
    });

    setTimeout(() => pinInput.focus(), 100);

    function submitPin() {
      const pin = pinInput.value.trim();
      if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        showError('Please enter a 6-digit PIN.');
        return;
      }
      pinBtn.disabled = true;
      pinBtn.textContent = 'Verifying…';
      chrome.runtime.sendMessage({ action: 'verifyPin', pin }, (res) => {
        pinBtn.disabled = false;
        pinBtn.textContent = 'Unlock with PIN';
        if (chrome.runtime.lastError || !res) {
          showError('Communication error. Try again.');
          return;
        }
        if (res.success) {
          hideOverlay();
        } else {
          showError(res.error || 'Incorrect PIN.');
          pinInput.value = '';
          const spans = dots.querySelectorAll('span');
          spans.forEach(s => s.classList.remove('filled'));
          pinInput.focus();
        }
      });
    }

    function requestBiometric() {
      chrome.runtime.sendMessage({ action: 'openBiometricAuth' });
    }

    function showError(text) {
      errorEl.textContent = text;
      errorEl.classList.add('visible');
      setTimeout(() => errorEl.classList.remove('visible'), 3000);
    }
  }

  // ── Block all interaction behind the overlay ─

  let blockHandler = null;

  function blockInteraction() {
    blockHandler = (e) => {
      if (overlay && !overlay.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const opts = { capture: true, passive: false };
    ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click',
     'contextmenu', 'touchstart', 'touchend', 'wheel', 'focus']
      .forEach(evt => document.addEventListener(evt, blockHandler, opts));
  }

  function unblockInteraction() {
    if (!blockHandler) return;
    const opts = { capture: true, passive: false };
    ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click',
     'contextmenu', 'touchstart', 'touchend', 'wheel', 'focus']
      .forEach(evt => document.removeEventListener(evt, blockHandler, opts));
    blockHandler = null;
  }
})();
