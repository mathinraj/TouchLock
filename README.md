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
- **Fullscreen lock screen** – optionally hides the address bar, tabs, and browser UI while locked (on by default)
- **Tab guards** – prevents switching to other tabs, opening new tabs, or closing the lock tab while locked
- **Lock specific sites (PRO)** – keep sites like banking or email locked even while the browser is unlocked; add them in Settings or with "Lock this site" in the popup, with configurable re-lock timing and subdomain matching
- **PIN-protected settings** – changing credentials, removing locked sites, changing site-lock settings, or resetting data requires your PIN or biometrics
- **Guided tour** – an interactive walkthrough of Settings on first install, replayable from the sidebar
- **Manifest V3** – modern service-worker architecture, works on Chrome 110+, Edge 110+, and other Chromium browsers
- **Firefox support** – full Manifest V3 support for Firefox 115+, including auto-updating browser shortcuts via `browser.commands.update()`

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
4. **Lock specific sites** *(optional)* – in **Settings → Lock Specific Sites**, add sites such as `bank.com`, or open a site and click **Lock this site** in the toolbar popup
5. You're ready! The extension will auto-lock on the next browser startup

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

### Lock Specific Sites
- Opening a locked site shows a TouchLock unlock page instead of the site; unlock with biometrics (auto-triggers when the tab is visible) or your PIN, and you're taken to the page you were opening
- An unlocked site locks again based on **Lock an unlocked site again**: when you leave it or close all its tabs (default), 5 / 15 / 30 / 60 minutes after unlocking, or only when the browser locks
- **Include subdomains** (default on): locking `google.com` also locks `mail.google.com` and `drive.google.com`; `www.` is always included
- **Keep sites locked after unlocking the browser** (default on): when off, unlocking the browser also unlocks your locked sites
- Sites always lock again when the browser locks or restarts
- The popup shows the current site with **Lock this site**, or **Lock now** while it's unlocked
- Each locked site gets a `declarativeNetRequest` dynamic rule that redirects its pages to `site-lock.html` before any request is sent; a `tabs.onUpdated` check catches navigations without a request (back/forward cache, `view-source:`)
- Unlocking a site adds a higher-priority session "allow" rule; session rules and unlock state (`storage.session`) are cleared automatically when the browser restarts
- Site locking is paused while no PIN or biometrics are set up, so you can't be locked out of a site
- Limitation: someone with access to an unlocked browser can still disable or remove the extension itself from the browser's extensions page

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
| `site-lock-bg.js` | Per-site lock in the background – declarativeNetRequest rules, unlock grants, re-lock alarms, tab checks |
| `site-lock-shared.js` | Site matching and settings helpers shared by the background, popup, Settings, and site lock page |
| `lock.html/js/css` | Full-page lock screen with auto-biometric trigger, dynamic PIN dots, and PIN input |
| `site-lock.html` | Unlock page for a single locked site (reuses `lock.js` / `lock.css`) |
| `content.js/css` | Content script – visual overlay safety net on web pages, keyboard shortcut listener |
| `popup.html/js/css` | Toolbar popup – status, Lock button, and "Lock this site" / "Lock now" for the current site |
| `options.html/js/css` | Settings – PIN setup with strength indicator, security questions, WebAuthn registration, shortcut configuration |
| `options-sites.js` | Settings – Lock Specific Sites section |
| `reauth.js` | PIN / biometric confirmation dialog for sensitive settings changes |
| `recovery.html/js/css` | PIN recovery – verifies 2 security question answers, resets credentials |
| `auth.html/js` | Biometric auth popup – WebAuthn in extension origin context |

### Security Notes

- PIN is hashed with **SHA-256 + random salt** before storage (never stored in plaintext)
- Security question answers are **individually hashed** with unique salts (case-normalized before hashing)
- WebAuthn credentials use `authenticatorAttachment: 'platform'` to ensure on-device biometrics
- All data is stored in `chrome.storage.local` (profile-scoped, not synced); which sites are currently unlocked lives in `chrome.storage.session` and is cleared on browser restart
- Site unlock messages are only accepted from the extension's own site lock page, never from web pages or content scripts
- Changing PIN, biometrics or security questions, removing a locked site, changing site-lock settings, and Reset All require PIN or biometric confirmation (valid for 2 minutes)
- Tab guards use 5 listeners (`onActivated`, `onCreated`, `onUpdated`, `onRemoved`, `windows.onCreated`) to prevent access to any browser feature while locked
- The content overlay uses `z-index: 2147483647` and event capture to block interaction
- Keyboard shortcut recorder blocks reserved browser shortcuts and warns about macOS Option key conflicts

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Store hashed PIN, security questions, WebAuthn credential ID, shortcut preferences, and locked sites |
| `tabs` | Query and message all open tabs for lock/unlock, tab guards, and locking open tabs of a locked site |
| `scripting` | Inject lock overlay into tabs that load before the content script |
| `idle` | Detect user inactivity for auto-lock on idle |
| `alarms` | Re-lock a site after the chosen number of minutes |
| `declarativeNetRequestWithHostAccess` | Redirect locked sites to the unlock page before they load |
| `host_permissions: <all_urls>` | Required for scripting injection and site-lock redirects on any page |

