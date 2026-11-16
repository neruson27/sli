# Sli - Compañero de Escritorio

> **Un compañero de escritorio inteligente y fluido en forma de slime blanco para Antigravity CLI, gestión multimonitor y control por voz local.**

[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-blue.svg)](LICENSE)
[![Plataforma](https://img.shields.io/badge/Plataforma-Linux%20(Hyprland%2FWayland)%20%7C%20macOS%20%7C%20Windows-green.svg)]()
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app)

*Lee este documento en [English (Inglés)](README.md).*

---

## 🌟 Visión General

**Sli** es una mascota de escritorio interactiva en forma de tierno slime blanco que vive directamente sobre tu pantalla. Renderizado con física elástica de cuerpos blandos (spring-mass / Verlet) en una ventana flotante y transparente, Sli reacciona a tu cursor, rebota en los bordes de tus monitores y puede acoplarse suavemente a tu barra superior (Waybar/Hyprland en Linux, Menu Bar en macOS, Barra de Tareas en Windows).

Además de ser un adorable compañero visual, Sli actúa como **puente interactivo para el sistema de agentes de Antigravity CLI (`agy` / `gemini-cli`)**, observando en tiempo real las operaciones en segundo plano, mostrando estados de pensamiento y llamadas a herramientas, alertando suavemente cuando el agente requiere confirmación o entrada del usuario, y respondiendo a comandos de voz 100% locales en español e inglés.

---

## 🏗️ Arquitectura

```
┌────────────────────────────────────────────────────────┐
│                   sli (App Tauri v2)                   │
├────────────────────────────┬───────────────────────────┤
│ Frontend (Webview / Canvas)│ Núcleo Backend (Rust)     │
│ • Física 2D de Slime Jelly │ • Ventana Transparente    │
│ • Ojos y Expresiones       │ • Estado de Ventana/Dock  │
│ • Bocadillo / HUD          │ • Push-To-Talk Global     │
│ • Medidor de Tokens        │ • Bus de Eventos IPC      │
└─────────────┬──────────────┴─────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ Motor de Audio (Local)   │  │ Control de SO & Watchers │
│ • Faster-Whisper (STT)   │  │ • Lector Logs Antigravity│
│ • Piper/Kokoro (TTS)     │  │ • Dispatcher Hyprctl IPC │
│ • Enrutador Dual CLI/Clau│  │ • Lanzador de Procesos   │
└──────────────────────────┘  └──────────────────────────┘
```

### Componentes Clave

1. **Núcleo Tauri v2 (Rust)**:
   - Consumo mínimo de recursos (~40–70 MB de memoria RAM en reposo).
   - Control de ventana transparente sin bordes, siempre visible (*always-on-top*) y gestión de clics pasantes (*click-through*).
   - Comunicación de baja latencia mediante IPC entre frontend, sistema operativo y motor de voz.

2. **Física del Slime y Frontend (Canvas 2D)**:
   - Simulación física de masa y resorte (*spring-mass*) con integración de Verlet para simular la consistencia gelatinosa.
   - Animaciones reactivas: respiración en reposo, estiramiento por velocidad al arrastrar, deformación por colisión, sincronización labial con la amplitud fonética del habla y transformación en píldora al anclarse.

3. **Monitor de Antigravity CLI**:
   - Observa los archivos de bloqueo activos en `~/.gemini/antigravity-cli/presence/*.lock`.
   - Lee en tiempo real el registro de la conversación en `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
   - Transiciones de estado visuales automáticas:
     - `IDLE`: Respiración tranquila habitual.
     - `THINKING`: Aura cian con mirada concentrada.
     - `EXECUTING_TOOL`: Píldora de estado con el nombre de la herramienta activa (ej. `run_command`, `edit_file`).
     - `NEEDS_INPUT`: Salto de alerta en tono ámbar y suave sonido de aviso opcional.

4. **Motor de Voz Local y Privado (100% Offline)**:
   - **STT (Reconocimiento de voz)**: `faster-whisper` (modelos base/small con cuantización INT8) para transcripción local instantánea.
   - **TTS (Síntesis de voz)**: `piper-tts` / `kokoro-onnx` configurado con perfil de voz dulce, suave y natural.
   - **Privacidad Total**: El micrófono permanece completamente apagado durante el reposo. Se activa únicamente mediante la tecla Push-To-Talk (`Super + S`) o al hacer clic sobre el slime.

5. **Enrutador Cerebral Multimodelo**:
   - **Principal**: Comandos para Antigravity CLI (`agy`) para programar, editar archivos y ejecutar herramientas de desarrollo.
   - **Secundario**: API de Anthropic Claude para charlas informales, lluvia de ideas y consultas analíticas.

6. **Gestión de Pantallas y Escritorio (Hyprland)**:
   - Integración nativa con IPC de Hyprland (`hyprctl`) para cambiar monitores activos, mover espacios de trabajo y enfocar ventanas.
   - Soporte para macOS y Windows mediante APIs de ventana nativas.

---

## 🚀 Requisitos e Instalación

### Requisitos Previos

- **Rust**: 1.77+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Node.js / Bun**: Bun 1.1+ o Node.js 20+
- **Python**: 3.10+ (para el sidecar de audio)
- **Paquetes del Sistema en Linux** (Arch/CachyOS):
  ```bash
  sudo pacman -S webkit2gtk-4.1 base-devel openssl libayatana-appindicator
  ```

### Clonar y Configurar

```bash
git clone https://github.com/neruson27/sli.git
cd sli
cp config.example.json ~/.config/sli/config.json
```

---

## ⚙️ Configuración

Sli carga su configuración desde `~/.config/sli/config.json` (puedes tomar como referencia `config.example.json`):

```json
{
  "antigravity": {
    "enabled": true,
    "presence_dir": "~/.gemini/antigravity-cli/presence",
    "brain_dir": "~/.gemini/antigravity-cli/brain",
    "poll_interval_ms": 350
  },
  "voice": {
    "enabled": true,
    "stt_model": "base",
    "language": "es",
    "tts_voice": "es_ES-dalia-medium",
    "push_to_talk_key": "Super+S"
  },
  "hotkeys": {
    "push_to_talk": "Super+S",
    "toggle_dock": "Super+D"
  },
  "providers": {
    "default": "antigravity",
    "anthropic_api_key": "",
    "gemini_api_key": ""
  },
  "window": {
    "always_on_top": true,
    "transparent": true,
    "width": 180,
    "height": 180,
    "dock_position": "top-right"
  }
}
```

---

## 🪟 Integración con Hyprland

Para que la ventana flotante mantenga su transparencia, ausencia de bordes y no interfiera con tu flujo de trabajo, agrega estas reglas a tu `hyprland.conf`:

```ini
# Reglas de ventana para Sli en Hyprland
windowrulev2 = float, class:(sli)
windowrulev2 = pin, class:(sli)
windowrulev2 = noborder, class:(sli)
windowrulev2 = noblur, class:(sli)
windowrulev2 = nodim, class:(sli)
windowrulev2 = noshadow, class:(sli)
```

---

## 🎮 Desarrollo y Pruebas

Para ejecutar las pruebas y los entornos de desarrollo:

```bash
# Ejecutar suite de pruebas unitarias
npm test

# Iniciar servidor UI en modo desarrollo independiente
npm run dev:ui

# Iniciar aplicación completa de Tauri
npm run dev
```

---

## ⌨️ Atajos de Teclado por Defecto

| Atajo | Acción |
|-------|--------|
| `Super + S` | Push-to-Talk (Mantén pulsado o presiona para hablar) |
| `Super + D` | Alternar Acoplamiento (cambia entre mascota flotante y píldora en barra) |
| Clic Izquierdo y Arrastrar | Desplazar libremente a Sli por tus pantallas |
| Clic en Sli | Despertar / Muestra de afecto / Activar micrófono |

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
