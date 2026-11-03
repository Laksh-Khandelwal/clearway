// Shared settings used by the popup and the content script.
// Assigned to globalThis (not const) so re-injecting the script never throws.
globalThis.CW_SHARED = {
  DEFAULTS: {
    profile: null,        // 'dyslexia' | 'lowVision' | 'focus' | 'motor' | null
    focusMode: false,     // hide clutter, show only the main content
    font: 'site',         // 'site' | 'sans' | 'atkinson' | 'opendyslexic'
    ruler: false,         // reading ruler that follows the mouse
    underlineLinks: false,
    reduceMotion: false,
    textScale: 100,       // percent; 100 = site default
    lineHeight: 1,        // 1 = site default, otherwise unitless line-height
    letterSpacing: 0,     // em; 0 = site default
    theme: 'none',        // 'none' | 'cream' | 'dark' | 'yellow'
    ttsRate: 1,
    scanning: false,
    scanSpeed: 2000,      // ms per item (automatic mode), 800–6000
    scanMode: 'auto'      // 'auto' = one switch, 'step' = two switches
  },

  // Each profile is applied on top of DEFAULTS.
  PROFILES: {
    dyslexia: {
      // Follows the British Dyslexia Association style guide: plain sans-serif,
      // extra letter/word spacing, ~1.5 line spacing, cream background.
      font: 'sans', theme: 'cream', lineHeight: 1.6,
      letterSpacing: 0.08, textScale: 115, ruler: true, underlineLinks: true
    },
    lowVision: {
      textScale: 160, theme: 'yellow', lineHeight: 1.6,
      letterSpacing: 0.02, underlineLinks: true
    },
    focus: {
      focusMode: true, reduceMotion: true, textScale: 110,
      lineHeight: 1.8, theme: 'cream'
    },
    motor: {
      scanning: true
    }
  }
};
