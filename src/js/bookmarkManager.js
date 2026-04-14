/**
 * BookmarkManager — Bookmark CRUD operations with per-book localStorage persistence and sidebar UI.
 */

import { eventBus } from './eventBus.js';
import { bookKey, getLocal, setLocal } from './storage.js';
import { $, createElement, formatDate } from './utils.js';

class BookmarkManager {
  constructor() {
    /** @type {string|null} */
    this._bookId = null;
    /** @type {Array<{cfi: string, chapter: string, date: number}>} */
    this._bookmarks = [];
    /** @type {string|null} */
    this._currentCfi = null;
  }

  /**
   * Initialize for a specific book.
   * @param {string} bookId
   */
  init(bookId) {
    this._bookId = bookId;
    this._bookmarks = getLocal(bookKey(bookId, 'bookmarks'), []);
    this.render();
  }

  /**
   * Update current reading position (called on relocated).
   * @param {string} cfi
   */
  updateCurrentPosition(cfi) {
    this._currentCfi = cfi;
    this._updateRibbonState();
  }

  /**
   * Toggle bookmark at the current position.
   * @param {string} [chapter=''] - Chapter title for display
   */
  toggle(chapter = '') {
    if (!this._currentCfi || !this._bookId) return;

    const existingIndex = this._bookmarks.findIndex((b) => b.cfi === this._currentCfi);

    if (existingIndex >= 0) {
      // Remove
      this._bookmarks.splice(existingIndex, 1);
      eventBus.emit('toast', { message: 'Bookmark removed', type: 'success' });
    } else {
      // Add
      this._bookmarks.unshift({
        cfi: this._currentCfi,
        chapter: chapter || 'Unknown Chapter',
        date: Date.now(),
      });
      eventBus.emit('toast', { message: 'Bookmark added', type: 'success' });
    }

    this._save();
    this.render();
    this._updateRibbonState();
    this._updateToolbarButton();
  }

  /**
   * Remove a bookmark by CFI.
   * @param {string} cfi
   */
  remove(cfi) {
    this._bookmarks = this._bookmarks.filter((b) => b.cfi !== cfi);
    this._save();
    this.render();
    this._updateRibbonState();
    this._updateToolbarButton();
  }

  /**
   * Check if current position is bookmarked.
   * @returns {boolean}
   */
  isCurrentBookmarked() {
    if (!this._currentCfi) return false;
    return this._bookmarks.some((b) => b.cfi === this._currentCfi);
  }

  /**
   * Save bookmarks to localStorage.
   */
  _save() {
    if (!this._bookId) return;
    setLocal(bookKey(this._bookId, 'bookmarks'), this._bookmarks);
  }

  /**
   * Render bookmarks in the sidebar panel.
   */
  render() {
    const container = $('#bookmarks-content');
    if (!container) return;

    if (this._bookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔖</div>
          <div class="empty-state-text">No bookmarks yet.<br>Press Ctrl+D or click the bookmark icon to add one.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    this._bookmarks.forEach((bm) => {
      const card = createElement('div', { className: 'bookmark-card' });
      card.innerHTML = `
        <div class="bookmark-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </div>
        <div class="bookmark-info">
          <div class="bookmark-chapter">${this._escapeHtml(bm.chapter)}</div>
          <div class="bookmark-date">${formatDate(bm.date)}</div>
        </div>
        <button class="icon-btn bookmark-delete" title="Remove bookmark" aria-label="Remove bookmark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      // Click to navigate
      card.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-delete')) return;
        eventBus.emit('navigate:cfi', bm.cfi);
      });

      // Delete button
      const deleteBtn = card.querySelector('.bookmark-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(bm.cfi);
      });

      container.appendChild(card);
    });
  }

  /**
   * Update the bookmark ribbon visibility on the reader page.
   */
  _updateRibbonState() {
    const ribbon = $('#page-bookmark-ribbon');
    if (ribbon) {
      ribbon.classList.toggle('visible', this.isCurrentBookmarked());
    }
  }

  /**
   * Update the toolbar bookmark button state.
   */
  _updateToolbarButton() {
    const btn = $('#btn-bookmark');
    if (btn) {
      btn.classList.toggle('active', this.isCurrentBookmarked());
    }
  }

  /**
   * Escape HTML entities to prevent XSS in rendered strings.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Clean up when book is closed.
   */
  destroy() {
    this._bookId = null;
    this._bookmarks = [];
    this._currentCfi = null;
  }
}

export const bookmarkManager = new BookmarkManager();
