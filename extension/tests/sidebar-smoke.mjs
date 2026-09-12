// Real Chromium sidebar integration using the implemented backend contract.
// Usage: node extension/tests/sidebar-smoke.mjs [--real-backend] (Node 22+).
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
  if (req.url === '/chat' || req.url === '/investigate') {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { path: req.url, body: JSON.parse(body) };
    res.setHeader('Content-Type', 'application/json');
    if (responseMode === 'slow') { req.socket.on('close', () => res.destroy()); return; }
    if (responseMode === 'error') { res.writeHead(503); res.end('{}'); return; }
    if (req.url === '/chat') res.end(JSON.stringify({ answer: responseMode === 'ungrounded' ? 'This is not stated in the paper.' : '<img src=x> The trial improved recall.', grounded: responseMode !== 'ungrounded' }));
    else res.end(JSON.stringify({ summary: 'Fixture evidence.', supporting: responseMode === 'empty' ? [] : [{ title: '<img src=x>', url: 'https://example.org/source', why: 'Supports recall.' }, { title: 'Unsafe link', url: 'javascript:alert(1)', why: 'No clickable URL.' }], contradicting: [], qualifying: [], related: [] }));
    return;
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
    throw new Error(`Condition did not become true: ${expression}: ${await evaluate(session, "document.body.innerText")}`);
  };
  const id = createHash('sha256').update(extension).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  // Pregrant only the local test server in this disposable profile. Human
  // permission-dialog acceptance remains a manual check; no API is mocked.
  const managementTarget = (await call('Target.createTarget', { url: 'chrome://extensions' })).targetId;
  const management = await attach(managementTarget);
  await waitFor(management, '!!chrome.developerPrivate');
  await evaluate(management, `chrome.developerPrivate.addHostPermission(${JSON.stringify(id)}, 'http://127.0.0.1/*')`);
  await call('Target.closeTarget', { targetId: managementTarget });
  const targetId = (await call('Target.createTarget', { url: `${base}/fixture.html` })).targetId;
  const page = await attach(targetId);
  await waitFor(page, "!!document.querySelector('#claim')");
  const tab = (await call('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] })).targetInfos.find(t => t.url === `${base}/fixture.html`);
  await call('Extensions.triggerAction', { id, targetId: tab.targetId });
  let popup;
  for (let i = 0; i < 50; i++) { popup = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`); if (popup) break; await delay(100); }
  const popupUI = await attach(popup.targetId);
  await waitFor(popupUI, "document.querySelector('#status')?.textContent.includes('Page captured')");
  await evaluate(popupUI, `import('./settings.mjs').then(m => m.saveSettings({...m.DEFAULTS, backendUrl:${JSON.stringify(base)}}, {backendToken:'',aiApiKey:''}))`);
  await evaluate(popupUI, "document.querySelector('#open-sidebar').click()");
  let panel;
  for (let i = 0; i < 50; i++) { panel = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/sidepanel.html`); if (panel) break; await delay(100); }
  assert.ok(panel, 'Popup opens real chrome.sidePanel without a selection');
  const ui = await attach(panel.targetId);
  await waitFor(ui, "document.querySelector('#ask') && !document.querySelector('#ask').disabled");
  await delay(500);
  await evaluate(ui, "document.querySelector('details').open=true;document.querySelector('#save-connection').click()");
  await waitFor(ui, "document.querySelector('#connection-status').textContent.includes('Connection saved')");
  await evaluate(ui, "document.querySelector('#mode-chat').click();document.querySelector('#question').value='What improved?';document.querySelector('#ask').click()");
  await waitFor(ui, "!!document.querySelector('.answer-grounded')");
  assert.equal(received.path, '/chat');
  assert.equal(received.body.question, 'What improved?');
  assert.ok(received.body.page_content.includes('the intervention improved recall'));
  assert.equal(received.body.page_metadata.url, `${base}/fixture.html`);
  assert.equal(await evaluate(ui, "document.querySelector('#history img') === null"), true);
  responseMode = 'ungrounded';
  await evaluate(ui, "document.querySelector('#question').value='What is missing?';document.querySelector('#ask').click()");
  await waitFor(ui, "!!document.querySelector('.answer-ungrounded')");
  assert.equal(await evaluate(ui, "document.querySelectorAll('#history article').length"), 2);
  console.log('PASS real sidebar opening without highlight, HTML chat payload, history, grounded/ungrounded labels, safe rendering');
  responseMode = 'slow';
  await evaluate(ui, "document.querySelector('#question').value='Pending';document.querySelector('#ask').click()");
  await waitFor(ui, "!document.querySelector('#cancel').hidden");
  assert.equal(await evaluate(ui, "document.querySelector('#ask').disabled"), true);
  await evaluate(ui, "document.querySelector('#cancel').click()");
  await waitFor(ui, "document.querySelector('#status').textContent.includes('cancelled')");
  responseMode = 'error';
  await evaluate(ui, "document.querySelector('#ask').click()");
  await waitFor(ui, "document.querySelector('#status').textContent.includes('unavailable')");
  console.log('PASS chat loading, cancellation, backend failure and retryable question');
  responseMode = 'success';
  await evaluate(page, "{const r=document.createRange();r.selectNodeContents(document.querySelector('#claim'));getSelection().removeAllRanges();getSelection().addRange(r);}");
  await evaluate(ui, "document.querySelector('#mode-investigate').click();document.querySelector('#capture').click()");
  await waitFor(ui, "!document.querySelector('#investigate').disabled");
  await evaluate(ui, "document.querySelector('#investigate').click()");
  await waitFor(ui, "!document.querySelector('#evidence').hidden");
  assert.equal(received.path, '/investigate');
  assert.equal(received.body.context_range, 'paragraph');
  assert.equal(received.body.highlight, 'the intervention improved recall');
  assert.equal(await evaluate(ui, "document.querySelectorAll('#evidence a').length"), 1);
  assert.equal(await evaluate(ui, "document.querySelector('#evidence img') === null"), true);
  responseMode = 'empty';
  await evaluate(ui, "document.querySelector('#investigate').click()");
  await waitFor(ui, "document.querySelector('#evidence').textContent.includes('No evidence returned')");
  console.log('PASS sidebar investigation contract, evidence links, unsafe URL rejection and empty result');
  await evaluate(page, "history.pushState({}, '', '/another-paper')");
  await waitFor(ui, "document.querySelectorAll('#history article').length === 0");
  assert.equal(await evaluate(ui, "document.querySelector('#evidence').hidden"), true);
  const paperScript = await readFile(join(extension, 'paper-content.js'), 'utf8');
  await evaluate(page, "document.body.innerHTML='<main>Paper text<form>PRIVATE<input value=SECRET></form><nav>MENU</nav></main>'");
  assert.equal((await evaluate(page, paperScript)).pageContent, 'Paper text');
  await evaluate(page, "document.querySelector('main').textContent='x'.repeat(200001)");
  assert.match((await evaluate(page, paperScript)).error, /not sent or truncated/);
  await evaluate(page, "document.body.innerHTML='<main></main>'");
  assert.match((await evaluate(page, paperScript)).error, /No readable/);
  console.log('PASS navigation clears history/results; content excludes controls and rejects empty/oversized pages');
  if (process.argv.includes('--real-backend')) {
    await call('Page.navigate', { url: 'https://arxiv.org/html/2401.04088v1' }, page);
    await waitFor(page, "!!document.querySelector('.ltx_abstract')");
    const paperTab = (await call('Target.getTargets', { filter: [{type:'tab',exclude:false}] })).targetInfos.find(t => t.url === 'https://arxiv.org/html/2401.04088v1');
    await call('Extensions.triggerAction', { id, targetId: paperTab.targetId });
    await delay(500);
    const popupAgain = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`);
    const pui = await attach(popupAgain.targetId);
    await waitFor(pui, "!!document.querySelector('#open-sidebar')");
    await evaluate(pui, "document.querySelector('#open-sidebar').click()");
    await evaluate(ui, "document.querySelector('#backend-url').value='http://127.0.0.1:8788';document.querySelector('#save-connection').click()");
    await waitFor(ui, "document.querySelector('#connection-status').textContent.includes('Connection saved')");
    await evaluate(ui, "document.querySelector('#mode-chat').click();document.querySelector('#question').value='How many experts are used per layer and how many are selected per token?';document.querySelector('#ask').click()");
    for (let i = 0; i < 700; i++) { if (await evaluate(ui, "!document.querySelector('#ask').disabled")) break; await delay(100); }
    const result = await evaluate(ui, "({status:document.querySelector('#status').textContent, history:document.querySelector('#history').textContent,source:document.querySelector('#source').textContent})");
    console.log('LIVE BACKEND RESULT', JSON.stringify(result));
    assert.match(result.history, /Grounded in this paper/);
    assert.match(result.source, /Mixtral/);
    console.log('PASS live arXiv HTML → actual FastAPI /chat → AI grounded answer in sidebar');
  }
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  ws?.close();
  browser.kill('SIGTERM');
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
