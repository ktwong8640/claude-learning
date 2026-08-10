# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Döstädning — a mobile-friendly Swedish Death Cleaning (estate cleaning) catalog app. Users photograph belongings and assign each one a disposition (Keep, Gift, Sell, Donate, Discard), then export a printable inventory for family/executors. See [README.md](README.md) for the full feature list and data model.

## Architecture

Plain HTML/CSS/JavaScript, no build step, no dependencies, no backend:

- `index.html` — single-page app shell with three views (Capture, Items dashboard, Export) toggled by `js/app.js`, plus a bottom tab bar and item detail modal.
- `css/styles.css` — dark slate + neon blue theme (CSS custom properties in `:root`), mobile-first.
- `js/db.js` — thin promise-based wrapper (`AssetDB`) around IndexedDB (`death-cleaning-db` / `assets` store). Photos are stored as `Blob`s directly in IndexedDB records.
- `js/app.js` — all UI logic: view switching, the capture form (with disposition-conditional fields), dashboard filtering/search, the item modal, the printable estate summary (`window.print()` + `@media print`), and JSON backup/restore (photos round-tripped through data URLs).

No frameworks, no ES modules (scripts are loaded as plain globals so the page keeps working from `file://`), no external services — everything is local to the browser via IndexedDB.

## Running / testing

Serve the directory with any static file server (e.g. `npx serve .` or `python -m http.server`) and open the printed URL — IndexedDB and the file input are more reliable over `http://` than `file://`. There is no build, lint, or test command.
