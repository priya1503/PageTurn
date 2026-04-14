/**
 * LibraryManager — Manages recently opened books for the landing page library grid.
 * Stores metadata + cover thumbnails in IndexedDB.
 */

import { eventBus } from './eventBus.js';
import { getLibraryItems, saveLibraryItem, clearLibrary } from './storage.js';
import { $, createElement } from './utils.js';

class LibraryManager {
  constructor() {
    /** @type {Array} */
    this._items = [];
  }

  /**
   * Initialize the library: load items and render.
   */
  async init() {
    await this.loadItems();
    this.render();
    this._bindEvents();
  }

  /**
   * Load library items from IndexedDB.
   */
  async loadItems() {
    this._items = await getLibraryItems();
    // Sort by last opened, newest first
    this._items.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  }

  /**
   * Add or update a book in the library.
   * @param {Object} data
   * @param {string} data.bookId
   * @param {string} data.title
   * @param {string} data.author
   * @param {string|null} data.coverUrl
   * @param {string} data.fileName
   */
  async addBook({ bookId, title, author, coverUrl, fileName }) {
    const item = {
      id: bookId,
      title,
      author,
      coverDataUrl: null,
      fileName,
      lastOpened: Date.now(),
    };

    // Convert cover blob URL to data URL for persistence
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        const blob = await response.blob();
        item.coverDataUrl = await this._blobToDataUrl(blob);
      } catch {
        // Cover extraction failed, that's okay
      }
    }

    await saveLibraryItem(item);
    await this.loadItems();
    this.render();
  }

  /**
   * Clear all library items.
   */
  async clearAll() {
    await clearLibrary();
    this._items = [];
    this.render();
    eventBus.emit('toast', { message: 'Library cleared', type: 'success' });
  }

  /**
   * Render the library grid.
   */
  render() {
    const section = $('#library-section');
    const grid = $('#library-grid');
    if (!section || !grid) return;

    if (this._items.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';

    this._items.forEach((item) => {
      const card = createElement('div', { className: 'library-card' });

      const coverHtml = item.coverDataUrl
        ? `<div class="library-card-cover"><img src="${item.coverDataUrl}" alt="${this._escapeHtml(item.title)} cover" loading="lazy" /></div>`
        : `<div class="library-card-cover">📖</div>`;

      card.innerHTML = `
        ${coverHtml}
        <div class="library-card-info">
          <div class="library-card-title" title="${this._escapeHtml(item.title)}">${this._escapeHtml(item.title)}</div>
          <div class="library-card-author">${this._escapeHtml(item.author)}</div>
        </div>
      `;

      // Note: We can't reopen without the file for now.
      // The card serves as a visual record. Users need to re-open the file.
      card.addEventListener('click', () => {
        eventBus.emit('toast', {
          message: `To reopen "${item.title}", please open the file again.`,
          type: 'warning',
        });
      });

      grid.appendChild(card);
    });
  }

  /**
   * Bind events.
   */
  _bindEvents() {
    const btnClear = $('#btn-clear-library');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearAll());
    }
  }

  /**
   * Convert a Blob to a data URL.
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Escape HTML.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}

export const libraryManager = new LibraryManager();
