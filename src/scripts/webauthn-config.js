/* ───────────────────────────────────────────────
   TouchLock – WebAuthn settings (Chromium)
   Chromium accepts the extension ID as the RP ID.
   Changing it would orphan every registered credential.
   ─────────────────────────────────────────────── */

const WEBAUTHN_RP_ID = location.hostname || location.host;
const WEBAUTHN_PROMPT_HINT = '';
const WEBAUTHN_NEEDS_HOST_ACCESS = false;

function webauthnUnavailableReason() {
  return null;
}
