import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

describe('Troko-Style Top Notch Dashboard & Sli Features', () => {
  test('dashboard.html contains notch container with sidebar navigation, metric cards, tasks and chat', () => {
    const html = readFileSync(join(root, 'ui/dashboard.html'), 'utf-8');
    assert.match(html, /id="dashboard"/, 'Must contain notch container');
    assert.match(html, /data-tab="tab-inicio"/, 'Must contain inicio tab');
    assert.match(html, /data-tab="tab-tareas"/, 'Must contain tareas tab');
    assert.match(html, /data-tab="tab-chat"/, 'Must contain chat tab');
    assert.match(html, /id="card-model-name"/, 'Must contain model card');
    assert.match(html, /id="model-select-dropdown"/, 'Must contain model dropdown');
    assert.match(html, /id="tasks-scroll-list"/, 'Must contain tasks scroll list');
    assert.match(html, /id="quick-action-form"/, 'Must contain quick input form');
  });

  test('dashboard.css contains styling for notch container, cards grid, and sidebar', () => {
    const css = readFileSync(join(root, 'ui/dashboard.css'), 'utf-8');
    assert.match(css, /\.notch-container/, 'Must style notch-container');
    assert.match(css, /\.cards-grid/, 'Must style cards-grid');
    assert.match(css, /\.metric-card/, 'Must style metric-card');
    assert.match(css, /\.sidebar/, 'Must style sidebar');
  });

  test('dashboard.js exports DashboardApp with summary and chat methods', () => {
    const js = readFileSync(join(root, 'ui/dashboard.js'), 'utf-8');
    assert.match(js, /class DashboardApp/, 'Must declare DashboardApp');
    assert.match(js, /fetchSummary\(\)/, 'Must have fetchSummary');
    assert.match(js, /renderSummary\(/, 'Must have renderSummary');
    assert.match(js, /sendChatCommand\(/, 'Must have sendChatCommand');
  });

  test('app.js invokes toggle_dashboard on context menu', () => {
    const js = readFileSync(join(root, 'ui/app.js'), 'utf-8');
    assert.match(js, /toggle_dashboard/, 'Must invoke toggle_dashboard');
  });
});
