pub mod antigravity_watcher;
pub mod hyprland_ipc;
pub mod system_controller;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::Emitter;

use crate::antigravity_watcher::{
    watch_antigravity_events, AntigravityState, WatcherConfig, WatcherHandle,
};
use crate::hyprland_ipc::HyprlandClient;
use crate::system_controller::SystemController;
use serde::{Deserialize, Serialize};

/// Shared application state managed by Tauri.
#[derive(Clone)]
pub struct AppState {
    pub antigravity_state: Arc<RwLock<AntigravityState>>,
    pub docked: Arc<AtomicBool>,
    pub recording: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            antigravity_state: Arc::new(RwLock::new(AntigravityState::Idle)),
            docked: Arc::new(AtomicBool::new(false)),
            recording: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// JSON payload emitted for Antigravity state change events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AntigravityStatePayload {
    pub state: String,
    pub message: Option<String>,
    pub tool: Option<String>,
    pub prompt: Option<String>,
}

/// Converts an internal `AntigravityState` into a serializable event payload.
pub fn state_to_payload(state: &AntigravityState) -> AntigravityStatePayload {
    match state {
        AntigravityState::Idle => AntigravityStatePayload {
            state: "idle".to_string(),
            message: Some("Listo".to_string()),
            tool: None,
            prompt: None,
        },
        AntigravityState::Thinking => AntigravityStatePayload {
            state: "thinking".to_string(),
            message: Some("Pensando...".to_string()),
            tool: None,
            prompt: None,
        },
        AntigravityState::ExecutingTool(tool) => AntigravityStatePayload {
            state: "executing_tool".to_string(),
            message: Some(format!("Ejecutando: {}", tool)),
            tool: Some(tool.clone()),
            prompt: None,
        },
        AntigravityState::NeedsInput(prompt) => AntigravityStatePayload {
            state: "needs_input".to_string(),
            message: Some(prompt.clone()),
            tool: None,
            prompt: Some(prompt.clone()),
        },
    }
}

/// Core function returning the current `AntigravityState` from `AppState`.
pub fn get_antigravity_status_core(state: &AppState) -> AntigravityState {
    state
        .antigravity_state
        .read()
        .map(|s| s.clone())
        .unwrap_or(AntigravityState::Idle)
}

/// Core function executing system or Hyprland screen actions.
pub fn dispatch_screen_action_core(action: &str, target: &str) -> Result<String, String> {
    match action {
        "focus_monitor" | "focus" => {
            HyprlandClient::focus_monitor(target)?;
            Ok(format!("Focused monitor: {}", target))
        }
        "move_workspace" | "move_workspace_to_monitor" => {
            let parts: Vec<&str> = target.split([',', ' ']).filter(|s| !s.is_empty()).collect();
            if parts.len() == 2 {
                HyprlandClient::move_workspace_to_monitor(parts[0], parts[1])?;
                Ok(format!("Moved workspace {} to monitor {}", parts[0], parts[1]))
            } else {
                Err("Target must be 'workspace monitor' or 'workspace,monitor'".to_string())
            }
        }
        "list_monitors" => {
            let monitors = HyprlandClient::query_monitors()?;
            serde_json::to_string(&monitors).map_err(|e| e.to_string())
        }
        "open_terminal" | "terminal" => {
            let pid = SystemController::open_terminal()?;
            Ok(format!("Terminal opened with PID {}", pid))
        }
        "open_url" | "url" => {
            let pid = SystemController::open_url(target)?;
            Ok(format!("Opened URL with PID {}", pid))
        }
        "open_path" | "path" | "open_file" => {
            let pid = SystemController::open_path(target)?;
            Ok(format!("Opened path with PID {}", pid))
        }
        "spawn" | "spawn_process" | "exec" | "run" => {
            let pid = SystemController::spawn_process(target)?;
            Ok(format!("Process spawned with PID {}", pid))
        }
        _ => Err(format!(
            "Unknown action: '{}'. Supported actions: focus_monitor, move_workspace, list_monitors, open_terminal, open_url, open_path, spawn_process",
            action
        )),
    }
}

