# Sli - Desktop Companion

> **A fluid, intelligent desktop pet companion for Antigravity CLI, multi-monitor management, and offline voice interaction.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20(Hyprland%2FWayland)%20%7C%20macOS%20%7C%20Windows-green.svg)]()
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app)

*Read this document in [Español (Spanish)](README_ES.md).*

---

## 🌟 Overview

**Sli** is an adorable, interactive white slime desktop pet that lives directly on your screen. Rendered with soft-body spring physics and transparent window overlays, Sli reacts to your cursor, bounces across screen boundaries, and docks smoothly to your top bar (Waybar/Hyprland on Linux, Menu Bar on macOS, Taskbar on Windows).

Beyond being a cute companion, Sli acts as an **interactive companion for the Antigravity CLI agent system (`agy` / `gemini-cli`)**, watching running agent processes, displaying real-time reasoning and tool states, alerting you when input is needed, and responding to offline voice commands in English and Spanish.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   sli (Tauri v2 App)                   │
├────────────────────────────┬───────────────────────────┤
│ Frontend (Webview / Canvas)│ Backend Core (Rust)       │
│ • Slime 2D Jelly Physics   │ • Transparent Frameless   │
│ • Expression & Eyes State  │ • Window & Docking State  │
│ • Dialog Bubble / HUD      │ • Global Push-To-Talk     │
│ • Token & Resource Gauge   │ • IPC Event Bus           │
└─────────────┬──────────────┴─────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ Audio Engine (Local)     │  │ OS Control & Observers   │
│ • Faster-Whisper (STT)   │  │ • Antigravity Log Watcher│
│ • Piper/Kokoro (TTS)     │  │ • Hyprctl IPC Dispatcher │
│ • Dual Router(CLI/Claude)│  │ • Process Launcher       │
└──────────────────────────┘  └──────────────────────────┘
```

### Key Components

1. **Tauri v2 Core (Rust)**:
   - Ultralight memory footprint (~40–70 MB idle RAM).
   - Manages transparent, frameless, click-through, and always-on-top window states.
   - Low-latency IPC between the webview, OS hooks, and audio sidecar.

2. **Frontend Canvas / Slime Physics**:
   - 2D soft-body spring-mass physics (Verlet integration) simulating organic jelly-like motion.
   - Dynamic animations: breathing idle, velocity stretch on drag, squash & stretch on impact, mouth sync with speech phonemes, and pill morphing when docked.

3. **Antigravity CLI Watcher**:
   - Monitors active session locks at `~/.gemini/antigravity-cli/presence/*.lock`.
   - Streams live conversation events from `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
   - Maps agent activity to visual states:
     - `IDLE`: Normal relaxed breathing.
     - `THINKING`: Cyan aura with focused eyes.
     - `EXECUTING_TOOL`: Discrete status pill showing active tool (e.g., `run_command`, `edit_file`).
     - `NEEDS_INPUT`: Amber alert hop with optional gentle chime.

4. **100% Offline Local Voice Engine**:
   - **STT (Speech-to-Text)**: `faster-whisper` (base/small models INT8 quantized) for zero-latency local speech recognition.
   - **TTS (Text-to-Speech)**: `piper-tts` / `kokoro-onnx` delivering a sweet, soft, natural voice.
   - **Privacy First**: Zero microphone recording when idle. Activates strictly upon Push-To-Talk (`Super + S`) or clicking the slime.

5. **Multi-Model Brain Router**:
   - **Primary**: Antigravity CLI commands (`agy`) for coding, editing, and tool execution.
   - **Secondary**: Anthropic Claude API for conversational dialogue, reasoning queries, and brainstorming.

6. **Desktop & Multi-Monitor Management**:
   - Native Hyprland Wayland IPC (`hyprctl`) to switch active monitors, move workspaces, and control windows.
   - Cross-platform fallbacks for macOS and Windows.

---

## 🚀 Installation & Prerequisites

### Prerequisites

- **Rust**: 1.77+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Node.js / Bun**: Bun 1.1+ or Node.js 20+
- **Python**: 3.10+ (for local speech sidecar)
- **Linux Packages** (Arch/CachyOS):
  ```bash
  sudo pacman -S webkit2gtk-4.1 base-devel openssl libayatana-appindicator
  ```

### Clone & Setup

```bash
git clone https://github.com/neruson27/sli.git
cd sli
cp config.example.json ~/.config/sli/config.json
```

---

## ⚙️ Configuration

Sli loads its configuration from `~/.config/sli/config.json` (or `./config.example.json` as reference):

```json
{
  "antigravity": {
    "enabled": true,
    "presence_dir": "~/.gemini/antigravity-cli/presence",
    "brain_dir": "~/.gemini/antigravity-cli/brain",
    "poll_interval_ms": 350
  },
  "voice": {
    "enabled": true,
    "stt_model": "base",
    "language": "es",
    "tts_voice": "es_ES-dalia-medium",
    "push_to_talk_key": "Super+S"
  },
  "hotkeys": {
    "push_to_talk": "Super+S",
    "toggle_dock": "Super+D"
  },
  "providers": {
    "default": "antigravity",
    "anthropic_api_key": "",
    "gemini_api_key": ""
  },
  "window": {
    "always_on_top": true,
    "transparent": true,
    "width": 180,
    "height": 180,
    "dock_position": "top-right"
  }
}
```

---

## 🪟 Hyprland Integration

For optimal floating and transparency behavior on Hyprland, add the following rules to your `hyprland.conf`:

```ini
# Sli Desktop Pet Rules
windowrulev2 = float, class:(sli)
windowrulev2 = pin, class:(sli)
windowrulev2 = noborder, class:(sli)
windowrulev2 = noblur, class:(sli)
windowrulev2 = nodim, class:(sli)
windowrulev2 = noshadow, class:(sli)
```

---

## 🎮 Development & Testing

Run unit and integration tests:

```bash
# Run Node.js test suite
npm test

# Run UI dev server standalone
npm run dev:ui

# Launch full Tauri desktop application
npm run dev
```

---

## ⌨️ Default Keybindings

| Shortcut | Action |
|----------|--------|
| `Super + S` | Push-to-Talk (Hold or toggle to speak) |
| `Super + D` | Toggle Docking (morph between pet and top-bar pill) |
| Left Click & Drag | Move Sli around screens |
| Click Sli | Wake / Express affection / Activate Voice |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
