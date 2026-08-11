// Döstädning app logic. No frameworks, no build step — plain DOM + IndexedDB.

const DISPOSITIONS = ['Keep', 'Gift', 'Sell', 'Donate', 'Discard'];
const DISPOSITION_LABELS = {
  Keep: 'Keep',
  Gift: 'Gift / Designate',
  Sell: 'Sell',
  Donate: 'Donate / Recycle',
  Discard: 'Discard',
};
const DISPOSITION_CLASS = {
  Keep: 'badge-keep',
  Gift: 'badge-gift',
  Sell: 'badge-sell',
  Donate: 'badge-donate',
  Discard: 'badge-discard',
};

const MAX_RECORDING_MS = 60000;
const LAST_CURRENCY_KEY = 'dostadning-last-currency';
const DEFAULT_CURRENCY = 'USD';
// Matches google-sync.js's MAX_LINKED_MEDIA — capping capture at the source means the
// Google Sheet's 3 columns per field are never short of what's actually on the item.
const MAX_MEDIA_PER_FIELD = 3;
const MEDIA_LABEL = { media: 'photos/videos', receiptMedia: 'receipt images' };

let assets = [];
let filters = { disposition: 'all', category: 'all', search: '' };
let objectUrls = [];

// ---------- helpers ----------

function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

function mediaTypeFromMime(mime) {
  return mime && mime.startsWith('video/') ? 'video' : 'image';
}

function formatCurrency(n, currencyCode) {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  try {
    return num.toLocaleString(undefined, { style: 'currency', currency: currencyCode || DEFAULT_CURRENCY });
  } catch {
    return num.toFixed(2) + ' ' + (currencyCode || DEFAULT_CURRENCY);
  }
}

function revokeObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function trackObjectUrl(url) {
  objectUrls.push(url);
  return url;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- currency ----------

function getCurrencyList() {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('currency');
    } catch {
      // fall through to the static list below
    }
  }
  return ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CAD', 'CHF', 'HKD', 'INR', 'KRW',
    'THB', 'IDR', 'PHP', 'VND', 'NZD', 'SEK', 'NOK', 'DKK', 'ZAR', 'AED', 'SAR', 'MXN', 'BRL'];
}

const currencySelect = document.getElementById('f-currency');

function lastUsedCurrency() {
  return localStorage.getItem(LAST_CURRENCY_KEY) || DEFAULT_CURRENCY;
}

function populateCurrencySelect() {
  const list = getCurrencyList();
  currencySelect.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join('');
  const last = lastUsedCurrency();
  currencySelect.value = list.includes(last) ? last : DEFAULT_CURRENCY;
}
populateCurrencySelect();

// ---------- view switching ----------

function switchView(name) {
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  if (name === 'dashboard') renderDashboard();
  if (name === 'export') renderExportSummary();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ---------- capture form ----------

const dispositionSelect = document.getElementById('f-disposition');
const dispositionFieldGroups = {
  Gift: document.getElementById('f-gift-fields'),
  Sell: document.getElementById('f-sell-fields'),
  Donate: document.getElementById('f-donate-fields'),
};

function updateDispositionFields() {
  Object.values(dispositionFieldGroups).forEach((el) => { el.style.display = 'none'; });
  const group = dispositionFieldGroups[dispositionSelect.value];
  if (group) group.style.display = 'block';
}

dispositionSelect.addEventListener('change', updateDispositionFields);
updateDispositionFields();

// ---------- pending media queues (queued in the capture form before "Save item") ----------
// Two independent queues share the same logic: item photos/videos, and receipt/proof-of-
// purchase images. Each gets its own thumbnail strip with a remove (×) button per item.

function createPendingMediaController(listEl, onChange) {
  let items = [];
  let urls = [];

  function render() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    listEl.innerHTML = '';

    items.forEach((item) => {
      const url = URL.createObjectURL(item.blob);
      urls.push(url);

      const wrap = document.createElement('div');
      wrap.className = 'media-thumb-wrap';
      wrap.innerHTML = item.type === 'video'
        ? `<video class="media-thumb" src="${url}" muted playsinline></video><span class="media-thumb-badge">VIDEO</span>`
        : `<img class="media-thumb" src="${url}" alt="">`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'media-thumb-remove';
      removeBtn.setAttribute('aria-label', 'Remove');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        items = items.filter((i) => i.id !== item.id);
        render();
      });
      wrap.appendChild(removeBtn);

      listEl.appendChild(wrap);
    });

    if (onChange) onChange();
  }

  return {
    // Returns false (and adds nothing) once MAX_MEDIA_PER_FIELD is reached — callers
    // decide how to report that back to the user (single capture vs. bulk file picker
    // need different messages).
    add(blob, type) {
      if (items.length >= MAX_MEDIA_PER_FIELD) return false;
      items.push({ id: uuid(), type: type || mediaTypeFromMime(blob.type), blob });
      render();
      return true;
    },
    clear() {
      items = [];
      render();
    },
    get items() { return items; },
    get count() { return items.length; },
  };
}

function refreshCaptureMediaButtons() {
  const mediaFull = mediaController.count >= MAX_MEDIA_PER_FIELD;
  const receiptFull = receiptMediaController.count >= MAX_MEDIA_PER_FIELD;
  document.getElementById('btn-open-camera').disabled = mediaFull;
  document.getElementById('btn-choose-file').disabled = mediaFull;
  document.getElementById('btn-open-receipt-camera').disabled = receiptFull;
  document.getElementById('btn-choose-receipt-file').disabled = receiptFull;
  document.getElementById('media-count-label').textContent = `${mediaController.count} of ${MAX_MEDIA_PER_FIELD} used`;
  document.getElementById('receipt-count-label').textContent = `${receiptMediaController.count} of ${MAX_MEDIA_PER_FIELD} used`;
}

const mediaController = createPendingMediaController(document.getElementById('media-preview-list'), refreshCaptureMediaButtons);
const receiptMediaController = createPendingMediaController(document.getElementById('receipt-media-preview-list'), refreshCaptureMediaButtons);
refreshCaptureMediaButtons();

