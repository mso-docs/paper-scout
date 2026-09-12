import { loadSettings } from './settings.mjs';

const menuId = 'scout-this-claim';
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: menuId, title: 'Scout this claim', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
});

// The gesture must reach open() before any asynchronous capture/storage work.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== menuId || !Number.isInteger(tab?.id)) return;
  const opening = chrome.sidePanel.open({ tabId: tab.id });
  scoutSelection(info, tab, opening).catch(console.error);
});

export async function scoutSelection(info, tab, opening) {
  const key = `scout:${tab.windowId}`;
  const id = crypto.randomUUID();
  const job = { id, tabId: tab.id, url: info.pageUrl || tab.url };
  await chrome.storage.session.set({ [key]: { ...job, state: 'capturing' } });
  try {
    await opening;
    if (info.frameId) throw new Error('Select a claim in the main HTML page. Embedded frames are not supported.');
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const capture = results[0]?.result;
    const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
    if (capture?.status !== 'captured' || !capture.highlight || normalize(capture.highlight) !== normalize(info.selectionText)) throw new Error('The selection changed or could not be captured. Select the claim again on an HTML paper.');
    if (capture.pageMetadata.url !== job.url) throw new Error('The paper changed. Select the claim again.');
    const { settings } = await loadSettings();
    if ((await chrome.storage.session.get(key))[key]?.id !== id) return;
    await chrome.storage.session.set({ [key]: { ...job, state: 'ready', capture, range: settings.contextRange } });
  } catch (error) {
    if ((await chrome.storage.session.get(key))[key]?.id !== id) return;
    await chrome.storage.session.set({ [key]: { ...job, state: 'error', error: error.message } });
  }
}
