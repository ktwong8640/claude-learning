# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Döstädning — a mobile-friendly Swedish Death Cleaning (estate cleaning) catalog app. Users attach any number of photos and videos to each belonging and assign it a disposition (Keep, Gift, Sell, Donate, Discard), then export a printable inventory for family/executors. See [README.md](README.md) for the full feature list and data model.

## Architecture

Plain HTML/CSS/JavaScript, no build step, no dependencies, no backend:

- `index.html` — single-page app shell with three views (Capture, Items dashboard, Export) toggled by `js/app.js`, a bottom tab bar, item detail modal, and the live camera overlay markup (with a Photo/Video mode toggle and recording indicator).
- `css/styles.css` — dark slate + neon blue theme (CSS custom properties in `:root`), mobile-first.
- `js/db.js` — thin promise-based wrapper (`AssetDB`) around IndexedDB (`death-cleaning-db` / `assets` store). Each media item's `blob` (photo or video) is stored directly in the IndexedDB record.
- `js/app.js` — all UI logic: view switching, the capture form's pending-media queue (`pendingMedia`, rendered as a removable thumbnail strip before the item is saved), the live camera capture flow for both stills (`getUserMedia` → canvas frame grab) and video (`MediaRecorder`, 60s cap) with a shared review/retake step, dashboard filtering/search, the item modal (a gallery that supports adding more media — via camera or file picker — or removing individual items from an already-saved asset), the printable estate summary (`window.print()` + `@media print`), and JSON backup/restore (each media blob round-tripped through a data URL).
- `manifest.json` / `sw.js` / `icons/` — makes the app an installable PWA on Android (Add to Home screen, standalone display, offline app-shell cache). `icons/*.png` are generated placeholder art (simple ring on the theme's dark/cyan colors), not hand-designed. **`sw.js`'s `CACHE_NAME` must be bumped whenever any cached shell file changes** — the service worker is cache-first, so without a version bump, browsers/devices with it already installed keep serving stale files indefinitely.

No frameworks, no ES modules (scripts are loaded as plain globals so the page keeps working from `file://`), no external services — everything is local to the browser via IndexedDB.

Camera capture (`btn-open-camera` in `app.js`, and the "Camera" button inside the item detail modal) uses `navigator.mediaDevices.getUserMedia` with `facingMode: 'environment'` by default; video mode also requests `audio: true`. This requires a secure context (`https://` or `http://localhost`) — it will fail (with a handled, visible error) on plain `http://<lan-ip>` or `file://`. There is no way for a web page to invoke a phone's native camera app (e.g. Samsung's) or its proprietary modes; this is the standard browser camera pipeline, which is the ceiling for what any web app can do. The "Choose from Gallery" button (plain `<input type="file" multiple accept="image/*,video/*">`) is the fallback and works everywhere regardless of secure-context.

`openCamera(targetAssetId)` is shared between the capture form and the item modal: called with no argument, a captured photo/video is pushed into `pendingMedia` (for a not-yet-saved item); called with an existing asset's id, it attaches directly to that saved asset via `attachMediaToAsset` instead. Assets saved before this feature (single `photo` Blob field) are migrated into the `media` array format automatically in `loadAssets()`.

## Running / testing

Serve the directory with any static file server (e.g. `npx serve .` or `python -m http.server`) and open the printed URL. Camera testing on a real phone needs an `https://` URL (deploy to GitHub Pages/Netlify/Vercel, or tunnel with `ngrok`/`localtunnel`) — see README.md for details. There is no build, lint, or test command.
