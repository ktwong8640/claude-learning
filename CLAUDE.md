# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Döstädning — a mobile-friendly Swedish Death Cleaning (estate cleaning) catalog app. Users photograph belongings and assign each one a disposition (Keep, Gift, Sell, Donate, Discard), then export a printable inventory for family/executors. See [README.md](README.md) for the full feature list and data model.

## Architecture

Plain HTML/CSS/JavaScript, no build step, no dependencies, no backend:

- `index.html` — single-page app shell with three views (Capture, Items dashboard, Export) toggled by `js/app.js`, a bottom tab bar, item detail modal, and the live camera overlay markup.
- `css/styles.css` — dark slate + neon blue theme (CSS custom properties in `:root`), mobile-first.
- `js/db.js` — thin promise-based wrapper (`AssetDB`) around IndexedDB (`death-cleaning-db` / `assets` store). Photos are stored as `Blob`s directly in IndexedDB records.
- `js/app.js` — all UI logic: view switching, the capture form (with disposition-conditional fields), the live camera capture flow (`getUserMedia` → canvas frame grab → review/retake → `AssetDB`), dashboard filtering/search, the item modal, the printable estate summary (`window.print()` + `@media print`), and JSON backup/restore (photos round-tripped through data URLs).
- `manifest.json` / `sw.js` / `icons/` — makes the app an installable PWA on Android (Add to Home screen, standalone display, offline app-shell cache). `icons/*.png` are generated placeholder art (simple ring on the theme's dark/cyan colors), not hand-designed.

No frameworks, no ES modules (scripts are loaded as plain globals so the page keeps working from `file://`), no external services — everything is local to the browser via IndexedDB.

Camera capture (`btn-open-camera` in `app.js`) uses `navigator.mediaDevices.getUserMedia` with `facingMode: 'environment'` by default. This requires a secure context (`https://` or `http://localhost`) — it will fail (with a handled, visible error) on plain `http://<lan-ip>` or `file://`. There is no way for a web page to invoke a phone's native camera app (e.g. Samsung's) or its proprietary modes; this is the standard browser camera pipeline, which is the ceiling for what any web app can do. The "Choose from Gallery" button (plain `<input type="file">`) is the fallback and works everywhere regardless of secure-context.

## Running / testing

Serve the directory with any static file server (e.g. `npx serve .` or `python -m http.server`) and open the printed URL. Camera testing on a real phone needs an `https://` URL (deploy to GitHub Pages/Netlify/Vercel, or tunnel with `ngrok`/`localtunnel`) — see README.md for details. There is no build, lint, or test command.