function addFilesWithLimit(controller, files, fieldLabel) {
  let added = 0;
  for (const file of files) {
    if (!controller.add(file, mediaTypeFromMime(file.type))) break;
    added++;
  }
  if (added < files.length) {
    showToast(`Added ${added} of ${files.length} — up to ${MAX_MEDIA_PER_FIELD} ${fieldLabel} per item.`);
  }
}

const mediaInput = document.getElementById('f-media-input');
mediaInput.addEventListener('change', () => {
  addFilesWithLimit(mediaController, Array.from(mediaInput.files), MEDIA_LABEL.media);
  mediaInput.value = '';
});
document.getElementById('btn-choose-file').addEventListener('click', () => {
  mediaInput.removeAttribute('capture');
  mediaInput.click();
});

const receiptInput = document.getElementById('f-receipt-input');
receiptInput.addEventListener('change', () => {
  addFilesWithLimit(receiptMediaController, Array.from(receiptInput.files), MEDIA_LABEL.receiptMedia);
  receiptInput.value = '';
});
document.getElementById('btn-choose-receipt-file').addEventListener('click', () => {
  receiptInput.click();
});

document.getElementById('capture-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const disposition = dispositionSelect.value;
  const currency = currencySelect.value;
  const asset = {
    id: uuid(),
    title: document.getElementById('f-title').value.trim(),
    category: document.getElementById('f-category').value,
    media: mediaController.items.map((m) => ({ id: m.id, type: m.type, blob: m.blob })),
    receiptMedia: receiptMediaController.items.map((m) => ({ id: m.id, type: m.type, blob: m.blob })),
    dispositionType: disposition,
    recipientName: disposition === 'Gift' ? document.getElementById('f-recipient').value.trim() : '',
    platform: disposition === 'Sell' ? document.getElementById('f-platform').value.trim() : '',
    askingPrice: disposition === 'Sell' ? document.getElementById('f-asking-price').value : '',
    donateLocation: disposition === 'Donate' ? document.getElementById('f-donate-location').value.trim() : '',
    currency,
    estimatedValue: document.getElementById('f-value').value,
    notes: document.getElementById('f-notes').value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!asset.title) return;

  localStorage.setItem(LAST_CURRENCY_KEY, currency);

  AssetDB.put(asset).then(() => {
    resetCaptureForm();
    showToast('Saved "' + asset.title + '"');
    loadAssets();
  });
});

function resetCaptureForm() {
  document.getElementById('capture-form').reset();
  mediaController.clear();
  receiptMediaController.clear();
  updateDispositionFields();
  currencySelect.value = lastUsedCurrency();
}

// ---------- live camera capture ----------
// Opens an in-page viewfinder via getUserMedia (rear camera by default) instead of
// handing off to the OS file picker. Requires a secure context (https:// or localhost) —
// browsers refuse camera access on plain http:// or file://. Supports both a still-photo
// shutter and a video recorder (MediaRecorder) on the same stream, toggled by a mode chip.
//
// cameraTargetAssetId is null when capturing for the not-yet-saved capture form (the result
// goes into the pending queue for cameraTargetField); when set, "Use" attaches the result
// directly to that existing, already-saved item's field instead. cameraTargetField selects
// which media collection this capture belongs to: 'media' (item photos/videos) or
// 'receiptMedia' (proof of purchase — photo-only, the mode toggle is hidden for this one).

const cameraOverlay = document.getElementById('camera-overlay');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const cameraReviewImg = document.getElementById('camera-review-img');
const cameraReviewVideo = document.getElementById('camera-review-video');
const cameraErrorEl = document.getElementById('camera-error');
const cameraLiveControls = document.getElementById('camera-live-controls');
const cameraReviewControls = document.getElementById('camera-review-controls');
const cameraShutterBtn = document.getElementById('camera-shutter');
const cameraModeToggle = document.getElementById('camera-mode-toggle');
const cameraModePhotoBtn = document.getElementById('camera-mode-photo');
const cameraModeVideoBtn = document.getElementById('camera-mode-video');
const cameraRecTimeEl = document.getElementById('camera-rec-time');

let cameraStream = null;
let cameraFacingMode = 'environment';
let cameraMode = 'photo'; // 'photo' | 'video'
let cameraTargetAssetId = null;
let cameraTargetField = 'media'; // 'media' | 'receiptMedia'
let pendingCaptureBlob = null;
let pendingCaptureType = null;
let pendingCaptureUrl = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimerInterval = null;

function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function showCameraError(message) {
  cameraErrorEl.textContent = message;
  cameraErrorEl.classList.add('show');
}

function hideCameraError() {
  cameraErrorEl.classList.remove('show');
}

async function startCameraStream() {
  hideCameraError();
  stopCameraStream();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraFacingMode } },
      audio: cameraMode === 'video',
    });
    cameraVideo.srcObject = cameraStream;
  } catch (err) {
    let message = 'Could not access the camera (' + err.name + ').';
    if (err.name === 'NotAllowedError') {
      message = 'Camera permission was denied. Allow camera access for this site, or use "Choose from Gallery" instead.';
    } else if (err.name === 'NotFoundError') {
      message = 'No camera was found on this device.';
    } else if (!window.isSecureContext) {
      message = 'Camera access needs a secure connection (https://). Serve this app over HTTPS, or use "Choose from Gallery" instead.';
    }
    showCameraError(message);
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function setCameraMode(mode) {
  if (cameraMode === mode) return;
  cameraMode = mode;
  cameraModePhotoBtn.classList.toggle('active', mode === 'photo');
  cameraModeVideoBtn.classList.toggle('active', mode === 'video');
  startCameraStream();
}

function openCamera(targetAssetId, field) {
  cameraTargetAssetId = targetAssetId || null;
  cameraTargetField = field || 'media';
  const photoOnly = cameraTargetField === 'receiptMedia';
  const fallbackInput = photoOnly ? receiptInput : mediaInput;

  if (!cameraSupported()) {
    showToast('Live camera isn\'t supported here — using Choose from Gallery instead.');
    fallbackInput.setAttribute('capture', 'environment');
    fallbackInput.click();
    cameraTargetAssetId = null;
    return;
  }

  cameraMode = 'photo';
  cameraModePhotoBtn.classList.add('active');
  cameraModeVideoBtn.classList.remove('active');
  cameraModeToggle.style.display = photoOnly ? 'none' : 'flex';
  cameraOverlay.classList.remove('reviewing', 'recording', 'review-image', 'review-video');
  cameraOverlay.classList.add('show');
  cameraLiveControls.style.display = 'flex';
  cameraReviewControls.style.display = 'none';
  startCameraStream();
}

function closeCamera() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  stopRecordingTimer();
  stopCameraStream();
  cameraOverlay.classList.remove('show', 'reviewing', 'recording', 'review-image', 'review-video');
  hideCameraError();
  if (pendingCaptureUrl) {
    URL.revokeObjectURL(pendingCaptureUrl);
    pendingCaptureUrl = null;
  }
  pendingCaptureBlob = null;
  pendingCaptureType = null;
  cameraTargetAssetId = null;
  cameraTargetField = 'media';
}

