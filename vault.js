// Vault access via local HTTP server (port 19549).
// No permissions needed — just fetch from localhost.

const API = "http://127.0.0.1:19549";

async function readTodayNote() {
  const res = await fetch(API + "/note");
  const data = await res.json();
  return data.content;
}

async function saveTodayNote(content) {
  await fetch(API + "/note", {
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

async function saveConfig(vault) {
  const res = await fetch(API + "/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault }),
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
