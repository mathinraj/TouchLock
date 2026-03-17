# TouchLock – Fingerprint Browser Lock

A Chromium browser extension (Edge, Chrome, Brave, etc.) that locks your browser profile behind **Touch ID / Windows Hello** biometrics or a **6-digit PIN**.

## Features

- **Profile-level lock** – blocks access to the entire browser profile (history, downloads, bookmarks — everything) until authenticated
- **Biometric unlock** – WebAuthn-based platform authentication (Touch ID on macOS, Windows Hello on Windows), auto-triggers on lock screen
- **6-digit PIN fallback** – always available, even when biometrics aren't supported
- **Security questions** – set up 3 questions during setup; answer any 2 correctly to reset a forgotten PIN
- **Auto-lock on startup** – every browser launch requires authentication
- **Manual lock** – one-click lock from the toolbar popup
- **Tab guards** – prevents switching to other tabs, opening new tabs, or closing the lock tab while locked
- **Manifest V3** – modern service-worker architecture, works on Chrome 110+, Edge 110+, and other Chromium browsers

## Installation (Developer Mode)

1. Clone or download this repository
2. Generate icons (only needed once):

```bash
node generate-icons.js
```

3. Open your browser and navigate to:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
4. Enable **Developer mode** (toggle in the top-right)
5. Click **Load unpacked** and select the `TouchLock` folder
6. The extension will open the **Settings** page automatically on first install

## Initial Setup

1. **Set a 6-digit PIN** – this is your fallback unlock method
2. **Set up 3 security questions** – choose from 9 predefined questions and provide answers (used for PIN recovery)
3. **Register biometrics** *(optional but recommended)* – click "Register Biometrics" and verify with Touch ID or Windows Hello
4. You're ready! The extension will auto-lock on the next browser startup

## How It Works

### Locking
- On browser startup, the service worker opens a dedicated **lock tab** in every window and activates tab guards
- Tab guards prevent switching to other tabs, opening `chrome://history`, `chrome://downloads`, etc.
- Clicking "Lock Now" in the popup manually locks the browser
- Content overlays are injected on all web pages as a visual safety net

### Unlocking
- **Biometrics (auto):** If registered, Touch ID / Windows Hello triggers automatically when the lock screen loads
- **PIN:** Enter your 6-digit PIN on the lock screen
- **Forgot PIN:** Click "Forgot PIN?" → answer 2 of your 3 security questions → credentials reset → re-setup

### PIN Recovery Flow

1. On the lock screen, click **"Forgot PIN?"**
2. The recovery page presents **2 randomly selected** questions from the 3 you configured
3. Answer both correctly (case-insensitive)
4. All credentials (PIN, biometrics, security questions) are cleared
5. You're redirected to the Settings page to configure a new PIN

### Architecture

| File | Role |
|------|------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `background.js` | Service worker – lock state, tab guards, message routing, PIN verification |
| `lock.html/js/css` | Full-page lock screen with auto-biometric trigger and PIN input |
| `content.js/css` | Content script – visual overlay safety net on web pages |
| `popup.html/js/css` | Toolbar popup – status display and Lock button |
| `options.html/js/css` | Settings – PIN setup, security questions, WebAuthn registration |
| `recovery.html/js/css` | PIN recovery – verifies 2 security question answers, resets credentials |
| `auth.html/js` | Biometric auth popup – WebAuthn in extension origin context |

### Security Notes

- PIN is hashed with **SHA-256 + random salt** before storage (never stored in plaintext)
- Security question answers are **individually hashed** with unique salts (case-normalized before hashing)
- WebAuthn credentials use `authenticatorAttachment: 'platform'` to ensure on-device biometrics
- All data is stored in `chrome.storage.local` (profile-scoped, not synced)
- Tab guards use 5 listeners (`onActivated`, `onCreated`, `onUpdated`, `onRemoved`, `windows.onCreated`) to prevent access to any browser feature while locked
- The content overlay uses `z-index: 2147483647` and event capture to block interaction

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Store hashed PIN, security questions, and WebAuthn credential ID |
| `tabs` | Query and message all open tabs for lock/unlock, tab guards |
| `scripting` | Inject lock overlay into tabs that load before the content script |
| `host_permissions: <all_urls>` | Required for scripting injection on any page |

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Google Chrome 110+ | Supported |
| Microsoft Edge 110+ | Supported |
| Brave | Supported |
| Opera / Vivaldi | Should work (Chromium-based) |
| Firefox | Not supported (uses different extension APIs) |