function capturePhoto() {
  if (!cameraVideo.videoWidth) return;
  cameraCanvas.width = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  cameraCanvas.getContext('2d').drawImage(cameraVideo, 0, 0);
  cameraCanvas.toBlob((blob) => {
    if (!blob) return;
    pendingCaptureBlob = blob;
    pendingCaptureType = 'image';
    pendingCaptureUrl = URL.createObjectURL(blob);
    cameraReviewImg.src = pendingCaptureUrl;
    cameraOverlay.classList.add('reviewing', 'review-image');
    cameraLiveControls.style.display = 'none';
    cameraReviewControls.style.display = 'flex';
  }, 'image/jpeg', 0.9);
}

function pickVideoMimeType() {
  if (!window.MediaRecorder) return '';
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function startRecording() {
  if (!cameraStream || !window.MediaRecorder) {
    showCameraError('Video recording isn\'t supported on this browser.');
    return;
  }
  recordedChunks = [];
  const mimeType = pickVideoMimeType();
  try {
    mediaRecorder = mimeType ? new MediaRecorder(cameraStream, { mimeType }) : new MediaRecorder(cameraStream);
  } catch (err) {
    showCameraError('Video recording isn\'t supported on this browser.');
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    stopRecordingTimer();
    cameraOverlay.classList.remove('recording');
    cameraShutterBtn.classList.remove('recording');
    if (recordedChunks.length === 0) return;
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    pendingCaptureBlob = blob;
    pendingCaptureType = 'video';
    pendingCaptureUrl = URL.createObjectURL(blob);
    cameraReviewVideo.src = pendingCaptureUrl;
    cameraOverlay.classList.add('reviewing', 'review-video');
    cameraLiveControls.style.display = 'none';
    cameraReviewControls.style.display = 'flex';
  };

  mediaRecorder.start();
  recordingStartTime = Date.now();
  cameraOverlay.classList.add('recording');
  cameraShutterBtn.classList.add('recording');
  startRecordingTimer();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function startRecordingTimer() {
  updateRecordingTime();
  recordingTimerInterval = setInterval(() => {
    updateRecordingTime();
    if (Date.now() - recordingStartTime >= MAX_RECORDING_MS) stopRecording();
  }, 250);
}

function stopRecordingTimer() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
}

function updateRecordingTime() {
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  cameraRecTimeEl.textContent = mins + ':' + String(secs).padStart(2, '0');
}

function retakeCapture() {
  if (pendingCaptureUrl) {
    URL.revokeObjectURL(pendingCaptureUrl);
    pendingCaptureUrl = null;
  }
  pendingCaptureBlob = null;
  pendingCaptureType = null;
  cameraOverlay.classList.remove('reviewing', 'review-image', 'review-video');
  cameraLiveControls.style.display = 'flex';
  cameraReviewControls.style.display = 'none';
}

function useCapturedMedia() {
  if (pendingCaptureBlob) {
    if (cameraTargetAssetId) {
      attachMediaToAsset(cameraTargetAssetId, [{ blob: pendingCaptureBlob, type: pendingCaptureType }], cameraTargetField);
    } else {
      const controller = cameraTargetField === 'receiptMedia' ? receiptMediaController : mediaController;
      if (!controller.add(pendingCaptureBlob, pendingCaptureType)) {
        showToast(`Up to ${MAX_MEDIA_PER_FIELD} ${MEDIA_LABEL[cameraTargetField]} per item — remove one first.`);
      }
    }
  }
  if (pendingCaptureUrl) {
    URL.revokeObjectURL(pendingCaptureUrl);
    pendingCaptureUrl = null;
  }
  pendingCaptureBlob = null;
  pendingCaptureType = null;
  closeCamera();
}

document.getElementById('btn-open-camera').addEventListener('click', () => openCamera(null, 'media'));
document.getElementById('btn-open-receipt-camera').addEventListener('click', () => openCamera(null, 'receiptMedia'));
// (Both buttons above are also disabled via refreshCaptureMediaButtons once at the cap,
// so this click handler only runs when there's room — no separate guard needed here.)
document.getElementById('camera-cancel').addEventListener('click', closeCamera);
cameraShutterBtn.addEventListener('click', () => {
  if (cameraMode === 'photo') {
    capturePhoto();
  } else if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});
document.getElementById('camera-retake').addEventListener('click', retakeCapture);
document.getElementById('camera-use').addEventListener('click', useCapturedMedia);
document.getElementById('camera-switch').addEventListener('click', () => {
  cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
  startCameraStream();
});
cameraModePhotoBtn.addEventListener('click', () => setCameraMode('photo'));
cameraModeVideoBtn.addEventListener('click', () => setCameraMode('video'));

// ---------- attaching/removing media on an already-saved item (from the item detail modal) ----------

function attachMediaToAsset(assetId, items, field) {
  field = field || 'media';
  const asset = assets.find((a) => a.id === assetId);
  if (!asset || items.length === 0) return;

  const current = asset[field] || [];
  const room = Math.max(0, MAX_MEDIA_PER_FIELD - current.length);
  const toAdd = items.slice(0, room);
  const skipped = items.length - toAdd.length;

  if (toAdd.length === 0) {
    showToast(`Up to ${MAX_MEDIA_PER_FIELD} ${MEDIA_LABEL[field]} per item — remove one first.`);
    return;
  }

  asset[field] = current.concat(toAdd.map((it) => ({ id: uuid(), type: it.type, blob: it.blob })));
  asset.updatedAt = new Date().toISOString();
  AssetDB.put(asset).then(() => {
    showToast(skipped > 0
      ? `Added ${toAdd.length} to "${asset.title}" (${skipped} skipped — max ${MAX_MEDIA_PER_FIELD}).`
      : 'Added to "' + asset.title + '"');
    loadAssets().then(() => openItemModal(assetId));
  });
}

function removeMediaFromAsset(assetId, mediaId, field) {
  field = field || 'media';
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return;
  asset[field] = (asset[field] || []).filter((m) => m.id !== mediaId);
  asset.updatedAt = new Date().toISOString();
  AssetDB.put(asset).then(() => {
    loadAssets().then(() => openItemModal(assetId));
  });
}

// ---------- dashboard ----------

function populateCategoryFilter() {
  const select = document.getElementById('category-filter');
  const current = select.value;
  const categories = Array.from(new Set(assets.map((a) => a.category))).sort();
  select.innerHTML = '<option value="all">All categories</option>' +
    categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  select.value = categories.includes(current) ? current : 'all';
}

document.querySelectorAll('#disposition-chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#disposition-chips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    filters.disposition = chip.dataset.disposition;
    renderDashboard();
  });
});

