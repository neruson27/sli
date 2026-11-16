use serde::{Deserialize, Serialize};
use std::process::Command;

/// Information describing an active Hyprland output monitor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub width: i64,
    pub height: i64,
    pub focused: bool,
}

/// Parses the JSON output from `hyprctl monitors -j` into a list of `MonitorInfo`.
pub fn parse_hyprctl_monitors(json_str: &str) -> Result<Vec<MonitorInfo>, String> {
    serde_json::from_str::<Vec<MonitorInfo>>(json_str)
        .map_err(|e| format!("Failed to parse hyprctl monitors JSON: {}", e))
}

/// Formats the command-line arguments for `hyprctl dispatch focusmonitor <name_or_id>`.
pub fn format_focus_command(name_or_id: &str) -> Vec<String> {
    vec![
        "dispatch".to_string(),
        "focusmonitor".to_string(),
        name_or_id.to_string(),
    ]
}

/// Client interface for Hyprland Wayland IPC commands.
#[derive(Debug, Clone, Default)]
pub struct HyprlandClient;

impl HyprlandClient {
    /// Creates a new `HyprlandClient` instance.
    pub fn new() -> Self {
        Self
    }

    /// Checks if a Hyprland session is currently running.
    pub fn is_available() -> bool {
        std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok()
            || Command::new("hyprctl")
                .arg("version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
    }

    /// Lists connected monitors parsed from `hyprctl monitors -j`.
    /// Returns an empty list if Hyprland is unavailable or if querying fails.
    pub fn list_monitors() -> Vec<MonitorInfo> {
        Self::query_monitors().unwrap_or_default()
    }

    /// Queries connected monitors, returning full Result with any diagnostic errors.
    pub fn query_monitors() -> Result<Vec<MonitorInfo>, String> {
        let output = Command::new("hyprctl")
            .args(["monitors", "-j"])
            .output()
            .map_err(|e| format!("Failed to execute hyprctl: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("hyprctl monitors failed: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_hyprctl_monitors(&stdout)
    }

    /// Focuses the specified monitor by name or id using `hyprctl dispatch focusmonitor <name_or_id>`.
    pub fn focus_monitor(name_or_id: &str) -> Result<(), String> {
        let args = format_focus_command(name_or_id);
        let output = Command::new("hyprctl")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to execute hyprctl dispatch: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "hyprctl dispatch focusmonitor failed: {}",
                stderr.trim()
            ));
        }

        Ok(())
    }

    /// Moves a workspace to the specified monitor using `hyprctl dispatch moveworkspacetomonitor <workspace> <monitor>`.
    pub fn move_workspace_to_monitor(workspace: &str, monitor: &str) -> Result<(), String> {
        let output = Command::new("hyprctl")
            .args(["dispatch", "moveworkspacetomonitor", workspace, monitor])
            .output()
            .map_err(|e| format!("Failed to execute hyprctl dispatch: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "hyprctl dispatch moveworkspacetomonitor failed: {}",
                stderr.trim()
            ));
        }

        Ok(())
    }
}
