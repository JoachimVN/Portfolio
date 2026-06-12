# JoachimVN.github.io

Personal portfolio website. Built with vanilla HTML, CSS, and JavaScript. No frameworks, no build tools.

**Live:** https://joachimvn.github.io

---

## Features

- GitHub API integration — project cards fetch live data (description, language, stars) at runtime
- Animated screenshot carousel with per-project brand colors on the progress indicators
- Vanilla Python syntax highlighter with VS Code Dark+ colors and line numbers, source files loaded via `fetch()`
- Auto-updating age calculated from birthdate
- Shared footer rendered from JavaScript — single definition used across all pages
- Self-hosted variable fonts (Syne, Inter) — no external font requests

## Stack

- HTML5, CSS3, JavaScript (ES2022)
- GitHub Pages

## Structure

```
index.html          Main portfolio page
lego.html           LEGO MINDSTORMS EV3 project page
script.js           All JavaScript
resources/
  css/style.css     All styles
  fonts/            Self-hosted Syne and Inter variable fonts
  images/           Photos, screenshots, logos
  code/             Python source files (line_follower.py, waste_handler.py)
```

## Running locally

No build step required. Serve the root directory with any static file server:

```bash
npx serve .
```

Or open `index.html` directly in a browser. Note that the Python source files load via `fetch()`, so a local server is needed for the LEGO page code blocks to render.

## Author

Joachim Valdersnes Nilsen
