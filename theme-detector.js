// Runs as content script on real web pages where matchMedia works
function reportTheme() {
  const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
}
reportTheme();
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', reportTheme);
