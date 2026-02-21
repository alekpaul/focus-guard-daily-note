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

// Check if a site has a temporary bypass (matches subdomains too)
function isTempAllowed(hostname, tempAllowed) {
  if (!tempAllowed) return false;
  const now = Date.now();
  return Object.entries(tempAllowed).some(([host, expiry]) => {
    if (now >= expiry) return false;
    return hostname === host || hostname.endsWith("." + host);
  });
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

// Block a tab if the URL matches a blocked site
function blockIfNeeded(tabId, url) {
  if (!url || url.startsWith("chrome-extension://") || url.startsWith("chrome://")) return;

  chrome.storage.sync.get(["blockedSites", "enabled", "tempAllowed"], (data) => {
    if (!data.enabled) return;
    const sites = data.blockedSites || DEFAULT_BLOCKED;

    if (isBlocked(url, sites)) {
      // Check temporary bypass
      try {
        const hostname = new URL(url).hostname;
        if (isTempAllowed(hostname, data.tempAllowed)) return;
      } catch {}

      const redirectUrl = chrome.runtime.getURL(
        "redirect.html?from=" + encodeURIComponent(url)
      );
      chrome.tabs.update(tabId, { url: redirectUrl });
    }

    // Clean expired temp allowances
    const cleaned = cleanExpired(data.tempAllowed);
    chrome.storage.sync.set({ tempAllowed: cleaned });
  });
}

// Intercept navigation to blocked sites
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only intercept main frame (not iframes, etc.)
  if (details.frameId !== 0) return;
  blockIfNeeded(details.tabId, details.url);
});

// Catch SPA navigations (pushState/replaceState) that don't trigger webNavigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    blockIfNeeded(tabId, changeInfo.url);
  }
});
