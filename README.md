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

- **Capture** — add an item with a title, category, and a disposition: Keep, Gift/Designate, Sell, Donate/Recycle, or Discard. Disposition-specific fields appear as needed (recipient for Gift, platform/price for Sell, drop-off location for Donate). Attach **up to 3 photos/videos** to the item before saving it, via either:
  - **Camera** — an in-page live viewfinder (rear camera by default, Flip button for front/back) via `getUserMedia`, with a **Photo/Video mode toggle**. Photo mode is a shutter + retake/use review step; Video mode is a record/stop button with a recording timer (capped at 60 seconds per clip) that also requests microphone access. This is the standard camera pipeline the phone's browser exposes; there's no way for a web page to launch Samsung's own Camera app or its exclusive modes (100x zoom, night mode, etc.).
  - **Choose from Gallery** — the OS file/photo picker, with multi-select for photos and videos together. Always works, even over plain `http://` or `file://`.
  
  Queued media show as a thumbnail strip with a remove (×) button on each before you save, along with a live "X of 3 used" count. Once you've added 3, the Camera and Choose from Gallery buttons for that item disable themselves (with a tooltip explaining why); picking more than 3 files at once in the gallery picker adds up to whatever room is left and tells you how many got skipped. This cap matches the Google Sheets sync, which links up to 3 photos per item by design (see below) — capturing more than 3 would just mean some never show up there anyway.

  Estimated value has its own **currency selector** (every ISO currency your browser supports, defaulting to whatever you picked last time) instead of assuming USD. Receipts/warranty cards get their own separate **Receipt / proof of purchase** section — same Camera/Gallery pattern and 3-item cap as item photos, but photo-only (no video mode) and kept apart from the item's own gallery, since a receipt isn't a photo of the item itself.
- **Items** — browse everything you've catalogued, filter by disposition or category, search by title, and tap an item to open it. The detail view has two separate galleries — item photos/videos, and receipt images, each capped at 3 with the same "X of 3 used" indicator and self-disabling buttons as the capture form — each independently addable (Camera or Gallery) and removable at any time; changes save immediately. An **Edit** button turns the same view into a form for every other field (title, category, disposition and its conditional fields, currency/value, notes) — nothing about a saved item is fixed after the fact. If Google sync is set up, there's also a **Sync to Google Drive** button here for that one item.
- **Export** — see counts per disposition, print (or save as PDF) a structured inventory grouped by disposition and, for gifts, by recipient, noting each item's photo/video counts — a guide for whoever handles your estate. Also download/restore a JSON backup, since everything lives only in this browser. The **Google Drive sync** card here lets you connect your Google account, choose a Drive folder, connect or create a Google Sheet, sync every item in one go, and — once connected with a folder chosen — **Upload backup to Drive**, which builds the same JSON backup as the Download button and uploads it straight to that folder, skipping the manual download-then-upload-yourself round trip.

## Google Drive & Sheets sync

Uploads photos/videos to a Google Drive folder you choose and logs each item's Title, Category, Valuation, Disposition Status, Recipient, and Drive Photo URL to a Google Sheet — all from the browser, authenticated as *you*, with no backend server and no secret credentials to protect. That's a deliberate tradeoff: this app is a static site with nowhere safe to hold a real secret (like a service-account key), so instead it uses Google's own sign-in flow and asks for only the minimum access it needs (`drive.file` — files this app created or you explicitly picked, not your whole Drive; and `spreadsheets` — for the one sheet you connect).

### One-time Google Cloud setup (you do this part — it needs your own Google account)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing one).
2. **APIs & Services → Library** — enable the **Google Drive API**, **Google Sheets API**, and **Google Picker API**.
3. **APIs & Services → OAuth consent screen** — choose **External**, fill in the required fields (app name, your email), and add your own Google account under **Test users**. Leave it in **Testing** publishing status — no Google verification needed for personal use, but tokens will need re-approval every 7 days.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: add `http://localhost:8000` (or whatever port you use locally) and your deployed `https://` URL (e.g. `https://<you>.github.io`)
   - Copy the generated **Client ID**.
5. **APIs & Services → Credentials → Create Credentials → API key**:
   - Copy the generated key, then click into it and restrict it:
     - **Application restrictions → Websites** — add the same origins as step 4.
     - **API restrictions → Restrict key** — select only **Google Picker API**. That's the only one of the three this app actually uses the API key for; Drive and Sheets calls authenticate with your OAuth sign-in token instead.
   - This key isn't a secret, but restricting it stops other sites from using it under your quota.

### Configure the app

```
cp js/google-config.example.js js/google-config.js
```

Fill in the `clientId` and `apiKey` you just created, and commit the file — GitHub Pages only serves what's actually in the repo, and there's no build step to inject secrets at deploy time, so this needs to be a real committed file. That's fine: neither value is meant to be kept private (see the comment in `js/google-config.js` itself). **Never put a Client Secret in this file or anywhere in this repo** — this app's client-side OAuth flow doesn't use one, and unlike the Client ID/API key, a secret genuinely needs protecting.

If you'd rather keep these two values out of your repo's history entirely, add `js/google-config.js` back to `.gitignore` and inject it at deploy time instead (e.g. via a GitHub Actions secret written into the Pages workflow) — a bit more setup, but keeps the file out of your public git history. (`.env.example` at the repo root documents the same two values for reference either way, but nothing reads a `.env` file here — see the comment in that file for why.)

### Using it

Open the **Export** tab → **Google Drive sync** card:

