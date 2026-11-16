#[cfg(test)]
mod tests {
    use sli_lib::antigravity_watcher::AntigravityState;
    use sli_lib::{
        dispatch_screen_action_core, get_antigravity_status_core, start_ptt_core,
        state_to_payload, stop_ptt_core, toggle_dock_core, AppState,
    };
    use std::fs;
    use std::sync::atomic::Ordering;

    #[test]
    fn test_tauri_conf_transparency() {
        let conf_str = fs::read_to_string("tauri.conf.json").unwrap();
        let val: serde_json::Value = serde_json::from_str(&conf_str).unwrap();
        let app = &val["app"]["windows"][0];
        assert_eq!(app["transparent"], true);
        assert_eq!(app["decorations"], false);
        assert_eq!(app["alwaysOnTop"], true);
    }

    #[test]
    fn test_tauri_conf_window_geometry_and_title() {
        let conf_str = fs::read_to_string("tauri.conf.json").unwrap();
        let val: serde_json::Value = serde_json::from_str(&conf_str).unwrap();
        let app = &val["app"]["windows"][0];
        assert_eq!(app["title"], "sli");
        assert_eq!(app["width"], 220);
        assert_eq!(app["height"], 220);
        assert_eq!(app["resizable"], false);
    }

    #[test]
    fn test_app_state_and_antigravity_status() {
        let state = AppState::default();
        assert_eq!(get_antigravity_status_core(&state), AntigravityState::Idle);

        {
            let mut writer = state.antigravity_state.write().unwrap();
            *writer = AntigravityState::ExecutingTool("web_search".to_string());
        }

        assert_eq!(
            get_antigravity_status_core(&state),
            AntigravityState::ExecutingTool("web_search".to_string())
        );
    }

    #[test]
    fn test_state_to_payload_conversion() {
        let p_idle = state_to_payload(&AntigravityState::Idle);
        assert_eq!(p_idle.state, "idle");
        assert_eq!(p_idle.message.as_deref(), Some("Listo"));

        let p_thinking = state_to_payload(&AntigravityState::Thinking);
        assert_eq!(p_thinking.state, "thinking");
        assert_eq!(p_thinking.message.as_deref(), Some("Pensando..."));

        let p_tool = state_to_payload(&AntigravityState::ExecutingTool("bash".to_string()));
        assert_eq!(p_tool.state, "executing_tool");
        assert_eq!(p_tool.tool.as_deref(), Some("bash"));
        assert_eq!(p_tool.message.as_deref(), Some("Ejecutando: bash"));

        let p_input = state_to_payload(&AntigravityState::NeedsInput("Confirm delete?".to_string()));
        assert_eq!(p_input.state, "needs_input");
        assert_eq!(p_input.prompt.as_deref(), Some("Confirm delete?"));
    }

    #[test]
    fn test_toggle_dock() {
        let state = AppState::default();
        assert!(!state.docked.load(Ordering::SeqCst));

        let docked = toggle_dock_core(&state);
        assert!(docked);
        assert!(state.docked.load(Ordering::SeqCst));

        let undocked = toggle_dock_core(&state);
        assert!(!undocked);
        assert!(!state.docked.load(Ordering::SeqCst));
    }

    #[test]
    fn test_ptt_start_stop() {
        let state = AppState::default();
        assert!(!state.recording.load(Ordering::SeqCst));

        let start_res = start_ptt_core(&state);
        assert_eq!(start_res.unwrap(), "recording_started");
        assert!(state.recording.load(Ordering::SeqCst));

        let stop_res = stop_ptt_core(&state);
        assert_eq!(stop_res.unwrap(), "recording_stopped");
        assert!(!state.recording.load(Ordering::SeqCst));
    }

    #[test]
    fn test_dispatch_screen_action_validation() {
        // Unknown action returns error
        let err = dispatch_screen_action_core("unknown_dummy_action", "target").unwrap_err();
        assert!(err.contains("Unknown action: 'unknown_dummy_action'"));

        // Move workspace invalid target
        let ws_err = dispatch_screen_action_core("move_workspace", "single_target").unwrap_err();
        assert!(ws_err.contains("Target must be 'workspace monitor'"));
    }

    #[test]
    fn test_chat_with_sli() {
        use sli_lib::chat_with_sli_core;

        let res_status = chat_with_sli_core("cual es tu estado?");
        assert!(res_status.reply.contains("monitoreando tus tareas activas"));

        let res_other = chat_with_sli_core("puedes contarme una historia?");
        assert!(res_other.reply.contains("puedes contarme una historia?"));
    }
}
