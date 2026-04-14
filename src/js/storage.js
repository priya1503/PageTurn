/**
 * Storage — Utility wrappers for localStorage and IndexedDB.
 * Provides typed get/set with error handling and book-scoped key generation.
 */

const DB_NAME = 'PageTurnDB';
const DB_VERSION = 1;
const STORE_LIBRARY = 'library';

// ─── localStorage helpers ────────────────────────

/**
 * Generate a scoped storage key for a book.
 * @param {string} bookId - Unique identifier for the book
 * @param {string} key - Property name
 * @returns {string}
 */
export function bookKey(bookId, key) {
  return `pt_${bookId}_${key}`;
}

/**
 * Get a value from localStorage, parsed from JSON.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
export function getLocal(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Set a value in localStorage, serialized as JSON.
 * @param {string} key
 * @param {*} value
 */
export function setLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[Storage] localStorage write failed:', err);
  }
}

/**
 * Remove a key from localStorage.
 * @param {string} key
 */
export function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

// ─── IndexedDB helpers ───────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
        db.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from the library store.
 * @returns {Promise<Array>}
 */
export async function getLibraryItems() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LIBRARY, 'readonly');
      const store = tx.objectStore(STORE_LIBRARY);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Save or update a library item.
 * @param {Object} item - Must have an `id` property
 * @returns {Promise<void>}
 */
export async function saveLibraryItem(item) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LIBRARY, 'readwrite');
      const store = tx.objectStore(STORE_LIBRARY);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Storage] IndexedDB write failed:', err);
  }
}

/**
 * Delete a library item by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteLibraryItem(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LIBRARY, 'readwrite');
      const store = tx.objectStore(STORE_LIBRARY);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Storage] IndexedDB delete failed:', err);
  }
}

/**
 * Clear all library items.
 * @returns {Promise<void>}
 */
export async function clearLibrary() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LIBRARY, 'readwrite');
      const store = tx.objectStore(STORE_LIBRARY);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Storage] IndexedDB clear failed:', err);
  }
}