document.getElementById('category-filter').addEventListener('change', (e) => {
  filters.category = e.target.value;
  renderDashboard();
});

document.getElementById('search-filter').addEventListener('input', (e) => {
  filters.search = e.target.value.trim().toLowerCase();
  renderDashboard();
});

function filteredAssets() {
  return assets.filter((a) => {
    if (filters.disposition !== 'all' && a.dispositionType !== filters.disposition) return false;
    if (filters.category !== 'all' && a.category !== filters.category) return false;
    if (filters.search && !a.title.toLowerCase().includes(filters.search)) return false;
    return true;
  });
}

function thumbnailHtml(media) {
  const firstImage = media.find((m) => m.type === 'image');
  const thumbMedia = firstImage || media[0];
  if (!thumbMedia) return '<div class="item-thumb placeholder">No photo</div>';

  const url = trackObjectUrl(URL.createObjectURL(thumbMedia.blob));
  return thumbMedia.type === 'video'
    ? `<video class="item-thumb" src="${url}" muted playsinline></video>`
    : `<img class="item-thumb" src="${url}" alt="">`;
}

function renderDashboard() {
  populateCategoryFilter();
  revokeObjectUrls();
  const list = document.getElementById('item-list');
  const items = filteredAssets().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">No items match. Add one from the Capture tab.</p>';
    return;
  }

  list.innerHTML = '';
  items.forEach((asset) => {
    const media = asset.media || [];
    const card = document.createElement('div');
    card.className = 'item-card';
    card.addEventListener('click', () => openItemModal(asset.id));

    const countBadge = media.length > 1 ? `<span class="media-count-badge">${media.length}</span>` : '';

    const metaBits = [asset.category];
    if (asset.dispositionType === 'Gift' && asset.recipientName) metaBits.push('→ ' + asset.recipientName);
    if (asset.dispositionType === 'Sell' && asset.askingPrice) metaBits.push(formatCurrency(asset.askingPrice, asset.currency));

    card.innerHTML = `
      <div class="item-thumb-wrap">${thumbnailHtml(media)}${countBadge}</div>
      <div class="item-info">
        <div class="item-title"></div>
        <div class="item-meta"></div>
        <span class="badge ${DISPOSITION_CLASS[asset.dispositionType]}">${asset.dispositionType}</span>
      </div>
    `;
    card.querySelector('.item-title').textContent = asset.title;
    card.querySelector('.item-meta').textContent = metaBits.join(' · ');
    list.appendChild(card);
  });
}

// ---------- item detail / edit modal ----------

const modalOverlay = document.getElementById('item-modal');
const modalContent = document.getElementById('item-modal-content');

function galleryHtml(media, field) {
  if (media.length === 0) {
    return '<p class="empty-state" style="padding:1.5rem 0;">Nothing here yet.</p>';
  }
  return '<div class="modal-gallery">' + media.map((m) => {
    const url = trackObjectUrl(URL.createObjectURL(m.blob));
    const inner = m.type === 'video'
      ? `<video src="${url}" controls playsinline></video>`
      : `<img src="${url}" alt="">`;
    return `<div class="modal-gallery-item">${inner}<button type="button" class="modal-gallery-remove" data-media-id="${m.id}" data-field="${field}" aria-label="Remove">×</button></div>`;
  }).join('') + '</div>';
}

