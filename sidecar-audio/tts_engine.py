"""
Local Text-to-Speech (TTS) Engine for Sli Desktop Companion.
Supports Piper TTS / Kokoro models with fallback procedural sweet harmonic synthesis.
Generates real-time audio amplitude envelopes for slime mouth sync and body jiggle.
"""

import io
import math
import os
import shutil
import struct
import wave
from typing import Any, Dict, List, Optional, Tuple


class TTSEngine:
    """
    Local Text-to-Speech engine for Sli.
    Produces 16-bit PCM mono WAV bytes and normalized amplitude envelopes.
    """

    def __init__(
        self,
        voice_model: Optional[str] = None,
        sample_rate: int = 22050,
        piper_path: Optional[str] = None,
    ):
        self.sample_rate = sample_rate
        self.piper_path = piper_path or self._find_piper_binary()
        self.voice_model = self._find_voice_model(voice_model)

    def _find_piper_binary(self) -> Optional[str]:
        """Check if piper binary is installed on PATH or local models dir."""
        local_piper = os.path.expanduser("~/.local/share/sli/piper/piper/piper")
        if os.path.exists(local_piper):
            return local_piper

        for name in ["piper", "piper-tts"]:
            path = shutil.which(name)
            if path and os.path.exists(path):
                return path
        return None

    def _find_voice_model(self, preferred: Optional[str]) -> str:
        """Finds high-quality local Piper ONNX voice model."""
        if preferred and os.path.exists(preferred):
            return preferred

        candidates = [
            os.path.expanduser("~/.local/share/sli/piper/es_MX-claude-high.onnx"),
            os.path.expanduser("~/.local/share/sli/piper/es_MX-ald-medium.onnx"),
            os.path.expanduser("~/.local/share/sli/piper/es_ES-dalia-medium.onnx"),
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return preferred or "es_MX-claude-high"

    def play(self, wav_bytes: bytes) -> bool:
        """Plays standard WAV audio bytes through system PipeWire/PulseAudio."""
        import subprocess
        import tempfile

        players = ["pw-play", "paplay", "aplay"]
        player_bin = None
        for p in players:
            found = shutil.which(p)
            if found:
                player_bin = found
                break

        if not player_bin:
            return False

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                tf.write(wav_bytes)
                tmp_path = tf.name

            subprocess.Popen(
                [player_bin, tmp_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except Exception:
            return False

    def synthesize(self, text: str) -> bytes:
        """
        Synthesizes text into standard 16-bit PCM WAV audio bytes.
        Uses Piper TTS if available; otherwise generates sweet procedural slime voice.
        """
        text = text.strip() if text else ""
        if not text:
            # Short gentle blip for empty input
            return self._generate_sweet_tone(
                freqs=[440.0], duration_per_tone=0.08, volume=0.3
            )

        # Check if Piper binary is available and model exists
        if self.piper_path and os.path.exists(self.piper_path):
            try:
                wav = self._synthesize_piper(text)
                if wav and len(wav) > 44:
                    return wav
            except Exception:
                pass

        # Fallback: Sweet expressive slime procedural speech
        return self._generate_slime_speech(text)

    def _synthesize_piper(self, text: str) -> bytes:
        """Synthesize using piper CLI if present."""
        import subprocess

        cmd = [self.piper_path, "--output-raw"]
        if self.voice_model:
            cmd.extend(["--model", self.voice_model])

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        raw_pcm, _ = proc.communicate(input=text.encode("utf-8"))

        # Wrap raw PCM into WAV
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(raw_pcm)
        return out.getvalue()

    def _generate_slime_speech(self, text: str) -> bytes:
        """
        Generates sweet, melodic harmonic tones emulating a friendly desktop slime.
        Uses formant-like multi-harmonic synthesis with pitch contours mapped to vowels/punctuation.
        """
        words = text.split()
        if not words:
            return self._generate_sweet_tone([392.0, 523.25], 0.1, 0.4)

        all_samples: List[int] = []

        # Base fundamental pitch range around F4-A4 (340 - 450 Hz)
        base_f0 = 360.0

        for w_idx, word in enumerate(words):
            clean_word = word.lower().strip()
            if not clean_word:
                continue

            # Check question mark or exclamation for pitch contour
            is_question = word.endswith("?")
            is_exclamation = word.endswith("!")
            is_comma = word.endswith(",")

            # Number of syllable phonemes roughly proportional to vowels or length
            syllables = max(1, len([c for c in clean_word if c in "aeiouáéíóúy"]))
            syllable_duration = 0.075 + (0.015 * min(syllables, 4))

            for s in range(syllables):
                progress = s / max(1, syllables)
                # Pitch inflection
                pitch_offset = (s * 25.0) if is_question else (-s * 15.0 if not is_exclamation else 30.0)
                word_pitch = base_f0 + (math.sin(w_idx * 1.3) * 35.0) + pitch_offset

                samples = self._render_syllable(
                    f0=word_pitch,
                    duration=syllable_duration,
                    volume=0.45,
                )
                all_samples.extend(samples)

            # Brief inter-word pause
            pause_samples = int(self.sample_rate * (0.08 if is_comma else 0.035))
            all_samples.extend([0] * pause_samples)

        # Build WAV file
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            raw_bytes = struct.pack(f"<{len(all_samples)}h", *all_samples)
            wf.writeframes(raw_bytes)

        return out.getvalue()

    def _render_syllable(
        self, f0: float, duration: float, volume: float = 0.4
    ) -> List[int]:
        """Renders one syllable with attack-sustain-release envelope and harmonic overtones."""
        num_samples = int(self.sample_rate * duration)
        samples = []
        max_amplitude = 32767 * volume

        attack_samples = int(num_samples * 0.20)
        release_samples = int(num_samples * 0.35)

        for i in range(num_samples):
            # ADSR envelope
            if i < attack_samples:
                env = i / attack_samples
            elif i > num_samples - release_samples:
                env = (num_samples - i) / release_samples
            else:
                env = 1.0

            # Gentle vibrato
            t = i / self.sample_rate
            vibrato = 1.0 + 0.015 * math.sin(2.0 * math.pi * 5.5 * t)
            freq = f0 * vibrato

            # Harmonic overtone synthesis (F0 + 2*F0 + 3*F0)
            phase = 2.0 * math.pi * freq * t
            wave_val = (
                0.65 * math.sin(phase)
                + 0.25 * math.sin(2.0 * phase)
                + 0.10 * math.sin(3.0 * phase)
            )

            sample_int = int(wave_val * env * max_amplitude)
            # Clamp to 16-bit range
            sample_int = max(-32768, min(32767, sample_int))
            samples.append(sample_int)

        return samples

    def _generate_sweet_tone(
        self, freqs: List[float], duration_per_tone: float, volume: float = 0.4
    ) -> bytes:
        """Helper to generate a clean sequence of sweet tones."""
        all_samples = []
        for freq in freqs:
            all_samples.extend(self._render_syllable(freq, duration_per_tone, volume))

        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            raw_bytes = struct.pack(f"<{len(all_samples)}h", *all_samples)
            wf.writeframes(raw_bytes)
        return out.getvalue()

    def get_amplitude_envelope(
        self, wav_bytes: bytes, num_frames: int = 24
    ) -> List[float]:
        """
        Parses 16-bit PCM WAV bytes and computes a normalized RMS amplitude envelope [0.0 - 1.0].
        Supplies values for mouth opening and body squish in the frontend canvas.
        """
        if not wav_bytes or len(wav_bytes) <= 44:
            return [0.0] * num_frames

        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
                n_frames = wf.getnframes()
                if n_frames == 0:
                    return [0.0] * num_frames

                frames_data = wf.readframes(n_frames)
                sample_count = len(frames_data) // 2
                if sample_count == 0:
                    return [0.0] * num_frames

                fmt = f"<{sample_count}h"
                samples = struct.unpack(fmt, frames_data[: sample_count * 2])

                chunk_size = max(1, sample_count // num_frames)
                envelope = []

                for k in range(num_frames):
                    start = k * chunk_size
                    end = min(sample_count, start + chunk_size)
                    chunk = samples[start:end]
                    if not chunk:
                        envelope.append(0.0)
                        continue

                    # Root Mean Square (RMS) calculation
                    sum_sq = sum(s * s for s in chunk)
                    rms = math.sqrt(sum_sq / len(chunk))
                    normalized = min(1.0, rms / 16384.0)
                    envelope.append(round(normalized, 3))

                return envelope
        except Exception:
            return [0.0] * num_frames

    def synthesize_with_visemes(self, text: str) -> Dict[str, Any]:
        """Synthesize audio and generate synchronized visual amplitude envelope."""
        wav = self.synthesize(text)
        envelope = self.get_amplitude_envelope(wav)
        duration_sec = 0.0
        try:
            with wave.open(io.BytesIO(wav), "rb") as wf:
                duration_sec = round(wf.getnframes() / float(wf.getframerate()), 3)
        except Exception:
            pass

        return {
            "wav_bytes": wav,
            "amplitudes": envelope,
            "duration": duration_sec,
            "sample_rate": self.sample_rate,
        }
