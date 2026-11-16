# Sli - Spec & Technical Design Document

**Project Name:** `sli`  
**Target Directory:** `/home/neru/Documentos/Proyectos/sli`  
**GitHub Repository:** `neruson27/sli`  
**Date:** 2026-11-16  
**Status:** Approved for Implementation Planning  

---

## 1. Executive Summary

**Sli** is an intelligent, lightweight desktop companion designed as a cute, fluid white slime on a dark/transparent background. It lives as a floating desktop pet that can freely wander, squish, bounce, or dock neatly onto the top bar (Waybar/Hyprland on Linux, Menu Bar on macOS, Taskbar/Tray on Windows).

Sli serves as an interactive bridge for **Antigravity CLI** (`agy` / `gemini-cli`), reading its live operations, tool executions, thoughts, and confirmation prompts in real-time. Sli speaks with a gentle, soft, and sweet voice using an offline local neural TTS/STT engine. Sli also possesses system capabilities: launching applications, switching focus, and managing multi-monitor layouts (with first-class Hyprland Wayland IPC support), with a multi-model router supporting both Antigravity/Gemini and Claude (Anthropic).

---

## 2. Architecture & Tech Stack

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
│ • Piper/Kokoro (TTS Dulce│  │ • Hyprctl IPC Dispatcher │
│ • Dual Router (CLI/Claude│  │ • Process Launcher       │
└──────────────────────────┘  └──────────────────────────┘
```

### 2.1 Core Framework
- **Application Shell:** Tauri v2 with Rust backend.
  - Minimal footprint (~40–70 MB RAM).
  - Native Wayland / Hyprland layer & window rule support.
  - Native window transparency and click-through management.
- **Frontend / Rendering:** Webview Canvas / WebGL 2D.
  - Verlet integration / Spring-mass soft-body physics for organic slime jiggling.
  - Real-time audio waveform synchronization (mouth/body pulsating to spoken phonemes).

### 2.2 Voice Engine (100% Local & Offline)
- **STT (Speech to Text):** `faster-whisper` (model `base` / `small` with INT8 quantization).
  - Push-to-Talk activation (Global hotkey `Super + S` or mouse press on the slime).
  - Zero microphone polling or background listening when idle.
- **TTS (Text to Speech):** Piper TTS / Kokoro-ONNX.
  - Soft, melodic, high-quality voice profile (`es_ES` / `en_US` support).
  - Local wav playback with RMS amplitude piped into Tauri for animation deformation.

### 2.3 Antigravity CLI Integration
- **Presence & Session Detection:**
  - Watches `~/.gemini/antigravity-cli/presence/*.lock` to identify active sessions.
  - Reads active conversation transcript at `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` using `notify` (inotify).
- **Status Classification:**
  - `IDLE`: No active lock or awaiting user prompt.
  - `WORKING` / `THINKING`: Model is reasoning or invoking subagents.
  - `EXECUTING_TOOL`: Model is running `run_command`, `edit_file`, etc. (Sli shows the tool name in a discrete bubble).
  - `NEEDS_INPUT`: Prompting user or asking confirmation (Sli alerts with a gentle hop and chime/voice alert).
- **Resource Monitoring:**
  - Extracts token metrics and context window usage from transcript steps and displays a subtle glow / mini-gauge.

### 2.4 Multi-Model Brain Router
- **Default (Antigravity CLI):** Commands requiring workspace edits or tool calls invoke `agy` directly.
- **Secondary (Claude / Anthropic API):** Configured via API key in `config.json` for conversational queries, brainstorming, or alternative reasoning tasks.

### 2.5 System & Screen Management
- **Linux (Hyprland):**
  - Executes `hyprctl` commands via IPC (`hyprctl monitors -j`, `hyprctl dispatch focusmonitor <id>`, `hyprctl dispatch moveworkspacetomonitor`).
  - Auto-configures window rules: `windowrulev2 = float, pin, noborder, noblur, class:(sli)`.
- **Windows & macOS:**
  - Cross-platform display resolution and positioning fallback using native OS windowing APIs.
- **Process Launcher:**
  - Safe process execution (`std::process::Command`) to launch requested apps (e.g., terminal, browser, IDE).

---

## 3. Visual & Aesthetic Specification

- **Character Concept:** White Slime with dark, glossy anime eyes, gentle blush, and dynamic expressions.
- **Base Dimensions:** ~160x160 px floating canvas (scalable).
- **Color Palette:**
  - Slime Body: `#FFFFFF` (95% opacity) with a subtle radial gradient rim `#E0E7FF`.
  - Eyes / Mouth: `#1E1B4B` (deep dark blue-black).
  - Blush: `#F43F5E` (translucent pink).
  - Aura / Glow: Dynamic aura based on state (Green for done, Cyan for thinking, Amber for awaiting user, Red for errors).
- **Physics States:**
  1. `Idle`: Gentle breathing oscillation (y-scale 0.96 to 1.04 over 2.4s), blinking every 4–7s.
  2. `Drag`: Velocity deformation stretching along the movement vector.
  3. `Bounce`: Collision compression against screen edges or top bar.
  4. `Speaking`: Periodic vertical jiggle & mouth opening synced to TTS amplitude.
  5. `Docked`: Morphing into a sleek pill at the top of the screen.

---

## 4. Directory Structure

```
/home/neru/Documentos/Proyectos/sli/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-11-16-sli-design.md
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── antigravity_watcher.rs
│       ├── system_controller.rs
│       ├── hyprland_ipc.rs
│       └── router.rs
├── sidecar-audio/
│   ├── requirements.txt
│   ├── server.py
│   ├── tts_engine.py
│   ├── stt_engine.py
│   └── models/
├── ui/
│   ├── index.html
│   ├── styles.css
│   ├── slime_physics.js
│   └── app.js
├── README.md
├── README_ES.md
└── config.example.json
```

---

## 5. Security & Safety

- Sudo commands and privileged operations require explicit user approval.
- Zero audio recording unless the push-to-talk key or slime click is actively triggered.
- All voice data stays 100% on device; no external cloud voice telemetry.
- API keys stored in local user config (`~/.config/sli/config.json`) with restricted permissions (0600).

---

## 6. Verification & Acceptance Criteria

1. **Floating Slime UI:** Smooth 60+ FPS spring-mass animation with transparency and click-through/drag support on Hyprland.
2. **Docking:** Toggling dock state cleanly transitions the slime into a top-bar pill and back.
3. **Antigravity Live State:** Sli immediately changes visual state when `agy` starts running a tool or pauses for user input.
4. **Voice Pipeline:** Pressing Push-to-Talk captures speech via Faster-Whisper, routes to the selected brain, and speaks response via Piper TTS with a sweet voice.
5. **Screen / App Control:** Voice command *"abre la terminal"* or *"enfoca la otra pantalla"* triggers the respective OS command.
6. **Documentation & Repo:** Git repository created with bilingual READMEs (EN/ES) and pushed to GitHub.