1. **Connect Google Account** — triggers the real Google sign-in popup.
2. **Choose Drive folder** — opens Google's own folder picker; pick (or create) the folder uploads should go to.
3. **Connect sheet** (paste an existing Sheet's URL/ID) or **Create new sheet** — either way, the header row is written/corrected automatically: `Title, Category, Valuation, Currency, Disposition Status, Recipient, Drive Photo URL 1, Drive Photo URL 2, Drive Photo URL 3, Receipt URL 1, Receipt URL 2, Receipt URL 3, Logged At`. Connecting an older sheet from before this column layout existed self-upgrades its header on the next sync — no need to reconnect it. Since this inserts "Currency" in the middle rather than only appending at the end, rows logged under the older single-`Valuation`-column layout will show up shifted one column relative to the new headers until you re-sync them (Sync all items fixes every row in one go).
4. **Sync all items**, or open any single item and use its **Sync to Google Drive** button. Already-uploaded media isn't re-uploaded; re-syncing an item updates its existing sheet row instead of adding a duplicate.

**Deleting an item** clears its sheet row too (best-effort — if you're not already connected, or the request fails, the item still deletes locally and you're told the row wasn't cleared, rather than being blocked). The row is blanked, not removed outright, so every *other* synced item's row stays exactly where it was — physically deleting a row would shift everything below it up by one and silently corrupt other items' row tracking.

**Upload backup to Drive** (same card, once connected with a folder chosen) uploads the whole-catalog JSON backup — everything the Download backup button produces — straight into that Drive folder alongside your photos, named the same way (`dostadning-backup-YYYY-MM-DD.json`). It's a copy of the same local IndexedDB data, just parked somewhere that survives this phone's browser storage getting cleared — not a substitute for occasionally checking it actually restores cleanly.

**Both backup buttons** — Download backup and Upload backup to Drive — check for unsynced items first (only if Google sync is configured and connected; if not, they just run immediately, nothing to check). If any items haven't been synced to Drive/Sheets yet, you're asked whether to sync them before backing up (the backup file itself is always complete either way — an item's presence in it never depends on whether it's been synced — this is purely about keeping your Drive folder/Sheet from silently falling behind what's in the backup). Decline and the backup runs immediately; accept and it syncs everything pending first, then backs up; if syncing hits an error partway through, the backup is skipped rather than produced next to an incomplete sync.

Each photo and receipt gets its **own column** (up to 3 of each) rather than being comma-joined into one cell — that's deliberate: Google Sheets only shows its hover-preview thumbnail when a cell's entire content is a single recognized Drive link, so cramming several URLs into one cell breaks the preview for all of them. This matches the app's own 3-photo/3-receipt-per-item capture limit (see the Capture section above), so every uploaded photo always gets a column. "Valuation" is the plain number; "Currency" (its own column, right next to it) carries the ISO code — kept separate rather than combined as `250 EUR` in one cell, so the number stays usable for spreadsheet math/sorting.

**Restoring a backup**: tap **Restore backup**, then pick the `dostadning-backup-*.json` file from wherever you saved it (your phone's Downloads folder by default, unless you moved it). If the file picker doesn't show it, that's almost always the OS mis-tagging the download's file type rather than the file actually being missing — try switching the picker to "All files" / browsing by folder instead of relying on its type filter, or search your Files app for "dostadning". If you used **Upload backup to Drive** rather than the local Download button, the file lives in Drive, not on the phone — open the Google Drive app, download that file to the device first, then Restore backup as above.

## Data model

Each catalogued item (`Asset`) has: `id`, `title`, `media` (array of `{ id, type: 'image'|'video', blob, driveFileId?, driveUrl? }`), `receiptMedia` (same shape, images only), `category`, `dispositionType`, `recipientName` (Gift), `platform` / `askingPrice` (Sell), `donateLocation` (Donate), `currency` (ISO code, e.g. `USD`), `estimatedValue`, `notes`, `createdAt`, `updatedAt`, and (once synced) `sheetRow` / `driveSyncedAt`. Older items saved before multi-media support (single `photo` field) are migrated into `media` automatically the first time they're loaded; the old boolean `hasProof` field is dropped in favor of `receiptMedia`'s length.

## Limitations / next steps

- Data is local to one browser/device — no cross-device sync. Use the JSON backup/restore in the Export tab to move data between devices, or add a backend (e.g. Supabase or Firebase) later for that.
- No AI-assisted photo tagging yet — category and title are entered manually. A vision API could be wired in later to pre-fill these from a photo.
- This is a mobile *web* app (installable as a PWA), not a native Android APK. It doesn't touch Samsung's proprietary camera SDK/app — only the standard browser camera API, which is the most any web page can access.
- The PWA icons in `icons/` are simple placeholder generated art — swap them for real branding whenever.
- Videos are recorded as WebM (`MediaRecorder`'s default on Chrome/Android); there's no transcoding, so file sizes depend entirely on resolution and length. IndexedDB storage isn't unlimited — keep an eye on how much video you're capturing on one device.
- Google Drive/Sheets sync was built and code-reviewed against the documented API shapes, but **not exercised against a real Google Cloud project** — there's no way to create one autonomously, and this app was built without one. Follow the setup steps once and test a real sync before relying on it; if something doesn't match Google's current API behavior, the browser console/network tab is the place to look first.
- The OAuth consent screen stays in "Testing" mode (see setup steps) unless you submit it for Google verification, so the Google sign-in step will need re-approval roughly every 7 days.
