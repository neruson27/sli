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
     - `NEEDS_INPUT`: Salto de alerta en tono ámbar y suave aviso visual.

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

## ⚡ Inicio Rápido (Quickstart)

### 1. Iniciar la Aplicación de Escritorio Sli
Inicia la aplicación completa en Tauri v2 con ventana transparente, atajos globales y soporte IPC:
```bash
cargo tauri dev
# o alternativamente:
npm run dev
```

### 2. Iniciar el Sidecar de Audio y Enrutador Multimodelo
Ejecuta el servidor de voz en Python:
```bash
# Modo estándar IPC por stdio (utilizado automáticamente por Tauri)
python sidecar-audio/server.py

# O modo servidor HTTP independiente para pruebas locales (puerto 5174)
python sidecar-audio/server.py --http --port 5174
```

### 3. Vista Previa de la Interfaz Web Independiente
Previsualiza y ajusta la física de resortes del slime en cualquier navegador web:
```bash
npm run dev:ui
```

---

## 📖 Guía de Uso

### Interactuando con Sli
- **Arrastrar**: Haz clic izquierdo y arrastra a Sli libremente a través de cualquiera de tus monitores. Al soltarlo, conservará la inercia y rebotará en los límites de la pantalla.
- **Tocar / Afecto**: Haz clic sobre Sli para provocar una adorable deformación elástica y una expresión cariñosa.
- **Modo Anclado / Barra (`Super + D`)**: Alterna entre mascota libre flotante y una píldora compacta anclada en el borde superior.

### Compañero de Antigravity CLI
Cuando ejecutas agentes de Antigravity (`agy` o `gemini-cli`), Sli detecta automáticamente la sesión activa:
- **`IDLE`**: Respiración suave y ojos relajados.
- **`THINKING`**: El agente está planificando o analizando tareas; Sli emite un brillo cian suave con mirada concentrada.
- **`EXECUTING_TOOL`**: El agente ejecuta comandos o herramientas (`run_command`, `edit_file`, etc.); Sli despliega una píldora indicando la herramienta en curso.
- **`NEEDS_INPUT`**: El agente requiere confirmación o respuesta del usuario; Sli realiza un salto de alerta con tono ámbar sin robar el foco del teclado.

### Control por Voz (Push-To-Talk)
1. Mantén presionado **`Super + S`** (o pulsa el icono de micrófono / haz clic en Sli).
2. Di tu comando en español o inglés:
   - *"Corre los tests del proyecto"* -> Se enruta a ejecución de comandos de Antigravity CLI.
   - *"Explícame cómo funciona la física de resortes"* -> Se enruta al modelo Claude para razonamiento y charla.
   - *"Cambia a la pantalla 2"* -> Se despacha mediante IPC de Hyprland para enfocar el monitor 2.
3. Suelta `Super + S` para sintetizar la respuesta localmente con Piper TTS mientras Sli sincroniza sus labios.

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

Para que la ventana flotante mantenga su transparencia, ausencia de bordes, fijación y tamaño óptimo en Hyprland, añade las siguientes reglas a tu `hyprland.conf`:

```ini
# Reglas de ventana para Sli en Hyprland
windowrulev2 = float, class:(sli)
windowrulev2 = pin, class:(sli)
windowrulev2 = noborder, class:(sli)
windowrulev2 = noblur, class:(sli)
windowrulev2 = nodim, class:(sli)
windowrulev2 = noshadow, class:(sli)
windowrulev2 = size 180 180, class:(sli)
```

### Atajos Globales en Hyprland
Para activar Push-to-Talk y cambiar de modo de acoplamiento incluso cuando otra aplicación tenga el foco:

```ini
# Pasar atajos de teclado directamente a la ventana de Sli
bind = SUPER, S, pass, ^(sli)$
bind = SUPER, D, pass, ^(sli)$
```

---

## 🧪 Pruebas (Testing)

Sli cuenta con suites de pruebas automatizadas que cubren la física del frontend, el núcleo en Rust y el motor de audio en Python:

### Ejecutar Todas las Pruebas
```bash
npm test && cargo test --manifest-path src-tauri/Cargo.toml && python -m unittest sidecar-audio/test_router.py
```

### Ejecutar Suites Individuales
- **Frontend y Física del Slime (Node.js)**:
  ```bash
  npm test
  ```
- **Núcleo Rust Tauri y Observadores (Cargo)**:
  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml
  ```
- **Sidecar de Voz y Enrutador Multimodelo (Python)**:
  ```bash
  python -m unittest sidecar-audio/test_router.py
  # o con pytest:
  python -m pytest sidecar-audio/
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
