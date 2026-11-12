/* ───────────────────────────────────────────────
   TouchLock – Per-site lock (background)
   Locked sites are redirected to site-lock.html by
   declarativeNetRequest dynamic rules. Unlocking a
   site adds a higher-priority session "allow" rule;
   session rules and grants vanish on browser restart.
   tabs.onUpdated catches navigations the rules can't
   see (back/forward cache, view-source:).
   ─────────────────────────────────────────────── */

const SITE_LOCK_URL     = chrome.runtime.getURL('src/pages/site-lock.html');
const EXTENSION_ORIGIN  = chrome.runtime.getURL('');
const SITE_RELOCK_ALARM = 'site-relock:';
const ALLOW_RULE_OFFSET = 100000;
const BROWSER_LOCK_RULE_ID = 1000000;
const LOCK_PAGE_URL = chrome.runtime.getURL('src/pages/lock.html');
const GRANT_GRACE_MS    = 5000;

const dnr = chrome.declarativeNetRequest || null;
let memoryGrants = {};

// ── Grants (which sites are unlocked right now) ──

async function readGrants() {
  if (chrome.storage.session) {
    const { siteGrants } = await chrome.storage.session.get('siteGrants');
    return siteGrants || {};
  }
  return { ...memoryGrants };
}

async function writeGrants(grants) {
  if (chrome.storage.session) {
    await chrome.storage.session.set({ siteGrants: grants });
  } else {
    memoryGrants = grants;
  }
}

function isGrantActive(grant, now = Date.now()) {
  return !!grant && (!grant.expiresAt || grant.expiresAt > now);
}

async function getSiteLockContext() {
  const { lockedSites, siteLockSettings, setupComplete } =
    await chrome.storage.local.get(['lockedSites', 'siteLockSettings', 'setupComplete']);
  return {
    enabled: setupComplete === true,
    sites: Array.isArray(lockedSites) ? lockedSites : [],
    settings: getSiteLockSettings(siteLockSettings),
    grants: await readGrants()
  };
}

function lockedSiteFor(ctx, url) {
  if (!ctx.enabled) return null;
  const site = findLockedSite(ctx.sites, url, ctx.settings.includeSubdomains);
  if (!site || isGrantActive(ctx.grants[site.id])) return null;
  return site;
}

function stripViewSource(url) {
  return typeof url === 'string' && url.startsWith('view-source:') ? url.slice(12) : url;
}

function waitingReturnUrl(tabUrl) {
  if (!tabUrl || !tabUrl.startsWith(SITE_LOCK_URL)) return null;
  const i = tabUrl.indexOf('#');
  return i === -1 ? null : toHttpUrl(decodeHashUrl(tabUrl.slice(i + 1)));
}

function isFromExtensionPage(sender) {
  return !!sender && sender.id === chrome.runtime.id &&
         typeof sender.url === 'string' && sender.url.startsWith(EXTENSION_ORIGIN);
}

function isFromSiteLockPage(sender) {
  return isFromExtensionPage(sender) && sender.url.startsWith(SITE_LOCK_URL);
}

// ── declarativeNetRequest rules ─────────────────

function siteRuleCondition(site, includeSubdomains) {
  return {
    regexFilter: buildSiteRegex(site.host, includeSubdomains),
    isUrlFilterCaseSensitive: false,
    resourceTypes: ['main_frame']
  };
}

let ruleSync = Promise.resolve();

function syncSiteRules() {
  ruleSync = ruleSync
    .then(applySiteRules)
    .catch(err => console.warn('[TouchLock] site rule sync failed:', err));
  return ruleSync;
}

async function applySiteRules() {
  if (!dnr) return;
  const ctx = await getSiteLockContext();
  const sites = ctx.enabled ? ctx.sites : [];
  const now = Date.now();
  const sub = ctx.settings.includeSubdomains;

  const dynamicRules = sites.map(site => ({
    id: site.ruleId,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: `${SITE_LOCK_URL}#\\0` } },
    condition: siteRuleCondition(site, sub)
  }));

  const sessionRules = sites
    .filter(site => isGrantActive(ctx.grants[site.id], now))
    .map(site => ({
      id: ALLOW_RULE_OFFSET + site.ruleId,
      priority: 2,
      action: { type: 'allow' },
      condition: siteRuleCondition(site, sub)
    }));

  const [oldDynamic, oldSession] = await Promise.all([
    dnr.getDynamicRules(),
    dnr.getSessionRules()
  ]);

  await dnr.updateSessionRules({
    removeRuleIds: oldSession.map(r => r.id).filter(id => id !== BROWSER_LOCK_RULE_ID),
    addRules: sessionRules
  });
  await dnr.updateDynamicRules({
    removeRuleIds: oldDynamic.map(r => r.id),
    addRules: dynamicRules
  });
}

