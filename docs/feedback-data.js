/* ───────────────────────────────────────────────
   TouchLock – Feedback tracker entries
   Shown on feedback.html. Add new entries at the top.

   type:    'bug' | 'feature' | 'improvement'
   status:  'reported'     – received, not started yet
            'in-progress'  – being worked on
            'rolling-out'  – fixed, waiting for store review
            'released'     – live in the stores
   dates:   'YYYY-MM-DD' (resolvedOn = when the fix was done)
   version: release that contains the fix (links to the changelog)
   ─────────────────────────────────────────────── */

const FEEDBACK_ITEMS = [
  {
    type: 'feature',
    title: 'Duress PIN that erases site history and cookies',
    feedback: 'A second password that when entered wipes all the history of one site and all that sites cookies or another choice could be that every site and the cookies from the account with the extension are wiped.',
    source: 'Store review',
    reportedOn: '2026-11-12',
    status: 'rolling-out',
    resolution: 'Added a Duress PIN (Settings → Duress PIN). It unlocks like your real PIN but first erases what you choose: the history of specific sites, their history plus cookies and site data, or all browsing data. Extra permissions are only requested when you turn it on.',
    version: '1.5.4',
    resolvedOn: '2026-11-12'
  },
  {
    type: 'improvement',
    title: 'Fullscreen lock gets in the way of other apps',
    feedback: 'Exclude the full screen option when prompting the finger print when using multiple applications its hard to operate it. Anyways the extension is good',
    source: 'Store review',
    reportedOn: '2026-11-12',
    status: 'rolling-out',
    resolution: 'Fullscreen lock used to bring the browser to the front and go fullscreen as soon as it locked, even while you were working in another app, and forced it back to fullscreen if you switched away. Now it only goes fullscreen when you switch to the browser to unlock, and leaves it alone while you use other apps. Fullscreen also stays optional and off by default.',
    version: '1.5.4',
    resolvedOn: '2026-11-12'
  },
  {
    type: 'bug',
    title: 'Idle lock kicks in while watching YouTube',
    feedback: 'A feature would be nice to have the automatic lock ignore specific sites such as youtube if it\'s playing video so it doesn\'t lock when watching something.',
    source: 'Store review',
    reportedOn: '2026-11-11',
    status: 'rolling-out',
    resolution: 'The idle lock only counted keyboard and mouse input, so a long video looked like you had walked away. It now waits while a video is playing, on any site or only the sites you choose (like youtube.com), and locks after your usual idle time once the video stops. A safety limit still locks the browser if something plays for hours, and the popup can pause auto-lock for an hour.',
    version: '1.5.2',
    resolvedOn: '2026-11-11'
  },
  {
    type: 'bug',
    title: 'Pressing Esc gets past the lock screen',
    feedback: 'It just lets people access it easily by pressing the Escape key.',
    source: 'Store review',
    reportedOn: '2026-11-03',
    status: 'rolling-out',
    resolution: 'Esc exited the fullscreen lock and showed the browser again. Now, while locked, every website and browser page (including Settings and Extensions) is sent to the lock screen before it opens, and the window goes straight back to fullscreen if Esc is pressed. Tabs return to their pages after you unlock.',
    version: '1.5.1',
    resolvedOn: '2026-11-03'
  },
  {
    type: 'feature',
    title: 'Require the PIN periodically, even with fingerprint unlock',
    feedback: 'After a password unlock, fingerprint unlock should work for a configurable period — e.g. 1h, 4h, 6h, 12h or 24h. When that period expires, require a password unlock, then fingerprint works again for another full period.',
    source: 'Email',
    reportedOn: '2026-11-03',
    status: 'rolling-out',
    resolution: 'Added "Require PIN every…" in Settings → Biometric Authentication with 1, 4, 6, 12 and 24 hours. Once the time is up, Touch ID and Windows Hello stop working until you unlock once with your PIN, and then work for another full period.',
    version: '1.5.0',
    resolvedOn: '2026-11-03'
  },
  {
    type: 'bug',
    title: 'Chrome stuck in fullscreen after unlocking',
    feedback: 'The navigation buttons keep disappearing after unlocking the browser, and websites fail to load. It keeps forcing Chrome to be full screen.',
    source: 'Store review',
    browser: 'Chrome',
    reportedOn: '2026-11-03',
    status: 'rolling-out',
    resolution: 'Unlocking now always brings windows TouchLock made fullscreen back to their normal size, including after the browser was closed while locked. Fullscreen lock is also off by default now and was switched off once for existing users. If a window is still stuck, press F11 once.',
    version: '1.4.1',
    resolvedOn: '2026-11-03'
  },
  {
    type: 'bug',
    title: 'Windows Hello registration fails in Firefox',
    feedback: 'Registering Windows Hello consistently fails with "Registration failed: The operation is insecure." Windows Hello is set up and available.',
    source: 'Email',
    browser: 'Firefox 158 · Windows 11',
    reportedOn: '2026-11-03',
    status: 'rolling-out',
    resolution: 'Firefox doesn\'t accept an extension\'s own address as the biometric site ID. TouchLock for Firefox now uses touchlock.vercel.app instead, which Firefox 150+ allows, so Touch ID and Windows Hello work for registering and unlocking.',
    version: '1.4.1',
    resolvedOn: '2026-11-03'
  },
  {
    type: 'feature',
    title: 'Keep specific sites locked after unlocking the browser',
    feedback: 'Missing lock on specific sites after unlocking. Hopefully it will get a fix in the future.',
    source: 'Store review',
    browser: 'Chrome & Firefox',
    reportedOn: '2026-11-02',
    status: 'rolling-out',
    resolution: 'Added Lock Specific Sites: banking, email or any site now asks for your fingerprint or PIN before it opens, even while the browser is unlocked. You choose when an unlocked site locks again and whether subdomains are included. Add sites in Settings or with "Lock this site" in the popup.',
    version: '1.4.0',
    resolvedOn: '2026-11-03'
  },
  {
    type: 'bug',
    title: 'Logo not showing in the top-left corner of Settings',
    feedback: 'A small UI bug: the logo is not showing correctly in the settings top left corner.',
    source: 'Store review',
    browser: 'Chrome & Firefox',
    reportedOn: '2026-11-02',
    status: 'rolling-out',
    resolution: 'The store packages were missing the logo file. It is now included, so the logo shows in Settings, the popup, Welcome and What\'s New pages.',
    version: '1.3.6',
    resolvedOn: '2026-11-02'
  },
  {
    type: 'feature',
    title: 'Keyboard shortcut to lock instantly',
    feedback: 'Asked for a quick way to lock the browser without opening the popup.',
    source: 'User request',
    status: 'released',
    resolution: 'Added a customizable lock shortcut (Alt+L by default, Ctrl+L on Mac). Reserved browser shortcuts are blocked with a clear warning.',
    version: '1.2.0',
    resolvedOn: '2026-09-01'
  },
  {
    type: 'feature',
    title: 'Choose a shorter or longer PIN',
    feedback: 'Asked to use a PIN length other than 6 digits.',
    source: 'User request',
    status: 'released',
    resolution: 'PINs can now be 4–10 digits, with a live strength indicator while you type.',
    version: '1.2.0',
    resolvedOn: '2026-09-01'
  }
];
