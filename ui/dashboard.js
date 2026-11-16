/**
 * Sli - Top Notch Dashboard Controller
 */

class DashboardApp {
  constructor() {
    this.navItems = document.querySelectorAll('.nav-item');
    this.tabPanes = document.querySelectorAll('.tab-pane');
    this.viewTitle = document.getElementById('view-title');
    this.viewSubtitle = document.getElementById('view-subtitle');
    this.closeBtn = document.getElementById('dashboard-close-btn');

    // Metrics & Card Elements
    this.cardModelName = document.getElementById('card-model-name');
    this.cardTasksCount = document.getElementById('card-tasks-count');
    this.cardTokensCount = document.getElementById('card-tokens-count');
    this.navTaskBadge = document.getElementById('nav-task-badge');
    this.modelSelect = document.getElementById('model-select-dropdown');
    this.btnSpeakSummary = document.getElementById('btn-speak-summary');
    this.btnDockSlime = document.getElementById('btn-dock-slime');

    // Tasks Elements
    this.tasksScrollList = document.getElementById('tasks-scroll-list');
    this.btnRefreshTasks = document.getElementById('btn-refresh-tasks-list');

    // Quick Input & Chat Elements
    this.quickForm = document.getElementById('quick-action-form');
    this.quickInput = document.getElementById('quick-input');
    this.btnMicToggle = document.getElementById('btn-mic-toggle');
    this.chatThread = document.getElementById('chat-thread');

    // System Action Buttons
    this.btnFocusMonitor = document.getElementById('btn-focus-monitor');
    this.btnOpenTerminal = document.getElementById('btn-open-terminal');
    this.btnOpenBrowser = document.getElementById('btn-open-browser');
    this.btnTestVoice = document.getElementById('btn-test-voice');

    this.tabDescriptions = {
      'tab-inicio': { title: 'Inicio', subtitle: 'Resumen de sesión de Gemini & Antigravity' },
      'tab-tareas': { title: 'Tareas Realizadas', subtitle: 'Historial de llamadas de herramientas y peticiones' },
      'tab-chat': { title: 'Chat con Sli', subtitle: 'Asistente de escritorio interactivo con voz' },
      'tab-sistema': { title: 'Acciones de Sistema', subtitle: 'Control de pantalla, procesos y utilidades' },
    };

    this.bindEvents();
    this.fetchSummary();
    this.startAutoRefresh();
  }

