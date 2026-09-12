import { loadSettings, saveSettings, clearSecrets, validateSettings, hostPattern } from "./settings.mjs";
import { claimPayload, requestApi, validateInvestigation } from "./api.mjs";

const $ = id => document.getElementById(id);
let connection, captured, originTabId, controller;
let busy = false;
const contextRanges = ["highlight", "paragraph", "section"];
const selectedRange = () => contextRanges[Number($("context-range").value)];
function setRange(range) { $("context-range").value = String(contextRanges.indexOf(range)); }
function message(id, text, error = false) { $(id).textContent = text; $(id).dataset.error = String(error); }
function updateActions() {
  $("investigate").disabled = busy || !captured?.highlight || !connection;
  $("capture").disabled = busy;
  $("context-range").disabled = busy;
  $("cancel").hidden = !busy;
  $("show-settings").disabled = busy;
}
function showSettings(show) {
  $("capture-view").hidden = show; $("settings-view").hidden = !show;
  $("show-capture").setAttribute("aria-pressed", String(!show));
  $("show-settings").setAttribute("aria-pressed", String(show));
}
function updateDestination() {
  if (!connection) return;
  const { settings } = connection;
  $("destination").textContent = `Send to: ${settings.backendUrl}${settings.aiEnabled ? ` · Custom model: ${settings.aiModel}. Your AI key is sent to this backend.` : " · Backend's AI configuration"}`;
}
function renderCapture() {
  $("context-range").setAttribute("aria-valuetext", ["Highlight only", "Paragraph", "Section"][Number($("context-range").value)]);
  $("evidence").hidden = true;
  message("api-status", "");
  $("result").hidden = !captured;
  if (!captured) return updateActions();
  $("page-title").textContent = captured.pageMetadata.title || "Untitled page";
  $("page-url").textContent = captured.pageMetadata.url;
  $("heading").textContent = captured.heading || "No non-empty <h1> heading found.";
  $("identifier").textContent = captured.pageMetadata.doi || captured.pageMetadata.arxivId || "No paper identifier found.";
  $("abstract").textContent = captured.pageMetadata.abstract || "No paper abstract found.";
  $("highlight").textContent = captured.highlight || "No claim selected. Highlight text on the page and reopen Paper Scout.";
  const context = captured.contexts[selectedRange()];
  $("context").textContent = context?.text || "Select a claim to preview its context.";
  $("context-label").textContent = `Context to send${context ? ` (${context.effectiveRange})` : ""}`;
  $("capture-warning").textContent = captured.selectionError || context?.warning || "";
  $("payload-details").hidden = !captured.highlight;
  $("payload").value = captured.highlight ? JSON.stringify(claimPayload(captured, selectedRange()), null, 2) : "";
  updateActions();
}
async function capturePage() {
  captured = null; originTabId = null; renderCapture();
  $("capture").disabled = true;
  message("status", "Reading the page and selection…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error("No active page found. Open an HTML paper and try again.");
    const url = new URL(tab.url || "chrome://newtab");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Open an HTTP(S) HTML page. Browser pages and local files aren't supported.");
    if (/\.pdf$/i.test(url.pathname)) throw new Error("PDFs are a stretch goal. Open the paper's HTML version to capture a claim.");
    let results;
    try { results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); }
    catch { throw new Error("Chrome couldn't read this page. Protected pages, embedded viewers, and PDFs aren't supported. Try a regular HTML page."); }
    const data = results[0]?.result;
    if (data?.status === "unsupported-pdf") throw new Error("PDFs aren't supported yet. Open an HTML version of the paper.");
    if (data?.status !== "captured") throw new Error("No capture returned. Reload the paper and try again.");
    captured = data; originTabId = tab.id;
    message("status", data.highlight ? "Claim captured. Review the context below." : "Page captured. Select a passage to investigate a claim.");
  } catch (error) { message("status", error.message, true); }
  finally { renderCapture(); updateActions(); }
}
function fillSettings() {
  const { settings: s, secrets } = connection;
  $("backend-url").value = s.backendUrl; $("backend-token").value = secrets.backendToken;
  $("default-range").value = s.contextRange; $("ai-enabled").checked = s.aiEnabled;
  $("ai-url").value = s.aiBaseUrl; $("ai-model").value = s.aiModel;
  $("ai-key").value = secrets.aiApiKey; $("remember-secrets").checked = s.rememberSecrets;
  $("ai-fields").hidden = !s.aiEnabled;
}
function readSettings() {
  return validateSettings({ backendUrl: $("backend-url").value, contextRange: $("default-range").value,
    aiEnabled: $("ai-enabled").checked, aiBaseUrl: $("ai-url").value, aiModel: $("ai-model").value,
    rememberSecrets: $("remember-secrets").checked });
}
function evidenceResults(data) {
  const container = $("evidence"); container.replaceChildren();
  const add = (parent, tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; parent.append(el); return el; };
  add(container, "h2", data.status === "insufficient_evidence" ? "Insufficient evidence" : "Investigation");
  add(container, "p", data.summary);
  for (const warning of data.warnings) add(container, "p", warning, "warning");
  for (const [category, label] of [["supports", "Supports"], ["contradicts", "Contradicts"], ["qualifies", "Qualifies"], ["related", "Related"]]) {
    add(container, "h3", label);
    if (!data[category].length) add(container, "p", "No evidence returned in this category.", "hint");
    for (const item of data[category]) {
      const article = add(container, "article", "", "evidence-item");
      const link = add(article, "a", item.title); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      add(article, "p", item.explanation);
    }
  }
  container.hidden = false;
}

