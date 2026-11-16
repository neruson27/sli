use crossbeam_channel::Sender;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

/// Representation of the live Antigravity CLI state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AntigravityState {
    Idle,
    Thinking,
    ExecutingTool(String),
    NeedsInput(String),
}

/// Configuration options for observing Antigravity presence and transcripts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherConfig {
    pub enabled: bool,
    pub presence_dir: PathBuf,
    pub brain_dir: PathBuf,
    pub poll_interval_ms: u64,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        Self {
            enabled: true,
            presence_dir: PathBuf::from(&home).join(".gemini/antigravity-cli/presence"),
            brain_dir: PathBuf::from(&home).join(".gemini/antigravity-cli/brain"),
            poll_interval_ms: 350,
        }
    }
}

/// Expands leading `~` or `~/` to the user's home directory.
pub fn resolve_path(path: &Path) -> PathBuf {
    let path_str = path.to_string_lossy();
    if path_str == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    } else if let Some(stripped) = path_str.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    path.to_path_buf()
}

/// Cleans and extracts tool summary strings.
fn clean_tool_summary(s: &str) -> String {
    let trimmed = s.trim().trim_matches('"').trim();
    if trimmed.is_empty() {
        "Executing tool".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Parses a single JSON line from Antigravity's `transcript.jsonl` into an `AntigravityState`.
pub fn parse_transcript_line(line: &str) -> Option<AntigravityState> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let val: Value = serde_json::from_str(trimmed).ok()?;

    // 1. Check if awaiting user input
    if let Some(status) = val.get("status").and_then(|s| s.as_str()) {
        if status == "AWAITING_USER_INPUT" {
            let content = val
                .get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("Please confirm action")
                .trim()
                .to_string();
            return Some(AntigravityState::NeedsInput(content));
        }
    }

    // 2. Check for active tool calls
    if let Some(tool_calls) = val.get("tool_calls").and_then(|t| t.as_array()) {
        if let Some(first_call) = tool_calls.first() {
            let summary = if let Some(summary_str) =
                first_call.get("toolSummary").and_then(|s| s.as_str())
            {
                clean_tool_summary(summary_str)
            } else if let Some(summary_str) = first_call
                .get("args")
                .and_then(|a| a.get("toolSummary"))
                .and_then(|s| s.as_str())
            {
                clean_tool_summary(summary_str)
            } else if let Some(name_str) = first_call.get("name").and_then(|s| s.as_str()) {
                clean_tool_summary(name_str)
            } else {
                "Executing tool".to_string()
            };
            return Some(AntigravityState::ExecutingTool(summary));
        }
    }

    // 3. Check message type
    if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
        match msg_type {
            "USER_INPUT" => return Some(AntigravityState::Thinking),
            "PLANNER_RESPONSE" => {
                if let Some(status) = val.get("status").and_then(|s| s.as_str()) {
                    if status == "IN_PROGRESS" {
                        return Some(AntigravityState::Thinking);
                    }
                    if status == "DONE" {
                        return Some(AntigravityState::Idle);
                    }
                }
                if val.get("thinking").is_some() && val.get("content").is_none() {
                    return Some(AntigravityState::Thinking);
                }
            }
            _ => {}
        }
    }

    // 4. Fallback status strings
    if let Some(status) = val.get("status").and_then(|s| s.as_str()) {
        match status {
            "THINKING" | "IN_PROGRESS" => return Some(AntigravityState::Thinking),
            "IDLE" => return Some(AntigravityState::Idle),
            _ => {}
        }
    }

    None
}

/// Scans the presence directory for active `.lock` files, returning the session ID of the newest one.
pub fn find_active_session(presence_dir: &Path) -> Option<String> {
    let brain_dir = presence_dir.parent().unwrap_or(presence_dir).join("brain");
    find_active_session_with_brain(presence_dir, &brain_dir)
}

