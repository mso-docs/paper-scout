import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigationPayload, validateEvidence, validateChat, safeSourceUrl, backendRequest } from '../backend-api.mjs';
test('backend adapter sends actual range and snake_case fields', () => {
  const payload = investigationPayload({ highlight: 'claim', contexts: { paragraph: { effectiveRange: 'highlight', text: 'claim' } }, pageMetadata: { title: 'Paper' } }, 'paragraph');
  assert.deepEqual(payload, { highlight: 'claim', context_range: 'highlight', context: 'claim', page_metadata: { title: 'Paper' } });
});
test('evidence accepts empty results and missing links, rejects malformed categories', () => {
  const data = { summary: 'No evidence', supporting: [], contradicting: [], qualifying: [], related: [] };
  assert.equal(validateEvidence(data), data);
  assert.throws(() => validateEvidence({ ...data, supporting: null }));
  assert.doesNotThrow(() => validateEvidence({ ...data, supporting: [{ title: 'Paper', why: '', url: null }] }));
  for (const value of [null, 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.org']) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl('https://example.org/paper'), 'https://example.org/paper');
});
test('chat validates grounding and distinguishes backend failures from absent evidence', () => {
  assert.equal(validateChat({ answer: 'Not present', grounded: false }).grounded, false);
  assert.throws(() => validateChat({ answer: 'Something went wrong answering this question.', grounded: false }), /could not answer/);
  assert.throws(() => validateChat({ answer: 'Answer', grounded: 'false' }));
  assert.throws(() => backendRequest('/chat', { settings: { aiEnabled: true } }), /custom AI/);
});
