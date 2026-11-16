pub mod antigravity_watcher;
pub mod hyprland_ipc;
pub mod system_controller;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{Emitter, Manager};

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
    pub dashboard_visible: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            antigravity_state: Arc::new(RwLock::new(AntigravityState::Idle)),
            docked: Arc::new(AtomicBool::new(false)),
            recording: Arc::new(AtomicBool::new(false)),
            dashboard_visible: Arc::new(AtomicBool::new(false)),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageResponse {
    pub reply: String,
    pub action_taken: Option<String>,
}

/// Helper function to speak text out loud using local Piper neural voice and emit voice events
pub fn speak_text_with_events(text: &str, app: Option<&tauri::AppHandle>) -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let piper_bin = PathBuf::from(&home).join(".local/share/sli/piper/piper/piper");
    let model = PathBuf::from(&home).join(".local/share/sli/piper/es_MX-claude-high.onnx");
    let out_file = PathBuf::from("/tmp/sli_speech.wav");

    if piper_bin.exists() && model.exists() {
        let mut child = std::process::Command::new(&piper_bin)
            .args([
                "--model",
                &model.to_string_lossy(),
                "--output_file",
                &out_file.to_string_lossy(),
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(text.as_bytes());
        }
        let _ = child.wait();

        if let Some(app_handle) = app.cloned() {
            let text_clone = text.to_string();
            std::thread::spawn(move || {
                let _ = app_handle.emit(
                    "voice-state",
                    serde_json::json!({
                        "state": "speaking",
                        "text": text_clone,
                        "amplitude": 0.85
                    }),
                );

                let play_child = std::process::Command::new("pw-play")
                    .arg(&out_file)
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn();

                if let Ok(mut c) = play_child {
                    let _ = c.wait();
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(2000));
                }

                let _ = app_handle.emit(
                    "voice-state",
                    serde_json::json!({
                        "state": "idle",
                        "amplitude": 0.0
                    }),
                );
            });
        } else {
            let _ = std::process::Command::new("pw-play")
                .arg(&out_file)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();
        }
    }
    Ok(())
}

/// Helper function to speak text out loud without requiring AppHandle
pub fn speak_text_core(text: &str) -> Result<(), String> {
    speak_text_with_events(text, None)
}

/// Processes chat messages and executes system commands or friendly responses
pub fn chat_with_sli_core(message: &str) -> ChatMessageResponse {
    chat_with_sli_with_events(None, message)
}

