const { DEFAULTS, PROFILES } = globalThis.CW_SHARED;
const KEEP_PROFILE = ['ttsRate', 'scanSpeed', 'scanMode', 'profile'];   // changing these doesn't break a profile
let s = { ...DEFAULTS };

const statusEl = document.getElementById('status');
function showStatus(text) { statusEl.textContent = text; statusEl.hidden = !text; }

// ---------- Display helpers ----------
const FORMAT = {
  ttsRate: (v) => `${Number(v).toFixed(1)}×`,
  textScale: (v) => (Number(v) === 100 ? 'Site default' : `${v}%`),
  lineHeight: (v) => (Number(v) <= 1 ? 'Site default' : Number(v).toFixed(1)),
  letterSpacing: (v) => (Number(v) === 0 ? 'Site default' : `${Number(v).toFixed(2)} em`),
  scanSpeed: (v) => `${(v / 1000).toFixed(1)} s on each item`
};

function render() {
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach((el) => {
    el.checked = !!s[el.dataset.key];
  });
  document.querySelectorAll('input[type="range"][data-key]').forEach((el) => {
    el.value = s[el.dataset.key];
    document.getElementById(el.id + '-out').textContent = FORMAT[el.dataset.key](s[el.dataset.key]);
  });
  for (const key of ['theme', 'font', 'scanMode']) {
    document.querySelectorAll(`input[name="${key}"]`).forEach((el) => { el.checked = el.value === s[key]; });
  }
  const speedRow = document.getElementById('speed-row');
  speedRow.classList.toggle('off', s.scanMode === 'step');
  document.getElementById('scanSpeed').disabled = s.scanMode === 'step';
  document.querySelectorAll('.sign').forEach((el) => {
    el.setAttribute('aria-pressed', String(s.profile === el.dataset.profile));
  });
}

function save(patch) {
  const touchesProfile = Object.keys(patch).some((k) => !KEEP_PROFILE.includes(k));
  if (touchesProfile && !('profile' in patch)) patch.profile = null;
  Object.assign(s, patch);
  render();
  return chrome.storage.local.set(patch);
}

// ---------- Talking to the page ----------
async function sendToTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    // The page was open before Clearway was installed: add the script now and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared.js', 'lib/Readability.js', 'content.js'] });
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e2) {
      showStatus('Clearway can’t change this page. Browser pages and the Chrome Web Store are protected. Open a normal website to use it.');
      return null;
    }
  }
}

function updateReadButtons(state) {
  const reading = !!(state && state.reading);
  document.getElementById('read-pause').disabled = !reading;
  document.getElementById('read-stop').disabled = !reading;
  document.getElementById('read-pause').textContent = state && state.paused ? 'Resume' : 'Pause';
}

// ---------- Wire up controls ----------
document.querySelectorAll('input[type="checkbox"][data-key]').forEach((el) => {
  el.addEventListener('change', () => save({ [el.dataset.key]: el.checked }));
});

document.querySelectorAll('input[type="range"][data-key]').forEach((el) => {
  const key = el.dataset.key;
  el.addEventListener('input', () => {
    document.getElementById(el.id + '-out').textContent = FORMAT[key](el.value);
  });
  el.addEventListener('change', () => save({ [key]: Number(el.value) }));
});

for (const key of ['theme', 'font', 'scanMode']) {
  document.querySelectorAll(`input[name="${key}"]`).forEach((el) => {
    el.addEventListener('change', () => { if (el.checked) save({ [key]: el.value }); });
  });
}

document.querySelectorAll('.sign').forEach((el) => {
  el.addEventListener('click', () => {
    const name = el.dataset.profile;
    const keep = { ttsRate: s.ttsRate, scanSpeed: s.scanSpeed, scanMode: s.scanMode };
    if (s.profile === name) {
      save({ ...DEFAULTS, ...keep, profile: null });          // pressing an active profile turns it off
    } else {
      save({ ...DEFAULTS, ...PROFILES[name], ...keep, profile: name });
    }
  });
});

document.getElementById('read-start').addEventListener('click', async () => {
  updateReadButtons(await sendToTab({ type: 'read-start' }));
});
document.getElementById('read-pause').addEventListener('click', async () => {
  updateReadButtons(await sendToTab({ type: 'read-pause-toggle' }));
});
document.getElementById('read-stop').addEventListener('click', async () => {
  updateReadButtons(await sendToTab({ type: 'read-stop' }));
});

document.getElementById('reset').addEventListener('click', () => save({ ...DEFAULTS }));

// ---------- Start ----------
chrome.storage.local.get(DEFAULTS).then((stored) => {
  s = { ...DEFAULTS, ...stored };
  render();
});
sendToTab({ type: 'ping' }).then(updateReadButtons);
