"""
Brain Router & Intent Classification for Sli Desktop Companion.
Routes prompts between system commands, screen management, and AI models (Antigravity CLI / Claude).
"""

import json
import os
import re
from typing import Any, Dict, Optional


def classify_intent(prompt: str) -> str:
    """
    Classify the intent of a user prompt into:
    - 'system_command': OS actions like opening applications, terminal, running commands.
    - 'screen_management': Multi-monitor/Hyprland actions like switching monitors, workspaces.
    - 'ai_chat': General conversational queries, coding, reasoning, explanations.
    """
    if not prompt or not prompt.strip():
        return "ai_chat"

    # Remove provider prefixes if present for classification
    clean = re.sub(
        r"^(claude|anthropic|antigravity|agy|gemini):\s*",
        "",
        prompt.strip(),
        flags=re.IGNORECASE,
    ).strip().lower()

    if not clean:
        return "ai_chat"

    # 1. Screen / Multi-monitor management patterns
    screen_keywords = [
        "pantalla",
        "monitor",
        "display",
        "screen",
        "workspace",
        "área de trabajo",
        "area de trabajo",
        "escritorio",
    ]
    screen_verbs = [
        "cambia",
        "cambiar",
        "switch",
        "mueve",
        "mover",
        "move",
        "enfoca",
        "enfocar",
        "focus",
        "pasa",
        "pasar",
        "ir a",
        "goto",
    ]
    screen_modifiers = [
        "otra",
        "otro",
        "siguiente",
        "next",
        "anterior",
        "prev",
        "previous",
        "segunda",
        "segundo",
        "second",
        "primera",
        "primer",
        "first",
        "izquierda",
        "derecha",
        "left",
        "right",
        "hdmi",
        "dp-",
        "edp-",
    ]

    has_screen_keyword = any(k in clean for k in screen_keywords)
    has_screen_verb = any(v in clean for v in screen_verbs)
    has_screen_mod = any(m in clean for m in screen_modifiers)

    if (has_screen_keyword and (has_screen_verb or has_screen_mod)) or (
        has_screen_verb and has_screen_mod
    ):
        return "screen_management"

    # 2. System command patterns
    # Starts with open/launch/run/close/start/kill
    sys_verb_pattern = (
        r"^(abre|abrir|open|lanza|lanzar|launch|ejecuta|ejecutar|run|"
        r"inicia|iniciar|start|cierra|cerrar|close|mata|matar|kill|"
        r"reinicia|reboot|apaga|poweroff)\b"
    )
    if re.search(sys_verb_pattern, clean):
        # Disallow things that are clearly conversational or screen actions
        if not has_screen_keyword:
            return "system_command"

    # Specific system command targets
    common_apps = [
        "terminal",
        "navegador",
        "browser",
        "consola",
        "alacritty",
        "kitty",
        "foot",
        "xterm",
        "google-chrome",
        "chrome",
        "firefox",
        "code",
        "editor",
    ]
    if any(f" {app}" in clean or clean.endswith(f" {app}") or clean == app for app in common_apps):
        if any(v in clean for v in ["abre", "open", "lanza", "launch", "ejecuta", "run", "cierra", "close"]):
            return "system_command"

    # 3. Default to AI chat for questions, discussions, reasoning
    return "ai_chat"


class RouterResponse:
    """Structured response container supporting attribute and dict access."""

    def __init__(
        self,
        provider: str,
        intent: str,
        prompt: str,
        content: str = "",
        action: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.provider = provider
        self.intent = intent
        self.prompt = prompt
        self.content = content
        self.action = action or {}
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "intent": self.intent,
            "prompt": self.prompt,
            "content": self.content,
            "action": self.action,
            "metadata": self.metadata,
        }

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    def __repr__(self) -> str:
        return (
            f"RouterResponse(provider={self.provider!r}, intent={self.intent!r}, "
            f"prompt={self.prompt!r})"
        )


class ModelRouter:
    """
    Multi-model router for Sli Desktop Companion.
    Routes between:
    - 'antigravity': Primary agent executor (Antigravity CLI / agy).
    - 'claude': Secondary conversational / reasoning LLM (Anthropic Claude).
    """

    def __init__(
        self,
        default_provider: str = "antigravity",
        config: Optional[Dict[str, Any]] = None,
    ):
        self.default_provider = default_provider
        self.config = config or self._load_config()

        # Update default provider if specified in config
        if self.config.get("providers", {}).get("default"):
            self.default_provider = self.config["providers"]["default"]

    def _load_config(self) -> Dict[str, Any]:
        config_path = os.path.expanduser("~/.config/sli/config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def get_provider_for_prompt(self, prompt: str) -> str:
        """Determines provider by checking explicit prefixes or config fallback."""
        trimmed = prompt.strip().lower()
        if trimmed.startswith("claude:") or trimmed.startswith("anthropic:"):
            return "claude"
        if trimmed.startswith("antigravity:") or trimmed.startswith("agy:") or trimmed.startswith("gemini:"):
            return "antigravity"
        return self.default_provider

    def clean_prompt(self, prompt: str) -> str:
        """Strips provider prefix from user prompt."""
        return re.sub(
            r"^(claude|anthropic|antigravity|agy|gemini):\s*",
            "",
            prompt.strip(),
            flags=re.IGNORECASE,
        ).strip()

    def route(self, prompt: str) -> RouterResponse:
        """
        Routes the user prompt to the correct provider and classifies intent.
        Produces a RouterResponse with intent and routing metadata.
        """
        provider = self.get_provider_for_prompt(prompt)
        cleaned = self.clean_prompt(prompt)
        intent = classify_intent(prompt)

        action = {}
        if intent == "system_command":
            action = {"type": "spawn_process", "target": cleaned}
        elif intent == "screen_management":
            action = {"type": "hyprland_dispatch", "target": cleaned}
        else:
            action = {"type": "ai_query", "provider": provider}

        return RouterResponse(
            provider=provider,
            intent=intent,
            prompt=cleaned,
            content="",
            action=action,
            metadata={"raw_prompt": prompt, "default_provider": self.default_provider},
        )