$("show-settings").addEventListener("click", () => showSettings(true));
$("show-capture").addEventListener("click", () => showSettings(false));
$("capture").addEventListener("click", capturePage);
$("context-range").addEventListener("input", renderCapture);
$("ai-enabled").addEventListener("change", () => { $("ai-fields").hidden = !$("ai-enabled").checked; });
$("settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("settings-fields").disabled = true; $("test-connection").disabled = true; $("clear-keys").disabled = true; $("show-capture").disabled = true;
  try {
    const settings = readSettings();
    // Request inside this click/submit gesture, before awaiting storage or network.
    const allowed = await chrome.permissions.request({ origins: [hostPattern(settings.backendUrl)] });
    if (!allowed) throw new Error("Host access was declined. Settings were not saved.");
    connection = await saveSettings(settings, { backendToken: $("backend-token").value, aiApiKey: $("ai-key").value });
    setRange(settings.contextRange);
    updateDestination(); renderCapture();
    message("settings-status", "Connection saved. Test it below when the backend is running.");
  } catch (error) { message("settings-status", error.message, true); }
  finally { $("settings-fields").disabled = false; $("test-connection").disabled = false; $("clear-keys").disabled = false; $("show-capture").disabled = false; }
});
$("clear-keys").addEventListener("click", async () => {
  $("settings-fields").disabled = true; $("test-connection").disabled = true; $("clear-keys").disabled = true; $("show-capture").disabled = true;
  try { await clearSecrets(); connection.secrets = { backendToken: "", aiApiKey: "" }; $("backend-token").value = ""; $("ai-key").value = ""; message("settings-status", "Keys cleared from session and local storage."); }
  catch { message("settings-status", "Couldn't clear keys. Try again.", true); }
  finally { $("settings-fields").disabled = false; $("test-connection").disabled = false; $("clear-keys").disabled = false; $("show-capture").disabled = false; }
});
$("test-connection").addEventListener("click", async () => {
  $("test-connection").disabled = true;
  $("settings-fields").disabled = true; $("clear-keys").disabled = true; $("show-capture").disabled = true;
  const healthController = new AbortController();
  controller = healthController;
  message("settings-status", "Testing saved backend connection…");
  try {
    const health = await requestApi("/health", connection, { timeoutMs: 8000, signal: healthController.signal });
    if (health?.status !== "ok" || health.apiVersion !== "1.0") throw new Error("Server replied, but it doesn't match Paper Scout API v1.0. Check the backend URL and version.");
    message("settings-status", "Backend reachable · API v1.0. AI credentials and search readiness were not tested.");
  } catch (error) { message("settings-status", error.message, true); }
  finally { $("test-connection").disabled = false; $("settings-fields").disabled = false; $("clear-keys").disabled = false; $("show-capture").disabled = false; if (controller === healthController) controller = null; }
});
$("cancel").addEventListener("click", () => controller?.abort());
$("investigate").addEventListener("click", async () => {
  busy = true; updateActions(); $("evidence").hidden = true;
  const requestController = new AbortController(); controller = requestController;
  message("api-status", "Investigating the captured claim…");
  try {
    // Refuse stale snapshots after navigation. The capture's URL stays authoritative.
    const tab = await chrome.tabs.get(originTabId);
    if (tab.url !== captured.pageMetadata.url) throw new Error("The source page changed. Capture it again before investigating.");
    const data = await requestApi("/v1/investigations", connection, { payload: claimPayload(captured, selectedRange()), signal: requestController.signal });
    evidenceResults(validateInvestigation(data));
    message("api-status", "Investigation complete for the captured claim.");
  } catch (error) { message("api-status", error.message, true); }
  finally { busy = false; if (controller === requestController) controller = null; updateActions(); }
});
window.addEventListener("pagehide", () => controller?.abort());

try {
  connection = await loadSettings();
  fillSettings(); setRange(connection.settings.contextRange); updateDestination();
  $("settings-fields").disabled = false; $("test-connection").disabled = false; $("clear-keys").disabled = false;
} catch { message("settings-status", "Couldn't load settings. Reload the extension and try again.", true); }
await capturePage();
