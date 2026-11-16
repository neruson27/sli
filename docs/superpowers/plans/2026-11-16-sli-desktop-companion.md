# Sli Desktop Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sli`, an interactive, cross-platform desktop companion featuring a fluid white slime on dark/transparent canvas, real-time Antigravity CLI monitoring, sweet local voice (STT/TTS), multi-monitor/Hyprland control, and dual Gemini/Claude routing.

**Architecture:** A Tauri v2 lightweight desktop application with transparent frameless window rendering an interactive Verlet spring-mass slime in Canvas/WebGL. A Rust backend watches Antigravity CLI's live presence locks and `transcript.jsonl` files and dispatches window/screen management commands (native `hyprctl` IPC for Linux/Hyprland; cross-platform OS fallbacks). A lightweight local sidecar provides offline Whisper STT, sweet Piper TTS, and multi-model dispatching.

**Tech Stack:** Tauri v2, Rust (1.99+), HTML5 Canvas 2D/WebGL, JavaScript (ES2024), Python (3.14) / ONNX for local voice (Piper-TTS + Faster-Whisper), Bun / Node.js.

**Spec:** [docs/superpowers/specs/2026-11-16-sli-design.md](file:///home/neru/Documentos/Proyectos/sli/docs/superpowers/specs/2026-11-16-sli-design.md)

## Global Constraints

- Root project directory: `/home/neru/Documentos/Proyectos/sli`
- Git repository: `neruson27/sli` (remote `origin` on GitHub)
- All documentation and READMEs must be bilingual (English and Spanish)
- Zero external cloud audio transmission; local voice synthesis must remain offline
- Transparent frameless window with Wayland/Hyprland compatibility
- Memory footprint target: < 100 MB total idle RAM

---

### Task 1: Project Scaffolding & Bilingual Documentation

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `README_ES.md`
- Create: `.gitignore`
- Create: `config.example.json`
- Test: `tests/scaffolding.test.js`

**Interfaces:**
- Consumes: Project requirements from spec
- Produces: Base configuration format for `~/.config/sli/config.json` and package structure

- [ ] **Step 1: Write the failing test for configuration and bilingual READMEs**

```javascript
// tests/scaffolding.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Scaffolding and Bilingual Documentation', () => {
  it('should have valid package.json with sli metadata', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    assert.strictEqual(pkg.name, 'sli');
    assert.ok(pkg.version);
  });

  it('should have both README.md (EN) and README_ES.md (ES)', () => {
    assert.ok(fs.existsSync(path.resolve('README.md')), 'README.md must exist');
    assert.ok(fs.existsSync(path.resolve('README_ES.md')), 'README_ES.md must exist');
    const en = fs.readFileSync(path.resolve('README.md'), 'utf8');
    const es = fs.readFileSync(path.resolve('README_ES.md'), 'utf8');
    assert.ok(en.includes('Sli - Desktop Companion'), 'EN readme header');
    assert.ok(es.includes('Sli - Compañero de Escritorio'), 'ES readme header');
  });

  it('should have config.example.json with required schema keys', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve('config.example.json'), 'utf8'));
    assert.ok('voice' in config);
    assert.ok('antigravity' in config);
    assert.ok('hotkeys' in config);
    assert.ok('providers' in config);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scaffolding.test.js`  
Expected: FAIL (files missing)

- [ ] **Step 3: Create configuration, bilingual READMEs and package files**

Create `package.json`:
```json
{
  "name": "sli",
  "version": "0.1.0",
  "description": "Fluid desktop pet companion for Antigravity CLI and multi-monitor desktop management",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "dev:ui": "bun x vite ui",
    "dev": "cargo tauri dev"
  },
  "keywords": ["slime", "desktop-pet", "antigravity", "hyprland", "voice-assistant"],
  "author": "neruson27",
  "license": "MIT"
}
```

Create `config.example.json`:
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

Create `.gitignore`:
```
node_modules/
target/
src-tauri/target/
dist/
.DS_Store
*.pyc
__pycache__/
venv/
.env
config.json
```

Create `README.md` and `README_ES.md` documenting architecture, installation, Antigravity integration, Hyprland setup, and voice usage.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scaffolding.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json README.md README_ES.md .gitignore config.example.json tests/scaffolding.test.js
git commit -m "chore: scaffold sli project structure and bilingual documentation"
```

---

### Task 2: Slime 2D Jelly Physics & UI Engine

**Files:**
- Create: `ui/index.html`
- Create: `ui/styles.css`
- Create: `ui/slime_physics.js`
- Create: `ui/app.js`
- Test: `tests/slime_physics.test.js`

**Interfaces:**
- Produces: `SlimeEntity` class with methods `update()`, `draw()`, `setState(state)`, `drag(dx, dy)`, `dock()`, `undock()`.
- States supported: `'idle'`, `'thinking'`, `'alert'`, `'speaking'`, `'docked'`.

- [ ] **Step 1: Write the failing test for SlimeEntity physics**

```javascript
// tests/slime_physics.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SlimeEntity } from '../ui/slime_physics.js';

describe('SlimeEntity Physics & State Machine', () => {
  it('should initialize with 16 spring vertices and idle state', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    assert.strictEqual(slime.vertices.length, 16);
    assert.strictEqual(slime.state, 'idle');
  });

  it('should deform on drag and spring back on update', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    const initialY = slime.vertices[0].y;
    slime.drag(0, 20);
    assert.notStrictEqual(slime.vertices[0].y, initialY);
    for (let i = 0; i < 60; i++) {
      slime.update(0.016);
    }
    assert.ok(Math.abs(slime.vertices[0].y - initialY) < 5, 'Should spring back towards equilibrium');
  });

  it('should switch states cleanly', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    slime.setState('thinking');
    assert.strictEqual(slime.state, 'thinking');
    slime.setState('alert');
    assert.strictEqual(slime.state, 'alert');
    slime.dock();
    assert.strictEqual(slime.state, 'docked');
    slime.undock();
    assert.strictEqual(slime.state, 'idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/slime_physics.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SlimeEntity and Canvas rendering**

Write `ui/slime_physics.js` with spring-mass circular soft-body dynamics, damping, vertex restore forces, eye tracking, and expression rendering.
Write `ui/index.html`, `ui/styles.css`, and `ui/app.js` with canvas setup, mouse drag handlers, and Tauri IPC listener bindings.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/slime_physics.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/ tests/slime_physics.test.js
git commit -m "feat(ui): implement slime 2D spring-mass jelly physics and state animations"
```

---

### Task 3: Antigravity CLI Real-Time Transcript & Presence Observer

**Files:**
- Create: `src-tauri/src/antigravity_watcher.rs`
- Test: `src-tauri/tests/test_antigravity_watcher.rs`

**Interfaces:**
- Produces: `AntigravityState` enum (`Idle`, `Thinking`, `ExecutingTool(String)`, `NeedsInput(String)`).
- Produces: `WatcherConfig`, `watch_antigravity_events(config, sender)`.

- [ ] **Step 1: Write the failing Rust test for Antigravity watcher logic**

```rust
// src-tauri/tests/test_antigravity_watcher.rs
#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::tempdir;
    use sli_lib::antigravity_watcher::{parse_transcript_line, AntigravityState};

    #[test]
    fn test_parse_tool_execution() {
        let json_line = r#"{"type":"PLANNER_RESPONSE","source":"MODEL","tool_calls":[{"toolSummary":"Execute bash script","CommandLine":"npm test"}]}"#;
        let state = parse_transcript_line(json_line).unwrap();
        assert_eq!(state, AntigravityState::ExecutingTool("Execute bash script".into()));
    }

    #[test]
    fn test_parse_needs_input() {
        let json_line = r#"{"type":"PLANNER_RESPONSE","status":"AWAITING_USER_INPUT","content":"Please confirm if I should proceed"}"#;
        let state = parse_transcript_line(json_line).unwrap();
        assert_eq!(state, AntigravityState::NeedsInput("Please confirm if I should proceed".into()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test test_antigravity_watcher`  
Expected: FAIL (unresolved import / module)

- [ ] **Step 3: Implement `antigravity_watcher.rs`**

Implement JSON parsing of Antigravity transcript lines, directory polling for active lock files in `~/.gemini/antigravity-cli/presence/`, and live inotify/poll event generation.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test test_antigravity_watcher`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/antigravity_watcher.rs src-tauri/tests/test_antigravity_watcher.rs
git commit -m "feat(watcher): add real-time Antigravity CLI presence and transcript observer"
```

---

### Task 4: OS Control & Hyprland Multi-Monitor Manager

**Files:**
- Create: `src-tauri/src/hyprland_ipc.rs`
- Create: `src-tauri/src/system_controller.rs`
- Test: `src-tauri/tests/test_hyprland_ipc.rs`

**Interfaces:**
- Produces: `HyprlandClient::list_monitors() -> Vec<MonitorInfo>`
- Produces: `HyprlandClient::focus_monitor(name_or_id: &str) -> Result<(), String>`
- Produces: `SystemController::spawn_process(cmd: &str) -> Result<u32, String>`

- [ ] **Step 1: Write failing test for Hyprland monitor parsing and dispatch command formatting**

```rust
// src-tauri/tests/test_hyprland_ipc.rs
#[cfg(test)]
mod tests {
    use sli_lib::hyprland_ipc::{parse_hyprctl_monitors, format_focus_command};

    #[test]
    fn test_parse_monitors_json() {
        let sample = r#"[{"id":0,"name":"DP-1","description":"LG 4K","width":3840,"height":2160,"focused":true},{"id":1,"name":"HDMI-A-1","description":"Dell FHD","width":1920,"height":1080,"focused":false}]"#;
        let monitors = parse_hyprctl_monitors(sample).unwrap();
        assert_eq!(monitors.len(), 2);
        assert_eq!(monitors[0].name, "DP-1");
        assert!(monitors[0].focused);
    }

    #[test]
    fn test_format_focus_command() {
        let cmd = format_focus_command("HDMI-A-1");
        assert_eq!(cmd, vec!["dispatch", "focusmonitor", "HDMI-A-1"]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test test_hyprland_ipc`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement Hyprland IPC and System Controller**

Write `hyprland_ipc.rs` to handle command dispatching and JSON monitor queries.
Write `system_controller.rs` with safe process spawning and cross-platform desktop handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test test_hyprland_ipc`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/hyprland_ipc.rs src-tauri/src/system_controller.rs src-tauri/tests/test_hyprland_ipc.rs
git commit -m "feat(system): implement Hyprland multi-monitor IPC and process launcher"
```

---

### Task 5: Local Voice Engine Sidecar & Brain Router

**Files:**
- Create: `sidecar-audio/server.py`
- Create: `sidecar-audio/router.py`
- Create: `sidecar-audio/tts_engine.py`
- Create: `sidecar-audio/stt_engine.py`
- Create: `sidecar-audio/requirements.txt`
- Test: `sidecar-audio/test_router.py`

**Interfaces:**
- Produces: `ModelRouter::route(prompt: str) -> Response` (supports `antigravity` and `claude`)
- Produces: `TTSEngine::synthesize(text: str) -> wav_bytes`
- Produces: `STTEngine::transcribe(audio_bytes) -> str`

- [ ] **Step 1: Write failing Python unit test for router and intent classification**

```python
# sidecar-audio/test_router.py
import pytest
from router import classify_intent, ModelRouter

def test_classify_system_vs_chat():
    assert classify_intent("abre la terminal") == "system_command"
    assert classify_intent("cambia a la otra pantalla") == "screen_management"
    assert classify_intent("explícame cómo funciona un reactor nuclear") == "ai_chat"

def test_router_provider_selection():
    router = ModelRouter(default_provider="antigravity")
    assert router.get_provider_for_prompt("hola") == "antigravity"
    assert router.get_provider_for_prompt("claude: analiza este texto") == "claude"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest sidecar-audio/test_router.py`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement Python Sidecar (STT, TTS, Router)**

Write `sidecar-audio/requirements.txt`, `router.py`, `tts_engine.py`, `stt_engine.py`, and `server.py` with standard I/O IPC / HTTP microservice for Tauri.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest sidecar-audio/test_router.py`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar-audio/
git commit -m "feat(audio): add local voice engine sidecar and multi-model router"
```

---

### Task 6: Tauri v2 Desktop Shell Integration & IPC Wiring

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`
- Test: `src-tauri/tests/test_tauri_config.rs`

**Interfaces:**
- Connects frontend Canvas events, Push-to-Talk hotkeys, Antigravity watcher, and sidecar IPC.

- [ ] **Step 1: Write configuration integrity test**

```rust
// src-tauri/tests/test_tauri_config.rs
#[cfg(test)]
mod tests {
    use std::fs;

    #[test]
    fn test_tauri_conf_transparency() {
        let conf_str = fs::read_to_string("tauri.conf.json").unwrap();
        let val: serde_json::Value = serde_json::from_str(&conf_str).unwrap();
        let app = &val["app"]["windows"][0];
        assert_eq!(app["transparent"], true);
        assert_eq!(app["decorations"], false);
        assert_eq!(app["alwaysOnTop"], true);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test test_tauri_config`  
Expected: FAIL (file missing)

- [ ] **Step 3: Configure Tauri v2 application and IPC commands**

Write `tauri.conf.json` with transparent, frameless, floating window definitions and permissions.
Write `main.rs` and `lib.rs` exposing Tauri commands: `get_antigravity_status`, `dispatch_screen_action`, `toggle_dock`, `start_ptt`, `stop_ptt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test test_tauri_config`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat(tauri): wire Tauri v2 window shell, transparency, and IPC commands"
```

---

### Task 7: End-to-End Verification & GitHub Release Sync

**Files:**
- Modify: `README.md`, `README_ES.md` (Add quickstart run instructions and troubleshooting)
- Test: Full test suite (`npm test`, `cargo test`, `pytest`)

- [ ] **Step 1: Run all test suites across the stack**

Run: `node --test tests/*.test.js && cargo test && python -m pytest sidecar-audio/`  
Expected: All tests PASS with 0 errors.

- [ ] **Step 2: Verify git status and sync to GitHub repository**

```bash
git status
git push origin main
```

- [ ] **Step 3: Commit and push final release milestone**

```bash
git commit --allow-empty -m "release: v0.1.0 ready for sli desktop companion"
git push origin main
```
