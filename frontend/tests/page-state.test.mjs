import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../app/page-state.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function environment() {
  const frames = new Map();
  const listeners = new Map();
  let clock = 0, frameId = 0, height = 5000;
  const history = { state: { framework: 'preserved' }, replaceState(state) { this.state = state; }, pushState(state, _, url) { this.state = state; window.location.href = url; } };
  const window = {
    history, location: { href: '/?view=browse' }, scrollX: 0, scrollY: 850,
    scrollTo({left, top}) { this.scrollX = left; this.scrollY = Math.min(top, height); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    dispatchEvent() {},
  };
  const exports = {};
  runInNewContext(source, {
    exports, require: createRequire(import.meta.url), window, history,
    document: { querySelectorAll: () => [] }, performance: { now: () => clock },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }, PopStateEvent: class {},
  });
  return { exports, history, window, listeners, frames,
    height(value) { height = value; },
    tick() { clock += 100; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
  };
}

test('scroll snapshot preserves router state and waits for asynchronous page height', () => {
  const env = environment();
  env.exports.saveScroll();
  assert.equal(env.history.state.framework, 'preserved');
  assert.equal(env.history.state.cvScroll[1], 850);
  env.height(100);
  env.exports.restoreScroll();
  env.tick();
  assert.equal(env.window.scrollY, 100);
  env.height(5000);
  env.tick();
  assert.equal(env.window.scrollY, 850);
});

test('manual scrolling cancels pending restoration', () => {
  const env = environment();
  env.exports.saveScroll();
  env.height(100);
  env.exports.restoreScroll(); env.tick();
  env.listeners.get('wheel')();
  env.height(5000); env.window.scrollY = 250; env.tick();
  assert.equal(env.window.scrollY, 250);
});

test('dashboard home navigation saves position and preserves modified link clicks', () => {
  const env = environment();
  let prevented = false;
  env.exports.navigateHome({button: 0, ctrlKey: true, preventDefault() { prevented = true; }});
  assert.equal(prevented, false);
  assert.equal(env.window.location.href, '/?view=browse');
  env.exports.navigateHome({button: 0, preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(env.window.location.href, '/');
  assert.equal(env.history.state.cv, true);
});
