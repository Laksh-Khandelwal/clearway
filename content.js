// Clearway content script.
// Runs on every page. Reads settings from chrome.storage.local and applies them.
(() => {
  // If an older copy is running (e.g. after the extension was reloaded), shut it down first.
  if (window.__clearway) {
    try { window.__clearway.teardown(); } catch (e) { /* old context is gone */ }
  }

  const DEFAULTS = globalThis.CW_SHARED.DEFAULTS;
  let settings = { ...DEFAULTS };
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const safeSend = (msg) => {
    try { return chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { return Promise.resolve(); }
  };
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  // After the extension is reloaded or removed, this copy loses its connection to Chrome.
  const contextAlive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  // Another Clearway (e.g. an older copy loaded from a different folder) already on this page?
  const otherCopy = [...document.querySelectorAll('#clearway-host')]
    .some((h) => h.dataset.ext && h.dataset.ext !== chrome.runtime.id);

  // ------------------------------------------------------------------
  // Our own UI lives in a shadow root attached to <html>, outside <body>,
  // so page styles, our theme overrides and focus mode never touch it.
  // ------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = 'clearway-host';
  host.dataset.ext = chrome.runtime.id;
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      [hidden] { display: none !important; }
      * { box-sizing: border-box; }
      .dim { position: fixed; left: 0; right: 0; background: rgba(10, 20, 15, 0.55); pointer-events: none; }
      .dim.top { top: 0; border-bottom: 3px solid #ffb703; }
      .dim.bottom { bottom: 0; border-top: 3px solid #ffb703; }
      .scan-box {
        position: fixed; pointer-events: none; border: 5px solid #ffb703; border-radius: 8px;
        box-shadow: 0 0 0 3px #0b2e20, 0 0 22px 4px rgba(255, 183, 3, 0.75);
        transition: top .12s, left .12s, width .12s, height .12s;
      }
      .scan-box.group { border-style: dashed; background: rgba(255, 183, 3, 0.10); }
      .scan-box.flash { background: rgba(255, 183, 3, 0.4); }
      .scan-box.still { transition: none; }
      .scan-label {
        position: fixed; pointer-events: none; max-width: min(360px, 90vw);
        font: 700 15px/1.3 system-ui, sans-serif; color: #fff; background: #0b2e20;
        border: 2px solid #ffb703; border-radius: 6px; padding: 4px 9px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .panel {
        position: fixed; font: 15px/1.4 system-ui, sans-serif; color: #fff; background: #0b6e4f;
        border: 3px solid #fff; outline: 3px solid #0b6e4f; border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,.35); padding: 12px;
      }
      .scan-panel { right: 18px; bottom: 18px; width: 280px; }
      .tts-panel { left: 18px; bottom: 18px; display: flex; gap: 8px; align-items: center; }
      .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .panel-title { font-weight: 700; font-size: 16px; }
      button.mini { padding: 5px 9px; font-size: 13px; text-align: center; white-space: nowrap; flex: none; }
      .speed-row { display: flex; gap: 6px; align-items: center; margin-top: 10px; padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,.35); font-size: 13px; }
      .speed-text { flex: 1; }
      .panel-hint { font-size: 14px; margin: 4px 0 10px; }
      .controls { display: grid; gap: 6px; }
      button {
        font: 600 15px/1.2 system-ui, sans-serif; color: #0b2e20; background: #fff;
        border: 0; border-radius: 6px; padding: 9px 10px; text-align: left; cursor: pointer;
      }
      button:hover { background: #e6f4ee; }
      button:focus-visible { outline: 3px solid #ffb703; outline-offset: 2px; }
      .tts-panel button { text-align: center; }
      .panel-status { font-size: 13px; margin-top: 10px; opacity: .9; }
      .toast {
        position: fixed; top: 18px; left: 50%; transform: translateX(-50%); max-width: 80vw;
        font: 600 15px/1.4 system-ui, sans-serif; color: #fff; background: #0b2e20;
        border: 2px solid #ffb703; border-radius: 8px; padding: 10px 16px;
        box-shadow: 0 6px 24px rgba(0,0,0,.35);
      }
    </style>
    <div class="dim top" hidden></div>
    <div class="dim bottom" hidden></div>
    <div class="scan-box" hidden></div>
    <div class="scan-label" hidden></div>
    <div class="panel scan-panel" role="region" aria-label="Clearway switch scanning" hidden>
      <div class="panel-head">
        <span class="panel-title">Switch scanning</span>
        <button type="button" class="mini" data-ui="off">Turn off</button>
      </div>
      <div class="panel-hint"></div>
      <div class="controls">
        <button type="button" data-act="down">Scroll down</button>
        <button type="button" data-act="up">Scroll up</button>
        <button type="button" data-act="back">Go back</button>
        <button type="button" data-act="read">Read page aloud</button>
      </div>
      <div class="panel-status" aria-live="polite"></div>
      <div class="speed-row">
        <span class="speed-text"></span>
        <button type="button" class="mini" data-ui="slower">Slower</button>
        <button type="button" class="mini" data-ui="faster">Faster</button>
      </div>
    </div>
    <div class="panel tts-panel" role="region" aria-label="Clearway read aloud" hidden>
      <span>Reading aloud</span>
      <button type="button" data-tts="toggle">Pause</button>
      <button type="button" data-tts="stop">Stop</button>
    </div>
    <div class="toast" role="status" aria-live="polite" hidden></div>
  `;
  document.documentElement.appendChild(host);
  const $ = (s) => shadow.querySelector(s);
  const ui = {
    dimTop: $('.dim.top'), dimBottom: $('.dim.bottom'), box: $('.scan-box'), label: $('.scan-label'),
    scanPanel: $('.scan-panel'), scanHint: $('.panel-hint'), scanStatus: $('.panel-status'),
    speedRow: $('.speed-row'), speedText: $('.speed-text'),
    ttsPanel: $('.tts-panel'), ttsToggle: $('[data-tts="toggle"]'), toast: $('.toast')
  };

  let toastTimer = null;
  function toast(text, ms = 2600) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
  }

  // ------------------------------------------------------------------
  // Page styles (text size, spacing, font, themes, motion, focus mode)
  // ------------------------------------------------------------------
  const styleEl = document.createElement('style');
  styleEl.id = 'clearway-style';
  (document.head || document.documentElement).appendChild(styleEl);

  const TEXT = 'p, li, dd, dt, blockquote, figcaption, td, th, label, h1, h2, h3, h4, h5, h6';
  const NOT_MEDIA = ':not(img):not(video):not(svg):not(svg *):not(canvas):not(iframe):not(picture)';
  const NOT_ICON = ':not(i):not([class*="icon"]):not([class*="Icon"]):not([class^="fa"]):not([class*=" fa"])' +
    ':not(.material-icons):not([class*="material-symbols"]):not(code):not(pre):not(pre *):not(kbd):not(samp)';
  const THEMES = {
    cream:  { bg: '#f8f1e3', fg: '#2a2a2a', link: '#0b4f9c', border: '#cdbf9f' },
    dark:   { bg: '#15171a', fg: '#e9e9e9', link: '#8ab4f8', border: '#555' },
    yellow: { bg: '#000000', fg: '#ffff00', link: '#00ffff', border: '#ffff00' }
  };
  const FONTS = {
    sans: { family: "Verdana, 'CW Atkinson', Arial, sans-serif", load: 'atkinson' },
    atkinson: { family: "'CW Atkinson', Verdana, Arial, sans-serif", load: 'atkinson' },
    opendyslexic: { family: "'OpenDyslexic', Verdana, sans-serif", load: 'opendyslexic' }
  };
  const FONT_FILES = {
    atkinson: { name: 'CW Atkinson', files: [['Atkinson-Regular.woff2', '400'], ['Atkinson-Bold.woff2', '700']] },
    opendyslexic: { name: 'OpenDyslexic', files: [['OpenDyslexic-Regular.woff2', '400'], ['OpenDyslexic-Bold.woff2', '700']] }
  };

  function buildCSS(s) {
    let css = `
      .cw-hidden { display: none !important; }
      html body .cw-reading { outline: 3px solid #ffb703 !important; outline-offset: 3px !important;
        background-color: rgba(255, 183, 3, 0.22) !important; border-radius: 4px; }
    `;
    if (s.textScale !== 100) css += `body { zoom: ${s.textScale / 100} !important; }`;
    if (s.lineHeight > 1) {
      css += `body :is(${TEXT}) { line-height: ${s.lineHeight} !important; }
              body p { margin-bottom: ${Math.min(2, s.lineHeight * 0.6).toFixed(2)}em !important; }`;
    }
    if (s.letterSpacing > 0) {
      css += `body :is(${TEXT}, span, a) { letter-spacing: ${s.letterSpacing}em !important;
              word-spacing: ${(s.letterSpacing * 1.5).toFixed(3)}em !important; }`;
    }
    const font = FONTS[s.font];
    if (font) css += `body, body *${NOT_ICON} { font-family: ${font.family} !important; }`;
    const t = THEMES[s.theme];
    if (t) {
      css += `
        html, body, body *${NOT_MEDIA} {
          background-color: ${t.bg} !important; color: ${t.fg} !important; border-color: ${t.border} !important; }
        body a[href], body a[href] * { color: ${t.link} !important; }
        body ::placeholder { color: ${t.fg} !important; opacity: .7; }
      `;
    }
    if (s.underlineLinks || s.theme === 'yellow') {
      css += `body a[href] { text-decoration: underline !important; text-underline-offset: 3px !important;
              text-decoration-thickness: 2px !important; }`;
    }
    if (s.reduceMotion) {
      css += `*, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important; scroll-behavior: auto !important; }`;
    }
    if (s.focusMode) {
      css += `
        .cw-focus-path { display: block !important; width: auto !important; max-width: none !important;
          min-width: 0 !important; margin: 0 !important; padding: 0 !important; float: none !important;
          position: static !important; transform: none !important; columns: auto !important; }
        .cw-focus-root { display: block !important; max-width: 46rem !important; width: auto !important;
          margin: 2rem auto !important; padding: 1.5rem !important; float: none !important; position: static !important; }
        .cw-focus-root img, .cw-focus-root video { max-width: 100% !important; height: auto !important; }
      `;
    }
    return css;
  }

  // Fonts are loaded from the extension as bytes, so page font CSP rules don't block them.
  const fontsLoaded = new Set();
  async function ensureFont(key) {
    if (!key || fontsLoaded.has(key)) return;
    fontsLoaded.add(key);
    const { name, files } = FONT_FILES[key];
    try {
      for (const [file, weight] of files) {
        const buf = await (await fetch(chrome.runtime.getURL('fonts/' + file))).arrayBuffer();
        const face = new FontFace(name, buf, { weight });
        await face.load();
        document.fonts.add(face);
      }
    } catch (e) {
      console.warn('Clearway: could not load font ' + name + ', using fallback.', e);
    }
  }

  // ------------------------------------------------------------------
  // Finding the main content.
  // 1) Mozilla Readability (the engine behind Firefox Reader View) extracts the article
  //    from a copy of the page.
  // 2) Each extracted paragraph is matched back to the real element on the page by its
  //    text, so we can highlight it while reading and find its container for focus mode.
  // 3) If Readability can't find an article, fall back to a simple paragraph-density guess.
  // ------------------------------------------------------------------
  const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dd, dt, td, th, pre';
  const LEAF = BLOCKS + ', div';
  const leafBlocks = (scope) => [...scope.querySelectorAll(LEAF)].filter((el) => !el.querySelector(LEAF));

  function commonAncestor(els) {
    if (!els.length) return null;
    let anc = els[0];
    for (const el of els.slice(1)) {
      while (anc && !anc.contains(el)) anc = anc.parentElement;
    }
    return anc;
  }

  function runReadability() {
    if (typeof Readability !== 'function') return null;
    let article;
    try {
      const clone = document.cloneNode(true);
      clone.querySelectorAll('#clearway-host, #clearway-style').forEach((n) => n.remove());
      article = new Readability(clone, { charThreshold: 300 }).parse();
    } catch (e) {
      console.warn('Clearway: Readability failed', e);
      return null;
    }
    if (!article || !article.content) return null;

    const parsed = new DOMParser().parseFromString(article.content, 'text/html');
    const wanted = leafBlocks(parsed.body).map((el) => norm(el.textContent)).filter((t) => t.length > 1);
    if (!wanted.length) return null;

    // Index the live page's blocks by their text.
    const live = new Map();
    for (const el of leafBlocks(document.body)) {
      const t = norm(el.textContent);
      if (t.length < 2) continue;
      if (!live.has(t)) live.set(t, []);
      live.get(t).push(el);
    }

    const blocks = [];
    let matchedChars = 0, totalChars = 0;
    for (const text of wanted) {
      totalChars += text.length;
      const candidates = live.get(text);
      const el = candidates && candidates.length ? candidates.shift() : null;
      if (el) matchedChars += text.length;
      blocks.push({ el, text });
    }

    // Read the headline first (Readability keeps it separate from the body).
    const title = norm(article.title);
    if (title && !wanted.slice(0, 3).some((t) => t === title)) {
      const h1 = [...document.querySelectorAll('h1')].find((h) => {
        const t = norm(h.textContent);
        return t && (t === title || title.startsWith(t) || t.startsWith(title));
      });
      blocks.unshift({ el: h1 || null, text: title });
    }

    // Container for focus mode: common ancestor of the matched, substantial paragraphs.
    let root = null;
    if (matchedChars / totalChars >= 0.5) {
      const anchors = blocks.filter((b) => b.el && b.text.length >= 40).map((b) => b.el);
      root = commonAncestor(anchors.length >= 2 ? anchors : blocks.filter((b) => b.el).map((b) => b.el));
      // Pull in the headline if it sits just outside the body container.
      const h1 = blocks[0] && blocks[0].el;
      if (root && h1 && h1.tagName === 'H1' && !root.contains(h1)) {
        const wider = commonAncestor([root, h1]);
        if (wider && wider.textContent.length <= root.textContent.length * 1.5 + 800) root = wider;
      }
      if (root === document.body || root === document.documentElement) root = null;
    }
    return { source: 'readability', blocks, root };
  }

  // Fallback when there is no clear article (search results, app pages...).
  function guessMainContent() {
    const paragraphs = [...document.body.querySelectorAll('p')]
      .filter((p) => p.textContent.trim().length > 60 && !p.closest('nav, aside, footer, header'));
    if (!paragraphs.length) return document.querySelector('main, [role="main"], article') || document.body;
    const scores = new Map();
    for (const p of paragraphs) {
      const len = p.textContent.length;
      let el = p.parentElement;
      for (let depth = 0; el && el !== document.body && depth < 2; depth++, el = el.parentElement) {
        scores.set(el, (scores.get(el) || 0) + len / (depth + 1));
      }
    }
    let best = null, bestScore = 0;
    for (const [el, score] of scores) if (score > bestScore) { best = el; bestScore = score; }
    return best || document.body;
  }

  function runHeuristic() {
    const root = guessMainContent();
    const blocks = [...root.querySelectorAll(BLOCKS)]
      .filter((el) => !el.querySelector(BLOCKS) &&
        !el.closest('.cw-hidden, nav, aside, footer, header, form, [aria-hidden="true"], [role="navigation"]') &&
        el.getClientRects().length > 0)
      .map((el) => ({ el, text: norm(el.innerText) }))
      // Skip tiny bits like "Share", "Tweet", "12 comments".
      .filter((b) => b.text.split(' ').length >= 4 || /^H[1-3]$/.test(b.el.tagName));
    return { source: 'heuristic', blocks, root: root === document.body ? null : root };
  }

  let analysis = null;
  function analyzePage() {
    const fresh = analysis && analysis.href === location.href &&
      (!analysis.root || analysis.root.isConnected) && Date.now() - analysis.at < 15000;
    if (fresh) return analysis;
    analysis = runReadability();
    if (!analysis || !analysis.root) {
      const fallback = runHeuristic();
      // Keep Readability's text if it found one; just use the heuristic container for focus mode.
      analysis = analysis ? { ...analysis, root: fallback.root } : fallback;
    }
    analysis.href = location.href;
    analysis.at = Date.now();
    return analysis;
  }

  // ------------------------------------------------------------------
  // Focus mode: hide everything except the main content
  // ------------------------------------------------------------------
  const CLUTTER = 'aside, nav, [role="complementary"], [role="navigation"], iframe, ins.adsbygoogle, ' +
    '[id^="google_ads"], [class*="advert"], [aria-label="advertisement" i], [class*="newsletter"], ' +
    '[class*="cookie-banner"], [class*="social-share"]';
  let focusState = null;
  let focusFailed = false;   // so we only warn once

  function enableFocus() {
    if (focusState || focusFailed) return;
    const root = analyzePage().root;
    if (!root) {
      focusFailed = true;
      toast('Focus mode could not find a main article on this page.');
      return;
    }
    const hidden = [], path = [];
    let node = root;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const sib of parent.children) {
        if (sib !== node && !['SCRIPT', 'STYLE', 'LINK'].includes(sib.tagName) && sib !== host) {
          sib.classList.add('cw-hidden');
          hidden.push(sib);
        }
      }
      if (parent !== document.body) { parent.classList.add('cw-focus-path'); path.push(parent); }
      node = parent;
    }
    root.querySelectorAll(CLUTTER).forEach((el) => { el.classList.add('cw-hidden'); hidden.push(el); });
    root.classList.add('cw-focus-root');
    focusState = { root, hidden, path };
    window.scrollTo(0, 0);
  }

  function disableFocus() {
    focusFailed = false;
    if (!focusState) return;
    focusState.hidden.forEach((el) => el.classList.remove('cw-hidden'));
    focusState.path.forEach((el) => el.classList.remove('cw-focus-path'));
    focusState.root.classList.remove('cw-focus-root');
    focusState = null;
  }

  // ------------------------------------------------------------------
  // Reading ruler
  // ------------------------------------------------------------------
  let rulerY = Math.round(window.innerHeight / 3);
  function positionRuler() {
    const band = Math.round(60 * (settings.textScale / 100) * Math.max(1, settings.lineHeight / 1.5));
    ui.dimTop.style.height = Math.max(0, rulerY - band / 2) + 'px';
    ui.dimBottom.style.top = (rulerY + band / 2) + 'px';
  }
  on(window, 'mousemove', (e) => {
    if (!settings.ruler) return;
    rulerY = e.clientY;
    positionRuler();
  }, { passive: true });
  on(document, 'focusin', (e) => {
    if (!settings.ruler || !(e.target instanceof Element)) return;
    const r = e.target.getBoundingClientRect();
    rulerY = r.top + r.height / 2;
    positionRuler();
  });
  function setRuler(show) {
    ui.dimTop.hidden = ui.dimBottom.hidden = !show;
    if (show) positionRuler();
  }

  // ------------------------------------------------------------------
  // Read aloud (speech runs in the background worker via chrome.tts)
  // ------------------------------------------------------------------
  const tts = { queue: [], idx: 0, active: false, paused: false, token: 0, el: null };

  // Short chunks avoid speech engines cutting off long utterances.
  function splitText(text, max = 220) {
    const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) || [text];
    const out = [];
    let cur = '';
    const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (const s of sentences) {
      if (s.length > max) {
        for (const w of s.split(/\s+/)) {
          if ((cur + ' ' + w).length > max) push();
          cur += w + ' ';
        }
      } else {
        if ((cur + s).length > max) push();
        cur += s;
      }
    }
    push();
    return out;
  }

  function markReading(el) {
    if (tts.el) tts.el.classList.remove('cw-reading');
    tts.el = el;
    if (!el || !el.isConnected) return;
    el.classList.add('cw-reading');
    const r = el.getBoundingClientRect();
    if (r.height && (r.top < 0 || r.bottom > window.innerHeight)) {
      el.scrollIntoView({ block: 'center', behavior: settings.reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function readingPlan() {
    const selection = norm(window.getSelection());
    if (selection) return { selection: true, blocks: [{ el: null, text: selection }] };
    return { selection: false, blocks: analyzePage().blocks };
  }

  function readStart() {
    readStop(true);
    const plan = readingPlan();
    tts.queue = [];
    for (const b of plan.blocks) for (const chunk of splitText(b.text)) tts.queue.push({ el: b.el, text: chunk });
    if (!tts.queue.length) { toast('There is no text to read on this page.'); return; }
    tts.idx = 0; tts.active = true; tts.paused = false;
    ui.ttsPanel.hidden = false;
    ui.ttsToggle.textContent = 'Pause';
    toast(plan.selection ? 'Reading your selection' : 'Reading the main article');
    speakCurrent();
  }

  function speakCurrent() {
    if (!tts.active || tts.paused) return;
    if (tts.idx >= tts.queue.length) { readStop(); toast('Finished reading'); return; }
    const item = tts.queue[tts.idx];
    markReading(item.el);
    safeSend({ type: 'tts-speak', text: item.text, rate: settings.ttsRate, token: ++tts.token });
  }

  function readPauseToggle() {
    if (!tts.active) return;
    if (tts.paused) {
      tts.paused = false;
      ui.ttsToggle.textContent = 'Pause';
      speakCurrent();            // restarts the current sentence
    } else {
      tts.paused = true;
      tts.token++;               // ignore the "interrupted" event from stopping
      ui.ttsToggle.textContent = 'Resume';
      safeSend({ type: 'tts-stop' });
    }
  }

  function readStop(silent) {
    const wasActive = tts.active;
    tts.active = false; tts.paused = false; tts.token++;
    markReading(null);
    ui.ttsPanel.hidden = true;
    if (wasActive || !silent) safeSend({ type: 'tts-stop' });
  }

  ui.ttsToggle.addEventListener('click', readPauseToggle);
  $('[data-tts="stop"]').addEventListener('click', () => readStop());

  // ------------------------------------------------------------------
  // Switch scanning
  //
  // Automatic (one switch): the highlight moves on its own; press Space/Enter when it
  // reaches what you want. To avoid waiting through every link, it scans in two steps:
  // first groups (rows of nearby controls), then the items inside the chosen group.
  //
  // Step (two switches): Space moves the highlight, Enter selects. No waiting.
  // ------------------------------------------------------------------
  const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
    '[role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], ' +
    '[contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  const TYPING_INPUTS = ['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number',
    'date', 'datetime-local', 'month', 'week', 'time'];
  const GROUP_SIZE = 6;
  const FLAT_LIMIT = 8;     // with this many page items or fewer, skip the group step
  const scan = { on: false, paused: false, level: 'top', list: [], idx: -1, timer: null, restartTimer: null };

  function isEditable(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName === 'INPUT') return TYPING_INPUTS.includes((el.getAttribute('type') || '').toLowerCase());
    return false;
  }

  function isOnScreen(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
    // Skip things covered by something else (modals, overlays).
    const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (hit && hit !== host && !(hit === el || el.contains(hit) || hit.contains(el))) return false;
    return true;
  }

  function labelOf(el) {
    const text = el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') ||
      el.getAttribute('placeholder') || el.getAttribute('alt') ||
      (el.querySelector('img[alt]') && el.querySelector('img[alt]').getAttribute('alt')) || el.tagName.toLowerCase();
    return norm(text).slice(0, 60);
  }

  function unionRect(rects) {
    let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
    for (const r of rects) {
      if (!r.width && !r.height) continue;
      top = Math.min(top, r.top); left = Math.min(left, r.left);
      bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
    }
    return top === Infinity ? { top: 0, left: 0, width: 0, height: 0 } :
      { top, left, width: right - left, height: bottom - top };
  }

  function pageItems() {
    const candidates = [...document.body.querySelectorAll(FOCUSABLE)].filter((el) =>
      !el.disabled && !el.closest('.cw-hidden, [inert], [aria-hidden="true"]') && isOnScreen(el));
    // If a focusable wraps another focusable, keep only the inner one.
    const els = candidates.filter((el) => !candidates.some((o) => o !== el && el.contains(o))).slice(0, 90);
    return els.map((el) => ({
      kind: 'page', el, label: labelOf(el) || 'Unnamed control',
      rect: () => el.getBoundingClientRect(), run: () => activatePage(el)
    }));
  }

  function controlItems() {
    return [...shadow.querySelectorAll('.scan-panel [data-act]')].map((b) => ({
      kind: 'control', act: b.dataset.act, label: b.textContent,
      rect: () => b.getBoundingClientRect(), run: () => runControlItem(b.dataset.act)
    }));
  }

  function groupItem(members, label) {
    const g = { kind: 'group', members, label, rect: () => unionRect(members.map((m) => m.rect())) };
    g.run = members.length === 1 ? members[0].run : () => enterGroup(g);
    return g;
  }

  // Top-level list: either every item (small pages) or groups of nearby items.
  function buildTop() {
    const controls = controlItems();
    const items = pageItems();
    if (items.length <= FLAT_LIMIT) return [...controls, ...items];
    // Group in page order, starting a new group at each page region (menu, sidebar, form...)
    // so a group never spans unrelated parts of the page.
    const REGION = 'nav, aside, header, footer, form, ul, ol, table, [role="navigation"], [role="banner"], ' +
      '[role="complementary"], [role="contentinfo"], [role="search"], [role="toolbar"], [role="menu"], main, article, section';
    const runs = [];
    let cur = [], curRegion = null, curTop = 0;
    for (const it of items) {
      const region = it.el.closest(REGION);
      const top = it.rect().top;
      if (cur.length && (region !== curRegion || Math.abs(top - curTop) > 200)) { runs.push(cur); cur = []; }
      if (!cur.length) { curRegion = region; curTop = top; }
      cur.push(it);
    }
    if (cur.length) runs.push(cur);
    // Split long runs into evenly sized groups (e.g. 7 items -> 4 + 3, not 6 + 1).
    const groups = [];
    for (const run of runs) {
      const parts = Math.ceil(run.length / GROUP_SIZE);
      const size = Math.ceil(run.length / parts);
      for (let i = 0; i < run.length; i += size) groups.push(run.slice(i, i + size));
    }
    return [
      groupItem(controls, 'Scroll, go back, read aloud'),
      ...groups.map((g) => groupItem(g, g.map((m) => m.label).slice(0, 3).join(' · ') + (g.length > 3 ? ' …' : '')))
    ];
  }

  function showTop() {
    clearTimeout(scan.timer);
    clearTimeout(scan.restartTimer);
    if (!scan.on || scan.paused) return;
    scan.level = 'top';
    scan.list = buildTop();
    scan.idx = -1;
    advance();
  }

  function enterGroup(g) {
    scan.level = 'inside';
    scan.group = g;
    scan.list = [...g.members, { kind: 'exit', label: 'Back to all groups', rect: g.rect, run: showTop }];
    scan.idx = -1;
    advance();
  }

  function updateHint() {
    let hint;
    if (settings.scanMode === 'step') hint = 'Space moves the highlight. Enter selects it. Esc pauses.';
    else if (scan.level === 'inside') hint = 'Press Space when the item you want is highlighted.';
    else if (scan.list.some((i) => i.kind === 'group')) hint = 'Wait for the box to reach the area you want, then press Space.';
    else hint = 'Wait for the box to reach what you want, then press Space.';
    ui.scanHint.textContent = hint;
    ui.speedRow.hidden = settings.scanMode === 'step';
    ui.speedText.textContent = `${(settings.scanSpeed / 1000).toFixed(1)} s each`;
  }

  function drawItem(item) {
    const r = item.rect();
    const pad = 4;
    Object.assign(ui.box.style, {
      top: (r.top - pad) + 'px', left: (r.left - pad) + 'px',
      width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px'
    });
    ui.box.classList.toggle('still', settings.reduceMotion);
    ui.box.classList.toggle('group', item.kind === 'group' || item.kind === 'exit');
    ui.box.hidden = false;

    const prefix = item.kind === 'group' && item.members.length > 1 ? `Group (${item.members.length}): ` : '';
    ui.label.textContent = prefix + item.label;
    ui.label.hidden = false;
    const above = r.top - pad - 34;
    ui.label.style.top = (above > 4 ? above : r.top + r.height + pad + 6) + 'px';
    ui.label.style.left = Math.max(4, Math.min(r.left - pad, window.innerWidth - ui.label.offsetWidth - 8)) + 'px';

    const where = scan.level === 'inside' ? 'Inside group' : 'Choose';
    ui.scanStatus.textContent = `${where}: ${scan.idx + 1} of ${scan.list.length}`;
    updateHint();
  }

  function advance() {
    clearTimeout(scan.timer);
    if (!scan.on || scan.paused || !scan.list.length) return;
    scan.idx++;
    if (scan.idx >= scan.list.length) {
      // In automatic mode, one unanswered pass through a group returns to the groups.
      if (scan.level === 'inside' && settings.scanMode === 'auto') { showTop(); return; }
      scan.idx = 0;
      if (scan.level === 'top') scan.list = buildTop();   // refresh once per loop
    }
    const item = scan.list[scan.idx];
    if (item.kind === 'page' && (!item.el.isConnected || !isOnScreen(item.el))) { showTop(); return; }
    drawItem(item);
    if (settings.scanMode === 'auto') {
      // A little extra time on the first item, so there's time to react.
      scan.timer = setTimeout(advance, settings.scanSpeed * (scan.idx === 0 ? 1.5 : 1));
    }
  }

  function selectCurrent() {
    const item = scan.list[scan.idx];
    if (!item) return;
    clearTimeout(scan.timer);
    ui.box.classList.add('flash');
    setTimeout(() => ui.box.classList.remove('flash'), 250);
    item.run();
  }

  function showTopSoon(ms = 500) {
    clearTimeout(scan.timer);
    clearTimeout(scan.restartTimer);
    scan.restartTimer = setTimeout(showTop, ms);
  }

  function runControl(act) {
    const behavior = settings.reduceMotion ? 'auto' : 'smooth';
    if (act === 'down') window.scrollBy({ top: window.innerHeight * 0.8, behavior });
    if (act === 'up') window.scrollBy({ top: -window.innerHeight * 0.8, behavior });
    if (act === 'back') history.back();
    if (act === 'read') { if (tts.active) readStop(); else readStart(); }
  }

  function runControlItem(act) {
    runControl(act);
    if (act === 'down' || act === 'up') {
      // Stay on the same scroll button so pressing again keeps scrolling.
      const keepIdx = scan.idx;
      clearTimeout(scan.restartTimer);
      scan.restartTimer = setTimeout(() => {
        if (!scan.on || scan.paused) return;
        const list = scan.list;
        if (list[keepIdx] && list[keepIdx].kind === 'control') { scan.idx = keepIdx - 1; advance(); }
        else showTop();
      }, 600);
    } else {
      showTopSoon(500);
    }
  }

  function activatePage(el) {
    if (!el.isConnected) { showTopSoon(0); return; }
    if (isEditable(el)) {
      el.focus();
      if (el.tagName === 'SELECT' && el.showPicker) { try { el.showPicker(); } catch (e) { /* ignore */ } }
      scanPause('Typing. Press Esc when you are done to go back to scanning.');
      return;
    }
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    el.click();
    showTopSoon(500);
  }

  function scanPause(message) {
    scan.paused = true;
    clearTimeout(scan.timer);
    clearTimeout(scan.restartTimer);
    ui.box.hidden = true;
    ui.label.hidden = true;
    ui.scanStatus.textContent = message || 'Paused. Press Esc to resume.';
  }

  function scanResume() {
    scan.paused = false;
    showTop();
  }

  function scanStart() {
    if (scan.on) return;
    scan.on = true; scan.paused = false;
    ui.scanPanel.hidden = false;
    showTop();
  }

  function scanStop() {
    if (!scan.on) return;
    scan.on = false;
    clearTimeout(scan.timer);
    clearTimeout(scan.restartTimer);
    ui.box.hidden = true;
    ui.label.hidden = true;
    ui.scanPanel.hidden = true;
  }

  on(window, 'keydown', (e) => {
    if (!scan.on) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (scan.paused) {
        if (isEditable(document.activeElement)) document.activeElement.blur();
        scanResume();
      } else {
        scanPause();
      }
      return;
    }
    if (scan.paused || isEditable(e.target)) return;
    const step = settings.scanMode === 'step';
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (step && e.key === ' ') advance();
      else selectCurrent();
    }
  }, true);
  // Stop the page from also reacting to the key release (e.g. Space activating a focused button).
  on(window, 'keyup', (e) => {
    if (scan.on && !scan.paused && (e.key === ' ' || e.key === 'Enter') && !isEditable(e.target)) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  on(document, 'visibilitychange', () => {
    if (!scan.on || scan.paused) return;
    if (document.hidden) clearTimeout(scan.timer); else showTop();
  });
  // Mouse-only buttons on the panel (not part of the scan cycle), e.g. for a helper.
  function saveSetting(patch) {
    if (!contextAlive()) { teardown(); return; }
    chrome.storage.local.set(patch).catch(() => teardown());
  }
  shadow.querySelector('[data-ui="off"]').addEventListener('click', () =>
    saveSetting({ scanning: false, profile: settings.profile === 'motor' ? null : settings.profile }));
  shadow.querySelector('[data-ui="slower"]').addEventListener('click', () =>
    saveSetting({ scanSpeed: Math.min(6000, settings.scanSpeed + 500) }));
  shadow.querySelector('[data-ui="faster"]').addEventListener('click', () =>
    saveSetting({ scanSpeed: Math.max(800, settings.scanSpeed - 500) }));

  shadow.querySelectorAll('.scan-panel [data-act]').forEach((b) =>
    b.addEventListener('click', () => { runControl(b.dataset.act); showTopSoon(); }));

  // ------------------------------------------------------------------
  // Applying settings
  // ------------------------------------------------------------------
  function pauseAutoplayVideos() {
    document.querySelectorAll('video[autoplay]').forEach((v) => { if (!v.paused) v.pause(); });
  }

  function apply(prev) {
    styleEl.textContent = buildCSS(settings);
    if (FONTS[settings.font]) ensureFont(FONTS[settings.font].load);
    if (settings.focusMode) enableFocus(); else disableFocus();
    setRuler(settings.ruler);
    if (settings.reduceMotion) pauseAutoplayVideos();
    if (settings.scanning) scanStart(); else scanStop();
    if (prev && scan.on && !scan.paused &&
        (prev.scanMode !== settings.scanMode || prev.scanSpeed !== settings.scanSpeed)) showTop();
  }

  chrome.storage.local.get(DEFAULTS).then((stored) => {
    settings = { ...DEFAULTS, ...stored };
    apply(null);
  });

  const onStorage = (changes, area) => {
    if (area !== 'local') return;
    const prev = { ...settings };
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue === undefined ? DEFAULTS[key] : newValue;
    }
    apply(prev);
  };
  chrome.storage.onChanged.addListener(onStorage);

  const onMessage = (msg, sender, sendResponse) => {
    switch (msg && msg.type) {
      case 'ping': break;
      case 'read-start': readStart(); break;
      case 'read-pause-toggle': readPauseToggle(); break;
      case 'read-stop': readStop(); break;
      case 'read-toggle': if (tts.active) readStop(); else readStart(); break;
      case 'get-read-plan': {   // used for testing: what would be read, without speaking
        const plan = readingPlan();
        const a = analysis || {};
        sendResponse({ texts: plan.blocks.map((b) => b.text), source: a.source,
          highlighted: plan.blocks.filter((b) => b.el).length,
          rootWords: a.root ? a.root.innerText.split(/\s+/).length : 0, root: a.root ? a.root.tagName + '#' + a.root.id + '.' + a.root.className : null });
        return;
      }
      case 'tts-event':
        if (msg.token !== tts.token || !tts.active || tts.paused) break;
        if (msg.event === 'end') { tts.idx++; speakCurrent(); }
        else if (msg.event === 'error') { toast('Speech failed. Check that your system has a text-to-speech voice.'); readStop(); }
        break;
      default: return;
    }
    sendResponse({ ok: true, reading: tts.active, paused: tts.paused });
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // ------------------------------------------------------------------
  // Teardown (used when a newer copy of this script is injected)
  // ------------------------------------------------------------------
  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    clearInterval(watchdog);
    scanStop();
    tts.active = false;
    markReading(null);
    disableFocus();
    cleanups.forEach((fn) => fn());
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (e) { /* ignore */ }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (e) { /* ignore */ }
    host.remove();
    styleEl.remove();
    if (window.__clearway && window.__clearway.teardown === teardown) delete window.__clearway;
  }
  // If the extension was reloaded or removed, remove this copy instead of leaving it running.
  const watchdog = setInterval(() => { if (!contextAlive()) teardown(); }, 2000);
  window.__clearway = { teardown };

  if (otherCopy) {
    toast('Two copies of Clearway are installed. Remove the older one in chrome://extensions, then reload this page.', 9000);
  }
})();
