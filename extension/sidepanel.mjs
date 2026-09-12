import { loadSettings, saveContextRange, saveSettings, hostPattern } from './settings.mjs';
import { investigationPayload, validateEvidence, validateChat, safeSourceUrl, backendRequest } from './backend-api.mjs';
const $ = id => document.getElementById(id);
let connection, capture, source, controller, busy = false, generation = 0;
const message = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };
const add = (parent, tag, text, className = '') => { const el = document.createElement(tag); el.textContent = text; el.className = className; parent.append(el); return el; };
function actions() {
  for (const id of ['capture', 'range', 'ask', 'clear-history', 'save-connection']) $(id).disabled = busy || !connection;
  $('investigate').disabled = busy || !connection || !capture?.highlight;
  $('cancel').hidden = !busy;
  $('chat-form').setAttribute('aria-busy', String(busy));
}
function preview() {
  $('highlight').textContent = capture?.highlight || 'Highlight a claim on the paper, then capture it.';
  const context = capture?.contexts[$('range').value];
  $('context').textContent = context?.text || '';
  $('warning').textContent = capture?.selectionError || context?.warning || '';
  actions();
}
function resetSource() {
  generation++; controller?.abort(); capture = null; source = null;
  $('history').replaceChildren(); $('evidence').hidden = true; $('question').value = '';
  $('source').textContent = 'Page changed. Capture a claim or ask about the current page. If access is denied, reopen Paper Scout from the toolbar.';
  preview();
}
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error('No active paper found.');
  let url; try { url = new URL(tab.url); } catch { throw new Error('Open Paper Scout from the toolbar on the current HTML paper to allow access.'); }
  if (!['http:', 'https:'].includes(url.protocol) || /\.pdf$/i.test(url.pathname)) throw new Error('Open an HTTP(S) HTML paper. PDFs and browser pages are not supported.');
  return tab;
}
async function extract(tab, file) {
  let results;
  try { results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] }); }
  catch { throw new Error('Cannot read this page. Open Paper Scout from its toolbar button on the HTML paper and retry.'); }
  const data = results[0]?.result;
  if (!data || data.status === 'unsupported-pdf') throw new Error('No HTML content returned. PDFs are not supported.');
  if (data.error) throw new Error(data.error);
  return data;
}
async function assertSource(tab) {
  const current = await currentTab();
  if (current.id !== tab.id || current.url !== tab.url) throw new Error('The source page changed. Try again on the current paper.');
}
function setSource(tab, metadata) {
  source = { id: tab.id, url: tab.url };
  $('source').textContent = `${metadata.title || 'Untitled page'} — ${tab.url}`;
}
async function run(label, task) {
  if (busy) return;
  busy = true; controller = new AbortController(); const signal = controller.signal; const version = generation;
  actions(); message(label);
  try { connection = await loadSettings(); await task(signal); if (version === generation) message('Complete.'); }
  catch (error) { if (version === generation) message(signal.aborted ? 'Request cancelled.' : error.message, true); }
  finally { busy = false; controller = null; actions(); }
}
for (const mode of ['investigate', 'chat']) $(`mode-${mode}`).addEventListener('click', () => {
  for (const name of ['investigate', 'chat']) { $(`${name}-view`).hidden = mode !== name; $(`mode-${name}`).setAttribute('aria-pressed', String(mode === name)); }
});
$('capture').addEventListener('click', () => run('Reading selection…', async signal => {
  capture = null; $('evidence').hidden = true; preview();
  const tab = await currentTab(); const data = await extract(tab, 'content.js'); await assertSource(tab); signal.throwIfAborted();
  if (source && (source.id !== tab.id || source.url !== tab.url)) $('history').replaceChildren();
  capture = data; setSource(tab, data.pageMetadata); preview();
}));
$('range').addEventListener('change', () => { preview(); saveContextRange($('range').value).catch(error => message(error.message, true)); });
async function investigate(signal) {
  $('evidence').hidden = true;
  const tab = source; await assertSource(tab);
  const data = validateEvidence(await backendRequest('/investigate', connection, { payload: investigationPayload(capture, $('range').value), signal }));
  await assertSource(tab); signal.throwIfAborted();
  const container = $('evidence'); container.replaceChildren();
  add(container, 'h2', 'Investigation'); add(container, 'p', data.summary);
  if (['supporting', 'contradicting', 'qualifying', 'related'].every(key => !data[key].length)) add(container, 'p', 'No evidence returned. This does not establish whether the claim is true.', 'warning');
  for (const [key, label] of [['supporting', 'Supporting'], ['contradicting', 'Conflicting'], ['qualifying', 'Qualifying'], ['related', 'Related']]) {
    add(container, 'h3', label);
    if (!data[key].length) add(container, 'p', 'No evidence in this category.', 'hint');
    for (const item of data[key]) {
      const article = add(container, 'article', '', 'card'); const url = safeSourceUrl(item.url);
      const title = add(article, url ? 'a' : 'strong', item.title);
      if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
      add(article, 'p', item.why);
    }
  }
  container.hidden = false;
}
$('investigate').addEventListener('click', () => run('Investigating claim…', investigate));
$('chat-form').addEventListener('submit', event => {
  event.preventDefault(); const question = $('question').value.trim();
  if (!question) return message('Enter a question about this paper.', true);
  run('Reading paper and answering…', async signal => {
    const tab = await currentTab();
    const metadata = await extract(tab, 'content.js');
    const paper = await extract(tab, 'paper-content.js');
    await assertSource(tab); signal.throwIfAborted();
    if (paper.url !== tab.url || metadata.pageMetadata.url !== tab.url) throw new Error('The source page changed. Submit again.');
    if (source && (source.id !== tab.id || source.url !== tab.url)) $('history').replaceChildren();
    setSource(tab, metadata.pageMetadata);
    const data = validateChat(await backendRequest('/chat', connection, { payload: { question, page_content: paper.pageContent, page_metadata: metadata.pageMetadata }, signal }));
    await assertSource(tab); signal.throwIfAborted();
    const entry = add($('history'), 'article', '', `card answer-${data.grounded ? 'grounded' : 'ungrounded'}`);
    add(entry, 'h3', 'You'); add(entry, 'p', question);
    add(entry, 'h3', data.grounded ? 'Grounded in this paper' : 'Not established by this paper'); add(entry, 'p', data.answer);
    $('question').value = ''; entry.scrollIntoView({ block: 'nearest' });
  });
});
$('clear-history').addEventListener('click', () => $('history').replaceChildren());
$('cancel').addEventListener('click', () => controller?.abort());
$('connection-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const backendUrl = $('backend-url').value;
    const allowed = await chrome.permissions.request({ origins: [hostPattern(backendUrl)] });
    if (!allowed) throw new Error('Backend host access was declined.');
    const latest = await loadSettings();
    connection = await saveSettings({ ...latest.settings, backendUrl }, { ...latest.secrets, backendToken: $('backend-token').value });
    $('connection-status').textContent = 'Connection saved. Uses the backend’s AI configuration.';
  } catch (error) { $('connection-status').textContent = error.message; }
});
chrome.tabs.onActivated.addListener(async info => {
  const window = await chrome.windows.getCurrent();
  if (info.windowId === window.id) { resetSource(); message(''); }
});
chrome.tabs.onUpdated.addListener((id, change) => { if (source?.id === id && (change.url || change.status === 'loading')) { resetSource(); message(''); } });
window.addEventListener('pagehide', () => controller?.abort());
try {
  connection = await loadSettings(); $('backend-url').value = connection.settings.backendUrl; $('backend-token').value = connection.secrets.backendToken; $('range').value = connection.settings.contextRange;
} catch { message('Could not load connection settings. Reload the extension.', true); }
preview();

