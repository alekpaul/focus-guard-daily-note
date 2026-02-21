#!/usr/bin/env python3
"""
Native messaging host for Focus Guard Chrome extension.
"""
import json
import struct
import sys
import os
import traceback
from datetime import date

LOG = os.path.expanduser("~/focus-guard-debug.log")

def log(msg):
    with open(LOG, "a") as f:
        f.write(msg + "\n")

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def _load_vault():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("vault", "")
    return ""

VAULT = _load_vault()

NOTE_TEMPLATE = """

## Today's focus
- [ ]

## One thing that moves my main goal forward


## Progress log
-

## Notes / thoughts
"""


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        log(f"read_message: no data, got {len(raw_length) if raw_length else 0} bytes")
        sys.exit(0)
    length = struct.unpack("=I", raw_length)[0]
    log(f"read_message: expecting {length} bytes")
    data = sys.stdin.buffer.read(length).decode("utf-8")
    log(f"read_message: got {data}")
    return json.loads(data)


def send_message(msg):
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()
    log(f"send_message: sent {msg}")


def get_note_path():
    today = date.today().isoformat()
    return os.path.join(VAULT, "Progress", f"{today}.md")


def main():
    log("--- host started ---")
    log(f"python: {sys.executable}")
    log(f"cwd: {os.getcwd()}")
    log(f"argv: {sys.argv}")

    try:
        msg = read_message()
        action = msg.get("action")
        log(f"action: {action}")

        if action == "read":
            path = get_note_path()
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                send_message({"ok": True, "content": content})
            except FileNotFoundError:
                send_message({"ok": True, "content": None})

        elif action == "save":
            path = get_note_path()
            content = msg.get("content", "")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                send_message({"ok": True})
            except Exception as e:
                send_message({"ok": False, "error": str(e)})

        elif action == "create":
            path = get_note_path()
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    send_message({"ok": True, "content": f.read(), "created": False})
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(NOTE_TEMPLATE)
                send_message({"ok": True, "content": NOTE_TEMPLATE, "created": True})

        elif action == "ping":
            send_message({"ok": True})

        else:
            send_message({"ok": False, "error": f"unknown action: {action}"})

    except Exception as e:
        log(f"EXCEPTION: {traceback.format_exc()}")
        try:
            send_message({"ok": False, "error": str(e)})
        except:
            pass


if __name__ == "__main__":
    main()
