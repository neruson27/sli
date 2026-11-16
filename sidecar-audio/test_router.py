"""
Unit tests for Sli Local Voice Engine & Brain Router.
Compatible with both pytest and python -m unittest.
"""

import base64
import io
import os
import sys
import unittest
import wave

# Ensure sidecar-audio directory is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from router import ModelRouter, RouterResponse, classify_intent
from server import process_command
from stt_engine import STTEngine
from tts_engine import TTSEngine


class TestAudioSidecarAndRouter(unittest.TestCase):
    def test_classify_system_vs_chat(self):
        self.assertEqual(classify_intent("abre la terminal"), "system_command")
        self.assertEqual(classify_intent("cambia a la otra pantalla"), "screen_management")
        self.assertEqual(classify_intent("explícame cómo funciona un reactor nuclear"), "ai_chat")

    def test_router_provider_selection(self):
        router = ModelRouter(default_provider="antigravity")
        self.assertEqual(router.get_provider_for_prompt("hola"), "antigravity")
        self.assertEqual(router.get_provider_for_prompt("claude: analiza este texto"), "claude")

    def test_classify_english_and_edge_cases(self):
        self.assertEqual(classify_intent("open terminal"), "system_command")
        self.assertEqual(classify_intent("launch google-chrome"), "system_command")
        self.assertEqual(classify_intent("switch to HDMI-A-1 monitor"), "screen_management")
        self.assertEqual(classify_intent("move window to next screen"), "screen_management")
        self.assertEqual(classify_intent("what is the weather today?"), "ai_chat")
        self.assertEqual(classify_intent(""), "ai_chat")
        self.assertEqual(classify_intent("   "), "ai_chat")

    def test_model_router_route(self):
        router = ModelRouter(default_provider="antigravity")

        # Prefix routing to claude
        resp_claude = router.route("claude: resume este documento")
        self.assertEqual(resp_claude.provider, "claude")
        self.assertEqual(resp_claude.prompt, "resume este documento")
        self.assertEqual(resp_claude.intent, "ai_chat")
        self.assertEqual(resp_claude["provider"], "claude")
        self.assertEqual(resp_claude.to_dict()["provider"], "claude")

        # System command intent routing
        resp_sys = router.route("abre la terminal")
        self.assertEqual(resp_sys.intent, "system_command")
        self.assertEqual(resp_sys.action.get("type"), "spawn_process")

        # Screen management routing
        resp_screen = router.route("cambia a la otra pantalla")
        self.assertEqual(resp_screen.intent, "screen_management")
        self.assertEqual(resp_screen.action.get("type"), "hyprland_dispatch")

    def test_tts_engine_synthesize_wav(self):
        tts = TTSEngine(sample_rate=22050)
        wav_bytes = tts.synthesize("Hola, soy Sli, tu compañero de escritorio.")

        self.assertIsInstance(wav_bytes, bytes)
        self.assertGreater(len(wav_bytes), 44)
        self.assertEqual(wav_bytes[:4], b"RIFF")
        self.assertEqual(wav_bytes[8:12], b"WAVE")

        # Validate with standard wave module
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getsampwidth(), 2)
            self.assertEqual(wf.getframerate(), 22050)
            self.assertGreater(wf.getnframes(), 0)

    def test_tts_engine_amplitude_envelope(self):
        tts = TTSEngine(sample_rate=22050)
        result = tts.synthesize_with_visemes("Sli slime bouncy jelly!")

        self.assertIn("wav_bytes", result)
        self.assertIn("amplitudes", result)
        self.assertGreater(len(result["amplitudes"]), 0)
        self.assertTrue(all(0.0 <= amp <= 1.0 for amp in result["amplitudes"]))
        self.assertGreater(result["duration"], 0.0)

    def test_stt_engine_transcribe_and_recording(self):
        stt = STTEngine()
        self.assertIsInstance(stt.is_available(), bool)

        # Empty audio returns empty string
        self.assertEqual(stt.transcribe(b""), "")

        # Test fixture with mock tag
        test_wav = b"RIFF....WAVESLI_TEST_TRANSCRIPT:abre la consola\x00data..."
        self.assertEqual(stt.transcribe(test_wav), "abre la consola")

        # Recording cycle
        stt.start_recording()
        recorded_wav = stt.stop_recording()
        self.assertIsInstance(recorded_wav, bytes)
        self.assertGreaterEqual(len(recorded_wav), 44)
        self.assertEqual(recorded_wav[:4], b"RIFF")

    def test_server_process_command(self):
        # Ping
        res_ping = process_command({"command": "ping", "id": 1})
        self.assertEqual(res_ping["status"], "ok")
        self.assertEqual(res_ping["id"], 1)

        # Classify
        res_cls = process_command({"command": "classify", "prompt": "abre la terminal"})
        self.assertEqual(res_cls["status"], "ok")
        self.assertEqual(res_cls["intent"], "system_command")

        # Route
        res_route = process_command({"command": "route", "prompt": "claude: cómo estás?"})
        self.assertEqual(res_route["status"], "ok")
        self.assertEqual(res_route["provider"], "claude")
        self.assertEqual(res_route["intent"], "ai_chat")

        # TTS
        res_tts = process_command({"command": "tts", "text": "¡Hola mundo!"})
        self.assertEqual(res_tts["status"], "ok")
        self.assertIn("audio_base64", res_tts)
        decoded_audio = base64.b64decode(res_tts["audio_base64"])
        self.assertEqual(decoded_audio[:4], b"RIFF")
        self.assertGreater(len(res_tts["amplitudes"]), 0)

        # STT
        test_wav = b"RIFF....WAVESLI_TEST_TRANSCRIPT:cambia de monitor\x00data..."
        test_b64 = base64.b64encode(test_wav).decode("ascii")
        res_stt = process_command({"command": "stt", "audio_base64": test_b64})
        self.assertEqual(res_stt["status"], "ok")
        self.assertEqual(res_stt["transcription"], "cambia de monitor")

        # Health
        res_health = process_command({"command": "health"})
        self.assertEqual(res_health["status"], "ok")
        self.assertTrue(res_health["engines"]["router"])

        # Unknown command
        res_unknown = process_command({"command": "nonexistent_command"})
        self.assertEqual(res_unknown["status"], "error")


if __name__ == "__main__":
    unittest.main()
