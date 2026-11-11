/* ───────────────────────────────────────────────
   TouchLock – Per-site lock helpers
   Shared by the background, settings, popup and
   site lock page.
   ─────────────────────────────────────────────── */

const SITE_LOCK_DEFAULTS = {
  relockMode: 'tabs-closed',     // 'tabs-closed' | 'timer' | 'browser-lock'
  relockMinutes: 15,
  includeSubdomains: true,
  separateUnlock: true
};

const SITE_RELOCK_MINUTES = [5, 15, 30, 60];
const MAX_LOCKED_SITES = 100;

function getSiteLockSettings(raw) {
  const s = Object.assign({}, SITE_LOCK_DEFAULTS, raw || {});
  if (!['tabs-closed', 'timer', 'browser-lock'].includes(s.relockMode)) {
    s.relockMode = SITE_LOCK_DEFAULTS.relockMode;
  }
  if (!SITE_RELOCK_MINUTES.includes(s.relockMinutes)) {
    s.relockMinutes = SITE_LOCK_DEFAULTS.relockMinutes;
  }
  s.includeSubdomains = s.includeSubdomains !== false;
  s.separateUnlock = s.separateUnlock !== false;
  return s;
}

function toHttpUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
  } catch (_) {
    return null;
  }
}

// The site lock page carries the blocked URL in its fragment, which a browser
// may hand back percent-encoded.
function decodeHashUrl(raw) {
  if (typeof raw === 'string' && /^https?%3A/i.test(raw)) {
    try { return decodeURIComponent(raw); } catch (_) {}
  }
  return raw;
}

// Accepts "bank.com", "www.Bank.com" or a full URL and returns "bank.com".
function normalizeSiteHost(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;

  const href = toHttpUrl(value);
  if (!href) return null;

  let host = new URL(href).hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || host.startsWith('[')) return null;
  if (!host.includes('.') && host !== 'localhost') return null;
  return host;
}

function siteMatchesHost(siteHost, hostname, includeSubdomains) {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === siteHost || host === 'www.' + siteHost) return true;
  return includeSubdomains && host.endsWith('.' + siteHost);
}

// Returns the most specific locked site covering the URL, or null.
function findLockedSite(sites, url, includeSubdomains) {
  const href = toHttpUrl(url);
  if (!href || !Array.isArray(sites)) return null;
  const hostname = new URL(href).hostname;
  let best = null;
  for (const site of sites) {
    if (siteMatchesHost(site.host, hostname, includeSubdomains) &&
        (!best || site.host.length > best.host.length)) {
      best = site;
    }
  }
  return best;
}

function buildSiteRegex(host, includeSubdomains) {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hostPart = includeSubdomains ? `([^/?#@]*\\.)?${escaped}` : `(www\\.)?${escaped}`;
  return `^https?://([^/?#@]*@)?${hostPart}(:[0-9]+)?([/?#].*)?$`;
}

function createSiteEntry(sites, host) {
  const ruleId = sites.reduce((max, s) => Math.max(max, s.ruleId || 0), 0) + 1;
  return { id: crypto.randomUUID(), host, ruleId, addedAt: Date.now() };
}

// ── Idle lock while media plays ──────────────────

const IDLE_MEDIA_DEFAULTS = {
  enabled: true,
  scope: 'all',          // 'all' | 'sites'
  sites: [],             // hosts that count when scope is 'sites'
  includeAudio: false,
  maxMinutes: 240        // 0 = keep waiting while media plays
};

const IDLE_MEDIA_MAX_MINUTES = [0, 60, 120, 240];

function getIdleMediaSettings(raw) {
  const s = Object.assign({}, IDLE_MEDIA_DEFAULTS, raw || {});
  s.enabled = s.enabled !== false;
  if (!['all', 'sites'].includes(s.scope)) s.scope = IDLE_MEDIA_DEFAULTS.scope;
  s.sites = Array.isArray(s.sites) ? s.sites.filter(h => typeof h === 'string') : [];
  s.includeAudio = s.includeAudio === true;
  if (!IDLE_MEDIA_MAX_MINUTES.includes(s.maxMinutes)) s.maxMinutes = IDLE_MEDIA_DEFAULTS.maxMinutes;
  return s;
}

function idleMediaCoversHost(settings, hostname) {
  return settings.scope === 'all' ||
    settings.sites.some(host => siteMatchesHost(host, hostname, true));
}

function describeSiteMatch(host, includeSubdomains) {
  return includeSubdomains
    ? `Locks ${host} and all its subdomains, like www.${host} and login.${host}`
    : `Locks only ${host} and www.${host} (subdomains like login.${host} stay open)`;
}
