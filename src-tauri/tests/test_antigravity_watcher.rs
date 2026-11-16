#[cfg(test)]
mod tests {
    use std::fs::{self, File};
    use std::io::Write;
    use std::time::Duration;
    use tempfile::tempdir;
    use sli_lib::antigravity_watcher::{
        find_active_session, get_transcript_path, parse_transcript_line,
        watch_antigravity_events, AntigravityState, WatcherConfig,
    };

    #[test]
    fn test_parse_tool_execution() {
        let json_line = r#"{"type":"PLANNER_RESPONSE","source":"MODEL","tool_calls":[{"toolSummary":"Execute bash script","CommandLine":"npm test"}]}"#;
        let state = parse_transcript_line(json_line).unwrap();
        assert_eq!(
            state,
            AntigravityState::ExecutingTool("Execute bash script".into())
        );
    }

    #[test]
    fn test_parse_needs_input() {
        let json_line = r#"{"type":"PLANNER_RESPONSE","status":"AWAITING_USER_INPUT","content":"Please confirm if I should proceed"}"#;
        let state = parse_transcript_line(json_line).unwrap();
        assert_eq!(
            state,
            AntigravityState::NeedsInput("Please confirm if I should proceed".into())
        );
    }

    #[test]
    fn test_parse_thinking_and_idle() {
        // User input triggers thinking
        let user_line = r#"{"type":"USER_INPUT","source":"USER_EXPLICIT","status":"DONE","content":"hello"}"#;
        assert_eq!(
            parse_transcript_line(user_line).unwrap(),
            AntigravityState::Thinking
        );

        // Planner response in progress triggers thinking
        let thinking_line = r#"{"type":"PLANNER_RESPONSE","source":"MODEL","status":"IN_PROGRESS","thinking":"Analyzing the request"}"#;
        assert_eq!(
            parse_transcript_line(thinking_line).unwrap(),
            AntigravityState::Thinking
        );

        // Done planner response with message triggers idle
        let done_line = r#"{"type":"PLANNER_RESPONSE","source":"MODEL","status":"DONE","content":"Done executing task."}"#;
        assert_eq!(
            parse_transcript_line(done_line).unwrap(),
            AntigravityState::Idle
        );

        // Empty or invalid lines return None
        assert_eq!(parse_transcript_line(""), None);
        assert_eq!(parse_transcript_line("not-valid-json"), None);
    }

    #[test]
    fn test_session_detection_and_transcript_path() {
        let dir = tempdir().unwrap();
        let presence_dir = dir.path().join("presence");
        let brain_dir = dir.path().join("brain");
        fs::create_dir_all(&presence_dir).unwrap();
        fs::create_dir_all(&brain_dir).unwrap();

        // No session initially
        assert_eq!(find_active_session(&presence_dir), None);

        // Create older session lock
        let old_lock = presence_dir.join("old-session-123.lock");
        File::create(&old_lock).unwrap();

        std::thread::sleep(Duration::from_millis(50));

        // Create newer session lock
        let new_lock = presence_dir.join("new-session-456.lock");
        File::create(&new_lock).unwrap();

        let active = find_active_session(&presence_dir).expect("should find active session");
        assert_eq!(active, "new-session-456");

        let transcript_path = get_transcript_path(&brain_dir, &active);
        let expected_path = brain_dir
            .join("new-session-456")
            .join(".system_generated/logs/transcript.jsonl");
        assert_eq!(transcript_path, expected_path);
    }

    #[test]
    fn test_realtime_watcher_stream() {
        let dir = tempdir().unwrap();
        let presence_dir = dir.path().join("presence");
        let brain_dir = dir.path().join("brain");
        let session_id = "test-session-stream";

        fs::create_dir_all(&presence_dir).unwrap();
        let transcript_dir = brain_dir.join(session_id).join(".system_generated/logs");
        fs::create_dir_all(&transcript_dir).unwrap();

        let transcript_path = transcript_dir.join("transcript.jsonl");
        let mut transcript_file = File::create(&transcript_path).unwrap();

        // Create lock file to mark active session
        let lock_path = presence_dir.join(format!("{}.lock", session_id));
        File::create(&lock_path).unwrap();

        let config = WatcherConfig {
            enabled: true,
            presence_dir: presence_dir.clone(),
            brain_dir: brain_dir.clone(),
            poll_interval_ms: 50,
        };

        let (tx, rx) = crossbeam_channel::unbounded();
        let handle = watch_antigravity_events(config, tx);

        // Append tool execution event
        let tool_line = r#"{"type":"PLANNER_RESPONSE","source":"MODEL","tool_calls":[{"toolSummary":"Running cargo test"}]}"#;
        writeln!(transcript_file, "{}", tool_line).unwrap();
        transcript_file.flush().unwrap();

        let state1 = rx
            .recv_timeout(Duration::from_millis(1500))
            .expect("should receive ExecutingTool event");
        assert_eq!(
            state1,
            AntigravityState::ExecutingTool("Running cargo test".into())
        );

        // Append needs input event
        let input_line = r#"{"type":"PLANNER_RESPONSE","status":"AWAITING_USER_INPUT","content":"Should I overwrite?"}"#;
        writeln!(transcript_file, "{}", input_line).unwrap();
        transcript_file.flush().unwrap();

        let state2 = rx
            .recv_timeout(Duration::from_millis(1500))
            .expect("should receive NeedsInput event");
        assert_eq!(
            state2,
            AntigravityState::NeedsInput("Should I overwrite?".into())
        );

        // Drop receiver so watcher loop exits cleanly
        drop(rx);
        let _ = handle.join();
    }
}
