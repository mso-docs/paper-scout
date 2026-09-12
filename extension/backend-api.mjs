import { claimPayload, requestApi } from './api.mjs';

export function investigationPayload(capture, range) {
  const data = claimPayload(capture, range);
  return { highlight: data.highlight, context_range: data.contextRange, context: data.context, page_metadata: data.pageMetadata };
}
export function validateEvidence(data) {
  if (!data || typeof data.summary !== 'string' || !data.summary.trim()) throw new Error('Invalid investigation response.');
  for (const key of ['supporting', 'contradicting', 'qualifying', 'related']) {
    if (!Array.isArray(data[key]) || data[key].length > 50 || data[key].some(item => !item || typeof item.title !== 'string' || !item.title.trim() || typeof item.why !== 'string' || !(item.url == null || typeof item.url === 'string'))) throw new Error('Invalid evidence response.');
  }
  return data;
}
export function safeSourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validateChat(data) {
  if (!data || typeof data.answer !== 'string' || !data.answer.trim() || typeof data.grounded !== 'boolean') throw new Error('Invalid chat response.');
  // The MVP backend uses this same fallback for provider/parse failures.
  if (data.answer === 'Something went wrong answering this question.') throw new Error('The backend could not answer. Check its AI configuration and try again.');
  return data;
}
export function backendRequest(path, connection, options) {
  if (connection.settings.aiEnabled) throw new Error('This backend uses its own AI configuration. Turn off custom AI in the popup Settings first.');
  return requestApi(path, connection, options);
}
