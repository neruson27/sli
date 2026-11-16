import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

describe('Context Menu & Sli Features', () => {
  test('index.html contains sli-menu with tabs, model status, task list, and chat', () => {
    const html = readFileSync(join(root, 'ui/index.html'), 'utf-8');
    assert.match(html, /id="sli-menu"/, 'Must contain sli-menu');
    assert.match(html, /data-tab="tab-model"/, 'Must contain model tab');
    assert.match(html, /data-tab="tab-tasks"/, 'Must contain tasks tab');
    assert.match(html, /data-tab="tab-chat"/, 'Must contain chat tab');
    assert.match(html, /id="model-status-text"/, 'Must contain model status text');
    assert.match(html, /id="model-select"/, 'Must contain model dropdown selector');
    assert.match(html, /id="tasks-container"/, 'Must contain tasks container');
    assert.match(html, /id="chat-form"/, 'Must contain chat form');
    assert.match(html, /id="chat-input"/, 'Must contain chat input');
  });

  test('styles.css contains styling for glassmorphic sli-menu, tabs, and chat messages', () => {
    const css = readFileSync(join(root, 'ui/styles.css'), 'utf-8');
    assert.match(css, /\.sli-menu/, 'Must style sli-menu');
    assert.match(css, /\.menu-tab/, 'Must style menu-tab');
    assert.match(css, /\.tab-pane/, 'Must style tab-pane');
    assert.match(css, /\.chat-messages/, 'Must style chat-messages');
    assert.match(css, /\.chat-msg\.sli/, 'Must style Sli chat bubbles');
    assert.match(css, /\.chat-msg\.user/, 'Must style User chat bubbles');
  });

  test('app.js exports SliApp with context menu and summary methods', () => {
    const js = readFileSync(join(root, 'ui/app.js'), 'utf-8');
    assert.match(js, /openMenu\(\)/, 'Must have openMenu');
    assert.match(js, /closeMenu\(\)/, 'Must have closeMenu');
    assert.match(js, /switchTab\(/, 'Must have switchTab');
    assert.match(js, /fetchSessionSummary\(\)/, 'Must have fetchSessionSummary');
    assert.match(js, /renderSessionSummary\(/, 'Must have renderSessionSummary');
    assert.match(js, /sendChatMessage\(/, 'Must have sendChatMessage');
  });
});