function openItemModal(id) {
  const asset = assets.find((a) => a.id === id);
  if (!asset) return;
  const media = asset.media || [];
  const receiptMedia = asset.receiptMedia || [];

  const extraLines = [];
  if (asset.dispositionType === 'Gift' && asset.recipientName) {
    extraLines.push(`<div class="item-meta">Recipient: ${escapeHtml(asset.recipientName)}</div>`);
  }
  if (asset.dispositionType === 'Sell') {
    if (asset.platform) extraLines.push(`<div class="item-meta">Platform: ${escapeHtml(asset.platform)}</div>`);
    if (asset.askingPrice) extraLines.push(`<div class="item-meta">Asking price: ${formatCurrency(asset.askingPrice, asset.currency)}</div>`);
  }
  if (asset.dispositionType === 'Donate' && asset.donateLocation) {
    extraLines.push(`<div class="item-meta">Where: ${escapeHtml(asset.donateLocation)}</div>`);
  }
  if (asset.estimatedValue) {
    extraLines.push(`<div class="item-meta">Estimated value: ${formatCurrency(asset.estimatedValue, asset.currency)}</div>`);
  }
  if (asset.notes) {
    extraLines.push(`<div class="item-meta" style="margin-top:0.5rem;">${escapeHtml(asset.notes)}</div>`);
  }

  const googleConfigured = window.GoogleSync && GoogleSync.isConfigured();
  const synced = googleConfigured && isAssetSynced(asset);
  const googleSyncHtml = googleConfigured
    ? `<div class="btn-row" style="margin-bottom:0.5rem;">
         <button type="button" class="secondary full" id="modal-google-sync-btn">${synced ? 'Re-sync to Google Drive' : 'Sync to Google Drive'}</button>
       </div>
       ${synced ? '<p class="item-meta" style="margin-top:-0.25rem;margin-bottom:1rem;">Synced to Google Drive/Sheet.</p>' : '<div style="margin-bottom:1rem;"></div>'}`
    : '';

  const mediaFull = media.length >= MAX_MEDIA_PER_FIELD;
  const receiptFull = receiptMedia.length >= MAX_MEDIA_PER_FIELD;
  const limitTitle = `Maximum ${MAX_MEDIA_PER_FIELD} per item`;

  modalContent.innerHTML = `
    <button class="modal-close" id="modal-close-btn">Close</button>
    <h3>${escapeHtml(asset.title)}</h3>
    ${galleryHtml(media, 'media')}
    <div class="btn-row" style="margin-bottom:0.25rem;">
      <button type="button" class="secondary" id="modal-camera-btn" ${mediaFull ? `disabled title="${limitTitle}"` : ''}>Camera</button>
      <button type="button" class="secondary" id="modal-gallery-btn" ${mediaFull ? `disabled title="${limitTitle}"` : ''}>Choose from Gallery</button>
    </div>
    <p class="item-meta" style="margin-bottom:1rem;">${media.length} of ${MAX_MEDIA_PER_FIELD} used</p>
    <input type="file" id="modal-media-input" accept="image/*,video/*" multiple style="display:none;">
    ${googleSyncHtml}
    <span class="badge ${DISPOSITION_CLASS[asset.dispositionType]}">${asset.dispositionType}</span>
    <div class="item-meta" style="margin-top:0.5rem;">${escapeHtml(asset.category)}</div>
    ${extraLines.join('')}

    <h3 style="margin-top:1.25rem;">Receipt / proof of purchase</h3>
    ${galleryHtml(receiptMedia, 'receiptMedia')}
    <div class="btn-row" style="margin-bottom:0.25rem;">
      <button type="button" class="secondary" id="modal-receipt-camera-btn" ${receiptFull ? `disabled title="${limitTitle}"` : ''}>Camera</button>
      <button type="button" class="secondary" id="modal-receipt-gallery-btn" ${receiptFull ? `disabled title="${limitTitle}"` : ''}>Choose from Gallery</button>
    </div>
    <p class="item-meta">${receiptMedia.length} of ${MAX_MEDIA_PER_FIELD} used</p>
    <input type="file" id="modal-receipt-input" accept="image/*" multiple style="display:none;">

    <div class="btn-row" style="margin-top:1rem;">
      <button type="button" class="secondary" id="modal-edit-btn">Edit</button>
      <button class="danger" id="modal-delete-btn">Delete item</button>
    </div>
  `;

  modalContent.querySelector('#modal-close-btn').addEventListener('click', closeItemModal);
  modalContent.querySelector('#modal-edit-btn').addEventListener('click', () => renderEditForm(asset));
  modalContent.querySelectorAll('.modal-gallery-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeMediaFromAsset(asset.id, btn.dataset.mediaId, btn.dataset.field));
  });

  modalContent.querySelector('#modal-camera-btn').addEventListener('click', () => openCamera(asset.id, 'media'));
  const modalMediaInput = modalContent.querySelector('#modal-media-input');
  modalContent.querySelector('#modal-gallery-btn').addEventListener('click', () => modalMediaInput.click());
  modalMediaInput.addEventListener('change', () => {
    const items = Array.from(modalMediaInput.files).map((file) => ({ blob: file, type: mediaTypeFromMime(file.type) }));
    modalMediaInput.value = '';
    if (items.length) attachMediaToAsset(asset.id, items, 'media');
  });

  modalContent.querySelector('#modal-receipt-camera-btn').addEventListener('click', () => openCamera(asset.id, 'receiptMedia'));
  const modalReceiptInput = modalContent.querySelector('#modal-receipt-input');
  modalContent.querySelector('#modal-receipt-gallery-btn').addEventListener('click', () => modalReceiptInput.click());
  modalReceiptInput.addEventListener('change', () => {
    const items = Array.from(modalReceiptInput.files).map((file) => ({ blob: file, type: 'image' }));
    modalReceiptInput.value = '';
    if (items.length) attachMediaToAsset(asset.id, items, 'receiptMedia');
  });

  const syncBtn = modalContent.querySelector('#modal-google-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      const originalText = syncBtn.textContent;
      try {
        await GoogleSync.syncAsset(asset, (i, total) => { syncBtn.textContent = `Uploading ${i}/${total}…`; });
        await AssetDB.put(asset);
        showToast('Synced "' + asset.title + '" to Google Drive');
        await loadAssets();
        openItemModal(asset.id);
      } catch (err) {
        showToast(err.message);
        syncBtn.disabled = false;
        syncBtn.textContent = originalText;
      }
    });
  }

  modalContent.querySelector('#modal-delete-btn').addEventListener('click', () => {
    const sheetNote = asset.sheetRow ? ' Its Google Sheet row will also be cleared.' : '';
    if (!confirm(`Delete "${asset.title}"? This can't be undone.${sheetNote}`)) return;

    // Best-effort: only try if this item actually has a row to clear, and we're already
    // connected (never trigger a surprise Google sign-in popup from a delete action).
    // Any failure here is reported but never blocks the local delete.
    const clearSheet = (asset.sheetRow && window.GoogleSync && GoogleSync.isConfigured() && GoogleSync.isConnected())
      ? GoogleSync.clearSheetRow(asset.sheetRow).then(() => null).catch((err) => err.message)
      : Promise.resolve(null);

    clearSheet.then((sheetError) => {
      AssetDB.delete(asset.id).then(() => {
        closeItemModal();
        showToast(sheetError
          ? `Deleted "${asset.title}" — but couldn't clear its Google Sheet row (${sheetError})`
          : 'Deleted "' + asset.title + '"');
        loadAssets();
      });
    });
  });

  modalOverlay.classList.add('show');
}

