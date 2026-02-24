// --- Elements ---
const setupView = document.getElementById("setup-view");
const editorContainer = document.getElementById("editor-container");
const saveStatusEl = document.getElementById("save-status");
const obsidianLink = document.getElementById("open-obsidian");
const blockedSiteEl = document.getElementById("blocked-site");

let saveTimeout = null;

// --- Obsidian URI (updates to match currently displayed note) ---
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const todayStr = `${yyyy}-${mm}-${dd}`;

let currentVault = "Obsidian";

function updateObsidianLink(dateStr) {
  const filePath = `Progress/${dateStr || todayStr}`;
  obsidianLink.href = `obsidian://open?vault=${encodeURIComponent(currentVault)}&file=${encodeURIComponent(filePath)}`;
}

function setObsidianLink(vaultName) {
  currentVault = vaultName;
  updateObsidianLink();
}

// --- Show blocked site ---
const params = new URLSearchParams(window.location.search);
const fromUrl = params.get("from") || "";
try {
  blockedSiteEl.textContent = new URL(fromUrl).hostname;
} catch {
  blockedSiteEl.textContent = "distracting site";
}

// --- Block Editor ---
const editor = new BlockEditor(editorContainer, {
  onChange: (md) => debouncedSave(md),
});

// --- Debounced auto-save ---
function debouncedSave(md) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => doSave(md), 600);
}

async function doSave(md) {
  showStatus("Saving...", "saving");
  try {
    if (viewingDate) {
      await saveNote(viewingDate, md);
    } else {
      await saveTodayNote(md);
    }
    showStatus("Saved", "saved");
  } catch (e) {
    showStatus("Save failed", "error");
  }
}

function showStatus(text, cls) {
  saveStatusEl.textContent = text;
  saveStatusEl.className = "save-status " + cls;
  if (cls === "saved") {
    setTimeout(() => {
      if (saveStatusEl.textContent === "Saved") {
        saveStatusEl.textContent = "";
        saveStatusEl.className = "save-status";
      }
    }, 2000);
  }
}

// --- Go back ---
document.getElementById("go-back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else window.close();
});

// --- Bypass with cooldown ---
const bypassLink = document.getElementById("bypass-link");
let countdown = 5;

const timer = setInterval(() => {
  countdown--;
  if (countdown <= 0) {
    clearInterval(timer);
    bypassLink.textContent = "continue anyway";
    bypassLink.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        const hostname = new URL(fromUrl).hostname.replace(/^www\./, "");
        chrome.storage.sync.get(["tempAllowed", "bypassMinutes"], (data) => {
          const allowed = data.tempAllowed || {};
          const minutes = data.bypassMinutes || 5;
          allowed[hostname] = Date.now() + minutes * 60 * 1000;
          chrome.storage.sync.set({ tempAllowed: allowed }, () => {
            window.location.href = fromUrl;
          });
        });
      } catch {
        window.location.href = fromUrl;
      }
    });
  } else {
    bypassLink.textContent = `continue anyway (${countdown}s)`;
  }
}, 1000);

// --- Streak UI ---
const noteTitle = document.getElementById("note-title");
const backToToday = document.getElementById("back-to-today");
const noteCard = document.querySelector(".note-card");
let viewingDate = null; // null = today (editable)

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function viewPastNote(dateStr) {
  const content = await readNote(dateStr);
  if (content === null) return;

  viewingDate = dateStr;
  editor.load(content);
  noteCard.classList.add("past-note");
  noteTitle.textContent = formatDateLabel(dateStr);
  backToToday.style.display = "inline";
  saveStatusEl.textContent = "";
  updateObsidianLink(dateStr);

  // Update selected dot
  document.querySelectorAll("#streak-days .dot").forEach((d) => {
    d.classList.toggle("selected", d.dataset.date === dateStr);
  });
}

async function returnToToday() {
  viewingDate = null;
  const res = await createTodayNote();
  editor.load(res.content);
  editor.setReadOnly(false);
  noteCard.classList.remove("past-note");
  noteTitle.textContent = "Today's Plan";
  backToToday.style.display = "none";
  updateObsidianLink();

  document.querySelectorAll("#streak-days .dot").forEach((d) => {
    d.classList.remove("selected");
  });
}

backToToday.addEventListener("click", (e) => {
  e.preventDefault();
  returnToToday();
});

async function loadStreak() {
  try {
    const data = await getStreak();
    const container = document.getElementById("streak-days");
    const row = document.getElementById("streak-row");

    data.days.forEach((day) => {
      const el = document.createElement("div");
      el.className = "streak-day";
      const cls = ["dot", day.done && "done", day.isToday && "today"].filter(Boolean).join(" ");
      const dotEl = document.createElement("div");
      dotEl.className = cls;
      dotEl.dataset.date = day.date;
      dotEl.textContent = day.done ? "\u2713" : "";

      if (day.done) {
        dotEl.addEventListener("click", () => {
          if (day.isToday) {
            returnToToday();
          } else {
            viewPastNote(day.date);
          }
        });
      }

      el.innerHTML = `<span class="label">${day.label}</span>`;
      el.appendChild(dotEl);
      container.appendChild(el);
    });

    document.getElementById("streak-number").textContent = data.currentStreak;
    document.getElementById("streak-unit").textContent = data.currentStreak === 1 ? "" : "s";
    row.style.display = "flex";
  } catch {}
}

// --- Load note into editor ---
async function loadNote() {
  try {
    const res = await createTodayNote();
    setupView.style.display = "none";
    editorContainer.style.display = "";
    editor.load(res.content);
    if (res.created) {
      const carried = res.carriedTasks || 0;
      if (carried > 0) {
        showStatus(`Created note + ${carried} task${carried === 1 ? "" : "s"} carried over`, "saved");
      } else {
        showStatus("Created today's note", "saved");
      }
    }
  } catch (e) {
    // Native host not available — show friendly error
    const msg = (e.message || String(e)).toLowerCase();
    const isServerDown = msg.includes("fetch") || msg.includes("network") || msg.includes("connect");

    document.getElementById("state-icon").textContent = isServerDown ? "🔌" : "⚠️";
    document.getElementById("state-title").textContent = isServerDown
      ? "Server is warming up"
      : "Couldn't load your plan";
    document.getElementById("state-message").innerHTML = isServerDown
      ? 'The local server isn\'t running yet. Start it up and this page will connect automatically.<br><a href="https://github.com/alekpaul/focus-guard-daily-note#setup" target="_blank" style="color:#9a8aff;font-size:12px;margin-top:8px;display:inline-block;">Need help? View setup guide →</a>'
      : "Something went wrong connecting to your vault. Give it another shot.";
    document.getElementById("retry-btn").style.display = "inline-block";

    // Auto-retry every 3 seconds
    const retryInterval = setInterval(async () => {
      try {
        await createTodayNote();
        clearInterval(retryInterval);
        location.reload();
      } catch {}
    }, 3000);
  }
}

// --- Init ---
(async () => {
  try {
    const cfg = await getConfig();
    setObsidianLink(cfg.vaultName || "Obsidian");
  } catch {}
  loadNote();
  loadStreak();
})();
