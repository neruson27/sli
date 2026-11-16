use std::process::{Command, Stdio};

/// Splits a command string into individual arguments, supporting single and double quotes and escapes.
pub fn split_command(cmd: &str) -> Result<Vec<String>, String> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Err("Command string is empty".to_string());
    }

    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;

    for c in trimmed.chars() {
        if escaped {
            current.push(c);
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == '\'' && !in_double {
            in_single = !in_single;
        } else if c == '"' && !in_single {
            in_double = !in_double;
        } else if c.is_whitespace() && !in_single && !in_double {
            if !current.is_empty() {
                tokens.push(current);
                current = String::new();
            }
        } else {
            current.push(c);
        }
    }

    if in_single || in_double {
        return Err("Unclosed quote in command string".to_string());
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    if tokens.is_empty() {
        return Err("No executable command found".to_string());
    }

    Ok(tokens)
}

/// Safe system process executor and cross-platform desktop controller.
#[derive(Debug, Clone, Default)]
pub struct SystemController;

impl SystemController {
    /// Creates a new `SystemController` instance.
    pub fn new() -> Self {
        Self
    }

    /// Safely spawns an application or process from a command string.
    /// Decouples standard I/O streams and returns the child Process ID (PID).
    pub fn spawn_process(cmd: &str) -> Result<u32, String> {
        let tokens = split_command(cmd)?;
        let (program, args) = tokens
            .split_first()
            .ok_or_else(|| "Command cannot be empty".to_string())?;

        let mut command = Command::new(program);
        command.args(args);
        command.stdin(Stdio::null());
        command.stdout(Stdio::null());
        command.stderr(Stdio::null());

        let child = command
            .spawn()
            .map_err(|e| format!("Failed to spawn process '{}': {}", program, e))?;

        Ok(child.id())
    }

    /// Opens a web URL in the system's default browser.
    pub fn open_url(url: &str) -> Result<u32, String> {
        #[cfg(target_os = "windows")]
        let cmd = format!("cmd /c start {}", url);

        #[cfg(target_os = "macos")]
        let cmd = format!("open {}", url);

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let cmd = format!("xdg-open {}", url);

        Self::spawn_process(&cmd)
    }

    /// Opens a file or directory path in the system default file manager or viewer.
    pub fn open_path(path: &str) -> Result<u32, String> {
        #[cfg(target_os = "windows")]
        let cmd = format!("explorer {}", path);

        #[cfg(target_os = "macos")]
        let cmd = format!("open {}", path);

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let cmd = format!("xdg-open {}", path);

        Self::spawn_process(&cmd)
    }

    /// Spawns the default or detected system terminal emulator.
    pub fn open_terminal() -> Result<u32, String> {
        let env_term = std::env::var("TERMINAL").unwrap_or_default();
        let candidate_terminals = [
            env_term.as_str(),
            "x-terminal-emulator",
            "kitty",
            "alacritty",
            "foot",
            "wezterm",
            "ghostty",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "xterm",
        ];

        for term in candidate_terminals {
            if term.is_empty() {
                continue;
            }
            if let Ok(pid) = Self::spawn_process(term) {
                return Ok(pid);
            }
        }

        Err("No supported terminal emulator found on system".to_string())
    }
}
