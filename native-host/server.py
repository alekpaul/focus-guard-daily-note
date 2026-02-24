#!/usr/bin/env python3
"""
Tiny local HTTP server for Focus Guard.
Serves Obsidian daily notes on localhost:19549.
"""
import http.server
import json
import os
import re
from datetime import date, timedelta

PORT = 19549
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def get_vault():
    cfg = load_config()
    return cfg.get("vault", "")

NOTE_TEMPLATE = """

## Today's focus
- [ ]

## One thing that moves my main goal forward


## Progress log
-

## Notes / thoughts
"""


def get_note_path():
    today = date.today().isoformat()
    return os.path.join(get_vault(), "Progress", f"{today}.md")


def note_path_for(d):
    return os.path.join(get_vault(), "Progress", f"{d.isoformat()}.md")


def is_note_meaningful(filepath):
    """Return True if the note has content beyond the blank template."""
    if not os.path.exists(filepath):
        return False
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    return content.strip() != NOTE_TEMPLATE.strip()


def calculate_streak():
    today = date.today()
    streak = 0

    # Walk backwards from yesterday
    d = today - timedelta(days=1)
    while True:
        if is_note_meaningful(note_path_for(d)):
            streak += 1
            d -= timedelta(days=1)
        else:
            break

    # If today also has content, include it
    if is_note_meaningful(note_path_for(today)):
        streak += 1

    current = streak

    # Last 7 days (today + 6 previous), ordered oldest→newest
    days = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        days.append({
            "date": d.isoformat(),
            "label": d.strftime("%a")[0],  # M, T, W, ...
            "done": is_note_meaningful(note_path_for(d)),
            "isToday": d == today,
        })

    return {"currentStreak": current, "days": days}


def extract_tasks(filepath):
    """Return (uncompleted, completed) task text lists from a note file."""
    if not os.path.exists(filepath):
        return [], []
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    uncompleted = re.findall(r"^- \[ \]\s+(.+)$", content, re.MULTILINE)
    completed = re.findall(r"^- \[[xX]\]\s+(.+)$", content, re.MULTILINE)
    return uncompleted, completed


def get_carryover_tasks():
    """Scan back up to 7 days for uncompleted tasks, deduplicated.
    Tasks completed on any day in the window are excluded."""
    cfg = load_config()
    if not cfg.get("carryover", True):
        return []

    today = date.today()
    seen = set()
    completed_all = set()
    tasks = []

    # First pass: collect all completed tasks across the window
    for i in range(1, 8):
        d = today - timedelta(days=i)
        _, completed = extract_tasks(note_path_for(d))
        completed_all.update(completed)

    # Second pass: collect uncompleted tasks, skipping completed ones
    for i in range(1, 8):
        d = today - timedelta(days=i)
        uncompleted, _ = extract_tasks(note_path_for(d))
        for task in uncompleted:
            # Skip tasks completed on any day, headings, or empty tasks
            if task in completed_all or task in seen or task.startswith("#"):
                continue
            seen.add(task)
            tasks.append(task)
    return tasks


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silent

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            self._json(200, {"ok": True})
            return

        if self.path == "/config":
            cfg = load_config()
            self._json(200, {"ok": True, "vault": cfg.get("vault", ""), "vaultName": cfg.get("vaultName", ""), "carryover": cfg.get("carryover", True)})
            return

        if self.path == "/streak":
            if not get_vault():
                self._json(400, {"ok": False, "error": "vault not configured"})
                return
            self._json(200, {"ok": True, **calculate_streak()})
            return

        # Read-only access to a specific date's note
        note_date_match = re.match(r"^/note/(\d{4}-\d{2}-\d{2})$", self.path)
        if note_date_match:
            date_str = note_date_match.group(1)
            path = os.path.join(get_vault(), "Progress", f"{date_str}.md")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    self._json(200, {"ok": True, "content": f.read()})
            else:
                self._json(404, {"ok": False, "error": "Note not found"})
            return

        if self.path == "/note":
            path = get_note_path()
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    self._json(200, {"ok": True, "content": f.read(), "created": False})
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                carried = get_carryover_tasks()
                if carried:
                    task_lines = "\n".join(f"- [ ] {t}" for t in carried)
                    content = NOTE_TEMPLATE.replace("- [ ]", task_lines + "\n- [ ]", 1)
                else:
                    content = NOTE_TEMPLATE
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                self._json(200, {"ok": True, "content": content, "created": True, "carriedTasks": len(carried)})
            return

        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path == "/config":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            cfg = load_config()
            vault_path = body.get("vault", "").strip()
            if vault_path:
                if not os.path.isdir(vault_path):
                    self._json(400, {"ok": False, "error": "Folder not found"})
                    return
                cfg["vault"] = vault_path
                cfg["vaultName"] = os.path.basename(vault_path)
            if "carryover" in body:
                cfg["carryover"] = bool(body["carryover"])
            save_config(cfg)
            self._json(200, {"ok": True, "vault": cfg.get("vault", ""), "vaultName": cfg.get("vaultName", ""), "carryover": cfg.get("carryover", True)})
            return

        # Save today's note or a specific date's note
        note_post_match = re.match(r"^/note(?:/(\d{4}-\d{2}-\d{2}))?$", self.path)
        if note_post_match:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            content = body.get("content", "")
            date_str = note_post_match.group(1)
            if date_str:
                path = os.path.join(get_vault(), "Progress", f"{date_str}.md")
            else:
                path = get_note_path()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                self._json(200, {"ok": True})
            except Exception as e:
                self._json(500, {"ok": False, "error": str(e)})
            return

        self._json(404, {"ok": False, "error": "not found"})


if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Focus Guard server on http://127.0.0.1:{PORT}")
    server.serve_forever()
