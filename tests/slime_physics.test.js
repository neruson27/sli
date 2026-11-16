import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SlimeEntity } from '../ui/slime_physics.js';

describe('SlimeEntity Physics & State Machine', () => {
  it('should initialize with 16 spring vertices and idle state', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    assert.strictEqual(slime.vertices.length, 16);
    assert.strictEqual(slime.state, 'idle');
  });

  it('should deform on drag and spring back on update', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    const initialY = slime.vertices[0].y;
    slime.drag(0, 20);
    assert.notStrictEqual(slime.vertices[0].y, initialY);
    for (let i = 0; i < 60; i++) {
      slime.update(0.016);
    }
    assert.ok(Math.abs(slime.vertices[0].y - initialY) < 5, 'Should spring back towards equilibrium');
  });

  it('should switch states cleanly', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    slime.setState('thinking');
    assert.strictEqual(slime.state, 'thinking');
    slime.setState('alert');
    assert.strictEqual(slime.state, 'alert');
    slime.dock();
    assert.strictEqual(slime.state, 'docked');
    slime.undock();
    assert.strictEqual(slime.state, 'idle');
  });

  it('should handle lookAt and speaking amplitude', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    slime.lookAt(120, 150);
    assert.ok(typeof slime.targetLook.x === 'number');
    assert.ok(typeof slime.targetLook.y === 'number');

    slime.setState('speaking');
    slime.setSpeechAmplitude(0.8);
    assert.strictEqual(slime.speechAmplitude, 0.8);
    slime.update(0.016);
    assert.strictEqual(slime.state, 'speaking');
  });

  it('should safely execute draw with mock canvas context', () => {
    const slime = new SlimeEntity({ radius: 50, vertices: 16 });
    const calls = [];
    const mockCtx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => calls.push('beginPath'),
      closePath: () => calls.push('closePath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      quadraticCurveTo: () => calls.push('quadraticCurveTo'),
      arc: () => calls.push('arc'),
      ellipse: () => calls.push('ellipse'),
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
      clearRect: () => calls.push('clearRect'),
      createRadialGradient: () => ({
        addColorStop: () => {}
      }),
      createLinearGradient: () => ({
        addColorStop: () => {}
      }),
      set fillStyle(val) {},
      set strokeStyle(val) {},
      set lineWidth(val) {},
      set shadowColor(val) {},
      set shadowBlur(val) {},
      set globalAlpha(val) {}
    };

    assert.doesNotThrow(() => {
      slime.draw(mockCtx);
    });
    assert.ok(calls.includes('beginPath'));
  });
});
