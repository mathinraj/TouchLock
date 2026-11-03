/* ───────────────────────────────────────────────
   TouchLock – "Require PIN every…" policy
   After the chosen number of hours since the last
   successful PIN entry, biometrics stop working until
   the PIN is entered again. Shared by the background
   and every page that offers biometric unlock.
   ─────────────────────────────────────────────── */

const PIN_INTERVAL_HOURS = [1, 4, 6, 12, 24];
const HOUR_MS = 60 * 60 * 1000;

function getPinInterval(raw) {
  const hours = Number(raw);
  return PIN_INTERVAL_HOURS.includes(hours) ? hours : 0;
}

// When biometrics stop working: Infinity if the policy is off, 0 if a PIN is needed now.
function biometricsAllowedUntil({ pinHash, pinRequiredEvery, lastPinUnlockAt }) {
  const hours = getPinInterval(pinRequiredEvery);
  if (!hours || !pinHash) return Infinity;
  const now = Date.now();
  // A clock set back before the last PIN entry also requires the PIN.
  if (!lastPinUnlockAt || lastPinUnlockAt > now) return 0;
  const until = lastPinUnlockAt + hours * HOUR_MS;
  return until > now ? until : 0;
}

async function getBiometricWindow() {
  const data = await chrome.storage.local.get(['pinHash', 'pinRequiredEvery', 'lastPinUnlockAt']);
  return biometricsAllowedUntil(data);
}

async function biometricAllowedNow() {
  return (await getBiometricWindow()) > 0;
}
