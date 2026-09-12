export const DEFAULTS = Object.freeze({
  backendUrl: "http://localhost:8787", contextRange: "paragraph",
  aiEnabled: false, aiBaseUrl: "", aiModel: "", rememberSecrets: false,
});

export function serverUrl(value, label = "Server URL", allowHttp = false) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error(`${label} must be a complete HTTP(S) URL.`); }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (local || allowHttp))) {
    throw new Error(`${label} must use HTTPS, or HTTP on localhost/127.0.0.1.`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} cannot contain credentials, a query, or a fragment.`);
  return url.href.replace(/\/+$/, "");
}

export function hostPattern(baseUrl) {
  const url = new URL(serverUrl(baseUrl));
  // Chrome match patterns grant a scheme/host, not a specific port or path.
  return `${url.protocol}//${url.hostname}/*`;
}

export function validateSettings(input) {
  const settings = {
    backendUrl: serverUrl(input.backendUrl, "Paper Scout backend URL"),
    contextRange: input.contextRange,
    aiEnabled: Boolean(input.aiEnabled),
    aiBaseUrl: input.aiBaseUrl.trim() ? serverUrl(input.aiBaseUrl, "AI server URL", true) : "",
    aiModel: input.aiModel.trim(),
    rememberSecrets: Boolean(input.rememberSecrets),
  };
  if (!["highlight", "paragraph", "section"].includes(settings.contextRange)) throw new Error("Choose a valid default context range.");
  if (settings.aiEnabled && (!settings.aiBaseUrl || !settings.aiModel)) throw new Error("Custom AI settings require an AI server URL and model name.");
  if (settings.aiModel.length > 200) throw new Error("Model name must be at most 200 characters.");
  return settings;
}

export async function loadSettings() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const [local, session] = await Promise.all([chrome.storage.local.get(["settings", "secrets"]), chrome.storage.session.get("secrets")]);
  const settings = { ...DEFAULTS, ...local.settings };
  return { settings, secrets: { backendToken: "", aiApiKey: "", ...(settings.rememberSecrets ? local.secrets : session.secrets) } };
}

export async function saveSettings(input, secrets) {
  const settings = validateSettings(input);
  const clean = { backendToken: secrets.backendToken.trim(), aiApiKey: secrets.aiApiKey.trim() };
  if (Object.values(clean).some(value => value.length > 4096 || /[\r\n]/.test(value))) throw new Error("Keys must be a single line and at most 4,096 characters.");
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  if (settings.rememberSecrets) {
    await chrome.storage.local.set({ settings, secrets: clean });
    await chrome.storage.session.remove("secrets");
  } else {
    await chrome.storage.session.set({ secrets: clean });
    await chrome.storage.local.set({ settings });
    await chrome.storage.local.remove("secrets");
  }
  return { settings, secrets: clean };
}

export async function clearSecrets() {
  await Promise.all([chrome.storage.local.remove("secrets"), chrome.storage.session.remove("secrets")]);
}
