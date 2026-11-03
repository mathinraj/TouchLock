/* ───────────────────────────────────────────────
   TouchLock – WebAuthn settings (Firefox)
   Firefox rejects moz-extension:// origins as a WebAuthn
   RP ID ("The operation is insecure"). Since Firefox 150 an
   extension may claim a domain covered by its host
   permissions instead. Credentials are bound to this domain,
   so it must never change.
   ─────────────────────────────────────────────── */

const WEBAUTHN_RP_ID = 'touchlock.vercel.app';
const WEBAUTHN_MIN_FIREFOX = 150;
const WEBAUTHN_NEEDS_HOST_ACCESS = true;
const WEBAUTHN_PROMPT_HINT = ' Your system prompt will show "touchlock.vercel.app" — that\'s TouchLock.';

function webauthnUnavailableReason() {
  const match = navigator.userAgent.match(/Firefox\/(\d+)/);
  if (match && parseInt(match[1], 10) < WEBAUTHN_MIN_FIREFOX) {
    return `Biometric unlock needs Firefox ${WEBAUTHN_MIN_FIREFOX} or later. Update Firefox to use it — your PIN keeps working meanwhile.`;
  }
  return null;
}
