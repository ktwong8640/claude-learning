// Google Drive & Sheets sync. Client-side only, authenticated as the signed-in user via
// Google Identity Services — no backend, no server-held secrets. Uploads use the
// least-privilege `drive.file` scope (the app can only touch files/folders it created or
// that the user explicitly picked via the Drive folder picker below), plus the
// `spreadsheets` scope for logging rows to a Google Sheet the user owns or can edit.
//
// Requires js/google-config.js (see js/google-config.example.js) with a real OAuth Client
// ID and API key. Without it, every function here reports "not configured" rather than
// throwing, so the rest of the app works fine even if this feature was never set up.

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

// Each photo/receipt gets its own column (rather than comma-joining several URLs into one
// cell) specifically so Google Sheets' hover-preview still works — it only recognizes a
// cell as a previewable Drive link when the cell's *entire* content is that one URL.
// MAX_LINKED_MEDIA caps how many of each get a column; anything beyond that still uploads
// to Drive and is tracked in the app, it's just not listed in the sheet.
const MAX_LINKED_MEDIA = 3;
const SHEET_HEADERS = [
  'Title', 'Category', 'Valuation', 'Disposition Status', 'Recipient',
  'Drive Photo URL 1', 'Drive Photo URL 2', 'Drive Photo URL 3',
  'Receipt URL 1', 'Receipt URL 2', 'Receipt URL 3',
  'Logged At',
];
const SETTINGS_KEY = 'dostadning-google-sync';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

// ---------- settings persistence (folder/sheet choice only — never the access token) ----------

function loadSyncSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSyncSettings(patch) {
  const next = { ...loadSyncSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function isConfigured() {
  return !!(window.GOOGLE_CONFIG && GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.apiKey);
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error('Google sync isn\'t set up yet. Copy js/google-config.example.js to js/google-config.js and fill in your Client ID and API key (see README).');
  }
}

// ---------- Google Identity Services (auth) ----------

function waitFor(check, timeoutMessage) {
  return new Promise((resolve, reject) => {
    if (check()) { resolve(); return; }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (attempts > 100) {
        clearInterval(timer);
        reject(new Error(timeoutMessage));
      }
    }, 100);
  });
}

function ensureGisLoaded() {
  return waitFor(
    () => window.google && google.accounts && google.accounts.oauth2,
    'Google Sign-In script did not load. Check your internet connection and reload.'
  );
}

function ensurePickerLoaded() {
  return waitFor(() => window.google && google.picker, 'Google Drive picker did not load.').catch(() => {
    return new Promise((resolve, reject) => {
      if (!window.gapi) { reject(new Error('Google API loader did not load. Check your internet connection and reload.')); return; }
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google Drive picker.')) });
    });
  });
}

async function initTokenClientOnce() {
  if (tokenClient) return;
  await ensureGisLoaded();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.clientId,
    scope: GOOGLE_SCOPES,
    callback: () => {}, // overridden per-request below
  });
}

function requestAccessToken(interactive) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error === 'access_denied' ? 'Google sign-in was cancelled or denied.' : 'Google sign-in failed (' + resp.error + ').'));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in * 1000) - 60000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function getValidToken() {
  requireConfigured();
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  await initTokenClientOnce();
  try {
    return await requestAccessToken(false);
  } catch {
    return requestAccessToken(true);
  }
}

async function connect() {
  requireConfigured();
  await initTokenClientOnce();
  await requestAccessToken(true);
  saveSyncSettings({ connected: true });
}

function disconnect() {
  if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  saveSyncSettings({ connected: false });
}

function isConnected() {
  return !!loadSyncSettings().connected;
}

// ---------- Drive folder selection (Picker) ----------

async function chooseFolder() {
  const token = await getValidToken();
  await ensurePickerLoaded();

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .addView(view)
      .setTitle('Choose the Drive folder for Döstädning uploads')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const folder = data.docs[0];
          saveSyncSettings({ folderId: folder.id, folderName: folder.name });
          resolve({ id: folder.id, name: folder.name });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

// ---------- Sheets: connect existing or create new, keeping a header row ----------

function extractSheetId(input) {
  const match = /[-\w]{25,}/.exec(input);
  return match ? match[0] : input.trim();
}

function sheetLastCol() {
  return String.fromCharCode(65 + SHEET_HEADERS.length - 1);
}

async function ensureHeaderRow(sheetId, token) {
  const lastCol = sheetLastCol();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:${lastCol}1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const existing = (data.values && data.values[0]) || [];
  const matches = existing.length === SHEET_HEADERS.length && SHEET_HEADERS.every((h, i) => existing[i] === h);
  if (matches) return;

  // Enforces the exact header text for every column this app knows about (A through
  // lastCol) — including relabeling/repositioning columns from an older schema version —
  // but never touches anything past lastCol, so custom columns a user added on their own
  // are left alone.
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:${lastCol}1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [SHEET_HEADERS] }),
  });
}