  bindEvents() {
    // Navigation items
    this.navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        this.closeDashboard();
      });
    }

    // Escape key listener to close
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDashboard();
      }
    });

    // Quick action / Chat form submit
    if (this.quickForm) {
      this.quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = this.quickInput ? this.quickInput.value.trim() : '';
        if (!text) return;
        if (this.quickInput) this.quickInput.value = '';

        this.addChatMessage(text, 'user');
        this.switchTab('tab-chat');
        await this.sendChatCommand(text);
      });
    }

    // Mic button
    if (this.btnMicToggle) {
      this.btnMicToggle.addEventListener('click', () => {
        this.speakText('Hola Neru, te escucho. Puedes decirme qué necesitas.');
      });
    }

    // Refresh tasks
    if (this.btnRefreshTasks) {
      this.btnRefreshTasks.addEventListener('click', () => {
        this.fetchSummary();
      });
    }

    // Speak summary
    if (this.btnSpeakSummary) {
      this.btnSpeakSummary.addEventListener('click', () => {
        const model = this.cardModelName ? this.cardModelName.textContent : 'Gemini 3.8 Flash';
        const tasks = this.cardTasksCount ? this.cardTasksCount.textContent : '0';
        const tokens = this.cardTokensCount ? this.cardTokensCount.textContent : '0';
        const msg = `Estoy utilizando el modelo ${model}. Llevamos ${tasks} tareas registradas y aproximadamente ${tokens} tokens procesados.`;
        this.speakText(msg);
      });
    }

    // Dock toggle
    if (this.btnDockSlime) {
      this.btnDockSlime.addEventListener('click', () => {
        this.invokeTauri('toggle_dock').catch(() => {});
      });
    }

    // Model selection dropdown
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        const text = e.target.options[e.target.selectedIndex]?.text || e.target.value;
        if (this.cardModelName) {
          this.cardModelName.textContent = text.replace(/^[^\w]+/, '').trim();
        }
        this.speakText(`Modelo cambiado a ${text}`);
      });
    }

    // System actions
    if (this.btnFocusMonitor) {
      this.btnFocusMonitor.addEventListener('click', () => {
        this.invokeTauri('dispatch_screen_action', { action: 'focus_monitor', target: '+1' });
        this.speakText('Cambiando monitor activo.');
      });
    }

    if (this.btnOpenTerminal) {
      this.btnOpenTerminal.addEventListener('click', () => {
        this.invokeTauri('dispatch_screen_action', { action: 'open_terminal', target: '' });
        this.speakText('Abriendo terminal.');
      });
    }

    if (this.btnOpenBrowser) {
      this.btnOpenBrowser.addEventListener('click', () => {
        this.invokeTauri('dispatch_screen_action', { action: 'open_url', target: 'https://google.com' });
        this.speakText('Abriendo navegador.');
      });
    }

    if (this.btnTestVoice) {
      this.btnTestVoice.addEventListener('click', () => {
        this.speakText('Hola Neru, la síntesis de voz neuronal local está funcionando con total fluidez.');
      });
    }
  }

  switchTab(tabId) {
    this.navItems.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    this.tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (this.tabDescriptions[tabId]) {
      if (this.viewTitle) this.viewTitle.textContent = this.tabDescriptions[tabId].title;
      if (this.viewSubtitle) this.viewSubtitle.textContent = this.tabDescriptions[tabId].subtitle;
    }

    if (tabId === 'tab-tareas') {
      this.fetchSummary();
    }
  }

  async fetchSummary() {
    try {
      const summary = await this.invokeTauri('get_active_session_summary');
      if (summary) {
        this.renderSummary(summary);
      }
    } catch (err) {
      console.warn('[Dashboard] Could not fetch summary:', err);
    }
  }

  renderSummary(summary) {
    if (this.cardModelName && summary.model) {
      this.cardModelName.textContent = summary.model;
    }

    const fmtNum = (n) => {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    };

    const taskCount = summary.recent_tasks ? summary.recent_tasks.length : 0;
    if (this.cardTasksCount) this.cardTasksCount.textContent = taskCount.toString();
    if (this.navTaskBadge) this.navTaskBadge.textContent = taskCount.toString();

    const totalToks = (summary.total_input_tokens || 0) + (summary.total_output_tokens || 0) + (summary.total_cache_tokens || 0);
    if (this.cardTokensCount) this.cardTokensCount.textContent = fmtNum(totalToks);

    if (this.tasksScrollList && summary.recent_tasks) {
      if (summary.recent_tasks.length === 0) {
        this.tasksScrollList.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:16px; text-align:center;">No hay tareas registradas aún.</div>';
      } else {
        const tasks = [...summary.recent_tasks].reverse().slice(0, 30);
        this.tasksScrollList.innerHTML = tasks.map((task) => `
          <div class="task-card-item">
            <div class="task-card-title">${this.escapeHtml(task.title)}</div>
            ${task.detail ? `<div class="task-card-detail">${this.escapeHtml(task.detail)}</div>` : ''}
          </div>
        `).join('');
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

  addChatMessage(text, role = 'user') {
    if (!this.chatThread) return;

    const row = document.createElement('div');
    row.className = `chat-bubble-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = role === 'sli' ? '💧' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;

    row.appendChild(avatar);
    row.appendChild(bubble);

    this.chatThread.appendChild(row);
    this.chatThread.scrollTop = this.chatThread.scrollHeight;
  }

  async sendChatCommand(message) {
    try {
      const res = await this.invokeTauri('chat_with_sli', { message });
      if (res && res.reply) {
        this.addChatMessage(res.reply, 'sli');
      }
    } catch (err) {
      this.addChatMessage(`Error: ${err}`, 'sli');
    }
  }

  speakText(text) {
    this.invokeTauri('speak_text', { text }).catch(() => {});
  }

  closeDashboard() {
    this.invokeTauri('toggle_dashboard').catch(() => {});
  }

  startAutoRefresh() {
    setInterval(() => {
      this.fetchSummary();
    }, 4000);
  }

  async invokeTauri(cmd, args = {}) {
    const tauri = window.__TAURI__;
    if (tauri?.core?.invoke) {
      return await tauri.core.invoke(cmd, args);
    } else if (tauri?.invoke) {
      return await tauri.invoke(cmd, args);
    }
    return null;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.dashboardApp = new DashboardApp();
});
