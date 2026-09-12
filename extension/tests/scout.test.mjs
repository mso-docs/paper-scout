import assert from 'node:assert/strict';
import { test } from 'node:test';

let installed, clicked, menu, events = [], saved = {};
const capture = { status: 'captured', highlight: 'A claim', pageMetadata: { url: 'https://example.org/paper' }, contexts: { section: { text: 'A claim in context', effectiveRange: 'section' } } };
globalThis.chrome = {
  runtime: { onInstalled: { addListener(fn) { installed = fn; } } },
  contextMenus: { create(item) { menu = item; }, onClicked: { addListener(fn) { clicked = fn; } } },
  sidePanel: { open() { events.push('open'); return Promise.resolve(); } },
  scripting: { async executeScript() { events.push('capture'); return [{ result: capture }]; } },
  storage: {
    local: { async setAccessLevel() {}, async get() { return { settings: { contextRange: 'section' } }; } },
    session: { async setAccessLevel() {}, async get(key) { return key === 'secrets' ? {} : { [key]: saved[key] }; }, async set(data) { events.push('store'); Object.assign(saved, data); } },
  },
};
const { scoutSelection } = await import('../background.mjs');
const tab = { id: 7, windowId: 2, url: capture.pageMetadata.url };
const info = { menuItemId: 'scout-this-claim', selectionText: 'A claim', pageUrl: tab.url, frameId: 0 };

test('selection-only menu opens synchronously and hands off the saved range', async () => {
  installed();
  assert.equal(menu.title, 'Scout this claim');
  assert.deepEqual(menu.contexts, ['selection']);
  clicked(info, tab);
  assert.equal(events[0], 'open');
  for (let i = 0; i < 20 && saved['scout:2']?.state !== 'ready'; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(saved['scout:2'].state, 'ready');
  assert.equal(saved['scout:2'].range, 'section');
  assert.equal(saved['scout:2'].capture.highlight, 'A claim');
});
test('changed selections and embedded frames produce errors instead of sending a wrong claim', async () => {
  await scoutSelection({ ...info, selectionText: 'Different claim' }, tab, Promise.resolve());
  assert.equal(saved['scout:2'].state, 'error');
  assert.match(saved['scout:2'].error, /selection changed/);
  await scoutSelection({ ...info, frameId: 9 }, tab, Promise.resolve());
  assert.match(saved['scout:2'].error, /Embedded frames/);
});
