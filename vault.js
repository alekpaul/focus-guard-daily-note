// Vault access via local HTTP server (port 19549).
// No permissions needed — just fetch from localhost.

const API = "http://127.0.0.1:19549";

async function readTodayNote() {
  const res = await fetch(API + "/note");
  const data = await res.json();
  return data.content;
}

async function readNote(date) {
  const res = await fetch(API + "/note/" + date);
  if (!res.ok) return null;
  const data = await res.json();
  return data.ok ? data.content : null;
}

async function saveTodayNote(content) {
  await fetch(API + "/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function saveNote(dateStr, content) {
  await fetch(API + "/note/" + dateStr, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function createTodayNote() {
  const res = await fetch(API + "/note");
  return await res.json();
}

async function getConfig() {
  const res = await fetch(API + "/config");
  return await res.json();
}

async function saveConfig(vaultOrObj) {
  const body = typeof vaultOrObj === "string" ? { vault: vaultOrObj } : vaultOrObj;
  const res = await fetch(API + "/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function getStreak() {
  const res = await fetch(API + "/streak");
  return await res.json();
}

async function isHostAvailable() {
  try {
    const res = await fetch(API + "/ping");
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
