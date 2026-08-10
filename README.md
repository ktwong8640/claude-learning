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
- **Items** — browse everything you've catalogued, filter by disposition or category, search by title, and tap an item to open it. The detail view is a small gallery of every attached photo/video (videos play inline), and you can add more (Camera or Gallery) or remove individual items at any time — changes save immediately. If Google sync is set up, there's also a **Sync to Google Drive** button here for that one item.
- **Export** — see counts per disposition, print (or save as PDF) a structured inventory grouped by disposition and, for gifts, by recipient, noting each item's photo/video counts — a guide for whoever handles your estate. Also download/restore a JSON backup, since everything lives only in this browser. The **Google Drive sync** card here lets you connect your Google account, choose a Drive folder, connect or create a Google Sheet, and sync every item in one go.

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
   - Copy the generated key, then click into it and restrict it under **Application restrictions → Websites** to the same origins as step 4 (this key isn't secret, but restricting it stops other sites from using it under your quota).

### Configure the app

```
cp js/google-config.example.js js/google-config.js
```

Fill in the `clientId` and `apiKey` you just created. `js/google-config.js` is gitignored — it never gets committed. (`.env.example` at the repo root documents the same two values for reference, but nothing reads a `.env` file here — see the comment in that file for why.)

### Using it

Open the **Export** tab → **Google Drive sync** card:

1. **Connect Google Account** — triggers the real Google sign-in popup.
2. **Choose Drive folder** — opens Google's own folder picker; pick (or create) the folder uploads should go to.
3. **Connect sheet** (paste an existing Sheet's URL/ID) or **Create new sheet** — either way, a header row (`Title, Category, Valuation, Disposition Status, Recipient, Drive Photo URL, Logged At`) is added automatically if missing.
4. **Sync all items**, or open any single item and use its **Sync to Google Drive** button. Already-uploaded media isn't re-uploaded; re-syncing an item updates its existing sheet row instead of adding a duplicate.

"Drive Photo URL" logs the first photo/video's Drive link — items with several photos still get every one uploaded, just the sheet row only carries the first as a quick preview link.

## Data model

Each catalogued item (`Asset`) has: `id`, `title`, `media` (array of `{ id, type: 'image'|'video', blob, driveFileId?, driveUrl? }`), `category`, `dispositionType`, `recipientName` (Gift), `platform` / `askingPrice` (Sell), `donateLocation` (Donate), `estimatedValue`, `hasProof`, `notes`, `createdAt`, `updatedAt`, and (once synced) `sheetRow` / `driveSyncedAt`. Older items saved before multi-media support (single `photo` field) are migrated into `media` automatically the first time they're loaded.

## Limitations / next steps

- Data is local to one browser/device — no cross-device sync. Use the JSON backup/restore in the Export tab to move data between devices, or add a backend (e.g. Supabase or Firebase) later for that.
- No AI-assisted photo tagging yet — category and title are entered manually. A vision API could be wired in later to pre-fill these from a photo.
- This is a mobile *web* app (installable as a PWA), not a native Android APK. It doesn't touch Samsung's proprietary camera SDK/app — only the standard browser camera API, which is the most any web page can access.
- The PWA icons in `icons/` are simple placeholder generated art — swap them for real branding whenever.
- Videos are recorded as WebM (`MediaRecorder`'s default on Chrome/Android); there's no transcoding, so file sizes depend entirely on resolution and length. IndexedDB storage isn't unlimited — keep an eye on how much video you're capturing on one device.
- Google Drive/Sheets sync was built and code-reviewed against the documented API shapes, but **not exercised against a real Google Cloud project** — there's no way to create one autonomously, and this app was built without one. Follow the setup steps once and test a real sync before relying on it; if something doesn't match Google's current API behavior, the browser console/network tab is the place to look first.
- The OAuth consent screen stays in "Testing" mode (see setup steps) unless you submit it for Google verification, so the Google sign-in step will need re-approval roughly every 7 days.
