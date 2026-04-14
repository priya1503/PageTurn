/**
 * SearchManager — Full-text search with in-page highlighting,
 * result-by-result navigation, and return-to-reading functionality.
 */

import { eventBus } from './eventBus.js';
import { $, debounce, createElement } from './utils.js';

class SearchManager {
  constructor() {
    /** @type {import('epubjs').Book|null} */
    this._book = null;
    /** @type {import('epubjs').Rendition|null} */
    this._rendition = null;
    /** @type {Array} */
    this._results = [];
    this._searching = false;
    this._abortSearch = false;

    /** Current active result index (-1 = none selected) */
    this._currentIndex = -1;
    /** The query that produced the current results */
    this._currentQuery = '';
    /** CFI of the reading position saved before search navigation */
    this._savedReadingPosition = null;
    /** Whether we've navigated away from reading position */
    this._hasNavigatedAway = false;
  }

  /**
   * Initialize with the current book and rendition.
   * @param {import('epubjs').Book} book
   * @param {import('epubjs').Rendition} rendition
   */
  init(book, rendition) {
    this._book = book;
    this._rendition = rendition;
    this._results = [];
    this._currentIndex = -1;
    this._currentQuery = '';
    this._savedReadingPosition = null;
    this._hasNavigatedAway = false;
    this._abortSearch = false;
    this._bindEvents();
    this._clearResults();
    this._hideSearchNav();
  }