// Session storage bridges a cold sidebar start and an already-open sidebar.
const scoutWindow = await chrome.windows.getCurrent();
const scoutKey = `scout:${scoutWindow.id}`;
let latestScout;
async function receiveScout(job) {
  if (!job) return;
  latestScout = job;
  generation++; controller?.abort();
  $('evidence').hidden = true;
  $('mode-investigate').click();
  if (job.state === 'capturing') { message('Capturing selected claim…'); return; }
  if (job.state === 'error') { message(job.error, true); return; }
  while (busy) await new Promise(resolve => setTimeout(resolve, 20));
  if (latestScout !== job) return;
  await run('Investigating selected claim…', async signal => {
    await assertSource({ id: job.tabId, url: job.url });
    signal.throwIfAborted();
    capture = job.capture; $('range').value = job.range;
    setSource({ id: job.tabId, url: job.url }, capture.pageMetadata); preview();
    await investigate(signal);
  });
  if ((await chrome.storage.session.get(scoutKey))[scoutKey]?.id === job.id) await chrome.storage.session.remove(scoutKey);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[scoutKey]?.newValue) receiveScout(changes[scoutKey].newValue).catch(error => message(error.message, true));
});
const initialScout = (await chrome.storage.session.get(scoutKey))[scoutKey];
if (!latestScout && initialScout) await receiveScout(initialScout);
