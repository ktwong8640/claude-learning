// IndexedDB wrapper for the Death Cleaning asset catalog.
// All data (including photos) stays in the browser's local IndexedDB store —
// nothing is uploaded anywhere.

const DB_NAME = 'death-cleaning-db';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('dispositionType', 'dispositionType', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore(mode, callback) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }));
}

const AssetDB = {
  getAll() {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  },

  put(asset) {
    return withStore('readwrite', (store) => store.put(asset));
  },

  delete(id) {
    return withStore('readwrite', (store) => store.delete(id));
  },

  clear() {
    return withStore('readwrite', (store) => store.clear());
  },
};
