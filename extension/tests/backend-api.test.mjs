import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigationPayload, validateEvidence, validateChat, safeSourceUrl, backendRequest } from '../backend-api.mjs';
test('backend adapter sends actual range and versioned camelCase fields', () => {
  const payload = investigationPayload({ highlight: 'claim', contexts: { paragraph: { effectiveRange: 'highlight', text: 'claim' } }, pageMetadata: { title: 'Paper' } }, 'paragraph');
  assert.equal(payload.schemaVersion, '1.0');
  assert.equal(payload.contextRange, 'highlight');
  assert.equal(payload.capture.requestedRange, 'paragraph');
  assert.deepEqual(payload.pageMetadata, { title: 'Paper' });
});
test('evidence accepts empty results and missing links, rejects malformed categories', () => {
  const data = { schemaVersion: '1.0', status: 'insufficient_evidence', warnings: [], summary: 'No evidence', supports: [], contradicts: [], qualifies: [], related: [] };
  assert.equal(validateEvidence(data).summary, data.summary);
  assert.throws(() => validateEvidence({ ...data, supports: null }));
  assert.doesNotThrow(() => validateEvidence({ ...data, supports: [{ title: 'Paper', explanation: '', url: null }] }));
  for (const value of [null, 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.org']) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl('https://example.org/paper'), 'https://example.org/paper');
});
test('chat validates grounding and distinguishes backend failures from absent evidence', () => {
  assert.equal(validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Not present', grounded: false }).grounded, false);
  assert.throws(() => validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Something went wrong answering this question.', grounded: false }), /could not answer/);
  assert.throws(() => validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Answer', grounded: 'false' }));
  assert.throws(() => backendRequest('/chat', { settings: { aiEnabled: true } }), /custom AI/);
});
