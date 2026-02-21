// --- Elements ---
const setupView = document.getElementById("setup-view");
const editorContainer = document.getElementById("editor-container");
const saveStatusEl = document.getElementById("save-status");
const obsidianLink = document.getElementById("open-obsidian");
const blockedSiteEl = document.getElementById("blocked-site");

let saveTimeout = null;

// --- Obsidian URI (set after config loads) ---
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");

function setObsidianLink(vaultName) {
  const filePath = `Progress/${yyyy}-${mm}-${dd}`;
  obsidianLink.href = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
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
  if (viewingDate) return; // Don't save when viewing past notes
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => doSave(md), 600);
}

async function doSave(md) {
  showStatus("Saving...", "saving");
  try {
    await saveTodayNote(md);
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
  editor.setReadOnly(true);
  noteCard.classList.add("past-note");
  noteTitle.textContent = formatDateLabel(dateStr);
  backToToday.style.display = "inline";
  saveStatusEl.textContent = "";

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
    // Native host not available — show error details
    setupView.querySelector("p").innerHTML =
      'Native host not connected.<br><code style="background:#1a1a2e;padding:4px 8px;border-radius:4px;color:#e74c3c;font-size:12px;display:block;margin-top:8px;word-break:break-all;">' +
      (e.message || String(e)) + '</code>';
    setupView.querySelector("button").style.display = "none";
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
