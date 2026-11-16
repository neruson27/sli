/**
 * Sli - Frontend Application Controller
 * Handles Canvas rendering loop, mouse drag interactions, HUD bubble,
 * and Tauri IPC event listeners.
 */

import { SlimeEntity } from './slime_physics.js';

class SliApp {
  constructor() {
    this.canvas = document.getElementById('slime-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.hudBubble = document.getElementById('hud-bubble');
    this.hudBadge = document.getElementById('hud-badge');
    this.hudStatus = document.getElementById('hud-status');
    this.hudMessage = document.getElementById('hud-message');
    this.pttIndicator = document.getElementById('ptt-indicator');

    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth || 180;
    this.height = window.innerHeight || 180;

    this.slime = new SlimeEntity({
      x: this.width / 2,
      y: this.height / 2,
      radius: Math.min(this.width, this.height) * 0.28,
      vertices: 16
    });

    this.isDragging = false;
    this.lastMouse = { x: this.width / 2, y: this.height / 2 };
    this.hudTimeout = null;
    this.lastTime = performance.now();

    this.initCanvas();
    this.bindEvents();
    this.bindTauriIPC();
    this.bindKeyboardShortcuts();
    this.startLoop();
  }

  initCanvas() {
    if (!this.canvas) return;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth || 180;
    this.height = window.innerHeight || 180;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const cx = this.width / 2;
    const cy = this.height / 2;
    this.slime.setPosition(cx, cy);
  }

  bindEvents() {
    if (!this.canvas) return;

    // Track mouse position for eyes lookAt
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.slime.lookAt(mouseX, mouseY);

      if (this.isDragging) {
        const dx = mouseX - this.lastMouse.x;
        const dy = mouseY - this.lastMouse.y;
        this.slime.drag(dx, dy);
        this.lastMouse = { x: mouseX, y: mouseY };
      }
    });

    // Start drag
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      this.isDragging = true;
      this.canvas.classList.add('dragging');

