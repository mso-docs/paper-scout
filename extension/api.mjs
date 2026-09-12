import { hostPattern, serverUrl } from "./settings.mjs";

export function claimPayload(capture, requestedRange) {
  const context = capture?.contexts?.[requestedRange];
  if (!capture?.highlight || !context) throw new Error("Highlight a claim in the page and capture it first.");
  return {
    schemaVersion: "1.0",
    highlight: capture.highlight,
    contextRange: context.effectiveRange,
    context: context.text,
    pageMetadata: capture.pageMetadata,
    capture: { capturedAt: capture.capturedAt, requestedRange, warnings: context.warning ? [context.warning] : [] },
  };
}

export function validateInvestigation(data) {
  const fail = () => { throw new Error("The backend returned an incompatible investigation response. Check its Paper Scout API version."); };
  if (!data || data.schemaVersion !== "1.0" || typeof data.summary !== "string" || !data.summary.trim() || data.summary.length > 20000 || !["complete", "insufficient_evidence"].includes(data.status)) fail();
  const categories = ["supports", "contradicts", "qualifies", "related"];
  for (const category of categories) {
    if (!Array.isArray(data[category]) || data[category].length > 50) fail();
    for (const item of data[category]) {
      if (!item || typeof item.title !== "string" || !item.title.trim() || item.title.length > 1000 || typeof item.explanation !== "string" || !item.explanation.trim() || item.explanation.length > 10000) fail();
      let url;
      try { url = new URL(item.url); } catch { fail(); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail();
    }
  }
  if (!Array.isArray(data.warnings) || data.warnings.length > 20 || data.warnings.some(w => typeof w !== "string" || w.length > 2000)) fail();
  if (data.status === "complete" && categories.every(c => data[c].length === 0)) fail();
  return data;
}

// Called only from extension UI, never from a page/content-script message.
export async function requestApi(path, { settings, secrets }, { payload, signal, timeoutMs = 60000 } = {}) {
  const base = serverUrl(settings.backendUrl);
  if (!await chrome.permissions.contains({ origins: [hostPattern(base)] })) throw new Error("Open Settings and save the connection to allow access to this backend.");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const headers = { Accept: "application/json" };
  if (secrets.backendToken) headers.Authorization = `Bearer ${secrets.backendToken}`;
  let body;
  if (payload) {
    headers["Content-Type"] = "application/json";
    body = { ...payload };
    if (settings.aiEnabled) {
      body.ai = { baseUrl: serverUrl(settings.aiBaseUrl, "AI server URL", true), model: settings.aiModel };
      if (secrets.aiApiKey) body.ai.apiKey = secrets.aiApiKey;
    }
  }
  try {
    const response = await fetch(`${base}${path}`, {
      method: payload ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
      credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) {
      const messages = { 401: "Backend authentication failed. Check the backend token in Settings.", 403: "The backend refused this request. Check access and custom AI policy.", 404: "This backend endpoint is not implemented. Check the URL and server's Paper Scout API support.", 413: "The backend rejected the capture as too large.", 422: "The backend rejected the capture or custom AI settings. Check the configuration and try again.", 429: "The backend is rate limited. Wait before trying again.", 503: "The backend's AI or search services are unavailable. Try again later." };
      throw new Error(messages[response.status] || `Backend request failed (HTTP ${response.status}). Try again later.`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Expected JSON from the Paper Scout backend. Check the server URL.");
    // Read a bounded response, including chunked responses without Content-Length.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "", size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1000000) { await reader.cancel(); throw new Error("Backend response exceeds the 1 MB limit."); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new Error("The backend returned invalid JSON."); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timedOut ? "The backend took too long. Try again later." : "Request cancelled.");
    if (error instanceof TypeError) throw new Error("Couldn't reach the backend. Check its URL, host permission, and whether the server is running.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
