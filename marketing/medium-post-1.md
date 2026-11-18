# I Got Tired of People Peeking at My Browser, So I Built a Lock for It

### How (and why) I built TouchLock, a free extension that locks your browser behind Touch ID, Windows Hello, or a PIN

> 🖼️ **IMAGE 1: Cover (1400 × 788)**
>
> *Prompt:* A sleek, modern hero illustration in a dark theme. A laptop on a minimal desk shows a browser window covered by a frosted-glass lock screen. In the center of the screen, a glowing indigo-to-purple fingerprint icon with the text "Browser Locked". Soft indigo and violet light glows behind the laptop. A coffee cup and a small potted plant sit beside it. Deep navy-black background (#0a0a14), subtle grid pattern, cinematic lighting, premium product-marketing style, no extra text, 16:9.

My browser knows more about me than most of my friends do.

My bank. My email. My half-written messages. Every "how to fix…" search I've ever made at 2 a.m. And the uncomfortable part: anyone who sat down at my laptop while I grabbed a coffee could see all of it.

Not because they're spies. Usually it's something like:

- A coworker who "just needs to check something quickly" 👀
- A family member who "won't look, promise"
- Someone almost seeing the birthday gift I was secretly buying for them 🎁

Locking my whole computer every time I stood up felt like overkill. Logging out of everything felt worse. I wanted something in between: **lock just the browser, and unlock it with a fingerprint.**

I looked for an extension that did this well, and couldn't find one I trusted. So I built one.

This is the story of **TouchLock**: why I built it, what it does, and how it works under the hood.

---

## The idea: a lock screen for your browser

The goal was simple to say and surprisingly tricky to build:

> When the browser is locked, **nothing** should be visible or usable until you prove it's you.

That means:

- Every tab and every window is covered, not just the current one.
- New tabs, other websites, and even browser pages like Settings or Extensions can't be opened.
- When you unlock, everything comes back exactly as it was.

And unlocking should take one touch, not typing a password every time.

> 🖼️ **IMAGE 2: The lock screen (screenshot or illustration, 1400 × 900)**
>
> *Best option:* a real screenshot of the TouchLock lock screen.
>
> *Prompt (if illustrating):* A clean UI mockup of a browser lock screen in dark mode. Centered card with a rounded lock icon, the title "Browser Locked", six PIN dots, a blue-to-indigo gradient "Unlock with PIN" button, a divider reading "or", and a secondary "Unlock with Biometrics" button with a fingerprint icon. Background dark (#0f1117) with a soft indigo glow. Modern sans-serif typography, crisp, flat UI style.

---

## Unlocking with your fingerprint (yes, in a browser)

Most laptops already have great biometrics: **Touch ID** on Macs and **Windows Hello** on Windows. Browsers can use them through a web standard called **WebAuthn**, the same technology behind passkeys.

TouchLock registers a credential that lives on your device's secure hardware. When the lock screen appears, it asks for that credential, which makes your OS show the familiar fingerprint prompt:

```javascript
await navigator.credentials.get({
  publicKey: {
    challenge,                      // random bytes, new every time
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    userVerification: 'required'    // the OS must actually verify you
  }
});
```

Two things I cared about here:

1. **Your fingerprint never reaches TouchLock.** The OS checks it and just says "yes, it's them." The extension never sees biometric data.
2. **`userVerification: 'required'`** means a key press or a simple "OK" isn't enough. The system has to actually confirm it's you.

There's always a **PIN** as a backup (4 to 10 digits), for computers without biometrics or for when your finger is covered in snack dust. The PIN is never stored as-is: it's hashed with SHA-256 and a random salt.

> 🖼️ **IMAGE 3: Fingerprint prompt (1400 × 800)**
>
> *Prompt:* A close-up illustration of a MacBook keyboard with a finger touching the Touch ID key, which glows softly in indigo. Above it, a floating translucent system dialog reads "TouchLock wants to verify your identity" with a fingerprint symbol. Next to it, a smaller floating Windows Hello face/fingerprint badge, showing both platforms are supported. Dark, moody background with purple and cyan accents, realistic lighting, shallow depth of field.

---

## The features, one by one

Here's what TouchLock does today, in the order you'd discover it.

### 🔒 Lock the whole browser

- **Lock on startup:** every time the browser opens, it's locked.
- **Auto-lock when you step away:** choose 1 minute to 1 hour of inactivity.
- **Instant lock:** one click on the toolbar icon, or press **Alt + L** (you can change the shortcut).

### 🧱 Nothing gets past it

This was the hardest part to get right. While locked:

- Websites you try to open wait at the lock screen.
- Anything typed into the address bar waits too.
- Browser pages like Settings, Extensions and History are held back.
- After you unlock, every tab goes back to the page it was trying to open, so nothing is lost.

### 🏦 Lock specific sites

Sometimes you don't want to lock everything, just the sensitive stuff. With **Lock Specific Sites**, you choose sites like your bank, email, or work tools, and they ask for your fingerprint or PIN even while the rest of the browser is unlocked.

You choose when a site locks again: when you leave it, after 5 to 60 minutes, or only when the browser locks. You can also include subdomains, so locking `google.com` covers `mail.google.com` too.

> 🖼️ **IMAGE 4: Lock Specific Sites (1400 × 900)**
>
> *Best option:* a screenshot of the toolbar popup on a site, showing the "Lock site PRO" button, next to the "Manage locked sites" page.
>
> *Prompt (if illustrating):* A split illustration. Left: a browser tab showing a bank website blurred behind a frosted overlay with a small lock and fingerprint icon and the text "This site is locked". Right: a compact dark extension popup listing "bank.com — Locked", "mail.yahoo.com — Unlocked", "chase.com — Locked" with small colored status pills. Indigo and blue accents on a dark background, clean flat UI style.

### 🧠 Require your PIN every few hours

Fingerprints are so convenient that people forget their PIN, and then they're in trouble the day the fingerprint reader doesn't work. So you can set TouchLock to ask for your PIN every **1, 4, 6, 12 or 24 hours**. After that, fingerprint unlock pauses until you enter your PIN once.

### 🛡️ Duress PIN

The newest feature: a **secret second PIN** for when someone pressures you to unlock your browser. It unlocks normally, but first quietly erases the browsing data you chose. Designing a feature that deletes data turned out to be a fascinating problem, so it gets its own post later in this series.

### 🔑 Recovery and protected settings

- Forgot your PIN? Answer **2 of your 3 security questions** to set a new one.
- Changing your PIN, biometrics, locked sites, or other sensitive settings requires your PIN or fingerprint, so nobody can quietly switch your protection off.

> 🖼️ **IMAGE 5: Feature overview grid (1400 × 1000)**
>
> *Prompt:* A clean infographic in a dark UI style with six rounded feature cards in a 3 × 2 grid, each with a colored icon tile and a short title: "Fingerprint unlock" (indigo fingerprint), "Lock specific sites" (blue globe, small orange PRO tag), "Smart auto-lock" (green clock), "Nothing gets past it" (purple shield), "Duress PIN" (red shield with exclamation, PRO and NEW tags), "Easy recovery" (teal question mark). Title at the top: "What TouchLock does". Deep navy background with soft indigo glow, modern sans-serif typography.

---

## How it works under the hood (the short version)

For the developers reading, here's the architecture in one breath:

> 🖼️ **IMAGE 6: Architecture diagram (1400 × 800)**
>
> *Prompt:* A minimal technical architecture diagram on a dark background. A central rounded box labeled "Background service worker (Manifest V3)" connects with arrows to four boxes: "Toolbar popup", "Lock screen tab", "Page overlay (content script)", and "Blocking rules (declarativeNetRequest)". A small side box labeled "chrome.storage (local only)" connects to the service worker. A browser-window outline frames the diagram. Indigo, cyan and violet line colors, clean monospace labels, flat vector style, no clutter.

- **A background service worker** (Manifest V3) is the brain. It knows whether the browser is locked, watches for inactivity, and listens for the lock shortcut.
- **A lock screen page** opens in every window when you lock. That's where the fingerprint prompt and PIN field live.
- **A content script overlay** covers pages that were already open, as a visual safety net.
- **Tab guards** catch new tabs, switched tabs and new windows, and send them back to the lock screen.
- **Blocking rules** (`declarativeNetRequest`) stop a locked site's page from loading at all, so nothing is visible even for a split second.

Each of these had its own surprise. My favorite: in Manifest V3, the background worker goes to sleep when idle and wakes up again, so anything you keep in memory can vanish. Everything important lives in storage instead. More on the bugs in a later post.

---

## Privacy wasn't a feature, it was the rule

A tool that protects your browser should never become the thing spying on it. So from day one:

- **Everything stays on your device.** Your PIN, settings and locked sites never leave your browser.
- **No accounts, no analytics, no ads.**
- **Biometrics through the OS**, never seen by the extension.
- **Open source** on GitHub, so anyone can check the code.
- **Minimal permissions.** Extra ones, like those the Duress PIN needs, are requested only when you turn that feature on.

> 🖼️ **IMAGE 7: Privacy promise (1400 × 700)**
>
> *Prompt:* A calm, minimal illustration of a glowing shield containing a laptop icon, surrounded by four small floating badges with check marks: "Stays on your device", "No accounts", "No tracking or ads", "Open source". Dark navy background with soft green and indigo glows, rounded glassmorphism badges, modern flat style, lots of breathing room.

---

## Where it is today

TouchLock works on **Chrome, Edge, Brave, Opera and Firefox**, and it's free.

It started as a weekend project to stop people peeking at my screen. Six months later, about **1,000 people** use it, with a **4.75★** rating, and nearly every feature since the first version came from a user's request or bug report.

That's the part that surprised me most, and it's what the next post is about.

> 🖼️ **IMAGE 8: Milestone card (1400 × 700)**
>
> *Prompt:* A celebratory but tasteful stats card in a dark theme. Three large gradient numbers side by side with small labels underneath: "~1,000" (users), "4.75★" (rating), "3" (browser stores). Below, small Chrome, Edge and Firefox logos in a row. Subtle confetti of tiny indigo and cyan dots in the background. Bold modern sans-serif, indigo-to-cyan gradient text, deep navy background.

---

### Try it

- 🟦 **Chrome / Brave / Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/jajgeiifpgdfnphjklcogipefkfdacdl)
- 🟩 **Edge:** [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/aibbojojoeamjgikgailflpbhdpcjgln)
- 🟧 **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/)
- 🌐 **Website:** [touchlock.vercel.app](https://touchlock.vercel.app)
- 💻 **Source code:** [GitHub](https://github.com/mathinraj/TouchLock)

---

**Next in this series:** *What 1,000 Users Taught Me About Building a Side Project*, including the one-line review that exposed my biggest security gap.

*What's the one website you'd lock first? Tell me in the comments. 👇*

---

<!--
Publishing notes (not part of the post):
- Tags: Side Project · Privacy · Chrome Extension · Web Development · Cybersecurity
- Submit to a publication such as "JavaScript in Plain English" or "Level Up Coding" for more reach.
- Medium doesn't render markdown tables or nested images from paste; replace each 🖼️ block with the generated image and delete the prompt text.
- Use the title as the headline and the "How (and why)…" line as the subtitle when Medium asks.
- Check "about 1,000 people use it" and "4.75★" are still accurate on the day you publish.
-->
