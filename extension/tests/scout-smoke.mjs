// Chromium selection-menu handler/sidebar integration; optional live backend + arXiv.
// Usage: node extension/tests/scout-smoke.mjs [--real-backend] (Node 22+).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const extension = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profile = await mkdtemp(join(tmpdir(), 'paper-scout-smoke-'));
const fixture = await readFile(new URL('./fixture.html', import.meta.url));
let received, responseMode = 'success';
const server = createServer(async (req, res) => {
  if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', apiVersion: '1.0' })); return; }
  if (req.url === '/v1/investigations') {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { body: JSON.parse(body), authorization: req.headers.authorization };
    res.setHeader('Content-Type', 'application/json');
    if (responseMode === 'auth-error') { res.writeHead(401); res.end(JSON.stringify({ error: { message: 'DO NOT DISPLAY SECRET' } })); return; }
    if (responseMode === 'slow') { req.socket.on('close', () => res.destroy()); return; }
    res.end(JSON.stringify({ schemaVersion: '1.0', status: 'complete', warnings: [], summary: 'Fixture evidence only', supports: [{title:'Test source',url:'https://example.org',explanation:'Test evidence'}], contradicts:[], qualifies:[], related:[] })); return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end(fixture);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(process.env.CHROMIUM || 'chromium', [
  '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--remote-debugging-port=0', `--load-extension=${extension}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
const pending = new Map();
let next = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const socketUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', chunk => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  ws = new WebSocket(socketUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data); if (!data.id) return;
    const p = pending.get(data.id); if (!p) return;
    pending.delete(data.id); clearTimeout(p.timer);
    data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const evaluate = async (session, expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const attach = async targetId => (await call('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  const waitFor = async (session, expression) => {
    for (let i = 0; i < 80; i++) { if (await evaluate(session, expression)) return; await delay(100); }
    throw new Error(`Condition did not become true: ${expression}`);
  };
  const id = createHash('sha256').update(extension).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  // Pregrant only the local test server in this disposable profile. Human
  // permission-dialog acceptance remains a manual check; no API is mocked.
  const managementTarget = (await call('Target.createTarget', { url: 'chrome://extensions' })).targetId;
  const management = await attach(managementTarget);
  await waitFor(management, '!!chrome.developerPrivate');
  await evaluate(management, `chrome.developerPrivate.addHostPermission(${JSON.stringify(id)}, 'http://127.0.0.1/*')`);
  await call('Target.closeTarget', { targetId: managementTarget });

  const paperUrl = process.argv.includes('--real-backend') ? 'https://arxiv.org/html/2401.04088v1' : `${base}/fixture.html`;
  const targetId = (await call('Target.createTarget', { url: paperUrl })).targetId;
  const page = await attach(targetId);
  await waitFor(page, "!!document.querySelector('#claim, .ltx_abstract .ltx_p')");
  const selected = await evaluate(page, `(() => {
    const root = document.querySelector('#claim, .ltx_abstract .ltx_p');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) if (node.textContent.trim().length > 20) break;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(node.length, 120));
    getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString();
  })()`);
  const tab = (await call('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] })).targetInfos.find(t => t.url === paperUrl);
  await call('Extensions.triggerAction', { id, targetId: tab.targetId });
  let popup;
  for (let i = 0; i < 50; i++) { popup = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`); if (popup) break; await delay(100); }
  const ui = await attach(popup.targetId);
  await waitFor(ui, "document.querySelector('#highlight')?.textContent.includes('') && !document.querySelector('#settings-fields').disabled");
  const backend = process.argv.includes('--real-backend') ? 'http://127.0.0.1:8787' : base;
  await evaluate(ui, `import('./settings.mjs').then(async m => { await chrome.permissions.request({origins:['http://127.0.0.1/*']}); await m.saveSettings({...m.DEFAULTS, backendUrl: ${JSON.stringify(backend)}, contextRange: 'section'}, {backendToken:'',aiApiKey:''}); })`);
  const sourceTab = await evaluate(ui, 'chrome.tabs.query({active:true,currentWindow:true}).then(t=>t[0])');
  const worker = (await call('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.includes(id));
  assert.ok(worker, 'Menu service worker registered');
  // CDP cannot click Chrome's native context menu. Exercise its exported handler
  // with the real selection and a user gesture; browser APIs are not stubbed.
  await evaluate(ui, `import('./background.mjs').then(m => m.scoutSelection({selectionText:${JSON.stringify(selected)}, pageUrl:${JSON.stringify(paperUrl)}, frameId:0}, ${JSON.stringify(sourceTab)}, chrome.sidePanel.open({tabId:${sourceTab.id}})))`);
  let panel;
  for (let i = 0; i < 50; i++) { panel = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/sidepanel.html`); if (panel) break; await delay(100); }
  assert.ok(panel, 'Real side panel opened');
  const sidebar = await attach(panel.targetId);
  // The real provider pipeline can take up to the extension's 60 second timeout.
  for (let i = 0; i < 650; i++) {
    if (await evaluate(sidebar, "!document.querySelector('#evidence').hidden || document.querySelector('#status').dataset.error === 'true'")) break;
    await delay(100);
  }
  const status = await evaluate(sidebar, "document.querySelector('#status').textContent");
  assert.equal(await evaluate(sidebar, "document.querySelector('#evidence').hidden"), false, status);
  assert.equal(await evaluate(sidebar, "document.querySelector('#highlight').textContent"), selected.trim().replace(/\s+/g, ' '));
  assert.equal(await evaluate(sidebar, "document.querySelector('#range').value"), 'section');
  console.log('PASS selection → saved section context → real sidebar → /investigate → evidence');
  console.log(await evaluate(sidebar, "document.querySelector('#evidence').textContent"));
  if (!process.argv.includes('--real-backend')) {
    assert.equal(received.body.contextRange, 'section');
    assert.equal(received.body.pageMetadata.url, paperUrl);
    assert.ok(received.body.context.includes(selected));
    responseMode = 'auth-error';
    await evaluate(ui, `import('./background.mjs').then(m => m.scoutSelection({selectionText:${JSON.stringify(selected)}, pageUrl:${JSON.stringify(paperUrl)}, frameId:0}, ${JSON.stringify(sourceTab)}, chrome.sidePanel.open({tabId:${sourceTab.id}})))`);
    await waitFor(sidebar, "document.querySelector('#status').textContent.includes('authentication failed')");
    assert.equal(await evaluate(sidebar, "document.querySelector('#evidence').hidden"), true);
    assert.equal(await evaluate(sidebar, "document.body.textContent.includes('DO NOT DISPLAY SECRET')"), false);
    console.log('PASS already-open sidebar receives next selection; backend errors clear stale evidence');
  }

} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  ws?.close();
  browser.kill('SIGTERM');
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
