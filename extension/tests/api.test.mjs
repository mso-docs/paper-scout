import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimPayload, requestApi, validateInvestigation } from '../api.mjs';
import { DEFAULTS, serverUrl, hostPattern, validateSettings, loadSettings, saveSettings, clearSecrets } from '../settings.mjs';

function storageArea() {
  const data = {};
  return { data, setAccessLevel: async () => {},
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
    set: async values => Object.assign(data, structuredClone(values)),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; } };
}
const mockChrome = allowed => ({ permissions: { contains: async () => allowed }, storage: { local: storageArea(), session: storageArea() } });
const connection = { settings: { ...DEFAULTS }, secrets: { backendToken: 'backend-secret', aiApiKey: 'ai-secret' } };
const capture = { highlight: 'A claim', pageMetadata: { title: 'Paper', url: 'https://example.org/paper' }, capturedAt: '2026-09-12T12:00:00Z', contexts: { paragraph: { text: 'A claim', effectiveRange: 'highlight', warning: 'Missing paragraph' } } };
const valid = () => ({ schemaVersion: '1.0', status: 'complete', summary: 'Some evidence.', supports: [{ title: 'Paper', url: 'https://example.org/paper', explanation: 'Relevant because…' }], contradicts: [], qualifies: [], related: [], warnings: [] });

test('backend URLs reject insecure remote hosts and embedded secrets; preserve base paths', () => {
  assert.equal(serverUrl('http://localhost:8787/api/'), 'http://localhost:8787/api');
  assert.equal(hostPattern('https://example.org:8443/api'), 'https://example.org/*');
  for (const url of ['http://example.org', 'https://u:key@example.org', 'https://example.org?key=abc', 'https://example.org/#key', 'file:///tmp']) assert.throws(() => serverUrl(url));
  const custom = validateSettings({ ...DEFAULTS, aiEnabled: true, aiBaseUrl: 'http://host.docker.internal:11434/v1', aiModel: 'local-model' });
  assert.equal(custom.aiBaseUrl, 'http://host.docker.internal:11434/v1');
  assert.throws(() => validateSettings({ ...DEFAULTS, aiEnabled: true }));
});
test('preview payload contains actual fallback range and no keys', () => {
  const payload = claimPayload(capture, 'paragraph');
  assert.equal(payload.contextRange, 'highlight'); assert.equal(payload.capture.requestedRange, 'paragraph');
  assert.equal(JSON.stringify(payload).includes('secret'), false);
  assert.throws(() => claimPayload({}, 'paragraph'));
});
test('keys are session-only by default, can be remembered, and are removed on opt-out/clear', async () => {
  globalThis.chrome = mockChrome(true);
  await saveSettings(DEFAULTS, connection.secrets);
  assert.equal(chrome.storage.local.data.secrets, undefined);
  assert.equal((await loadSettings()).secrets.backendToken, 'backend-secret');
  await saveSettings({ ...DEFAULTS, rememberSecrets: true }, connection.secrets);
  assert.equal(chrome.storage.session.data.secrets, undefined);
  assert.equal(chrome.storage.local.data.secrets.aiApiKey, 'ai-secret');
  await saveSettings(DEFAULTS, connection.secrets);
  assert.equal(chrome.storage.local.data.secrets, undefined);
  await clearSecrets(); assert.equal((await loadSettings()).secrets.aiApiKey, '');
});
test('transport separates backend bearer token and opt-in AI overrides, blocks redirects/cookies', async () => {
  globalThis.chrome = mockChrome(true);
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(valid()); };
  await requestApi('/v1/investigations', connection, { payload: claimPayload(capture, 'paragraph') });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer backend-secret');
  assert.equal(calls[0].options.body.includes('ai-secret'), false);
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.credentials, 'omit');
  const custom = { ...connection, settings: { ...DEFAULTS, aiEnabled: true, aiBaseUrl: 'https://ai.example/v1', aiModel: 'model' } };
  await requestApi('/v1/investigations', custom, { payload: claimPayload(capture, 'paragraph') });
  assert.equal(JSON.parse(calls[1].options.body).ai.apiKey, 'ai-secret');
  await requestApi('/health', custom);
  assert.equal(calls[2].options.body, undefined);
});
test('transport refuses missing host permissions and hides backend error bodies', async () => {
  globalThis.chrome = mockChrome(false);
  globalThis.fetch = async () => { throw new Error('Must not fetch'); };
  await assert.rejects(requestApi('/health', connection), /Settings/);
  globalThis.chrome = mockChrome(true);
  globalThis.fetch = async () => new Response('secret should not be displayed', { status: 401 });
  await assert.rejects(requestApi('/health', connection), /authentication failed/);
});
test('transport handles malformed JSON, non-JSON, oversize, cancellation, and timeout', async () => {
  globalThis.chrome = mockChrome(true);
  for (const [response, message] of [
    [new Response('{', { headers: { 'content-type': 'application/json' } }), /invalid JSON/],
    [new Response('<html>'), /Expected JSON/],
    [new Response('x'.repeat(1000001), { headers: { 'content-type': 'application/json' } }), /1 MB/],
  ]) { globalThis.fetch = async () => response; await assert.rejects(requestApi('/health', connection), message); }
  globalThis.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Abort', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('Abort', 'AbortError')));
  });
  await assert.rejects(requestApi('/health', connection, { timeoutMs: 5 }), /too long/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestApi('/health', connection, { signal: controller.signal }), /cancelled/);
});
test('response contract rejects unsafe links and accepts explicit insufficient evidence', () => {
  assert.equal(validateInvestigation(valid()).status, 'complete');
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.org', 'file:///tmp/x']) {
    const response = valid(); response.supports[0].url = url; assert.throws(() => validateInvestigation(response));
  }
  assert.throws(() => validateInvestigation({ ...valid(), supports: [] }));
  assert.equal(validateInvestigation({ ...valid(), supports: [], status: 'insufficient_evidence' }).status, 'insufficient_evidence');
  assert.throws(() => validateInvestigation({ ...valid(), qualifies: undefined }));
});
