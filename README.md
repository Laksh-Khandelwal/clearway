# Clearway

**A Chrome extension that adapts any website to the person using it: easier to read, easier to hear, and usable without a mouse.**

Built for BOOTUP Hackathon by AIDS4LYF.

![Dyslexia profile on a news page](docs/screenshots/2-dyslexia.png)

## The problem

About 1.3 billion people, roughly 1 in 6 worldwide, live with a significant disability (WHO, 2022). Most websites are designed for one kind of user: someone who reads small text easily, ignores clutter, and uses a mouse. Built-in browser settings help a little, but they're scattered and don't cover things like focus, reading support or switch access.

Clearway puts these adaptations in one place, with one-click profiles, and it works on any site without the site having to change.

## What it does

| Profile | What changes | Who it helps |
|---|---|---|
| **Dyslexia** | Plain sans-serif font, extra letter, word and line spacing, cream background, a reading ruler that follows the pointer, underlined links | Dyslexia, reading fatigue |
| **Low vision** | 160% size, yellow-on-black high contrast, underlined links so they don't rely on color | Low vision, color-vision differences |
| **Focus** | Hides menus, sidebars, ads and banners so only the article is left; stops animations and autoplay video | ADHD, autism, cognitive disabilities, brain injury |
| **One switch** | The whole page can be used with a single key, the way switch users (head switch, sip-and-puff, large button) use a computer | Cerebral palsy, ALS, spinal cord injury, muscular dystrophy |

**Read aloud** works with any profile: it reads your selected text, or the main article, and highlights each paragraph as it goes.

Every setting can also be adjusted on its own (text size, line spacing, letter spacing, font, colors, ruler, motion), and settings apply to every page you open.

### Screenshots

| Before | Focus mode |
|---|---|
| ![Original page](docs/screenshots/1-before.png) | ![Focus mode](docs/screenshots/3-focus.png) |

| Switch scanning: choose an area | Then choose an item |
|---|---|
| ![Scanning groups](docs/screenshots/5-scan-groups.png) | ![Scanning items](docs/screenshots/6-scan-item.png) |

| Low vision | Settings panel |
|---|---|
| ![Low vision profile](docs/screenshots/4-low-vision.png) | <img src="docs/screenshots/popup.png" alt="Clearway popup" width="300"> |

## Try it (2 minutes)

1. Download this repository (**Code → Download ZIP**) and unzip it, or `git clone` it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`extension`** folder.
4. Pin Clearway from the puzzle-piece menu in the toolbar.
5. Open any article, for example a Wikipedia page or a news story, and click a profile.

To use the included demo page (`demo/index.html`, a deliberately cluttered news article), open Clearway's **Details** in `chrome://extensions` and turn on **Allow access to file URLs**, then open the file in Chrome. Clearway can't run on `chrome://` pages or the Chrome Web Store; Chrome blocks all extensions there.

### Using switch scanning

- **One switch (automatic):** a box moves across the page by itself. When it reaches the area you want, press **Space**. It then moves through the items in that area; press **Space** again on the one you want. If you don't press, it returns to the areas. Text fields pause scanning so you can type; press **Esc** to continue.
- **Two switches (step):** **Space** moves the box, **Enter** selects. No waiting.
- **Speed:** each item gets 2 seconds by default. Change it with the **Scan speed** slider in the popup (0.8 to 6 seconds), or with the **Slower** and **Faster** buttons on the scanning panel.
- **Turning it off:** click **Turn off** on the scanning panel, switch it off in the popup, or press `Alt+Shift+S`. **Esc** only pauses it.

### Troubleshooting

- **Clearway won't turn off, or two scanning panels appear:** you probably have two copies installed (for example, an older one loaded from a different folder). Remove the older one in `chrome://extensions`, then reload the page.
- **Nothing happens on a page:** reload the page once after installing or updating Clearway.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+A` | Open Clearway |
| `Alt+Shift+F` | Focus mode on/off |
| `Alt+Shift+R` | Read aloud on/off |
| `Alt+Shift+S` | Switch scanning on/off |

Change them at `chrome://extensions/shortcuts`.

## How it works

