const onboardingView = document.getElementById("onboarding-view");
const mainView = document.getElementById("main-view");

// --- Onboarding ---
document.getElementById("save-vault-btn").addEventListener("click", async () => {
  const input = document.getElementById("vault-path-input");
  const errorEl = document.getElementById("vault-error");
  errorEl.style.display = "none";

  const path = input.value.trim();
  if (!path) {
    errorEl.textContent = "Please enter a path";
    errorEl.style.display = "block";
    return;
  }

  try {
    const res = await saveConfig(path);
    if (!res.ok) {
      errorEl.textContent = res.error || "Could not connect";
      errorEl.style.display = "block";
      return;
    }
    showMain(res.vaultName);
  } catch (e) {
    errorEl.textContent = "Server not running — run setup.sh first";
    errorEl.style.display = "block";
  }
});

// --- Show main UI ---
function showMain(vaultName) {
  onboardingView.style.display = "none";
  mainView.style.display = "block";
  initMain(vaultName);
}

function initMain(vaultName) {
  const siteListEl = document.getElementById("site-list");
  const newSiteInput = document.getElementById("new-site");
  const addBtn = document.getElementById("add-btn");
  const toggleEnabled = document.getElementById("toggle-enabled");
  const obsidianLink = document.getElementById("open-obsidian");
  const vaultDot = document.getElementById("vault-dot");
  const vaultLabel = document.getElementById("vault-label");

  // --- Obsidian URI ---
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const filePath = `Progress/${yyyy}-${mm}-${dd}`;
  obsidianLink.href = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;

  // --- Vault status + streak ---
  vaultDot.className = "dot ok";
  vaultLabel.textContent = "Vault connected";

  (async () => {
    try {
      const data = await getStreak();
      const container = document.getElementById("streak-days");
      data.days.forEach((day) => {
        const el = document.createElement("div");
        el.className = "streak-day";
        const cls = ["dot", day.done && "done", day.isToday && "today"].filter(Boolean).join(" ");
        const dotEl = document.createElement("div");
        dotEl.className = cls;
        dotEl.textContent = day.done ? "\u2713" : "";

        if (day.done) {
          dotEl.addEventListener("click", () => {
            const filePath = `Progress/${day.date}`;
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
            chrome.tabs.create({ url: uri });
          });
        }

        el.innerHTML = `<span class="label">${day.label}</span>`;
        el.appendChild(dotEl);
        container.appendChild(el);
      });
      document.getElementById("streak-number").textContent = data.currentStreak;
      document.getElementById("streak-unit").textContent = data.currentStreak === 1 ? "" : "s";
      document.getElementById("streak-row").style.display = "flex";
    } catch {}
  })();

  // --- Bypass duration ---
  const bypassSelect = document.getElementById("bypass-duration");

  // --- Toggle + settings ---
  chrome.storage.sync.get(["blockedSites", "enabled", "bypassMinutes"], (data) => {
    render(data.blockedSites || []);
    toggleEnabled.checked = data.enabled !== false;
    bypassSelect.value = String(data.bypassMinutes || 5);
  });

  toggleEnabled.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggleEnabled.checked });
  });

  bypassSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ bypassMinutes: Number(bypassSelect.value) });
  });

  // --- Site list ---
  function render(sites) {
    siteListEl.innerHTML = "";
    sites.forEach((site) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${site}</span>
        <button class="remove" data-site="${site}">&times;</button>
      `;
      siteListEl.appendChild(li);
    });
  }

  function addSite() {
    let site = newSiteInput.value.trim().toLowerCase();
    if (!site) return;
    site = site.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

    chrome.storage.sync.get("blockedSites", (data) => {
      const sites = data.blockedSites || [];
      if (!sites.includes(site)) {
        sites.push(site);
        chrome.storage.sync.set({ blockedSites: sites }, () => render(sites));
      }
      newSiteInput.value = "";
    });
  }

  addBtn.addEventListener("click", addSite);
  newSiteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSite();
  });

  siteListEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove");
    if (!btn) return;
    const siteToRemove = btn.dataset.site;
    chrome.storage.sync.get("blockedSites", (data) => {
      const sites = (data.blockedSites || []).filter((s) => s !== siteToRemove);
      chrome.storage.sync.set({ blockedSites: sites }, () => render(sites));
    });
  });
}

// --- Init: check config ---
(async () => {
  try {
    const cfg = await getConfig();
    if (cfg.vault) {
      showMain(cfg.vaultName || "Obsidian");
    } else {
      onboardingView.style.display = "block";
    }
  } catch {
    // Server not running
    onboardingView.style.display = "block";
    document.getElementById("vault-error").textContent = "Server not running — run setup.sh first";
    document.getElementById("vault-error").style.display = "block";
  }
})();