`src/pages/site-lock.html` is listed in `web_accessible_resources` because the browser only lets redirect rules send a page to extension pages listed there; it refuses to run inside a frame.

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Google Chrome 110+ | Supported |
| Microsoft Edge 110+ | Supported |
| Brave | Supported |
| Opera / Vivaldi | Should work (Chromium-based) |
| Firefox 115+ | Supported (biometrics need Firefox 150+) |

## Changelog

### v1.4.1
- **Fix: biometrics in Firefox** – registration failed with "The operation is insecure" because Firefox rejects `moz-extension://` origins as a WebAuthn RP ID; the Firefox build now uses `touchlock.vercel.app` as the RP ID (allowed for domains covered by host permissions since Firefox 150); older Firefox versions show a notice and keep PIN unlock
- **Clearer biometric errors** – if Firefox blocks registration because website access is turned off, Settings explains how to allow it

### v1.4.0
- **Lock specific sites (PRO)** – add sites in Settings → Lock Specific Sites or via "Lock this site" in the popup; locked sites are redirected to a TouchLock unlock page before they load (declarativeNetRequest), even while the browser is unlocked
- **Re-lock options** – an unlocked site locks again when you leave it or close all its tabs (default), after 5–60 minutes, or only when the browser locks; sites always re-lock on browser lock and restart
- **Subdomain and browser-unlock options** – choose whether locking `google.com` also covers `mail.google.com` (default on), and whether unlocking the browser also unlocks sites (default off)
- **Re-authentication for sensitive settings** – changing PIN, biometrics or security questions, removing a locked site, changing locked-site settings, and Reset All now require your PIN or biometrics
- **Cleaner popup** – status moved into the header; on websites, Settings becomes a gear icon next to Lock Now to make room for the current-site card; slightly larger layout overall
- **Guided tour** – new step for Lock Specific Sites
- **Feedback follow-up** – new [feedback tracker](https://touchlock.vercel.app/feedback.html) page listing user reports and their fixes; the uninstall page and Settings promise a fix within 7 days and accept an optional email to notify users when their feedback is done; the uninstall link now includes the extension version and browser
- **Firefox** – minimum version is now Firefox 115 (needed for `storage.session`)

### v1.3.6
- **Fix: missing logo** – the TouchLock logo now displays in Settings (top-left corner), the popup, Welcome, and What's New pages; store builds previously omitted `icons/icon.svg`

### v1.3.5
- **Guided tour** – step-by-step interactive tour auto-starts on first install, walking users through every settings section with detailed explanations; includes a "Guided Tour" button in the sidebar to replay anytime
- **Fullscreen lock screen** – new option (on by default) that puts the browser into fullscreen when locked, hiding the address bar, tabs, and all browser UI to prevent bypassing
- **Auto-save lock settings** – lock behavior toggles (startup lock, fullscreen, idle lock, idle timeout) now save instantly on change; no more "Save" button needed
- **Redesigned settings page** – completely rebuilt with sidebar navigation, centered content layout, setup progress bar, and clear visual hierarchy with colored section icons
- **Pin-to-toolbar prompt** – on first install, a guided banner on the welcome page helps users pin the extension to their browser toolbar; auto-detects when pinned using `chrome.action.getUserSettings()`
- **Grid & list view toggle** – floating bottom-right toggle lets users switch settings between a compact 2-column grid and a focused single-column list; preference is persisted
- **Support strip** – slim, non-intrusive support banner at the bottom of settings for "Buy me a coffee" and "Rate" actions
- **Responsive sidebar** – on smaller screens, the sidebar collapses into a hamburger menu overlay with smooth slide-in animation
- **Scrollspy navigation** – active sidebar link updates automatically as you scroll through settings sections

### v1.2.1
- **Store-specific builds** – build script produces separate zips for Chrome, Edge, and Firefox with correct store links baked in
- **Remote update check** – fetches latest version from a remote JSON on startup; shows update banner in popup, settings, and lock screen
- **Rate prompt** – non-intrusive rating prompt rotates in the popup alongside cross-promotions; respects "Remind me" and "Rated" states
- **Cross-promotion** – rotating banner in popup fetches projects from a remote JSON; self-exclusion prevents promoting the current extension
- **Uninstall feedback** – opens a feedback page with contextual nudges when the extension is uninstalled
- **Upcoming features roadmap** – collapsible section in Settings showing planned free and Pro features
- **Pro badges** – visual Pro tags on premium features (custom shortcut, 1-min idle lock) for future monetization

### v1.2.0
- **Variable PIN length** – PIN now supports 4–10 digits with a visual strength indicator (Weak / Fair / Good / Strong)
- **Keyboard shortcut** – lock the browser instantly with Alt+L (customizable); reserved shortcuts are blocked
- **Firefox auto-shortcut** – custom shortcuts are automatically applied at the browser level via `browser.commands.update()`
- **Auto-save shortcuts** – shortcut changes are saved immediately without needing to click "Save Lock Settings"

### v1.1.0
- Initial public release with biometric unlock, 6-digit PIN, security questions, auto-lock, and tab guards
