// Clearway background service worker.
// 1) Speaks text with chrome.tts (works without a click on the page itself).
// 2) Handles keyboard shortcuts.
// 3) Adds the content script to tabs that were already open at install time.

const SCRIPTS = ['shared.js', 'lib/Readability.js', 'content.js'];

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !/^https?:/.test(tab.url || '')) continue;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: SCRIPTS }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'tts-speak') {
    const tabId = sender.tab && sender.tab.id;
    chrome.tts.speak(msg.text, {
      rate: msg.rate || 1,
      enqueue: false,
      onEvent: (event) => {
        if (tabId == null) return;
        if (['end', 'error', 'interrupted', 'cancelled'].includes(event.type)) {
          chrome.tabs.sendMessage(tabId, { type: 'tts-event', event: event.type, token: msg.token })
            .catch(() => {});
        }
      }
    });
  } else if (msg.type === 'tts-stop') {
    chrome.tts.stop();
  }
  sendResponse({ ok: true });
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function toggleSetting(key) {
  const current = await chrome.storage.local.get({ [key]: false });
  await chrome.storage.local.set({ [key]: !current[key], profile: null });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-focus') return toggleSetting('focusMode');
  if (command === 'toggle-scan') return toggleSetting('scanning');
  if (command === 'read-aloud') {
    const tab = await activeTab();
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'read-toggle' }).catch(() => {});
  }
});
