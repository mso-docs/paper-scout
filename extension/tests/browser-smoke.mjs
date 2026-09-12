// Real Chromium popup/content-script integration with a local, in-memory API double.
// Usage: CHROMIUM=/usr/bin/chromium node extension/tests/browser-smoke.mjs (Node 22+).
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
    res.end(JSON.stringify({ schemaVersion: '1.0', status: 'complete', summary: 'Fixture evidence only — no AI was called.', supports: [{ title: '<img src=x onerror=alert(1)>', url: 'https://example.org/evidence', explanation: 'A test source.' }], contradicts: [], qualifies: [], related: [], warnings: [] })); return;
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
  const targetId = (await call('Target.createTarget', { url: `${base}/fixture.html` })).targetId;
  const page = await attach(targetId);
  await waitFor(page, "!!document.querySelector('#claim')");
  await evaluate(page, "{const r=document.createRange();r.selectNodeContents(document.querySelector('#claim'));window.getSelection().removeAllRanges();window.getSelection().addRange(r);}");
  const tab = (await call('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] })).targetInfos.find(t => t.url === `${base}/fixture.html`);
  await call('Extensions.triggerAction', { id, targetId: tab.targetId });
  let popup;
  for (let i = 0; i < 50; i++) { popup = (await call('Target.getTargets')).targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`); if (popup) break; await delay(100); }
  assert.ok(popup, 'Toolbar action opened popup');
  const ui = await attach(popup.targetId);
  await waitFor(ui, "document.querySelector('#highlight')?.textContent.includes('the intervention')");
  assert.equal(await evaluate(ui, "document.querySelector('#highlight').textContent"), 'the intervention improved recall');
  assert.match(await evaluate(ui, "document.querySelector('#context').textContent"), /Larger trials/);
  await evaluate(ui, "document.querySelector('#context-range').value='2';document.querySelector('#context-range').dispatchEvent(new Event('input'))");
  assert.match(await evaluate(ui, "document.querySelector('#context').textContent"), /other populations/);
  assert.equal(await evaluate(ui, "document.querySelector('#context-range').getAttribute('aria-valuetext')"), 'Section');
  await evaluate(ui, "document.querySelector('#context-range').value='0';document.querySelector('#context-range').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate(ui, "document.querySelector('#context').textContent"), 'the intervention improved recall');
  console.log('PASS selection survives toolbar action; paragraph and section previews');
  await evaluate(ui, `document.querySelector('#show-settings').click();document.querySelector('#backend-url').value=${JSON.stringify(base)};document.querySelector('#backend-token').value='fixture-token';document.querySelector('#save-settings').click()`);
  await waitFor(ui, "document.querySelector('#settings-status').textContent.includes('Connection saved')");
  assert.equal(await evaluate(ui, "chrome.storage.local.get('secrets').then(x=>!!x.secrets)"), false);
  await evaluate(ui, "document.querySelector('#test-connection').click()");
  await waitFor(ui, "document.querySelector('#settings-status').textContent.includes('Backend reachable')");
  console.log('PASS settings save, session-only token, host permission and real HTTP health check');
  await evaluate(ui, "document.querySelector('#show-capture').click();document.querySelector('#investigate').click()");
  await waitFor(ui, "!document.querySelector('#evidence').hidden");
  assert.equal(received.body.highlight, 'the intervention improved recall');
  assert.equal(received.authorization, 'Bearer fixture-token');
  assert.equal(received.body.ai, undefined);
  assert.equal(await evaluate(ui, "document.querySelector('#evidence img') === null"), true);
  assert.match(await evaluate(ui, "document.querySelector('#evidence').textContent"), /<img src=x/);
  console.log('PASS explicit investigation request, four evidence groups and safe text rendering');
  await evaluate(ui, "document.querySelector('#show-settings').click();document.querySelector('#ai-enabled').checked=true;document.querySelector('#ai-enabled').dispatchEvent(new Event('change'));document.querySelector('#ai-url').value='http://host.docker.internal:11434/v1';document.querySelector('#ai-model').value='fixture-model';document.querySelector('#ai-key').value='fixture-ai-key';document.querySelector('#save-settings').click()");
  await waitFor(ui, "!document.querySelector('#settings-fields').disabled");
  await evaluate(ui, "document.querySelector('#show-capture').click();document.querySelector('#investigate').click()");
  await waitFor(ui, "!document.querySelector('#evidence').hidden");
  assert.equal(received.body.ai.baseUrl, 'http://host.docker.internal:11434/v1');
  assert.equal(received.body.ai.apiKey, 'fixture-ai-key');
  assert.equal(await evaluate(ui, "document.querySelector('#payload').value.includes('fixture-ai-key')"), false);
  console.log('PASS custom AI settings are opt-in and absent from capture preview');
  responseMode = 'auth-error';
  await evaluate(ui, "document.querySelector('#investigate').click()");
  await waitFor(ui, "document.querySelector('#api-status').textContent.includes('authentication failed')");
  assert.equal(await evaluate(ui, "document.querySelector('#evidence').hidden"), true);
  assert.equal(await evaluate(ui, "document.body.textContent.includes('DO NOT DISPLAY SECRET')"), false);
  responseMode = 'slow';
  await evaluate(ui, "document.querySelector('#investigate').click()");
  await delay(150);
  await evaluate(ui, "document.querySelector('#cancel').click()");
  await waitFor(ui, "document.querySelector('#api-status').textContent.includes('cancelled')");
  console.log('PASS API failure clears stale evidence; cancellation releases UI');
  // Cross-paragraph selection has no enclosing paragraph, but section is valid.
  await evaluate(page, "{const r=document.createRange();r.setStart(document.querySelector('#claim-paragraph').firstChild,0);r.setEndAfter(document.querySelector('#second-paragraph'));window.getSelection().removeAllRanges();window.getSelection().addRange(r);}");
  await evaluate(ui, "document.querySelector('#capture').click()");
  await waitFor(ui, "document.querySelector('#capture-warning').textContent.includes('No single paragraph')");
  console.log('PASS real DOM cross-paragraph fallback');
  await evaluate(page, "history.pushState({}, '', '/another-paper')");
  await evaluate(ui, "document.querySelector('#investigate').click()");
  await waitFor(ui, "document.querySelector('#api-status').textContent.includes('source page changed')");
  console.log('PASS stale URL capture cannot be submitted');
  await evaluate(ui, "document.querySelector('#show-settings').click();document.querySelector('#clear-keys').click()");
  await waitFor(ui, "document.querySelector('#settings-status').textContent.includes('Keys cleared')");
  const shot = await call('Page.captureScreenshot', {}, ui);
  const screenshot = join(tmpdir(), 'paper-scout-settings.png');
  await writeFile(screenshot, Buffer.from(shot.data, 'base64')); console.log(`Settings screenshot: ${screenshot}`);
  await evaluate(ui, "document.querySelector('#show-capture').click()");
  const captureShot = await call('Page.captureScreenshot', {}, ui);
  await writeFile(join(tmpdir(), 'paper-scout-capture.png'), Buffer.from(captureShot.data, 'base64'));
  if (process.argv.includes('--real-papers')) {
    const contentScript = await readFile(join(extension, 'content.js'), 'utf8');
    for (const url of ['https://arxiv.org/abs/1706.03762', 'https://arxiv.org/abs/2609.11916', 'https://arxiv.org/html/2401.04088v1']) {
      const paperTarget = (await call('Target.createTarget', { url })).targetId;
      const paper = await attach(paperTarget);
      await waitFor(paper, "!!document.querySelector('blockquote.abstract, .ltx_abstract')");
      await evaluate(paper, `{
        const root = document.querySelector('.ltx_abstract .ltx_p, blockquote.abstract');
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node; while ((node = walker.nextNode())) { if (node.textContent.trim().length > 80) break; }
        if (!node) throw new Error('No abstract passage found');
        const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(node.length, 100));
        getSelection().removeAllRanges(); getSelection().addRange(range);
      }`);
      const capture = await evaluate(paper, contentScript);
      assert.equal(capture.status, 'captured');
      assert.equal(capture.pageMetadata.url, url);
      assert.ok(capture.pageMetadata.title);
      assert.ok(capture.pageMetadata.abstract?.length > 100);
      assert.ok(capture.pageMetadata.arxivId);
      assert.ok(capture.highlight);
      assert.equal(capture.contexts.paragraph.effectiveRange, 'paragraph');
      assert.equal(capture.contexts.paragraph.warning, null);
      assert.ok(capture.contexts.paragraph.text.length > capture.highlight.length);
      for (const [level, context] of Object.entries(capture.contexts)) {
        assert.ok(context.text.includes(capture.highlight), `${url}: ${level} preserves highlight`);
        assert.ok(context.text.length <= 24000);
        if (context.effectiveRange === 'highlight') assert.equal(context.text, capture.highlight);
        if (level !== 'highlight' && context.effectiveRange === 'highlight') assert.ok(context.warning);
      }
      console.log(`PASS real paper ${url}: ${JSON.stringify({ title: capture.pageMetadata.title, abstractLength: capture.pageMetadata.abstract.length, contexts: Object.fromEntries(Object.entries(capture.contexts).map(([k,v]) => [k, { range: v.effectiveRange, length: v.text.length, warning: v.warning }])) })}`);
      await call('Target.closeTarget', { targetId: paperTarget });
    }
  }
  console.log('PASS real Chromium smoke check (local API double; no backend or AI implementation)');
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  ws?.close();
  browser.kill('SIGTERM');
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