function editDispositionFieldGroups() {
  return {
    Gift: document.getElementById('modal-edit-gift-fields'),
    Sell: document.getElementById('modal-edit-sell-fields'),
    Donate: document.getElementById('modal-edit-donate-fields'),
  };
}

function updateEditDispositionFields() {
  const groups = editDispositionFieldGroups();
  const current = document.getElementById('modal-edit-disposition').value;
  Object.values(groups).forEach((el) => { el.style.display = 'none'; });
  if (groups[current]) groups[current].style.display = 'block';
}

function renderEditForm(asset) {
  const categoryOptions = Array.from(document.getElementById('f-category').options)
    .map((o) => `<option value="${o.value}" ${o.value === asset.category ? 'selected' : ''}>${o.textContent}</option>`)
    .join('');
  const dispositionOptions = DISPOSITIONS
    .map((d) => `<option value="${d}" ${d === asset.dispositionType ? 'selected' : ''}>${DISPOSITION_LABELS[d]}</option>`)
    .join('');
  const currencyOptions = getCurrencyList()
    .map((c) => `<option value="${c}" ${c === (asset.currency || DEFAULT_CURRENCY) ? 'selected' : ''}>${c}</option>`)
    .join('');

  modalContent.innerHTML = `
    <button class="modal-close" id="modal-close-btn">Close</button>
    <h3>Edit item</h3>

    <label for="modal-edit-title">Item title</label>
    <input type="text" id="modal-edit-title" value="${escapeHtml(asset.title)}" required>

    <label for="modal-edit-category">Category</label>
    <select id="modal-edit-category">${categoryOptions}</select>

    <label for="modal-edit-disposition">Disposition</label>
    <select id="modal-edit-disposition">${dispositionOptions}</select>

    <div id="modal-edit-gift-fields" class="disposition-fields" style="display:none;">
      <label for="modal-edit-recipient">Recipient</label>
      <input type="text" id="modal-edit-recipient" placeholder="Name of family member or friend" value="${escapeHtml(asset.recipientName || '')}">
    </div>

    <div id="modal-edit-sell-fields" class="disposition-fields" style="display:none;">
      <label for="modal-edit-platform">Sale platform</label>
      <input type="text" id="modal-edit-platform" placeholder="e.g. Carousell, Facebook Marketplace" value="${escapeHtml(asset.platform || '')}">
      <label for="modal-edit-asking-price">Asking price</label>
      <input type="number" id="modal-edit-asking-price" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(String(asset.askingPrice || ''))}">
    </div>

    <div id="modal-edit-donate-fields" class="disposition-fields" style="display:none;">
      <label for="modal-edit-donate-location">Charity / recycling facility</label>
      <input type="text" id="modal-edit-donate-location" placeholder="e.g. Salvation Army, e-waste center" value="${escapeHtml(asset.donateLocation || '')}">
    </div>

    <label for="modal-edit-value">Estimated value</label>
    <div class="value-row">
      <select id="modal-edit-currency">${currencyOptions}</select>
      <input type="number" id="modal-edit-value" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(String(asset.estimatedValue || ''))}">
    </div>

    <label for="modal-edit-notes">Notes</label>
    <textarea id="modal-edit-notes" placeholder="Sentimental notes, condition, why this item goes to this person...">${escapeHtml(asset.notes || '')}</textarea>

    <div class="btn-row" style="margin-top:1rem;">
      <button type="button" class="secondary" id="modal-edit-cancel-btn">Cancel</button>
      <button type="button" id="modal-edit-save-btn">Save changes</button>
    </div>
  `;

  modalContent.querySelector('#modal-close-btn').addEventListener('click', closeItemModal);
  document.getElementById('modal-edit-disposition').addEventListener('change', updateEditDispositionFields);
  updateEditDispositionFields();

  modalContent.querySelector('#modal-edit-cancel-btn').addEventListener('click', () => openItemModal(asset.id));

  modalContent.querySelector('#modal-edit-save-btn').addEventListener('click', () => {
    const title = document.getElementById('modal-edit-title').value.trim();
    if (!title) {
      showToast('Item title can\'t be empty');
      return;
    }
    const disposition = document.getElementById('modal-edit-disposition').value;
    asset.title = title;
    asset.category = document.getElementById('modal-edit-category').value;
    asset.dispositionType = disposition;
    asset.recipientName = disposition === 'Gift' ? document.getElementById('modal-edit-recipient').value.trim() : '';
    asset.platform = disposition === 'Sell' ? document.getElementById('modal-edit-platform').value.trim() : '';
    asset.askingPrice = disposition === 'Sell' ? document.getElementById('modal-edit-asking-price').value : '';
    asset.donateLocation = disposition === 'Donate' ? document.getElementById('modal-edit-donate-location').value.trim() : '';
    asset.currency = document.getElementById('modal-edit-currency').value;
    asset.estimatedValue = document.getElementById('modal-edit-value').value;
    asset.notes = document.getElementById('modal-edit-notes').value.trim();
    asset.updatedAt = new Date().toISOString();

    AssetDB.put(asset).then(() => {
      showToast('Saved changes to "' + asset.title + '"');
      return loadAssets();
    }).then(() => openItemModal(asset.id));
  });

  modalOverlay.classList.add('show');
}

function closeItemModal() {
  modalOverlay.classList.remove('show');
  modalContent.innerHTML = '';
}

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeItemModal();
});

// ---------- export view ----------

function renderExportSummary() {
  const grid = document.getElementById('summary-grid');
  grid.innerHTML = DISPOSITIONS.map((d) => {
    const count = assets.filter((a) => a.dispositionType === d).length;
    return `
      <div class="summary-tile">
        <div class="count">${count}</div>
        <div class="label">${DISPOSITION_LABELS[d]}</div>
      </div>
    `;
  }).join('');
  renderGoogleSyncCard();
}

document.getElementById('btn-print').addEventListener('click', () => {
  buildPrintableSummary();
  window.print();
});