/// Core function toggling dock state in `AppState`.
pub fn toggle_dock_core(state: &AppState) -> bool {
    let current = state.docked.load(Ordering::SeqCst);
    let next = !current;
    state.docked.store(next, Ordering::SeqCst);
    next
}

/// Core function starting Push-to-Talk audio recording.
pub fn start_ptt_core(state: &AppState) -> Result<String, String> {
    state.recording.store(true, Ordering::SeqCst);
    Ok("recording_started".to_string())
}

/// Core function stopping Push-to-Talk audio recording.
pub fn stop_ptt_core(state: &AppState) -> Result<String, String> {
    state.recording.store(false, Ordering::SeqCst);
    Ok("recording_stopped".to_string())
}

// ---------------------------------------------------------------------------
// Tauri Commands exposed to the webview frontend
// ---------------------------------------------------------------------------

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn get_antigravity_status(state: tauri::State<'_, AppState>) -> AntigravityState {
        get_antigravity_status_core(&state)
    }

    #[tauri::command]
    pub fn dispatch_screen_action(action: String, target: String) -> Result<String, String> {
        dispatch_screen_action_core(&action, &target)
    }

    #[tauri::command]
    pub fn toggle_dock(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
    ) -> Result<bool, String> {
        let is_docked = toggle_dock_core(&state);
        let _ = app.emit("window-dock", serde_json::json!({ "docked": is_docked }));
        Ok(is_docked)
    }

    #[tauri::command]
    pub fn start_ptt(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
    ) -> Result<String, String> {
        let res = start_ptt_core(&state)?;
        let _ = app.emit("voice-state", serde_json::json!({ "state": "recording" }));
        let _ = app.emit(
            "audio-ptt-state",
            serde_json::json!({ "recording": true, "label": "Escuchando..." }),
        );
        Ok(res)
    }

    #[tauri::command]
    pub fn stop_ptt(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
    ) -> Result<String, String> {
        let res = stop_ptt_core(&state)?;
        let _ = app.emit("voice-state", serde_json::json!({ "state": "idle" }));
        let _ = app.emit("audio-ptt-state", serde_json::json!({ "recording": false }));
        Ok(res)
    }
}

pub use commands::*;

/// Spawns the background Antigravity presence/transcript observer thread
/// and forwards state updates both to the AppState and via Tauri event emissions.
pub fn init_antigravity_watcher(
    app_handle: tauri::AppHandle,
    state: AppState,
    config: Option<WatcherConfig>,
) -> WatcherHandle {
    let cfg = config.unwrap_or_default();
    let (tx, rx) = crossbeam_channel::unbounded();
    let watcher_handle = watch_antigravity_events(cfg, tx);

    std::thread::spawn(move || {
        while let Ok(new_state) = rx.recv() {
            // 1. Update shared in-memory state
            if let Ok(mut current) = state.antigravity_state.write() {
                *current = new_state.clone();
            }

            // 2. Prepare payload
            let payload = state_to_payload(&new_state);

            // 3. Emit `antigravity-state-changed` event to webview
            let _ = app_handle.emit("antigravity-state-changed", &payload);

            // 4. Also emit `antigravity-state` for frontend app.js compatibility
            let _ = app_handle.emit("antigravity-state", &payload);
        }
    });

    watcher_handle
}

/// Runs the Tauri v2 application.
pub fn run() {
    let app_state = AppState::default();
    let app_state_clone = app_state.clone();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_antigravity_status,
            dispatch_screen_action,
            toggle_dock,
            start_ptt,
            stop_ptt,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let _watcher = init_antigravity_watcher(handle, app_state_clone, None);
            std::mem::forget(_watcher);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
