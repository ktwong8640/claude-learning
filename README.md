# Döstädning — Estate Cleaning Catalog

A mobile-friendly web app for **Swedish Death Cleaning** (*Döstädning*): photograph your belongings, decide what happens to each one (Keep, Gift, Sell, Donate, Discard), and generate a printable inventory for family or an executor.

Plain HTML, CSS, and JavaScript — no build step, no npm install, no account required. All data (including photos) is stored locally in your browser via IndexedDB; nothing is uploaded anywhere.

## Running the project

Because it uses the camera/file input and IndexedDB, it's most reliable served over `http://` rather than opened directly as a `file://` page (some browsers restrict storage APIs on `file://`). Any static file server works:

```
npx serve .
```

or, if you have Python installed:

```
python -m http.server 8000
```

Then visit the printed local URL (e.g. `http://localhost:8000`) — on your phone, use your computer's local network IP so you can use the camera.

You can also just double-click `index.html` to try it, but if items or photos don't seem to save, switch to serving it locally instead.

## What it does

- **Capture** — add an item with a photo (or camera shot on mobile), title, category, and a disposition: Keep, Gift/Designate, Sell, Donate/Recycle, or Discard. Disposition-specific fields appear as needed (recipient for Gift, platform/price for Sell, drop-off location for Donate).
- **Items** — browse everything you've catalogued, filter by disposition or category, search by title, and tap an item to view details or delete it.
- **Export** — see counts per disposition, print (or save as PDF) a structured inventory grouped by disposition and, for gifts, by recipient — a guide for whoever handles your estate. Also download/restore a JSON backup, since everything lives only in this browser.

## Data model

Each catalogued item (`Asset`) has: `id`, `title`, `photo` (Blob), `category`, `dispositionType`, `recipientName` (Gift), `platform` / `askingPrice` (Sell), `donateLocation` (Donate), `estimatedValue`, `hasProof`, `notes`, `createdAt`, `updatedAt`.

## Limitations / next steps

- Data is local to one browser/device — no cross-device sync. Use the JSON backup/restore in the Export tab to move data between devices, or add a backend (e.g. Supabase or Firebase) later for that.
- No AI-assisted photo tagging yet — category and title are entered manually. A vision API could be wired in later to pre-fill these from a photo.