      const rect = this.canvas.getBoundingClientRect();
      this.lastMouse = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      // Native Tauri window drag if running inside Tauri
      if (window.__TAURI__?.window?.getCurrentWindow) {
        window.__TAURI__.window.getCurrentWindow().startDragging();
      } else if (window.__TAURI__?.window?.appWindow) {
        window.__TAURI__.window.appWindow.startDragging();
      }
    });

    // End drag
    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.classList.remove('dragging');
      }
    });

    // Toggle Dock on double click
    this.canvas.addEventListener('dblclick', () => {
      this.toggleDock();
    });
  }

  toggleDock() {
    if (this.slime.state === 'docked') {
      this.slime.undock();
      document.body.classList.remove('docked');
      this.showHUD('Flotando libremente', 'Sli', 'idle', 2500);
    } else {
      this.slime.dock();
      document.body.classList.add('docked');
      this.showHUD('Acoplado a la barra', 'Sli', 'idle', 2500);
    }
  }

  showHUD(message, badge = 'Sli', type = 'idle', autoHideMs = 5000) {
    if (!this.hudBubble) return;

    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
      this.hudTimeout = null;
    }

    if (this.hudBadge) {
      this.hudBadge.textContent = badge;
      this.hudBadge.className = `hud-badge ${type}`;
    }

    if (this.hudStatus) {
      this.hudStatus.className = `hud-status-dot ${type !== 'idle' ? 'active' : ''}`;
    }

    if (this.hudMessage) {
      this.hudMessage.textContent = message;
    }

    this.hudBubble.classList.remove('hidden');

    if (autoHideMs > 0) {
      this.hudTimeout = setTimeout(() => {
        this.hideHUD();
      }, autoHideMs);
    }
  }

  hideHUD() {
    if (this.hudBubble) {
      this.hudBubble.classList.add('hidden');
    }
  }

  setPushToTalk(active, label = 'Escuchando...') {
    if (!this.pttIndicator) return;
    const labelEl = this.pttIndicator.querySelector('.ptt-label');
    if (labelEl) labelEl.textContent = label;

    if (active) {
      this.pttIndicator.classList.remove('hidden');
      this.slime.setState('speaking');
    } else {
      this.pttIndicator.classList.add('hidden');
      if (this.slime.state === 'speaking') {
        this.slime.setState('idle');
      }
    }
  }

  bindTauriIPC() {
    // Check for Tauri event listener
    const tauri = window.__TAURI__;
    if (!tauri?.event?.listen) {
      console.info('[Sli] Running outside Tauri or waiting for IPC bridge.');
      return;
    }

    // Antigravity live observer event
    tauri.event.listen('antigravity-state', (event) => {
      const payload = event.payload || {};
      const state = (payload.state || '').toLowerCase();

      switch (state) {
        case 'thinking':
          this.slime.setState('thinking');
          this.showHUD(payload.message || 'Pensando...', 'AGY', 'thinking', 0);
          break;
        case 'executing_tool':
          this.slime.setState('thinking');
          this.showHUD(`Ejecutando: ${payload.tool || 'herramienta'}`, 'AGY', 'thinking', 0);
          break;
        case 'needs_input':
          this.slime.setState('alert');
          this.showHUD(payload.message || 'Esperando confirmación...', 'ATENCIÓN', 'alert', 0);
          break;
        case 'idle':
        default:
          this.slime.setState('idle');
          this.hideHUD();
          break;
      }
    });

    // Voice Engine STT / TTS event
    tauri.event.listen('voice-state', (event) => {
      const payload = event.payload || {};
      const state = (payload.state || '').toLowerCase();

      if (state === 'recording') {
        this.setPushToTalk(true, 'Escuchando...');
      } else if (state === 'transcribing') {
        this.setPushToTalk(true, 'Procesando voz...');
      } else if (state === 'speaking') {
        this.setPushToTalk(false);
        this.slime.setState('speaking');
        if (typeof payload.amplitude === 'number') {
          this.slime.setSpeechAmplitude(payload.amplitude);
        }
        if (payload.text) {
          this.showHUD(payload.text, 'Sli', 'speaking', 6000);
        }
      } else {
        this.setPushToTalk(false);
        this.slime.setSpeechAmplitude(0);
        this.slime.setState('idle');
      }
    });

    // Window dock toggle event from backend
    tauri.event.listen('window-dock', (event) => {
      const payload = event.payload || {};
      if (payload.docked) {
        this.slime.dock();
        document.body.classList.add('docked');
      } else {
        this.slime.undock();
        document.body.classList.remove('docked');
      }
    });
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case '1':
          this.slime.setState('idle');
          this.showHUD('Estado: Inactivo (Idle)', 'Sli', 'idle', 3000);
          break;
        case '2':
          this.slime.setState('thinking');
          this.showHUD('Razonando solución con Antigravity...', 'AGY', 'thinking', 4000);
          break;
        case '3':
          this.slime.setState('alert');
          this.showHUD('¿Deseas permitir la ejecución del comando?', 'ALERTA', 'alert', 4000);
          break;
        case '4':
          this.slime.setState('speaking');
          this.slime.setSpeechAmplitude(0.75);
          this.showHUD('¡Hola! Soy Sli, tu compañero de escritorio.', 'Sli', 'speaking', 4000);
          setTimeout(() => {
            if (this.slime.state === 'speaking') {
              this.slime.setSpeechAmplitude(0);
              this.slime.setState('idle');
            }
          }, 3500);
          break;
        case '5':
          this.toggleDock();
          break;
        case ' ':
          if (!e.repeat) {
            this.setPushToTalk(true, 'Escuchando (PTT)...');
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        this.setPushToTalk(false);
      }
    });
  }

  startLoop() {
    const frame = (timestamp) => {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
      this.lastTime = timestamp;

      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.slime.update(dt);
        this.slime.draw(this.ctx);
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

// Instantiate app when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.sliApp = new SliApp();
  });
}

export { SliApp };
