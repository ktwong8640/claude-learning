# Döstädning — Estate Cleaning Catalog

A mobile-friendly web app for **Swedish Death Cleaning** (*Döstädning*): photograph or record video of your belongings, decide what happens to each one (Keep, Gift, Sell, Donate, Discard), and generate a printable inventory for family or an executor.

Plain HTML, CSS, and JavaScript — no build step, no npm install, no account required. All data (including photos and videos) is stored locally in your browser via IndexedDB; nothing is uploaded anywhere.

## Running the project

Plain static files — any static file server works:

```
npx serve .
```

or, if you have Python installed:

```
python -m http.server 8000
```

Then visit the printed local URL (e.g. `http://localhost:8000`).

**For the live camera to work, the page must be loaded over a secure origin** — `https://` or `http://localhost`. This is a browser security rule (`getUserMedia`), not something this app can opt out of. That means:

- On your **computer**, `http://localhost:8000` works fine for camera testing.
- On your **phone** (e.g. testing on a Samsung S23 Ultra), your computer's plain `http://<lan-ip>:8000` will **not** get camera access — only the gallery-picker fallback will work there. To test the live camera on a real phone, either:
  1. **Deploy it somewhere with free HTTPS** — e.g. push this repo to GitHub Pages, Netlify, Vercel, or Cloudflare Pages — then open that `https://` URL on your phone, or
  2. **Tunnel your local server** with something like `npx localtunnel --port 8000` or `ngrok http 8000`, which gives you a temporary `https://` URL.

You can also just double-click `index.html` to try it without a server, but if items/photos don't save, or the camera button falls back to the gallery picker, switch to serving it locally (or over HTTPS) instead.

### Installing on Android (PWA)

Once served over HTTPS and opened in Chrome (or Samsung Internet) on Android, use the browser menu → **Add to Home screen** / **Install app**. This installs it as a standalone app icon with no browser address bar, using the `manifest.json` and `sw.js` service worker in this repo. Your catalog data stays in the browser's IndexedDB either way — installing just changes how it's launched.

## What it does

- **Capture** — add an item with a title, category, and a disposition: Keep, Gift/Designate, Sell, Donate/Recycle, or Discard. Disposition-specific fields appear as needed (recipient for Gift, platform/price for Sell, drop-off location for Donate). Attach **any number of photos and videos** to the item before saving it, via either:
  - **Camera** — an in-page live viewfinder (rear camera by default, Flip button for front/back) via `getUserMedia`, with a **Photo/Video mode toggle**. Photo mode is a shutter + retake/use review step; Video mode is a record/stop button with a recording timer (capped at 60 seconds per clip) that also requests microphone access. Each capture gets added to the item's media list — take as many as you like before saving. This is the standard camera pipeline the phone's browser exposes; there's no way for a web page to launch Samsung's own Camera app or its exclusive modes (100x zoom, night mode, etc.).
  - **Choose from Gallery** — the OS file/photo picker, with multi-select for photos and videos together. Always works, even over plain `http://` or `file://`.
  
  Queued media show as a thumbnail strip with a remove (×) button on each before you save.
- **Items** — browse everything you've catalogued, filter by disposition or category, search by title, and tap an item to open it. The detail view is a small gallery of every attached photo/video (videos play inline), and you can add more (Camera or Gallery) or remove individual items at any time — changes save immediately.
- **Export** — see counts per disposition, print (or save as PDF) a structured inventory grouped by disposition and, for gifts, by recipient, noting each item's photo/video counts — a guide for whoever handles your estate. Also download/restore a JSON backup, since everything lives only in this browser.

## Data model

Each catalogued item (`Asset`) has: `id`, `title`, `media` (array of `{ id, type: 'image'|'video', blob }`), `category`, `dispositionType`, `recipientName` (Gift), `platform` / `askingPrice` (Sell), `donateLocation` (Donate), `estimatedValue`, `hasProof`, `notes`, `createdAt`, `updatedAt`. Older items saved before multi-media support (single `photo` field) are migrated into `media` automatically the first time they're loaded.

## Limitations / next steps

- Data is local to one browser/device — no cross-device sync. Use the JSON backup/restore in the Export tab to move data between devices, or add a backend (e.g. Supabase or Firebase) later for that.
- No AI-assisted photo tagging yet — category and title are entered manually. A vision API could be wired in later to pre-fill these from a photo.
- This is a mobile *web* app (installable as a PWA), not a native Android APK. It doesn't touch Samsung's proprietary camera SDK/app — only the standard browser camera API, which is the most any web page can access.
- The PWA icons in `icons/` are simple placeholder generated art — swap them for real branding whenever.
- Videos are recorded as WebM (`MediaRecorder`'s default on Chrome/Android); there's no transcoding, so file sizes depend entirely on resolution and length. IndexedDB storage isn't unlimited — keep an eye on how much video you're capturing on one device.
