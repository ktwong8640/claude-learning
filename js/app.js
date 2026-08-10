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

let assets = [];
let filters = { disposition: 'all', category: 'all', search: '' };
let objectUrls = [];
let capturedPhotoBlob = null;

// ---------- helpers ----------

function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

function formatCurrency(n) {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
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

const photoInput = document.getElementById('f-photo');
const photoPreview = document.getElementById('f-photo-preview');

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) {
    capturedPhotoBlob = null;
    photoPreview.classList.remove('show');
    return;
  }
  capturedPhotoBlob = file;
  const url = trackObjectUrl(URL.createObjectURL(file));
  photoPreview.src = url;
  photoPreview.classList.add('show');
});

document.getElementById('capture-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const disposition = dispositionSelect.value;
  const asset = {
    id: uuid(),
    title: document.getElementById('f-title').value.trim(),
    category: document.getElementById('f-category').value,
    photo: capturedPhotoBlob || null,
    dispositionType: disposition,
    recipientName: disposition === 'Gift' ? document.getElementById('f-recipient').value.trim() : '',
    platform: disposition === 'Sell' ? document.getElementById('f-platform').value.trim() : '',
    askingPrice: disposition === 'Sell' ? document.getElementById('f-asking-price').value : '',
    donateLocation: disposition === 'Donate' ? document.getElementById('f-donate-location').value.trim() : '',
    estimatedValue: document.getElementById('f-value').value,
    hasProof: document.getElementById('f-has-proof').checked,
    notes: document.getElementById('f-notes').value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!asset.title) return;

  AssetDB.put(asset).then(() => {
    resetCaptureForm();
    showToast('Saved "' + asset.title + '"');
    loadAssets();
  });
});

function resetCaptureForm() {
  document.getElementById('capture-form').reset();
  capturedPhotoBlob = null;
  photoPreview.classList.remove('show');
  updateDispositionFields();
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
    const card = document.createElement('div');
    card.className = 'item-card';
    card.addEventListener('click', () => openItemModal(asset.id));

    let thumbHtml;
    if (asset.photo) {
      const url = trackObjectUrl(URL.createObjectURL(asset.photo));
      thumbHtml = `<img class="item-thumb" src="${url}" alt="">`;
    } else {
      thumbHtml = '<div class="item-thumb placeholder">No photo</div>';
    }

    const metaBits = [asset.category];
    if (asset.dispositionType === 'Gift' && asset.recipientName) metaBits.push('→ ' + asset.recipientName);
    if (asset.dispositionType === 'Sell' && asset.askingPrice) metaBits.push(formatCurrency(asset.askingPrice));

    card.innerHTML = `
      ${thumbHtml}
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

function openItemModal(id) {
  const asset = assets.find((a) => a.id === id);
  if (!asset) return;

  let photoHtml = '';
  if (asset.photo) {
    const url = trackObjectUrl(URL.createObjectURL(asset.photo));
    photoHtml = `<img src="${url}" alt="">`;
  }

  const extraLines = [];
  if (asset.dispositionType === 'Gift' && asset.recipientName) {
    extraLines.push(`<div class="item-meta">Recipient: ${escapeHtml(asset.recipientName)}</div>`);
  }
  if (asset.dispositionType === 'Sell') {
    if (asset.platform) extraLines.push(`<div class="item-meta">Platform: ${escapeHtml(asset.platform)}</div>`);
    if (asset.askingPrice) extraLines.push(`<div class="item-meta">Asking price: ${formatCurrency(asset.askingPrice)}</div>`);
  }
  if (asset.dispositionType === 'Donate' && asset.donateLocation) {
    extraLines.push(`<div class="item-meta">Where: ${escapeHtml(asset.donateLocation)}</div>`);
  }
  if (asset.estimatedValue) {
    extraLines.push(`<div class="item-meta">Estimated value: ${formatCurrency(asset.estimatedValue)}</div>`);
  }
  extraLines.push(`<div class="item-meta">Proof of purchase: ${asset.hasProof ? 'Yes' : 'No'}</div>`);
  if (asset.notes) {
    extraLines.push(`<div class="item-meta" style="margin-top:0.5rem;">${escapeHtml(asset.notes)}</div>`);
  }

  modalContent.innerHTML = `
    <button class="modal-close" id="modal-close-btn">Close</button>
    <h3>${escapeHtml(asset.title)}</h3>
    ${photoHtml}
    <span class="badge ${DISPOSITION_CLASS[asset.dispositionType]}">${asset.dispositionType}</span>
    <div class="item-meta" style="margin-top:0.5rem;">${escapeHtml(asset.category)}</div>
    ${extraLines.join('')}
    <div class="btn-row" style="margin-top:1rem;">
      <button class="danger" id="modal-delete-btn">Delete</button>
    </div>
  `;

  modalContent.querySelector('#modal-close-btn').addEventListener('click', closeItemModal);
  modalContent.querySelector('#modal-delete-btn').addEventListener('click', () => {
    if (confirm(`Delete "${asset.title}"? This can't be undone.`)) {
      AssetDB.delete(asset.id).then(() => {
        closeItemModal();
        showToast('Deleted "' + asset.title + '"');
        loadAssets();
      });
    }
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
    if (asset.askingPrice) bits.push('Asking: ' + formatCurrency(asset.askingPrice));
  }
  if (asset.dispositionType === 'Donate' && asset.donateLocation) bits.push('Where: ' + asset.donateLocation);
  if (asset.estimatedValue) bits.push('Value: ' + formatCurrency(asset.estimatedValue));
  if (asset.hasProof) bits.push('Has proof of purchase');
  const notes = asset.notes ? ` — ${escapeHtml(asset.notes)}` : '';
  return `<div class="print-item"><strong>${escapeHtml(asset.title)}</strong> (${escapeHtml(bits.join(', '))})${notes}</div>`;
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

document.getElementById('btn-export-json').addEventListener('click', async () => {
  const exportable = await Promise.all(assets.map(async (a) => {
    const copy = { ...a };
    copy.photo = a.photo ? await blobToDataUrl(a.photo) : null;
    return copy;
  }));

  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), assets: exportable }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dostadning-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      restored.photo = item.photo ? await dataUrlToBlob(item.photo) : null;
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

function loadAssets() {
  return AssetDB.getAll().then((all) => {
    assets = all;
    const activeEl = document.querySelector('.view.active');
    const activeView = activeEl ? activeEl.id.replace('view-', '') : 'capture';
    if (activeView === 'dashboard') renderDashboard();
    if (activeView === 'export') renderExportSummary();
  });
}

switchView('capture');
loadAssets();