/// Scans the brain directory and presence directory to find the active session.
/// Prioritizes the session whose `transcript.jsonl` was modified most recently.
pub fn find_active_session_with_brain(presence_dir: &Path, brain_dir: &Path) -> Option<String> {
    let mut latest_session: Option<(String, SystemTime)> = None;

    // 1. First priority: Check brain_dir for most recently updated transcript.jsonl
    if brain_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(brain_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let transcript = path.join(".system_generated/logs/transcript.jsonl");
                    if let Ok(meta) = transcript.metadata() {
                        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                        if let Some(name) = entry.file_name().to_str() {
                            match &latest_session {
                                None => latest_session = Some((name.to_string(), mtime)),
                                Some((_, prev_mtime)) => {
                                    if mtime > *prev_mtime {
                                        latest_session = Some((name.to_string(), mtime));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: Check presence_dir .lock files
    if latest_session.is_none() && presence_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(presence_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("lock") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        let mtime = entry
                            .metadata()
                            .and_then(|m| m.modified())
                            .unwrap_or(SystemTime::UNIX_EPOCH);
                        match &latest_session {
                            None => latest_session = Some((stem.to_string(), mtime)),
                            Some((_, prev_mtime)) => {
                                if mtime > *prev_mtime {
                                    latest_session = Some((stem.to_string(), mtime));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    latest_session.map(|(id, _)| id)
}

/// Returns the full path to the `transcript.jsonl` file for a given session.
pub fn get_transcript_path(brain_dir: &Path, session_id: &str) -> PathBuf {
    brain_dir
        .join(session_id)
        .join(".system_generated/logs/transcript.jsonl")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub step_index: u64,
    pub task_type: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub model: String,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_tokens: u64,
    pub recent_tasks: Vec<TaskItem>,
}

/// Reads the active transcript and generates a rich summary of tasks, model name, and token usage.
pub fn get_session_summary(brain_dir: &Path, session_id: &str) -> SessionSummary {
    let transcript_path = get_transcript_path(brain_dir, session_id);
    let mut model_name = "Gemini 3.8 Flash".to_string();
    let mut total_in = 0u64;
    let mut total_out = 0u64;
    let mut total_cache = 0u64;
    let mut tasks = Vec::new();

    if let Ok(file) = File::open(&transcript_path) {
        let reader = BufReader::new(file);
        for line_res in reader.lines() {
            let Ok(line) = line_res else { continue };
            let trimmed = line.trim();
            if trimmed.is_empty() { continue };
            let Ok(val) = serde_json::from_str::<Value>(trimmed) else { continue };

            // Extract model name
            if let Some(m) = val.get("model").and_then(|s| s.as_str()) {
                if !m.is_empty() {
                    model_name = match m {
                        "gemini-3.8-flash-medium" | "gemini-3.8-flash" => "Gemini 3.8 Flash (Medium)".into(),
                        "gemini-2.5-pro" | "gemini-3.8-pro" => "Gemini 2.5 Pro".into(),
                        other => other.to_string(),
                    };
                }
            }

            // Extract tokens
            if let Some(tok) = val.get("input_tokens").and_then(|t| t.as_u64()) {
                total_in += tok;
            }
            if let Some(tok) = val.get("output_tokens").and_then(|t| t.as_u64()) {
                total_out += tok;
            }
            if let Some(tok) = val.get("cache_read_tokens").and_then(|t| t.as_u64()) {
                total_cache += tok;
            }

            let step_idx = val.get("step_index").and_then(|s| s.as_u64()).unwrap_or(0);
            let ts = val.get("created_at").and_then(|s| s.as_str()).unwrap_or("").to_string();
            let status = val.get("status").and_then(|s| s.as_str()).unwrap_or("done").to_string();

            // Check tool calls
            if let Some(calls) = val.get("tool_calls").and_then(|c| c.as_array()) {
                for call in calls {
                    let name = call.get("name").and_then(|s| s.as_str()).unwrap_or("tool");
                    let summary = call.get("toolSummary")
                        .or_else(|| call.get("args").and_then(|a| a.get("toolSummary")))
                        .and_then(|s| s.as_str())
                        .map(clean_tool_summary);

                    tasks.push(TaskItem {
                        step_index: step_idx,
                        task_type: "tool".to_string(),
                        title: format!("⚡ {}", name),
                        detail: summary,
                        status: status.clone(),
                        timestamp: ts.clone(),
                    });
                }
            } else if let Some(mtype) = val.get("type").and_then(|t| t.as_str()) {
                if mtype == "USER_INPUT" {
                    let content = val.get("content").and_then(|s| s.as_str()).unwrap_or("");
                    let clean_content = content
                        .replace("<USER_REQUEST>", "")
                        .replace("</USER_REQUEST>", "")
                        .split("<ADDITIONAL_METADATA>")
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();

                    tasks.push(TaskItem {
                        step_index: step_idx,
                        task_type: "user".to_string(),
                        title: "👤 Mensaje del usuario".to_string(),
                        detail: Some(clean_content),
                        status: "done".to_string(),
                        timestamp: ts,
                    });
                }
            }
        }
    }

    // Keep the most recent 12 tasks
    if tasks.len() > 12 {
        tasks = tasks.split_off(tasks.len() - 12);
    }
    tasks.reverse();

    SessionSummary {
        session_id: session_id.to_string(),
        model: model_name,
        total_input_tokens: total_in,
        total_output_tokens: total_out,
        total_cache_tokens: total_cache,
        recent_tasks: tasks,
    }
}

/// Reads new lines appended to the transcript starting from `offset`.
fn read_new_lines_from_transcript(
    path: &Path,
    offset: u64,
) -> (Vec<AntigravityState>, u64) {
    let mut states = Vec::new();
    let Ok(file) = File::open(path) else {
        return (states, offset);
    };

    let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut current_offset = if file_len < offset {
        // File was truncated or rotated
        0
    } else {
        offset
    };

    let mut reader = BufReader::new(file);
    if reader.seek(SeekFrom::Start(current_offset)).is_err() {
        return (states, current_offset);
    }

    let mut line = String::new();
    while let Ok(bytes) = reader.read_line(&mut line) {
        if bytes == 0 {
            break;
        }
        current_offset += bytes as u64;
        if let Some(state) = parse_transcript_line(&line) {
            states.push(state);
        }
        line.clear();
    }

    (states, current_offset)
}

/// Handle to control and terminate the background Antigravity watcher thread.
pub struct WatcherHandle {
    stop_flag: Arc<AtomicBool>,
    thread_handle: Option<std::thread::JoinHandle<()>>,
}

impl WatcherHandle {
    /// Signals the background observer thread to stop.
    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }

    /// Stops the watcher and waits for its thread to finish.
    pub fn join(mut self) -> std::thread::Result<()> {
        self.stop();
        if let Some(handle) = self.thread_handle.take() {
            handle.join()
        } else {
            Ok(())
        }
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Spawns a background thread watching Antigravity presence and live transcripts.
///
/// Emits state transitions into the provided `Sender<AntigravityState>`.
pub fn watch_antigravity_events(
    config: WatcherConfig,
    sender: Sender<AntigravityState>,
) -> WatcherHandle {
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = Arc::clone(&stop_flag);

    let thread_handle = std::thread::spawn(move || {
        let presence_dir = resolve_path(&config.presence_dir);
        let brain_dir = resolve_path(&config.brain_dir);
        let poll_interval = Duration::from_millis(config.poll_interval_ms.max(20));

        let mut current_session: Option<String> = None;
        let mut last_offset: u64 = 0;
        let mut last_state: Option<AntigravityState> = None;
        let mut is_first_scan_for_session = true;

        // Try setting up filesystem watcher for immediate event wakeups
        let (tx_notify, rx_notify) = crossbeam_channel::unbounded();
        let mut _watcher: Option<RecommendedWatcher> = {
            let tx = tx_notify.clone();
            RecommendedWatcher::new(
                move |res: notify::Result<Event>| {
                    let _ = tx.send(res);
                },
                Config::default(),
            )
            .ok()
        };

        if let Some(ref mut watcher) = _watcher {
            if presence_dir.exists() {
                let _ = watcher.watch(&presence_dir, RecursiveMode::NonRecursive);
            }
            if brain_dir.exists() {
                let _ = watcher.watch(&brain_dir, RecursiveMode::Recursive);
            }
        }

        while !stop_flag_clone.load(Ordering::SeqCst) && config.enabled {
            let active_session = find_active_session_with_brain(&presence_dir, &brain_dir);

            if active_session != current_session {
                current_session = active_session.clone();
                last_offset = 0;
                is_first_scan_for_session = true;

                if current_session.is_none() {
                    let new_state = AntigravityState::Idle;
                    if last_state.as_ref() != Some(&new_state) {
                        last_state = Some(new_state.clone());
                        if sender.send(new_state).is_err() {
                            break;
                        }
                    }
                }
            }

            if let Some(ref session_id) = current_session {
                let transcript_path = get_transcript_path(&brain_dir, session_id);
                if transcript_path.exists() {
                    let (states, new_offset) =
                        read_new_lines_from_transcript(&transcript_path, last_offset);
                    last_offset = new_offset;

                    if is_first_scan_for_session {
                        is_first_scan_for_session = false;
                        if let Some(latest) = states.last() {
                            if last_state.as_ref() != Some(latest) {
                                last_state = Some(latest.clone());
                                if sender.send(latest.clone()).is_err() {
                                    break;
                                }
                            }
                        }
                    } else {
                        for state in states {
                            if last_state.as_ref() != Some(&state) {
                                last_state = Some(state.clone());
                                if sender.send(state).is_err() {
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            // Sleep or wait for notify filesystem event with timeout
            let _ = rx_notify.recv_timeout(poll_interval);
        }
    });

    WatcherHandle {
        stop_flag,
        thread_handle: Some(thread_handle),
    }
}