// While the browser is locked, every web page load is sent to the lock screen,
// which keeps the address in its fragment and returns there on unlock. This
// outranks the site-lock allow rules.
function setBrowserLockRule(locked) {
  if (!dnr) return Promise.resolve();
  ruleSync = ruleSync
    .then(() => dnr.updateSessionRules({
      removeRuleIds: [BROWSER_LOCK_RULE_ID],
      addRules: locked ? [{
        id: BROWSER_LOCK_RULE_ID,
        priority: 10,
        action: { type: 'redirect', redirect: { regexSubstitution: `${LOCK_PAGE_URL}#\\0` } },
        condition: { regexFilter: '^https?://.*$', resourceTypes: ['main_frame'] }
      }] : []
    }))
    .catch(err => console.warn('[TouchLock] browser lock rule failed:', err));
  return ruleSync;
}

// ── Tabs ────────────────────────────────────────

async function enforceSiteLockOnTab(tabId, url, ctx) {
  const target = stripViewSource(url);
  if (!lockedSiteFor(ctx, target)) return;
  try {
    await chrome.tabs.update(tabId, { url: `${SITE_LOCK_URL}#${target}` });
  } catch (_) {}
}

async function relockOpenTabs() {
  const ctx = await getSiteLockContext();
  if (!ctx.enabled || !ctx.sites.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url) await enforceSiteLockOnTab(tab.id, tab.url, ctx);
  }
}

async function releaseUnlockedWaitingTabs(exceptTabId) {
  const ctx = await getSiteLockContext();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === exceptTabId) continue;
    const returnUrl = waitingReturnUrl(tab.url);
    if (!returnUrl || lockedSiteFor(ctx, returnUrl)) continue;
    try { await chrome.tabs.update(tab.id, { url: returnUrl }); } catch (_) {}
  }
}

// ── Unlock / re-lock ────────────────────────────

async function grantSites(siteIds) {
  const ctx = await getSiteLockContext();
  const now = Date.now();
  const grants = { ...ctx.grants };

  for (const id of siteIds) {
    if (!ctx.sites.some(s => s.id === id)) continue;
    const expiresAt = ctx.settings.relockMode === 'timer'
      ? now + ctx.settings.relockMinutes * 60 * 1000
      : null;
    grants[id] = { at: now, expiresAt };
    if (expiresAt) chrome.alarms.create(SITE_RELOCK_ALARM + id, { when: expiresAt });
  }

  await writeGrants(grants);
  await syncSiteRules();
  schedulePrune(GRANT_GRACE_MS + 500);
}

// Pass null to re-lock every site.
async function revokeSites(siteIds, { relockTabs }) {
  const grants = await readGrants();
  const ids = siteIds || Object.keys(grants);
  for (const id of ids) {
    delete grants[id];
    chrome.alarms.clear(SITE_RELOCK_ALARM + id);
  }
  await writeGrants(grants);
  await syncSiteRules();
  if (relockTabs) await relockOpenTabs();
}

async function unlockSite(siteId, exceptTabId) {
  await grantSites([siteId]);
  await releaseUnlockedWaitingTabs(exceptTabId);
}

async function onBrowserLocking() {
  await revokeSites(null, { relockTabs: true });
}

async function onBrowserUnlocked() {
  const ctx = await getSiteLockContext();
  if (!ctx.enabled || ctx.settings.separateUnlock || !ctx.sites.length) return;
  await grantSites(ctx.sites.map(s => s.id));
  await releaseUnlockedWaitingTabs();
}

// "When I leave or close all its tabs": drop grants for sites with no open tab.
let pruneTimer = null;

function schedulePrune(delay = 1000) {
  clearTimeout(pruneTimer);
  pruneTimer = setTimeout(pruneLeftSites, delay);
}

