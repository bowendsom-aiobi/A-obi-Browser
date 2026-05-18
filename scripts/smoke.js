'use strict';

// Code-QA smoke test for deterministic logic (no GUI; visual QA is manual).
const assert = require('node:assert/strict');
const { getEngine, resolveInput, DEFAULT_ENGINE_ID } = require('../src/main/search-engines');
const { GEOM, compute, clampChat } = require('../src/main/layout');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const brave = getEngine();

check('default engine is Brave', () => {
  assert.equal(DEFAULT_ENGINE_ID, 'brave');
  assert.equal(brave.id, 'brave');
});

check('query becomes a Brave search URL', () => {
  const url = resolveInput('hello world', brave);
  assert.ok(url.startsWith('https://search.brave.com/search?q='));
  assert.ok(url.includes('hello%20world'));
});

check('bare domain becomes https URL', () => {
  assert.equal(resolveInput('github.com', brave), 'https://github.com');
});

check('explicit http(s) URL passes through', () => {
  assert.equal(resolveInput('https://x.com/a', brave), 'https://x.com/a');
});

check('aiobi:// scheme passes through', () => {
  assert.equal(resolveInput('aiobi://home', brave), 'aiobi://home');
});

check('layout: closed chat has no chat/grip rects', () => {
  const b = compute({ width: 1320, height: 860 }, { chatOpen: false });
  assert.equal(b.sidebar.width, GEOM.SIDEBAR_W);
  assert.equal(b.chatBody, null);
  assert.equal(b.grip, null);
  assert.equal(b.content.x, GEOM.SIDEBAR_W + GEOM.GAP);
  assert.ok(b.content.width > 0);
});

check('layout: open chat shrinks content and fits in window', () => {
  const closed = compute({ width: 1320, height: 860 }, { chatOpen: false });
  const open = compute({ width: 1320, height: 860 }, { chatOpen: true, chatWidth: 400 });
  assert.ok(open.content.width < closed.content.width);
  assert.ok(open.chatBody.x + open.chatBody.width <= 1320);
  assert.ok(open.grip.x < open.chatBody.x);
  assert.equal(open.chatBody.height, 860 - GEOM.GAP * 2);
});

check('layout: collapsed sidebar = width 0, content full-left', () => {
  const b = compute({ width: 1320, height: 860 }, { chatOpen: false, sidebarCollapsed: true });
  assert.equal(b.sidebar.width, 0);
  assert.equal(b.content.x, GEOM.GAP);
  assert.ok(b.content.width > 1320 - GEOM.GAP * 2 - 1);
});

check('layout: clampChat respects min/max', () => {
  assert.equal(clampChat(10), GEOM.CHAT_MIN);
  assert.equal(clampChat(99999), GEOM.CHAT_MAX);
});

check('layout: never negative at tiny sizes', () => {
  const b = compute({ width: 200, height: 120 }, { chatOpen: true, chatWidth: 400 });
  assert.ok(b.content.width >= 0 && b.content.height >= 0);
  assert.ok(b.chatBody.width >= 0 && b.chatBody.height >= 0);
});

console.log(`\n${passed} checks passed`);
