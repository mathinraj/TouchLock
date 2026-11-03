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