function buildPrintableSummary() {
  const container = document.getElementById('printable-summary');
  const today = new Date().toLocaleDateString();

  let html = `
    <h1>Döstädning — Estate Inventory</h1>
    <p>Generated ${today} · ${assets.length} item${assets.length === 1 ? '' : 's'}</p>
  `;

  DISPOSITIONS.forEach((disposition) => {
    const items = assets.filter((a) => a.dispositionType === disposition);
    if (items.length === 0) return;

    html += `<h2>${DISPOSITION_LABELS[disposition]} (${items.length})</h2>`;

    if (disposition === 'Gift') {
      const byRecipient = {};
      items.forEach((a) => {
        const key = a.recipientName || 'Unassigned';
        (byRecipient[key] = byRecipient[key] || []).push(a);
      });
      Object.keys(byRecipient).sort().forEach((recipient) => {
        html += `<h3>To: ${escapeHtml(recipient)}</h3>`;
        byRecipient[recipient].forEach((a) => { html += printItemLine(a); });
      });
    } else {
      items.forEach((a) => { html += printItemLine(a); });
    }
  });

  container.innerHTML = html;
}

function printItemLine(asset) {
  const bits = [asset.category];
  if (asset.dispositionType === 'Sell') {
    if (asset.platform) bits.push('Platform: ' + asset.platform);
    if (asset.askingPrice) bits.push('Asking: ' + formatCurrency(asset.askingPrice, asset.currency));
  }
  if (asset.dispositionType === 'Donate' && asset.donateLocation) bits.push('Where: ' + asset.donateLocation);
  if (asset.estimatedValue) bits.push('Value: ' + formatCurrency(asset.estimatedValue, asset.currency));

  const receiptCount = (asset.receiptMedia || []).length;
  if (receiptCount) bits.push(receiptCount + ' receipt image' + (receiptCount === 1 ? '' : 's'));

  const media = asset.media || [];
  const photoCount = media.filter((m) => m.type === 'image').length;
  const videoCount = media.filter((m) => m.type === 'video').length;
  if (photoCount) bits.push(photoCount + ' photo' + (photoCount === 1 ? '' : 's'));
  if (videoCount) bits.push(videoCount + ' video' + (videoCount === 1 ? '' : 's'));

  const notes = asset.notes ? ` — ${escapeHtml(asset.notes)}` : '';
  return `<div class="print-item"><strong>${escapeHtml(asset.title)}</strong> (${escapeHtml(bits.join(', '))})${notes}</div>`;
}

// ---------- Google Drive sync ----------

function isAssetSynced(asset) {
  if (!asset.driveSyncedAt) return false;
  const media = asset.media || [];
  const receiptMedia = asset.receiptMedia || [];
  return media.every((m) => !!m.driveUrl) && receiptMedia.every((m) => !!m.driveUrl);
}

// Shared by the "Sync all items" button and the pre-backup-upload check, so both walk
// the same pending list the same way. Calls loadAssets() itself once done (which,  since
// this only ever runs from the Export view, re-renders this whole card — any DOM element
// reference a caller held before calling this is stale afterward and must be re-fetched.
async function syncPendingAssets(onProgress) {
  const pending = assets.filter((a) => !isAssetSynced(a));
  let done = 0;
  let error = null;
  for (const asset of pending) {
    if (onProgress) onProgress(asset, done, pending.length);
    try {
      await GoogleSync.syncAsset(asset);
      await AssetDB.put(asset);
      done++;
    } catch (err) {
      error = `Stopped on "${asset.title}": ${err.message}`;
      break;
    }
  }
  await loadAssets();
  return { done, total: pending.length, error };
}

