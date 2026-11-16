/**
 * Sli - Frontend Application Controller
 * Handles Canvas rendering loop, mouse drag interactions, HUD bubble,
 * Right-Click Context Menu, and Tauri IPC event listeners.
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

    // Context Menu DOM Elements
    this.sliMenu = document.getElementById('sli-menu');
    this.menuCloseBtn = document.getElementById('menu-close-btn');
    this.menuTabs = document.querySelectorAll('.menu-tab');
    this.tabPanes = document.querySelectorAll('.tab-pane');
    this.modelStatusText = document.getElementById('model-status-text');
    this.metricInTokens = document.getElementById('metric-in-tokens');
    this.metricOutTokens = document.getElementById('metric-out-tokens');
    this.metricCacheTokens = document.getElementById('metric-cache-tokens');
    this.modelSelect = document.getElementById('model-select');
    this.btnSpeakStatus = document.getElementById('btn-speak-status');
    this.btnDockToggle = document.getElementById('btn-dock-toggle');
    this.tasksContainer = document.getElementById('tasks-container');
    this.taskCount = document.getElementById('task-count');
    this.btnRefreshTasks = document.getElementById('btn-refresh-tasks');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.chatMicBtn = document.getElementById('chat-mic-btn');
    this.menuSessionChip = document.getElementById('menu-session');

    this.isMenuOpen = false;
    this.menuRefreshInterval = null;

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
    this.bindMenuEvents();
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

    // Open context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.toggleMenu();
    });
  }

  bindMenuEvents() {
    // Close button
    if (this.menuCloseBtn) {
      this.menuCloseBtn.addEventListener('click', () => {
        this.closeMenu();
      });
    }

    // Tabs switching
    this.menuTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    // Refresh tasks button
    if (this.btnRefreshTasks) {
      this.btnRefreshTasks.addEventListener('click', () => {
        this.fetchSessionSummary();
      });
    }

    // Speak status button
    if (this.btnSpeakStatus) {
      this.btnSpeakStatus.addEventListener('click', () => {
        this.speakCurrentStatus();
      });
    }

    // Dock toggle button
    if (this.btnDockToggle) {
      this.btnDockToggle.addEventListener('click', () => {
        this.toggleDock();
      });
    }

    // Model selection dropdown
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        const text = e.target.options[e.target.selectedIndex]?.text || e.target.value;
        if (this.modelStatusText) {
          this.modelStatusText.textContent = text.replace(/^[^\w]+/, '').trim();
        }
        this.showHUD(`Modelo seleccionado: ${text}`, 'Sli', 'idle', 3000);
        this.speakText(`Modelo cambiado a ${text}`);
      });
    }

    // Chat form submission
    if (this.chatForm) {
      this.chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = this.chatInput ? this.chatInput.value.trim() : '';
        if (!text) return;
        if (this.chatInput) this.chatInput.value = '';

        this.addChatMessage(text, 'user');
        await this.sendChatMessage(text);
      });
    }

    // Chat mic button
    if (this.chatMicBtn) {
      this.chatMicBtn.addEventListener('click', () => {
        this.showHUD('Voz activa. Te escucho...', 'Sli', 'speaking', 3000);
        this.speakText('Hola Neru, ¿qué necesitas que haga por ti?');
      });
    }
  }

  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.isMenuOpen = true;
    if (this.sliMenu) {
      this.sliMenu.classList.remove('hidden');
    }
    this.setTauriWindowSize(380, 520);
    this.fetchSessionSummary();

    // Start auto-refresh interval while menu is open
    if (!this.menuRefreshInterval) {
      this.menuRefreshInterval = setInterval(() => {
        if (this.isMenuOpen) {
          this.fetchSessionSummary();
        }
      }, 3500);
    }
  }

  closeMenu() {
    this.isMenuOpen = false;
    if (this.sliMenu) {
      this.sliMenu.classList.add('hidden');
    }
    this.setTauriWindowSize(220, 220);

    if (this.menuRefreshInterval) {
      clearInterval(this.menuRefreshInterval);
      this.menuRefreshInterval = null;
    }
  }

  switchTab(tabId) {
    this.menuTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });
    this.tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'tab-tasks') {
      this.fetchSessionSummary();
    }
  }

  async fetchSessionSummary() {
    try {
      const tauri = window.__TAURI__;
      let summary = null;
      if (tauri?.core?.invoke) {
        summary = await tauri.core.invoke('get_active_session_summary');
      } else if (tauri?.invoke) {
        summary = await tauri.invoke('get_active_session_summary');
      }

      if (summary) {
        this.renderSessionSummary(summary);
      }
    } catch (err) {
      console.warn('[Sli] Failed to fetch session summary:', err);
    }
  }

  renderSessionSummary(summary) {
    if (this.modelStatusText && summary.model) {
      this.modelStatusText.textContent = summary.model;
    }

    const fmtNum = (n) => {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    };

    if (this.metricInTokens) this.metricInTokens.textContent = fmtNum(summary.total_input_tokens);
    if (this.metricOutTokens) this.metricOutTokens.textContent = fmtNum(summary.total_output_tokens);
    if (this.metricCacheTokens) this.metricCacheTokens.textContent = fmtNum(summary.total_cache_tokens);

    if (this.taskCount && summary.recent_tasks) {
      this.taskCount.textContent = summary.recent_tasks.length.toString();
    }

    if (this.tasksContainer && summary.recent_tasks) {
      if (summary.recent_tasks.length === 0) {
        this.tasksContainer.innerHTML = '<div class="task-item empty" style="color:var(--text-muted); font-size:11px; text-align:center; padding:12px;">No hay tareas registradas en esta sesión</div>';
      } else {
        // Show newest tasks first
        const tasks = [...summary.recent_tasks].reverse().slice(0, 30);
        this.tasksContainer.innerHTML = tasks.map((task) => {
          const detailHtml = task.detail ? `<div class="task-item-detail">${this.escapeHtml(task.detail)}</div>` : '';
          return `
            <div class="task-item">
              <div class="task-item-title">${this.escapeHtml(task.title)}</div>
              ${detailHtml}
            </div>
          `;
        }).join('');
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  addChatMessage(text, sender = 'user') {
    if (!this.chatMessages) return;

    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    const bubble = document.createElement('span');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);

    this.chatMessages.appendChild(div);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  async sendChatMessage(message) {
    this.slime.setState('thinking');
    try {
      const tauri = window.__TAURI__;
      let res = null;
      if (tauri?.core?.invoke) {
        res = await tauri.core.invoke('chat_with_sli', { message });
      } else if (tauri?.invoke) {
        res = await tauri.invoke('chat_with_sli', { message });
      } else {
        res = { reply: `Respuesta simulada a: "${message}"` };
      }

      if (res && res.reply) {
        this.addChatMessage(res.reply, 'sli');
        this.slime.setState('speaking');
        setTimeout(() => {
          if (this.slime.state === 'speaking') {
            this.slime.setState('idle');
          }
        }, 3000);
      }
    } catch (err) {
      this.addChatMessage(`Error: ${err}`, 'sli');
      this.slime.setState('idle');
    }
  }

  speakCurrentStatus() {
    const model = this.modelStatusText ? this.modelStatusText.textContent : 'Gemini 3.8 Flash';
    const count = this.taskCount ? this.taskCount.textContent : '0';
    const text = `Estoy utilizando el modelo ${model}. Se han completado ${count} acciones en la sesión actual.`;
    this.showHUD(text, 'Sli', 'speaking', 5000);
    this.speakText(text);
  }

  speakText(text) {
    try {
      const tauri = window.__TAURI__;
      if (tauri?.core?.invoke) {
        tauri.core.invoke('speak_text', { text }).catch(() => {});
      } else if (tauri?.invoke) {
        tauri.invoke('speak_text', { text }).catch(() => {});
      }
    } catch (_) {}
  }

  setTauriWindowSize(width, height) {
    try {
      const tauri = window.__TAURI__;
      if (tauri?.core?.invoke) {
        tauri.core.invoke('set_window_size', { width, height }).catch(() => {});
      } else if (tauri?.invoke) {
        tauri.invoke('set_window_size', { width, height }).catch(() => {});
      }
    } catch (_) {}
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
      // If typing in input or textarea, only handle Escape
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape' && this.isMenuOpen) {
          this.closeMenu();
        }
        return;
      }

      if (e.key === 'Escape' && this.isMenuOpen) {
        this.closeMenu();
        return;
      }

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
