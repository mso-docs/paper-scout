import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigationPayload, validateEvidence, chatPayload, validateChat, safeSourceUrl, backendRequest } from '../backend-api.mjs';

const capture = { highlight: 'claim', contexts: { paragraph: { effectiveRange: 'highlight', text: 'claim' } }, pageMetadata: { title: 'Paper', url: 'https://example.org/paper' }, capturedAt: '2026-09-12T12:00:00Z' };
const valid = () => ({ schemaVersion: '1.0', status: 'complete', summary: 'Some evidence.', supports: [{ title: 'Paper', url: 'https://example.org/paper', explanation: 'Relevant.' }], contradicts: [], qualifies: [], related: [], warnings: [] });

test('backend adapter delegates to the current camelCase/schemaVersion contract, not the old snake_case shape', () => {
  const payload = investigationPayload(capture, 'paragraph');
  assert.equal(payload.schemaVersion, '1.0');
  assert.equal(payload.contextRange, 'highlight');
  assert.equal(payload.capture.requestedRange, 'paragraph');
  assert.equal('context_range' in payload, false);
  assert.equal('page_metadata' in payload, false);
});
test('evidence accepts empty results and missing links, rejects malformed categories', () => {
  const data = valid();
  assert.equal(validateEvidence(data), data);
  assert.throws(() => validateEvidence({ ...data, supports: null }));
  assert.throws(() => validateEvidence({ ...data, supports: [{ title: 'Paper', explanation: '', url: 'https://example.org' }] }));
  assert.throws(() => validateEvidence({ ...data, supports: [{ title: 'Paper', explanation: 'Relevant.', url: null }] }));
  for (const value of [null, 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.org']) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl('https://example.org/paper'), 'https://example.org/paper');
});
test('chat payload uses schemaVersion and camelCase pageContent/pageMetadata', () => {
  const payload = chatPayload('What are the limitations?', 'Extracted text…', { title: 'Paper', url: 'https://example.org/paper', authors: [] });
  assert.deepEqual(payload, { schemaVersion: '1.0', question: 'What are the limitations?', pageContent: 'Extracted text…', pageMetadata: { title: 'Paper', url: 'https://example.org/paper', authors: [] } });
});
test('chat validates schemaVersion, grounding and warnings, and distinguishes backend failures from absent evidence', () => {
  assert.equal(validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Not present', grounded: false }).grounded, false);
  assert.throws(() => validateChat({ warnings: [], answer: 'Not present', grounded: false }), /Invalid chat response/);
  assert.throws(() => validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Something went wrong answering this question.', grounded: false }), /could not answer/);
  assert.throws(() => validateChat({ schemaVersion: '1.0', warnings: [], answer: 'Answer', grounded: 'false' }));
  assert.throws(() => validateChat({ schemaVersion: '1.0', warnings: ['x'.repeat(2001)], answer: 'Answer', grounded: true }), /Invalid backend warnings/);
  assert.throws(() => backendRequest('/v1/chat', { settings: { aiEnabled: true } }), /custom AI/);
});
test('chat displays actionable AI warnings on provider failure', () => {
  assert.throws(() => validateChat({
    schemaVersion: '1.0', answer: 'Something went wrong answering this question.',
    grounded: false, warnings: ['OpenAI rejected the API key. Check backend/.env.'],
  }), /rejected the API key/);
});
