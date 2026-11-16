// tests/scaffolding.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Scaffolding and Bilingual Documentation', () => {
  it('should have valid package.json with sli metadata', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    assert.strictEqual(pkg.name, 'sli');
    assert.ok(pkg.version);
  });

  it('should have both README.md (EN) and README_ES.md (ES)', () => {
    assert.ok(fs.existsSync(path.resolve('README.md')), 'README.md must exist');
    assert.ok(fs.existsSync(path.resolve('README_ES.md')), 'README_ES.md must exist');
    const en = fs.readFileSync(path.resolve('README.md'), 'utf8');
    const es = fs.readFileSync(path.resolve('README_ES.md'), 'utf8');
    assert.ok(en.includes('Sli - Desktop Companion'), 'EN readme header');
    assert.ok(es.includes('Sli - Compañero de Escritorio'), 'ES readme header');
  });

  it('should have config.example.json with required schema keys', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve('config.example.json'), 'utf8'));
    assert.ok('voice' in config);
    assert.ok('antigravity' in config);
    assert.ok('hotkeys' in config);
    assert.ok('providers' in config);
  });
});
