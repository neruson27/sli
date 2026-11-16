"""
Audio & Brain Router IPC Server for Sli Desktop Companion.
Provides standard I/O (stdio) JSON-lines IPC for Tauri child process sidecars
and an optional localhost HTTP microservice for local API testing.
"""

import argparse
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict

from router import ModelRouter, classify_intent
from stt_engine import STTEngine
from tts_engine import TTSEngine

# Global shared engine instances
router = ModelRouter()
tts = TTSEngine()
stt = STTEngine()


def process_command(req: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process an incoming IPC command dictionary and return response dictionary.
    Supports:
    - ping
    - classify: { "prompt": "..." }
    - route: { "prompt": "..." }
    - tts: { "text": "..." }
    - stt: { "audio_base64": "..." }
    - health
    """
    cmd = req.get("command") or req.get("action")
    req_id = req.get("id")

    res: Dict[str, Any] = {"status": "ok"}
    if req_id is not None:
        res["id"] = req_id

    try:
        if cmd == "ping":
            res["status"] = "ok"
            res["pong"] = True

        elif cmd == "classify":
            prompt = req.get("prompt", "")
            res["intent"] = classify_intent(prompt)

        elif cmd == "route":
            prompt = req.get("prompt", "")
            route_res = router.route(prompt)
            res.update(route_res.to_dict())

        elif cmd == "tts":
            text = req.get("text", "")
            result = tts.synthesize_with_visemes(text)
            wav_b64 = base64.b64encode(result["wav_bytes"]).decode("ascii")
            res["audio_base64"] = wav_b64
            res["amplitudes"] = result["amplitudes"]
            res["duration"] = result["duration"]
            res["sample_rate"] = result["sample_rate"]

        elif cmd == "stt":
            audio_b64 = req.get("audio_base64", "")
            if audio_b64:
                audio_bytes = base64.b64decode(audio_b64)
                transcription = stt.transcribe(audio_bytes)
            else:
                transcription = ""
            res["transcription"] = transcription

        elif cmd == "health":
            res["engines"] = {
                "router": True,
                "tts": True,
                "stt_available": stt.is_available(),
                "piper_available": tts.piper_path is not None,
            }

        else:
            res["status"] = "error"
            res["error"] = f"Unknown command: {cmd}"

    except Exception as e:
        res["status"] = "error"
        res["error"] = str(e)

    return res


def run_stdio_loop():
    """Reads JSON-line messages from stdin and writes responses to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = process_command(req)
        except json.JSONDecodeError as err:
            res = {"status": "error", "error": f"Invalid JSON: {err}"}
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


class AudioRequestHandler(BaseHTTPRequestHandler):
    """HTTP microservice handler for testing and local integration."""

    def _send_json(self, status_code: int, data: Dict[str, Any]):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ["/health", "/"]:
            res = process_command({"command": "health"})
            self._send_json(200, res)
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        endpoint = self.path.strip("/")
        if endpoint in ["classify", "route", "tts", "stt", "ping", "health"]:
            payload["command"] = endpoint
        res = process_command(payload)
        self._send_json(200, res)


def run_http_server(host: str = "127.0.0.1", port: int = 5174):
    server = HTTPServer((host, port), AudioRequestHandler)
    print(f"Sli Audio & Router Sidecar listening on http://{host}:{port}", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Sli Audio & Router Sidecar")
    parser.add_argument("--http", action="store_true", help="Run HTTP server instead of stdio")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP server host")
    parser.add_argument("--port", type=int, default=5174, help="HTTP server port")
    args = parser.parse_args()

    if args.http:
        run_http_server(args.host, args.port)
    else:
        run_stdio_loop()


if __name__ == "__main__":
    main()