  /**
   * Bind search input and navigation button events.
   */
  _bindEvents() {
    const input = $('#search-input');
    if (!input) return;

    // Remove any previous listeners by replacing the element
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    // Debounced search
    const debouncedSearch = debounce((query) => this._performSearch(query), 400);

    newInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) {
        this._abortSearch = true;
        this._clearResults();
        this._hideSearchNav();
        this._clearHighlightsInContent();
        return;
      }
      debouncedSearch(query);
    });

    // Enter = search immediately
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query.length >= 2) {
          this._performSearch(query);
        }
      }
    });

    // Navigation buttons
    const btnPrev = $('#btn-search-prev');
    const btnNext = $('#btn-search-next');
    const btnBack = $('#btn-search-back');

    if (btnPrev) {
      // Replace to clear old listeners
      const newBtn = btnPrev.cloneNode(true);
      btnPrev.parentNode.replaceChild(newBtn, btnPrev);
      newBtn.addEventListener('click', () => this.prevResult());
    }
    if (btnNext) {
      const newBtn = btnNext.cloneNode(true);
      btnNext.parentNode.replaceChild(newBtn, btnNext);
      newBtn.addEventListener('click', () => this.nextResult());
    }
    if (btnBack) {
      const newBtn = btnBack.cloneNode(true);
      btnBack.parentNode.replaceChild(newBtn, btnBack);
      newBtn.addEventListener('click', () => this.goBackToReading());
    }
  }

  // ─── Search Execution ──────────────────────────────

  /**
   * Perform the search across all spine items.
   * @param {string} query
   */
  async _performSearch(query) {
    if (!this._book || this._searching) return;
    this._searching = true;
    this._abortSearch = false;
    this._currentQuery = query;
    this._currentIndex = -1;

    const resultsContainer = $('#search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="search-status">Searching...</div>';
    }

    try {
      const results = [];
      const spineItems = this._book.spine.spineItems;

      if (!spineItems || spineItems.length === 0) {
        this._results = [];
        this._renderResults(query);
        this._searching = false;
        return;
      }

      for (let i = 0; i < spineItems.length; i++) {
        if (this._abortSearch) {
          this._searching = false;
          return;
        }

        const section = spineItems[i];
        if (!section) continue;

        try {
          await section.load(this._book.load.bind(this._book));
          const sectionResults = section.find(query);

          if (sectionResults && sectionResults.length > 0) {
            results.push(
              ...sectionResults.map((r) => ({
                cfi: r.cfi,
                excerpt: r.excerpt || '',
                sectionIndex: i,
                sectionHref: section.href || '',
              }))
            );
          }

          section.unload();
        } catch (err) {
          console.warn(`[SearchManager] Failed to search section ${i}:`, err.message);
        }

        if (results.length > 200) break;
      }

      this._results = results;
      this._renderResults(query);

      // Show nav bar if we have results
      if (results.length > 0) {
        this._showSearchNav();
        this._updateSearchNavText();
      } else {
        this._hideSearchNav();
      }
    } catch (err) {
      console.error('[SearchManager] Search error:', err);
      if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="search-status">Search failed. Try again.</div>';
      }
    }

    this._searching = false;
  }

  // ─── Result Navigation ─────────────────────────────

  /**
   * Navigate to a specific result by index.
   * @param {number} index
   */
  goToResult(index) {
    if (index < 0 || index >= this._results.length) return;

    // Save reading position on first navigation
    if (!this._hasNavigatedAway && this._rendition) {
      try {
        const loc = this._rendition.currentLocation();
        if (loc && loc.start) {
          this._savedReadingPosition = loc.start.cfi;
        }
      } catch {
        // Ignore
      }
      this._hasNavigatedAway = true;
    }

    this._currentIndex = index;
    const result = this._results[index];

    // Navigate to the CFI
    eventBus.emit('navigate:cfi', result.cfi);

    // Highlight after a short delay for the page to render
    setTimeout(() => {
      this._highlightInContent(this._currentQuery);
    }, 400);

    // Update UI
    this._updateSearchNavText();
    this._markActiveResult(index);
    this._showBackButton(true);
  }

  /**
   * Go to the next search result.
   */
  nextResult() {
    if (this._results.length === 0) return;
    const nextIndex = this._currentIndex + 1 >= this._results.length ? 0 : this._currentIndex + 1;
    this.goToResult(nextIndex);
  }

  /**
   * Go to the previous search result.
   */
  prevResult() {
    if (this._results.length === 0) return;
    const prevIndex = this._currentIndex - 1 < 0 ? this._results.length - 1 : this._currentIndex - 1;
    this.goToResult(prevIndex);
  }

  /**
   * Return to the reading position saved before search navigation.
   */
  goBackToReading() {
    if (this._savedReadingPosition) {
      this._clearHighlightsInContent();
      eventBus.emit('navigate:cfi', this._savedReadingPosition);
      this._hasNavigatedAway = false;
      this._currentIndex = -1;
      this._updateSearchNavText();
      this._showBackButton(false);
      eventBus.emit('toast', { message: 'Returned to reading position', type: 'success' });
    }
  }

  // ─── In-Page Highlighting ──────────────────────────

  /**
   * Highlight all occurrences of the query text inside the rendered iframe(s).
   * Uses DOM TreeWalker to find text nodes and wraps matches with <mark>.
   * @param {string} query
   */
  _highlightInContent(query) {
    if (!this._rendition || !query) return;

    try {
      const contents = this._rendition.getContents();
      contents.forEach((content) => {
        const doc = content.document;
        const body = doc?.body;
        if (!body) return;

        // First clear old highlights
        this._removeHighlightsFromDoc(doc);

        // Walk all text nodes
        const lowerQuery = query.toLowerCase();
        const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
        const matches = [];

        while (walker.nextNode()) {
          const node = walker.currentNode;
          // Skip our own highlight elements
          if (node.parentElement?.classList?.contains('pt-search-hl')) continue;

          const text = node.textContent;
          const lowerText = text.toLowerCase();
          let startIdx = 0;

          while ((startIdx = lowerText.indexOf(lowerQuery, startIdx)) !== -1) {
            matches.push({ node, start: startIdx, length: query.length });
            startIdx += query.length;
          }
        }

        // Apply highlights in REVERSE order to preserve text node positions
        for (let i = matches.length - 1; i >= 0; i--) {
          try {
            const { node, start, length } = matches[i];
            const range = doc.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + length);

            const mark = doc.createElement('mark');
            mark.className = 'pt-search-hl';
            mark.style.cssText =
              'background: rgba(250, 204, 21, 0.55) !important; ' +
              'color: inherit !important; ' +
              'padding: 1px 2px; ' +
              'border-radius: 2px; ' +
              'box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.3); ' +
              'transition: background 0.2s ease;';
            range.surroundContents(mark);
          } catch {
            // surroundContents can fail if range crosses element boundaries — skip
          }
        }
      });
    } catch (err) {
      console.warn('[SearchManager] Highlight error:', err);
    }
  }

  /**
   * Remove all search highlights from a document.
   * @param {Document} doc
   */
  _removeHighlightsFromDoc(doc) {
    try {
      const marks = doc.querySelectorAll('mark.pt-search-hl');
      marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(doc.createTextNode(mark.textContent), mark);
          parent.normalize();
        }
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Clear highlights from ALL current iframes.
   */
  _clearHighlightsInContent() {
    if (!this._rendition) return;
    try {
      const contents = this._rendition.getContents();
      contents.forEach((content) => {
        if (content.document) {
          this._removeHighlightsFromDoc(content.document);
        }
      });
    } catch {
      // Ignore
    }
  }

  // ─── UI Rendering ──────────────────────────────────

  /**
   * Render search results list.
   * @param {string} query
   */
  _renderResults(query) {
    const container = $('#search-results');
    if (!container) return;

    if (this._results.length === 0) {
      container.innerHTML = `
        <div class="search-status">No results found for "${this._escapeHtml(query)}"</div>
      `;
      return;
    }

    container.innerHTML = `<div class="search-status" style="padding-bottom: 8px;">${this._results.length} result${this._results.length > 1 ? 's' : ''} found</div>`;

    // Render each result (cap at 50 in the list)
    this._results.slice(0, 50).forEach((result, idx) => {
      const item = createElement('div', { className: 'search-result' });
      item.dataset.resultIndex = idx;

      const excerpt = result.excerpt || '';
      const highlighted = this._highlightText(excerpt, query);

      item.innerHTML = `<div class="search-result-excerpt">${highlighted}</div>`;

      item.addEventListener('click', () => {
        this.goToResult(idx);
      });

      container.appendChild(item);
    });

    if (this._results.length > 50) {
      container.appendChild(
        createElement('div', {
          className: 'search-status',
          text: `Showing 50 of ${this._results.length} results`,
        })
      );
    }
  }

  /**
   * Mark the active result in the sidebar list.
   * @param {number} index
   */
  _markActiveResult(index) {
    const container = $('#search-results');
    if (!container) return;

    container.querySelectorAll('.search-result').forEach((el) => {
      el.classList.toggle('active', parseInt(el.dataset.resultIndex, 10) === index);
    });

    // Scroll the active result into view in the sidebar
    const activeEl = container.querySelector('.search-result.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ─── Search Nav Bar ────────────────────────────────

  _showSearchNav() {
    const nav = $('#search-nav');
    if (nav) nav.style.display = 'flex';
  }

  _hideSearchNav() {
    const nav = $('#search-nav');
    if (nav) nav.style.display = 'none';
  }

  _updateSearchNavText() {
    const posEl = $('#search-position');
    if (!posEl) return;

    if (this._currentIndex >= 0) {
      posEl.textContent = `${this._currentIndex + 1} of ${this._results.length}`;
    } else {
      posEl.textContent = `${this._results.length} results`;
    }
  }

  _showBackButton(show) {
    const btn = $('#btn-search-back');
    if (btn) {
      btn.style.display = show && this._savedReadingPosition ? 'inline-flex' : 'none';
    }
  }

  // ─── Utilities ─────────────────────────────────────

  _clearResults() {
    this._results = [];
    this._currentIndex = -1;
    const container = $('#search-results');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">Type to search within the book</div>
        </div>
      `;
    }
  }

  _highlightText(text, query) {
    const escaped = this._escapeHtml(text);
    const queryEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${queryEscaped})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Clean up.
   */
  destroy() {
    this._abortSearch = true;
    this._clearHighlightsInContent();
    this._book = null;
    this._rendition = null;
    this._results = [];
    this._searching = false;
    this._currentIndex = -1;
    this._savedReadingPosition = null;
    this._hasNavigatedAway = false;
  }
}

export const searchManager = new SearchManager();