/// Processes chat messages and emits voice events
pub fn chat_with_sli_with_events(app: Option<&tauri::AppHandle>, message: &str) -> ChatMessageResponse {
    let lower = message.to_lowercase();
    let trimmed = lower.trim();

    if trimmed.contains("terminal") || trimmed.contains("consola") {
        let _ = SystemController::open_terminal();
        let reply = "¡Listo! He abierto la terminal para ti.".to_string();
        let _ = speak_text_with_events(&reply, app);
        return ChatMessageResponse {
            reply,
            action_taken: Some("open_terminal".to_string()),
        };
    }

    if trimmed.contains("navegador")
        || trimmed.contains("browser")
        || trimmed.contains("chrome")
        || trimmed.contains("firefox")
    {
        let _ = SystemController::open_url("https://google.com");
        let reply = "Abriendo el navegador web.".to_string();
        let _ = speak_text_with_events(&reply, app);
        return ChatMessageResponse {
            reply,
            action_taken: Some("open_browser".to_string()),
        };
    }

    if trimmed.contains("pantalla") || trimmed.contains("monitor") {
        let _ = HyprlandClient::focus_monitor("+1");
        let reply = "He cambiado el foco de la pantalla en Hyprland.".to_string();
        let _ = speak_text_with_events(&reply, app);
        return ChatMessageResponse {
            reply,
            action_taken: Some("focus_monitor".to_string()),
        };
    }

    if trimmed.contains("estado")
        || trimmed.contains("que haces")
        || trimmed.contains("qué haces")
        || trimmed.contains("qué estás haciendo")
    {
        let reply = "Estoy monitoreando tus tareas activas en Antigravity y cuidando tu escritorio."
            .to_string();
        let _ = speak_text_with_events(&reply, app);
        return ChatMessageResponse {
            reply,
            action_taken: None,
        };
    }

    let reply = format!("Entendido. Procesé tu solicitud: \"{}\".", message);
    let _ = speak_text_with_events(&reply, app);
    ChatMessageResponse {
        reply,
        action_taken: None,
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands exposed to the webview frontend
// ---------------------------------------------------------------------------

pub mod commands {
    use super::*;
    use crate::antigravity_watcher::{
        find_active_session_with_brain, get_session_summary, SessionSummary,
    };

    #[tauri::command]
    pub fn get_antigravity_status(state: tauri::State<'_, AppState>) -> AntigravityState {
        get_antigravity_status_core(&state)
    }

    #[tauri::command]
    pub fn get_active_session_summary() -> SessionSummary {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        let presence_dir = PathBuf::from(&home).join(".gemini/antigravity-cli/presence");
        let brain_dir = PathBuf::from(&home).join(".gemini/antigravity-cli/brain");

        let session_id = find_active_session_with_brain(&presence_dir, &brain_dir)
            .unwrap_or_else(|| "default".to_string());
        get_session_summary(&brain_dir, &session_id)
    }

    #[tauri::command]
    pub fn chat_with_sli(app: tauri::AppHandle, message: String) -> ChatMessageResponse {
        chat_with_sli_with_events(Some(&app), &message)
    }

    #[tauri::command]
    pub fn speak_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
        speak_text_with_events(&text, Some(&app))
    }

    #[tauri::command]
    pub fn toggle_dashboard(
        app: tauri::AppHandle,
        state: tauri::State<'_, AppState>,
    ) -> Result<bool, String> {
        let current = state.dashboard_visible.load(Ordering::SeqCst);
        let next = !current;
        state.dashboard_visible.store(next, Ordering::SeqCst);

        let app_clone = app.clone();
        let _ = app.run_on_main_thread(move || {
            let main_win = app_clone.get_webview_window("main");
            let dash_win = app_clone.get_webview_window("dashboard");

            if next {
                if let Some(main) = main_win {
                    let _ = main.hide();
                }
                if let Some(dash) = dash_win {
                    let _ = dash.show();
                    let _ = dash.set_focus();
                }
            } else {
                if let Some(dash) = dash_win {
                    let _ = dash.hide();
                }
                if let Some(main) = main_win {
                    let _ = main.show();
                }
            }
        });

        Ok(next)
    }

    #[tauri::command]
    pub fn set_window_size(window: tauri::Window, width: u32, height: u32) -> Result<(), String> {
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: width as f64,
                height: height as f64,
            }))
            .map_err(|e| e.to_string())
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
            get_active_session_summary,
            chat_with_sli,
            speak_text,
            toggle_dashboard,
            set_window_size,
            dispatch_screen_action,
            toggle_dock,
            start_ptt,
            stop_ptt,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let _watcher = init_antigravity_watcher(handle.clone(), app_state_clone.clone(), None);
            std::mem::forget(_watcher);

            // Ensure dashboard window starts hidden and main floating window starts visible
            if let Some(dash) = app.get_webview_window("dashboard") {
                let _ = dash.hide();
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
            }

            let app_cmd = handle.clone();
            let state_cmd = app_state_clone.clone();
            std::thread::spawn(move || {
                let fifo_path = "/tmp/sli.fifo";
                let _ = std::fs::remove_file(fifo_path);
                let _ = std::process::Command::new("mkfifo").arg(fifo_path).status();
                use std::io::BufRead;
                loop {
                    if let Ok(file) = std::fs::File::open(fifo_path) {
                        let reader = std::io::BufReader::new(file);
                        for line in reader.lines().flatten() {
                            let trimmed = line.trim();
                            if trimmed == "toggle_dashboard" || trimmed == "dashboard" {
                                let current = state_cmd.dashboard_visible.load(Ordering::SeqCst);
                                let next = !current;
                                state_cmd.dashboard_visible.store(next, Ordering::SeqCst);
                                let app_thread = app_cmd.clone();
                                let _ = app_cmd.run_on_main_thread(move || {
                                    let main_win = app_thread.get_webview_window("main");
                                    let dash_win = app_thread.get_webview_window("dashboard");
                                    if next {
                                        if let Some(main) = main_win {
                                            let _ = main.hide();
                                        }
                                        if let Some(dash) = dash_win {
                                            let _ = dash.show();
                                            let _ = dash.set_focus();
                                        }
                                    } else {
                                        if let Some(dash) = dash_win {
                                            let _ = dash.hide();
                                        }
                                        if let Some(main) = main_win {
                                            let _ = main.show();
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