function renderGoogleSyncCard() {
  const container = document.getElementById('google-sync-body');
  if (!container) return;

  if (!window.GoogleSync || !GoogleSync.isConfigured()) {
    container.innerHTML = '<p class="item-meta">Not set up yet. Copy <code>js/google-config.example.js</code> to <code>js/google-config.js</code>, fill in your Google Client ID and API key, and reload — see README.md for the full setup steps.</p>';
    return;
  }

  const settings = GoogleSync.getSettings();

  if (!GoogleSync.isConnected()) {
    container.innerHTML = '<button type="button" class="full" id="google-connect-btn">Connect Google Account</button>';
    container.querySelector('#google-connect-btn').addEventListener('click', async () => {
      try {
        await GoogleSync.connect();
        showToast('Connected to Google');
      } catch (err) {
        showToast(err.message);
      }
      renderGoogleSyncCard();
    });
    return;
  }

  const pendingCount = assets.filter((a) => !isAssetSynced(a)).length;

  container.innerHTML = `
    <div class="item-meta">Connected to Google <button type="button" class="secondary" id="google-disconnect-btn" style="padding:0.2rem 0.6rem; margin-left:0.5rem;">Disconnect</button></div>
    <div class="item-meta" style="margin-top:0.75rem;">Folder: ${settings.folderName ? escapeHtml(settings.folderName) : '<em>not chosen</em>'}</div>
    <button type="button" class="secondary full" id="google-folder-btn">${settings.folderId ? 'Change folder' : 'Choose Drive folder'}</button>
    <div class="item-meta" style="margin-top:0.75rem;">Sheet: ${settings.sheetName ? escapeHtml(settings.sheetName) : '<em>not connected</em>'}</div>
    <div class="btn-row">
      <input type="text" id="google-sheet-input" placeholder="Paste existing Sheet URL or ID">
    </div>
    <div class="btn-row">
      <button type="button" class="secondary" id="google-sheet-connect-btn">Connect sheet</button>
      <button type="button" class="secondary" id="google-sheet-create-btn">Create new sheet</button>
    </div>
    <button type="button" class="full" id="google-sync-all-btn" ${settings.folderId ? '' : 'disabled'}>Sync all items (${pendingCount} pending)</button>
    <button type="button" class="secondary full" id="google-upload-backup-btn" style="margin-top:0.6rem;" ${settings.folderId ? '' : 'disabled'}>Upload backup to Drive</button>
  `;

  container.querySelector('#google-disconnect-btn').addEventListener('click', () => {
    GoogleSync.disconnect();
    renderGoogleSyncCard();
  });

  container.querySelector('#google-folder-btn').addEventListener('click', async () => {
    try {
      const folder = await GoogleSync.chooseFolder();
      if (folder) showToast('Folder set to "' + folder.name + '"');
    } catch (err) {
      showToast(err.message);
    }
    renderGoogleSyncCard();
  });

  container.querySelector('#google-sheet-connect-btn').addEventListener('click', async () => {
    const input = container.querySelector('#google-sheet-input').value.trim();
    if (!input) { showToast('Paste a sheet URL or ID first'); return; }
    try {
      const sheet = await GoogleSync.connectExistingSheet(input);
      showToast('Connected to "' + sheet.name + '"');
    } catch (err) {
      showToast(err.message);
    }
    renderGoogleSyncCard();
  });

  container.querySelector('#google-sheet-create-btn').addEventListener('click', async () => {
    try {
      const sheet = await GoogleSync.createNewSheet();
      showToast('Created "' + sheet.name + '"');
    } catch (err) {
      showToast(err.message);
    }
    renderGoogleSyncCard();
  });

  container.querySelector('#google-sync-all-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#google-sync-all-btn');
    const result = await syncPendingAssets((asset, i, total) => {
      btn.textContent = `Syncing "${asset.title}"… (${i + 1}/${total})`;
    });
    showToast(result.error || `Synced ${result.done} of ${result.total} item${result.total === 1 ? '' : 's'}`);
  });

  container.querySelector('#google-upload-backup-btn').addEventListener('click', async () => {
    const originalText = container.querySelector('#google-upload-backup-btn').textContent;
    const pending = assets.filter((a) => !isAssetSynced(a));
    let syncedFirst = false;

    if (pending.length > 0) {
      const noun = pending.length === 1 ? 'item hasn\'t' : 'items haven\'t';
      const wantsSync = confirm(
        `${pending.length} ${noun} been synced to Google Drive/Sheets yet.\n\n` +
        `Sync ${pending.length === 1 ? 'it' : 'them'} now before uploading the backup? ` +
        `(The backup itself always includes every item either way — this just keeps Drive/Sheets in sync too.)`
      );
      if (wantsSync) {
        const syncBtn = container.querySelector('#google-upload-backup-btn');
        syncBtn.disabled = true;
        const result = await syncPendingAssets((asset, i, total) => {
          syncBtn.textContent = `Syncing "${asset.title}"… (${i + 1}/${total})`;
        });
        // syncPendingAssets() called loadAssets(), which re-rendered this whole card —
        // the button reference above is now detached; re-fetch before continuing.
        if (result.error) {
          showToast(result.error + ' — backup not uploaded.');
          return;
        }
        syncedFirst = true;
      }
    }

    const btn = container.querySelector('#google-upload-backup-btn');
    btn.disabled = true;
    btn.textContent = 'Preparing backup…';
    try {
      const { blob, filename } = await buildBackupBlob();
      btn.textContent = 'Uploading…';
      await GoogleSync.uploadBackup(blob, filename);
      showToast(syncedFirst ? 'Synced pending items and uploaded backup to Drive' : 'Backup uploaded to Drive');
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

// ---------- backup / restore ----------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((res) => res.blob());
}

// Shared by the local download button and the "Upload backup to Drive" button in the
// Google sync card, so both always produce an identical backup.
async function buildBackupBlob() {
  const exportable = await Promise.all(assets.map(async (a) => {
    const copy = { ...a };
    copy.media = await Promise.all((a.media || []).map(async (m) => ({
      id: m.id,
      type: m.type,
      blob: await blobToDataUrl(m.blob),
    })));
    copy.receiptMedia = await Promise.all((a.receiptMedia || []).map(async (m) => ({
      id: m.id,
      type: m.type,
      blob: await blobToDataUrl(m.blob),
    })));
    return copy;
  }));

  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), assets: exportable }, null, 2)], { type: 'application/json' });
  const filename = `dostadning-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return { blob, filename };
}

document.getElementById('btn-export-json').addEventListener('click', async () => {
  const { blob, filename } = await buildBackupBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
});

document.getElementById('btn-import-json').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : data.assets;
    if (!Array.isArray(items)) throw new Error('Unrecognized backup format');

    for (const item of items) {
      const restored = { ...item };
      if (Array.isArray(item.media)) {
        restored.media = await Promise.all(item.media.map(async (m) => ({
          id: m.id || uuid(),
          type: m.type,
          blob: await dataUrlToBlob(m.blob),
        })));
      } else if (item.photo) {
        // legacy single-photo backup format
        restored.media = [{ id: uuid(), type: 'image', blob: await dataUrlToBlob(item.photo) }];
      } else {
        restored.media = [];
      }
      restored.receiptMedia = Array.isArray(item.receiptMedia)
        ? await Promise.all(item.receiptMedia.map(async (m) => ({
            id: m.id || uuid(),
            type: m.type,
            blob: await dataUrlToBlob(m.blob),
          })))
        : [];
      delete restored.photo;
      delete restored.hasProof;
      restored.id = restored.id || uuid();
      await AssetDB.put(restored);
    }

    showToast(`Restored ${items.length} item${items.length === 1 ? '' : 's'}`);
    loadAssets();
  } catch (err) {
    alert('Could not read this backup file: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ---------- boot ----------

function migrateAsset(asset) {
  let changed = false;
  if (!asset.media) {
    asset.media = asset.photo ? [{ id: uuid(), type: 'image', blob: asset.photo }] : [];
    delete asset.photo;
    changed = true;
  }
  if (!asset.receiptMedia) {
    asset.receiptMedia = [];
    changed = true;
  }
  if ('hasProof' in asset) {
    delete asset.hasProof;
    changed = true;
  }
  return changed;
}

async function loadAssets() {
  const all = await AssetDB.getAll();
  for (const asset of all) {
    if (migrateAsset(asset)) await AssetDB.put(asset);
  }
  assets = all;
  const activeEl = document.querySelector('.view.active');
  const activeView = activeEl ? activeEl.id.replace('view-', '') : 'capture';
  if (activeView === 'dashboard') renderDashboard();
  if (activeView === 'export') renderExportSummary();
}

switchView('capture');
loadAssets();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline/installable support is a nice-to-have; ignore registration failures
      // (e.g. when running over plain http:// during local development).
    });
  });
}
