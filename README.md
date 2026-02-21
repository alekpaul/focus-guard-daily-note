# Focus Guard Daily Note

Chrome extension that blocks distracting sites and replaces them with your Obsidian daily note — plan your day, track streaks, stay focused.

Uses a lightweight local server to read/write daily notes in your vault. Built for Obsidian users.

## Features

- Blocks distracting sites and shows your daily plan instead
- Inline editor — write your plan without leaving Chrome
- Streak tracker — 7-day view of consecutive writing days
- Todo carryover — uncompleted tasks from the last 7 days auto-carry to today's note
- 5-minute bypass — lets you through after a cooldown if you really need the site
- Customizable block list from the popup

## Requirements

- **macOS** (Chrome native messaging paths are macOS-specific for now)
- **Python 3** — ships with macOS or install via `brew install python3`
- **Google Chrome**
- **Obsidian** with a vault on your local filesystem

## Setup

### 1. Clone and load the extension

```bash
git clone https://github.com/YOUR_USERNAME/focus-guard-daily-note.git
cd focus-guard-daily-note
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the `focus-guard-extension` folder
4. Note the **Extension ID** shown under the extension name — you'll need it next

### 2. Run the setup script

```bash
./setup.sh
```

This will ask for your extension ID and register the native messaging host with Chrome.

### 3. Start the local server

```bash
python3 native-host/server.py
```

The server runs on `http://127.0.0.1:19549`. It needs to be running for the extension to work.

**To keep it running in the background:**

```bash
nohup python3 native-host/server.py &
```

Or create a launchd service (see [Running on startup](#running-on-startup) below).

### 4. Connect your vault

1. Click the Focus Guard icon in Chrome
2. Paste the **full path** to your Obsidian vault folder (e.g. `/Users/you/Documents/MyVault`)
3. Click **Connect Vault**

That's it. Try visiting a blocked site — you should see your daily plan.

## How it works

- Daily notes are stored in `YourVault/Progress/YYYY-MM-DD.md`
- The `Progress/` folder is created automatically if it doesn't exist
- Each note uses a simple template with sections for focus, goals, progress log, and notes
- The streak counts consecutive days where the note has content beyond the empty template

## Daily note template

```markdown
## Today's focus
- [ ]

## One thing that moves my main goal forward


## Progress log
-

## Notes / thoughts
```

You can write anything in these sections. The streak tracker considers a day "done" if the note has any content beyond this blank template.

## Running on startup

To auto-start the server when you log in, create `~/Library/LaunchAgents/com.focusguard.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.focusguard.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>python3</string>
        <string>/FULL/PATH/TO/focus-guard-daily-note/native-host/server.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Replace `/FULL/PATH/TO/` with the actual path, then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.focusguard.server.plist
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Popup says "Server not running" | Run `python3 native-host/server.py` |
| "Folder not found" when connecting vault | Make sure the path exists — use `ls /your/path` to verify |
| Streak not showing | The server needs to be restarted after first connecting your vault |
| Extension not blocking sites | Check it's enabled in the popup (toggle top right) |
| `python3: command not found` | Install Python 3: `brew install python3` |

## Project structure

```
focus-guard-daily-note/
├── manifest.json          # Chrome extension manifest
├── background.js          # Site blocking logic
├── popup.html/js          # Extension popup with settings + onboarding
├── redirect.html/js       # Redirect page with daily plan editor
├── editor.js/css          # Block editor for markdown
├── vault.js               # API client for the local server
├── setup.sh               # One-time native host registration
└── native-host/
    ├── server.py           # Local HTTP server (main)
    ├── focus_guard_host.py # Native messaging host (legacy)
    └── focus_guard_host.sh # Shell wrapper
```
