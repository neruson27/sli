#[cfg(test)]
mod tests {
    use sli_lib::hyprland_ipc::{format_focus_command, parse_hyprctl_monitors, HyprlandClient};
    use sli_lib::system_controller::{split_command, SystemController};

    #[test]
    fn test_parse_monitors_json() {
        let sample = r#"[{"id":0,"name":"DP-1","description":"LG 4K","width":3840,"height":2160,"focused":true},{"id":1,"name":"HDMI-A-1","description":"Dell FHD","width":1920,"height":1080,"focused":false}]"#;
        let monitors = parse_hyprctl_monitors(sample).unwrap();
        assert_eq!(monitors.len(), 2);
        assert_eq!(monitors[0].id, 0);
        assert_eq!(monitors[0].name, "DP-1");
        assert_eq!(monitors[0].description, "LG 4K");
        assert_eq!(monitors[0].width, 3840);
        assert_eq!(monitors[0].height, 2160);
        assert!(monitors[0].focused);

        assert_eq!(monitors[1].id, 1);
        assert_eq!(monitors[1].name, "HDMI-A-1");
        assert_eq!(monitors[1].description, "Dell FHD");
        assert_eq!(monitors[1].width, 1920);
        assert_eq!(monitors[1].height, 1080);
        assert!(!monitors[1].focused);
    }

    #[test]
    fn test_parse_monitors_invalid_json() {
        assert!(parse_hyprctl_monitors("not valid json").is_err());
        assert!(parse_hyprctl_monitors("{}").is_err());
    }

    #[test]
    fn test_parse_monitors_with_extra_fields() {
        let sample = r#"[{
            "id": 1,
            "name": "DP-2",
            "description": "Microstep MSI G27C3F",
            "make": "Microstep",
            "model": "MSI G27C3F",
            "serial": "CD0H134500406",
            "width": 1920,
            "height": 1080,
            "refreshRate": 60.0,
            "focused": false,
            "dpmsStatus": true
        }]"#;
        let monitors = parse_hyprctl_monitors(sample).unwrap();
        assert_eq!(monitors.len(), 1);
        assert_eq!(monitors[0].id, 1);
        assert_eq!(monitors[0].name, "DP-2");
        assert_eq!(monitors[0].description, "Microstep MSI G27C3F");
        assert_eq!(monitors[0].width, 1920);
        assert_eq!(monitors[0].height, 1080);
        assert!(!monitors[0].focused);
    }

    #[test]
    fn test_format_focus_command() {
        let cmd = format_focus_command("HDMI-A-1");
        assert_eq!(cmd, vec!["dispatch", "focusmonitor", "HDMI-A-1"]);
    }

    #[test]
    fn test_hyprland_client_list_monitors() {
        let monitors = HyprlandClient::list_monitors();
        // Returns a vector of monitors without panicking (populated on Hyprland, empty fallback otherwise)
        let _ = monitors.len();
    }

    #[test]
    fn test_split_command() {
        let tokens = split_command("echo 'hello world' \"foo bar\" test").unwrap();
        assert_eq!(tokens, vec!["echo", "hello world", "foo bar", "test"]);

        assert!(split_command("").is_err());
        assert!(split_command("   ").is_err());
        assert!(split_command("echo 'unclosed").is_err());
    }

    #[test]
    fn test_system_controller_spawn_process() {
        let pid = SystemController::spawn_process("true").unwrap();
        assert!(pid > 0);

        let err = SystemController::spawn_process("non_existent_binary_xyz_12345");
        assert!(err.is_err());
    }
}