async function connectExistingSheet(idOrUrl) {
  const sheetId = extractSheetId(idOrUrl);
  const token = await getValidToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,spreadsheetUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(res.status === 404 || res.status === 403
      ? 'Could not open that sheet — check the ID/URL and that your Google account has access to it.'
      : 'Could not open that sheet (error ' + res.status + ').');
  }
  const data = await res.json();
  await ensureHeaderRow(sheetId, token);
  saveSyncSettings({ sheetId, sheetName: data.properties.title, sheetUrl: data.spreadsheetUrl });
  return { id: sheetId, name: data.properties.title, url: data.spreadsheetUrl };
}

async function createNewSheet(title) {
  const token = await getValidToken();
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: title || 'Döstädning Estate Log' },
      sheets: [{ properties: { title: 'Items' } }],
    }),
  });
  if (!res.ok) throw new Error('Could not create a new sheet (error ' + res.status + ').');
  const data = await res.json();
  await ensureHeaderRow(data.spreadsheetId, token);
  saveSyncSettings({ sheetId: data.spreadsheetId, sheetName: data.properties.title, sheetUrl: data.spreadsheetUrl });
  return { id: data.spreadsheetId, name: data.properties.title, url: data.spreadsheetUrl };
}

function padUrls(urls) {
  const out = (urls || []).slice(0, MAX_LINKED_MEDIA);
  while (out.length < MAX_LINKED_MEDIA) out.push('');
  return out;
}

async function appendOrUpdateSheetRow(asset, driveUrls, receiptUrls) {
  const settings = loadSyncSettings();
  if (!settings.sheetId) return null;
  const token = await getValidToken();
  // Cheap idempotent check — upgrades an already-connected sheet's header the first time
  // it's synced after the schema changes, without requiring the user to manually
  // reconnect it.
  await ensureHeaderRow(settings.sheetId, token);

  const row = [
    asset.title || '',
    asset.category || '',
    asset.estimatedValue ? asset.estimatedValue + ' ' + (asset.currency || 'USD') : '',
    asset.dispositionType || '',
    asset.recipientName || '',
    ...padUrls(driveUrls),
    ...padUrls(receiptUrls),
    new Date().toISOString(),
  ];

  if (asset.sheetRow) {
    const range = `A${asset.sheetRow}:${sheetLastCol()}${asset.sheetRow}`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${settings.sheetId}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) throw new Error('Could not update the sheet row (error ' + res.status + ').');
    return asset.sheetRow;
  }

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${settings.sheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error('Could not log to the sheet (error ' + res.status + ').');
  const data = await res.json();
  const match = /![A-Z]+(\d+):/.exec(data.updates.updatedRange);
  return match ? parseInt(match[1], 10) : null;
}

// ---------- Drive upload ----------

async function uploadFileToDrive(blob, filename, folderId) {
  const token = await getValidToken();
  const metadata = { name: filename, parents: folderId ? [folderId] : undefined };
  const boundary = 'dostadning-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Blob([head, await blob.arrayBuffer(), tail]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error('Drive upload failed (error ' + res.status + ').');
  return res.json();
}

function safeFilename(title) {
  return (title || 'item').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

// ---------- top-level: sync one asset's media + receipts + log a row ----------

async function uploadMediaList(mediaList, asset, folderId, filenameInfix, onProgress, uploadState) {
  const urls = [];
  for (let i = 0; i < mediaList.length; i++) {
    const item = mediaList[i];
    if (item.driveUrl) {
      urls.push(item.driveUrl);
      continue;
    }
    uploadState.done++;
    if (onProgress) onProgress(uploadState.done, uploadState.total);
    const ext = item.type === 'video' ? '.webm' : '.jpg';
    const filename = safeFilename(asset.title) + filenameInfix + (i + 1) + ext;
    const result = await uploadFileToDrive(item.blob, filename, folderId);
    item.driveFileId = result.id;
    item.driveUrl = result.webViewLink;
    urls.push(item.driveUrl);
  }
  return urls;
}

async function syncAsset(asset, onProgress) {
  requireConfigured();
  const settings = loadSyncSettings();
  if (!settings.folderId) throw new Error('Choose a Google Drive folder first.');

  const media = asset.media || [];
  const receiptMedia = asset.receiptMedia || [];
  const uploadState = {
    done: 0,
    total: media.filter((m) => !m.driveUrl).length + receiptMedia.filter((m) => !m.driveUrl).length,
  };

  const mediaUrls = await uploadMediaList(media, asset, settings.folderId, '-', onProgress, uploadState);
  const receiptUrls = await uploadMediaList(receiptMedia, asset, settings.folderId, '-receipt-', onProgress, uploadState);

  const rowNumber = await appendOrUpdateSheetRow(asset, mediaUrls, receiptUrls);
  if (rowNumber) asset.sheetRow = rowNumber;
  asset.driveSyncedAt = new Date().toISOString();
  return asset;
}

window.GoogleSync = {
  isConfigured,
  isConnected,
  getSettings: loadSyncSettings,
  connect,
  disconnect,
  chooseFolder,
  connectExistingSheet,
  createNewSheet,
  syncAsset,
};
