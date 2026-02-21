const DEFAULT_BLOCKED = [
  "pinterest.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "reddit.com",
  "youtube.com"
];

// Initialize default blocked sites on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("blockedSites", (data) => {
    if (!data.blockedSites) {
      chrome.storage.sync.set({ blockedSites: DEFAULT_BLOCKED });
    }
  });
  chrome.storage.sync.get("enabled", (data) => {
    if (data.enabled === undefined) {
      chrome.storage.sync.set({ enabled: true });
    }
  });
});

// Check if a URL matches any blocked domain
function isBlocked(url, blockedSites) {
  try {
    const hostname = new URL(url).hostname;
    return blockedSites.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  } catch {
    return false;
  }
}

// Check if a site has a temporary bypass
function isTempAllowed(hostname, tempAllowed) {
  if (!tempAllowed || !tempAllowed[hostname]) return false;
  return Date.now() < tempAllowed[hostname];
}

// Clean expired temp allowances periodically
function cleanExpired(tempAllowed) {
  if (!tempAllowed) return {};
  const now = Date.now();
  const cleaned = {};
  for (const [host, expiry] of Object.entries(tempAllowed)) {
    if (expiry > now) cleaned[host] = expiry;
  }
  return cleaned;
}

// Intercept navigation to blocked sites
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only intercept main frame (not iframes, etc.)
  if (details.frameId !== 0) return;
  // Don't intercept our own redirect page
  if (details.url.startsWith("chrome-extension://")) return;

  chrome.storage.sync.get(["blockedSites", "enabled", "tempAllowed"], (data) => {
    if (!data.enabled) return;
    const sites = data.blockedSites || DEFAULT_BLOCKED;

    if (isBlocked(details.url, sites)) {
      // Check temporary bypass
      try {
        const hostname = new URL(details.url).hostname;
        if (isTempAllowed(hostname, data.tempAllowed)) return;
      } catch {}

      const redirectUrl = chrome.runtime.getURL(
        "redirect.html?from=" + encodeURIComponent(details.url)
      );
      chrome.tabs.update(details.tabId, { url: redirectUrl });
    }

    // Clean expired temp allowances
    const cleaned = cleanExpired(data.tempAllowed);
    chrome.storage.sync.set({ tempAllowed: cleaned });
  });
});
