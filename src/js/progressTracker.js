/**
 * ProgressTracker — Tracks reading position, calculates percentage, and displays progress.
 */

import { eventBus } from './eventBus.js';
import { bookKey, getLocal, setLocal } from './storage.js';
import { $ } from './utils.js';

class ProgressTracker {
  constructor() {
    /** @type {string|null} */
    this._bookId = null;
    /** @type {import('epubjs').Book|null} */
    this._book = null;
    this._currentLocation = null;
    this._progress = 0;
  }

  /**
   * Initialize for a book.
   * @param {string} bookId
   * @param {import('epubjs').Book} book
   */
  init(bookId, book) {
    this._bookId = bookId;
    this._book = book;
    this._progress = 0;

    // Generate locations for progress tracking
    this._generateLocations();

    // Bind progress bar click
    this._bindEvents();
  }

  /**
   * Generate locations for accurate progress calculation.
   * Waits for the rendition to finish displaying the first page before
   * generating, to avoid epub.js "root is null" errors.
   */
  async _generateLocations() {
    if (!this._book) return;

    // Wait for the first 'reader:displayed' event, which signals
    // that a page is fully rendered and the DOM is ready.
    await new Promise((resolve) => {
      let resolved = false;

      const onDisplayed = () => {
        if (!resolved) {
          resolved = true;
          eventBus.off('reader:displayed', onDisplayed);
          resolve();
        }
      };

      eventBus.on('reader:displayed', onDisplayed);

      // Safety timeout — if the event never fires, resolve after 3s anyway
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          eventBus.off('reader:displayed', onDisplayed);
          resolve();
        }
      }, 3000);
    });

    try {
      // Guard: ensure book still exists (user may have closed it)
      if (!this._book || !this._book.locations) return;
      if (!this._book.spine || !this._book.spine.spineItems) return;

      await this._book.locations.generate(1024);
      eventBus.emit('locations:generated');
    } catch (err) {
      console.warn('[ProgressTracker] Could not generate locations:', err.message || err);
      // Locations failed — progress will use relocated event percentage as fallback
    }
  }

  /**
   * Update progress from a relocated event location.
   * @param {Object} location - epub.js relocated location object
   */
  update(location) {
    if (!location || !this._bookId) return;

    this._currentLocation = location;

    // Calculate percentage
    if (location.start && location.start.percentage !== undefined) {
      this._progress = Math.round(location.start.percentage * 100);
    } else if (this._book && this._book.locations && location.start) {
      const percentage = this._book.locations.percentageFromCfi(location.start.cfi);
      if (percentage !== undefined && !isNaN(percentage)) {
        this._progress = Math.round(percentage * 100);
      }
    }

    // Update UI
    this._updateUI();

    // Save position
    this._savePosition(location.start?.cfi);
  }

  /**
   * Get saved reading position for a book.
   * @param {string} bookId
   * @returns {string|null}
   */
  getSavedPosition(bookId) {
    return getLocal(bookKey(bookId, 'position'), null);
  }

  /**
   * Save reading position.
   * @param {string} cfi
   */
  _savePosition(cfi) {
    if (!cfi || !this._bookId) return;
    setLocal(bookKey(this._bookId, 'position'), cfi);
  }

  /**
   * Update progress bar and text UI.
   */
  _updateUI() {
    const fill = $('#progress-bar-fill');
    const text = $('#progress-text');

    if (fill) {
      fill.style.width = `${this._progress}%`;
    }
    if (text) {
      text.textContent = `${this._progress}%`;
    }
  }

  /**
   * Bind progress bar click event for jumping to a position.
   */
  _bindEvents() {
    const wrapper = $('#progress-bar-wrapper');
    if (!wrapper) return;

    wrapper.addEventListener('click', (e) => {
      if (!this._book || !this._book.locations) return;

      const rect = wrapper.getBoundingClientRect();
      const percentage = (e.clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, percentage));

      const cfi = this._book.locations.cfiFromPercentage(clamped);
      if (cfi) {
        eventBus.emit('navigate:cfi', cfi);
      }
    });
  }

  /**
   * Reset progress display.
   */
  reset() {
    this._progress = 0;
    this._updateUI();
  }

  /**
   * Clean up.
   */
  destroy() {
    this._bookId = null;
    this._book = null;
    this._currentLocation = null;
    this._progress = 0;
    this.reset();
  }
}

export const progressTracker = new ProgressTracker();