async function pruneLeftSites() {
  const ctx = await getSiteLockContext();
  if (ctx.settings.relockMode !== 'tabs-closed') return;

  const now = Date.now();
  const ids = Object.keys(ctx.grants).filter(id => now - ctx.grants[id].at > GRANT_GRACE_MS);
  if (!ids.length) return;

  const tabs = await chrome.tabs.query({});
  const urls = tabs
    .flatMap(t => [t.url, t.pendingUrl, waitingReturnUrl(t.url)])
    .filter(Boolean)
    .map(stripViewSource);

  const left = ids.filter(id => {
    const site = ctx.sites.find(s => s.id === id);
    return !site || !urls.some(u => findLockedSite([site], u, ctx.settings.includeSubdomains));
  });

  if (left.length) await revokeSites(left, { relockTabs: false });
}

// Keeps grants consistent with the current settings and site list.
async function normalizeGrants(ctx) {
  const now = Date.now();
  const grants = {};

  if (ctx.enabled) {
    for (const [id, grant] of Object.entries(ctx.grants)) {
      if (!ctx.sites.some(s => s.id === id)) continue;
      if (ctx.settings.relockMode === 'timer') {
        const expiresAt = grant.at + ctx.settings.relockMinutes * 60 * 1000;
        if (expiresAt <= now) continue;
        grants[id] = { ...grant, expiresAt };
        chrome.alarms.create(SITE_RELOCK_ALARM + id, { when: expiresAt });
      } else {
        grants[id] = { ...grant, expiresAt: null };
      }
    }
  }

  for (const id of Object.keys(ctx.grants)) {
    if (!grants[id] || !grants[id].expiresAt) chrome.alarms.clear(SITE_RELOCK_ALARM + id);
  }
  await writeGrants(grants);
}

async function reconcileSiteLocks() {
  await normalizeGrants(await getSiteLockContext());
  await syncSiteRules();
  await relockOpenTabs();
  await releaseUnlockedWaitingTabs();
  schedulePrune();
}

// ── Messages from extension pages ───────────────

// Returns a response object, or undefined if the action isn't a site-lock action.
// checkUnlockPin also accepts the duress PIN; checkPin (settings changes) doesn't.
async function handleSiteLockMessage(msg, sender, checkPin, checkUnlockPin) {
  switch (msg.action) {
    case 'checkPin':
      if (!isFromExtensionPage(sender)) return { success: false, error: 'Not allowed.' };
      return checkPin(msg.pin);

    case 'unlockSite': {
      if (!isFromSiteLockPage(sender)) return { success: false, error: 'Not allowed.' };
      const result = await checkUnlockPin(msg.pin);
      if (result.success) await unlockSite(msg.siteId, sender.tab && sender.tab.id);
      return result;
    }

    case 'unlockSiteBiometric':
      if (!isFromSiteLockPage(sender)) return { success: false, error: 'Not allowed.' };
      if (!(await biometricAllowedNow())) {
        return { success: false, pinRequired: true, error: 'Enter your PIN to unlock.' };
      }
      await unlockSite(msg.siteId, sender.tab && sender.tab.id);
      return { success: true };

    case 'relockSite':
      if (!isFromExtensionPage(sender)) return { success: false, error: 'Not allowed.' };
      await revokeSites([msg.siteId], { relockTabs: true });
      return { success: true };

    case 'getSiteGrants': {
      if (!isFromExtensionPage(sender)) return { grants: {} };
      const grants = await readGrants();
      const now = Date.now();
      const active = {};
      for (const [id, g] of Object.entries(grants)) {
        if (isGrantActive(g, now)) active[id] = g;
      }
      return { grants: active };
    }

    default:
      return undefined;
  }
}

// ── Listeners ───────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.lockedSites || changes.siteLockSettings || changes.setupComplete) {
    reconcileSiteLocks();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(SITE_RELOCK_ALARM)) return;
  revokeSites([alarm.name.slice(SITE_RELOCK_ALARM.length)], { relockTabs: true });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  await enforceSiteLockOnTab(tabId, changeInfo.url, await getSiteLockContext());
  schedulePrune();
});

chrome.tabs.onRemoved.addListener(() => schedulePrune());
