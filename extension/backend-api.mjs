import { claimPayload, validateInvestigation, requestApi } from './api.mjs';

// Re-export the already-correct, already-validated request/response shape
// from api.mjs (the client contract in extension/BACKEND_HANDOFF.md, which
// the current backend implements at POST /v1/investigations) instead of
// duplicating validation logic here — keeps evidence-response safety rules
// (rejecting empty explanations, unsafe URLs, etc.) defined in exactly one
// place. Keeping these export names so sidepanel.mjs's call sites don't
// need to change, only the endpoint path.
export { claimPayload as investigationPayload, validateInvestigation as validateEvidence };

export function chatPayload(question, pageContent, pageMetadata) {
  return { schemaVersion: '1.0', question, pageContent, pageMetadata };
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
  validateWarnings(data.warnings);
  // The MVP backend uses this same fallback for provider/parse failures.
  if (data.answer === 'Something went wrong answering this question.') throw new Error(data.warnings.join(' ') || 'The backend could not answer. Check its AI configuration and try again.');
  return data;
}
export function backendRequest(path, connection, options) {
  if (connection.settings.aiEnabled) throw new Error('This backend uses its own AI configuration. Turn off custom AI in the popup Settings first.');
  return requestApi(path, connection, options);
}
