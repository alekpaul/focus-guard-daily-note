// Apply theme from storage (set by content script theme-detector.js)
const htmlEl = document.documentElement;
chrome.storage.local.get('theme', (d) => {
  if (d.theme === 'light') htmlEl.classList.add('light');
});
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.theme) {
    if (changes.theme.newValue === 'light') htmlEl.classList.add('light');
    else htmlEl.classList.remove('light');
  }
});
