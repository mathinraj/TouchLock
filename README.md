# TouchLock – Fingerprint Browser Lock

A browser extension for Chromium (Edge, Chrome, Brave, etc.) and Firefox that locks your browser profile behind **Touch ID / Windows Hello** biometrics or a **PIN**.

## Features

- **Profile-level lock** – blocks access to the entire browser profile (history, downloads, bookmarks — everything) until authenticated
- **Biometric unlock** – WebAuthn-based platform authentication (Touch ID on macOS, Windows Hello on Windows), auto-triggers on lock screen
- **4–10 digit PIN** – flexible PIN length with a strength indicator (Weak → Fair → Good → Strong); always available as a fallback
- **Keyboard shortcut** – instantly lock the browser with a customizable key combo (default: Alt+L / Ctrl+L on Mac); configurable from Settings
- **Security questions** – set up 3 questions during setup; answer any 2 correctly to reset a forgotten PIN
- **Auto-lock on startup** – every browser launch requires authentication
- **Auto-lock on idle** – optionally lock after a configurable period of inactivity (1 min – 1 hour)
- **Manual lock** – one-click lock from the toolbar popup
- **Tab guards** – prevents switching to other tabs, opening new tabs, or closing the lock tab while locked
- **Manifest V3** – modern service-worker architecture, works on Chrome 110+, Edge 110+, and other Chromium browsers
- **Firefox support** – full Manifest V3 support for Firefox 109+, including auto-updating browser shortcuts via `browser.commands.update()`

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
   - **Firefox:** `about:debugging#/runtime/this-firefox`
4. Enable **Developer mode** (toggle in the top-right, or click "Load Temporary Add-on" for Firefox)
5. Click **Load unpacked** and select the `TouchLock` folder (or `firefox/` folder for Firefox)
6. The extension will open the **Settings** page automatically on first install

## Initial Setup

1. **Set a PIN** – choose a 4–10 digit PIN as your fallback unlock method (the strength indicator shows how secure it is)
2. **Set up 3 security questions** – choose from 9 predefined questions and provide answers (used for PIN recovery)
3. **Register biometrics** *(optional but recommended)* – click "Register Biometrics" and verify with Touch ID or Windows Hello
4. You're ready! The extension will auto-lock on the next browser startup

## How It Works

### Locking
- On browser startup, the service worker opens a dedicated **lock tab** in every window and activates tab guards
- Tab guards prevent switching to other tabs, opening `chrome://history`, `chrome://downloads`, etc.
- Clicking "Lock Now" in the popup manually locks the browser
- Press the **keyboard shortcut** (default: Alt+L) from any web page to lock instantly
- Content overlays are injected on all web pages as a visual safety net

### Unlocking
- **Biometrics (auto):** If registered, Touch ID / Windows Hello triggers automatically when the lock screen loads
- **PIN:** Enter your PIN on the lock screen (4–10 digits, matching your configured length)
- **Forgot PIN:** Click "Forgot PIN?" → answer 2 of your 3 security questions → credentials reset → re-setup

### Keyboard Shortcut

| | Default | Customizable |
|---|---------|-------------|
| **Chrome / Edge / Brave** | Alt+L | Yes, in Settings (works on web pages); for browser pages, set via `chrome://extensions/shortcuts` |
| **Firefox** | Alt+L | Yes, in Settings (auto-applies everywhere via `browser.commands.update()`) |
| **Mac** | Ctrl+L | Use Ctrl (not Option) to avoid special character conflicts |

To change the shortcut, go to **Settings → Lock Behavior → Quick-lock shortcut → Change** and press your desired key combination. Reserved browser shortcuts (Ctrl+S, Ctrl+C, etc.) are blocked with a clear explanation.

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
| `background.js` | Service worker – lock state, tab guards, message routing, PIN verification, keyboard shortcut command |
| `lock.html/js/css` | Full-page lock screen with auto-biometric trigger, dynamic PIN dots, and PIN input |
| `content.js/css` | Content script – visual overlay safety net on web pages, keyboard shortcut listener |
| `popup.html/js/css` | Toolbar popup – status display and Lock button |
| `options.html/js/css` | Settings – PIN setup with strength indicator, security questions, WebAuthn registration, shortcut configuration |
| `recovery.html/js/css` | PIN recovery – verifies 2 security question answers, resets credentials |
| `auth.html/js` | Biometric auth popup – WebAuthn in extension origin context |

### Security Notes

- PIN is hashed with **SHA-256 + random salt** before storage (never stored in plaintext)
- Security question answers are **individually hashed** with unique salts (case-normalized before hashing)
- WebAuthn credentials use `authenticatorAttachment: 'platform'` to ensure on-device biometrics
- All data is stored in `chrome.storage.local` (profile-scoped, not synced)
- Tab guards use 5 listeners (`onActivated`, `onCreated`, `onUpdated`, `onRemoved`, `windows.onCreated`) to prevent access to any browser feature while locked
- The content overlay uses `z-index: 2147483647` and event capture to block interaction
- Keyboard shortcut recorder blocks reserved browser shortcuts and warns about macOS Option key conflicts

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Store hashed PIN, security questions, WebAuthn credential ID, and shortcut preferences |
| `tabs` | Query and message all open tabs for lock/unlock, tab guards |
| `scripting` | Inject lock overlay into tabs that load before the content script |
| `idle` | Detect user inactivity for auto-lock on idle |
| `host_permissions: <all_urls>` | Required for scripting injection on any page |

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Google Chrome 110+ | Supported |
| Microsoft Edge 110+ | Supported |
| Brave | Supported |
| Opera / Vivaldi | Should work (Chromium-based) |
| Firefox 109+ | Supported |

## Changelog

### v1.2.0
- **Variable PIN length** – PIN now supports 4–10 digits with a visual strength indicator (Weak / Fair / Good / Strong)
- **Keyboard shortcut** – lock the browser instantly with Alt+L (customizable); reserved shortcuts are blocked
- **Firefox auto-shortcut** – custom shortcuts are automatically applied at the browser level via `browser.commands.update()`
- **Auto-save shortcuts** – shortcut changes are saved immediately without needing to click "Save Lock Settings"

### v1.1.0
- Initial public release with biometric unlock, 6-digit PIN, security questions, auto-lock, and tab guards