```
extension/
├── manifest.json      Manifest V3 config
├── shared.js          Default settings and the four profiles
├── content.js         Runs on each page: styles, focus mode, ruler, read aloud, scanning
├── background.js      Speech (chrome.tts) and keyboard shortcuts
├── popup.html/css/js  The settings panel
├── lib/Readability.js Mozilla Readability, used to find the main article
└── fonts/             OpenDyslexic and Atkinson Hyperlegible
```

- **Page changes** are done with one injected stylesheet that is rebuilt whenever a setting changes, so turning a setting off fully restores the page.
- **Finding the main article** uses [Mozilla Readability](https://github.com/mozilla/readability), the engine behind Firefox Reader View. Clearway runs it on a copy of the page, then matches each extracted paragraph back to the real element by its text. That lets read aloud highlight the paragraph being spoken and lets focus mode hide everything outside the article. If no article is found, it falls back to a simple paragraph-density guess.
- **Read aloud** splits text into short sentences and speaks them through `chrome.tts` in the background worker. This avoids the browser's speech engine cutting off long passages and works without a click on the page itself.
- **Switch scanning** finds every visible link, button and field, groups them by page region (header, menu, article, sidebar, form) in reading order, and splits long regions into groups of up to six. The highlight and controls live in a Shadow DOM, so the website's styles can't break them.
- **Settings** are saved in `chrome.storage.local`. Every open tab listens for changes, so a setting changed in the popup applies everywhere at once.

## Design decisions

**Why the Dyslexia profile uses Verdana, not OpenDyslexic.** Controlled studies have not found that specialised "dyslexia fonts" like OpenDyslexic improve reading speed or accuracy compared with ordinary sans-serif fonts. What dyslexia style guides such as the British Dyslexia Association's recommend is a plain sans-serif font, larger text, extra letter and word spacing, about 1.5 line spacing, and an off-white background, so that is what the profile does. OpenDyslexic is still offered as an option because some readers prefer it, and comfort matters.

**Why scanning uses groups.** Scanning every link one at a time means waiting through dozens of items on a normal page. Group-then-item scanning is the standard approach in switch access systems: you wait through a few areas and then a few items instead.

**Why read aloud isn't for blind users.** Blind users already rely on screen readers such as NVDA, JAWS and VoiceOver, which do far more than we could in a hackathon. Read aloud is for sighted people who benefit from hearing text while they read it, including people with dyslexia, low vision or reading fatigue.

## Privacy and permissions

Clearway sends no data anywhere and has no server, account or analytics. Speech uses the voices available in your browser and operating system.

| Permission | Why |
|---|---|
| `storage` | Remember your settings |
| `tts` | Read text aloud |
| `scripting`, `activeTab` | Add Clearway to tabs that were open before it was installed |
| Access to all sites | Apply your settings to any page you visit |

## Limitations

- **Hearing loss isn't covered yet.** Live captions need tab-audio capture and a speech-to-text service.
- **Focus mode and read aloud need an article.** They work well on news, blogs and Wikipedia, but not on web apps like Gmail or on search results.
- **High-contrast themes override every color**, which can make some complex layouts look flat.
- **Scrolling controls move the main page,** not the inner scrolling panels some web apps use.
- **Speech quality depends on the voices installed** on the computer.

## Roadmap

- Live captions for audio and video (for deaf and hard-of-hearing users)
- "Explain this simply" for selected text, using a language model
- Per-site settings, and syncing profiles across devices
- Auditory scanning (speaking each highlighted item aloud) for switch users with low vision
- Testing with disabled users, which matters more than anything on this list

## Team

| Laksh Khandelwal  b26cm1030 |
| Shaurya Khatri  b26ch1034 |
| Vaisnavi Saxena  b26cm1087 |
| Harshit Tomar  b26cm1021 |

## Credits and licenses

Clearway is released under the [MIT License](LICENSE). It includes third-party components under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- [Mozilla Readability](https://github.com/mozilla/readability), Apache License 2.0
- [OpenDyslexic](https://opendyslexic.org) by Abbie Gonzalez, SIL Open Font License 1.1
- [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) by the Braille Institute, SIL Open Font License 1.1
