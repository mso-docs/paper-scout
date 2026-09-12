import { claimPayload, requestApi } from './api.mjs';

export function investigationPayload(capture, range) {
  return claimPayload(capture, range);
}
export function validateEvidence(data) {
  if (!data || data.schemaVersion !== '1.0' || typeof data.summary !== 'string' || !data.summary.trim() || !['complete', 'insufficient_evidence'].includes(data.status)) throw new Error('Invalid investigation response.');
  const result = { summary: data.summary, warnings: validateWarnings(data.warnings) };
  for (const [wire, display] of [['supports', 'supporting'], ['contradicts', 'contradicting'], ['qualifies', 'qualifying'], ['related', 'related']]) {
    if (!Array.isArray(data[wire]) || data[wire].length > 50 || data[wire].some(item => !item || typeof item.title !== 'string' || !item.title.trim() || typeof item.explanation !== 'string' || !(item.url == null || typeof item.url === 'string'))) throw new Error('Invalid evidence response.');
    result[display] = data[wire].map(item => ({ title: item.title, url: item.url, why: item.explanation }));
  }
  return result;
}
function validateWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.length > 20 || warnings.some(w => typeof w !== 'string' || w.length > 2000)) throw new Error('Invalid backend warnings.');
  return warnings;
}

export function safeSourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validateChat(data) {
  if (!data || data.schemaVersion !== '1.0' || typeof data.answer !== 'string' || !data.answer.trim() || typeof data.grounded !== 'boolean') throw new Error('Invalid chat response.');
  // The MVP backend uses this same fallback for provider/parse failures.
  if (data.answer === 'Something went wrong answering this question.') throw new Error('The backend could not answer. Check its AI configuration and try again.');
  validateWarnings(data.warnings);
  return data;
}
export function backendRequest(path, connection, options) {
  if (connection.settings.aiEnabled) throw new Error('This backend uses its own AI configuration. Turn off custom AI in the popup Settings first.');
  return requestApi(path, connection, options);
}
