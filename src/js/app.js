/**
 * App — Main orchestrator. Initializes all managers, wires the event bus,
 * handles file input, keyboard shortcuts, sidebar tabs, and view transitions.
 */

import { eventBus } from './eventBus.js';
import { bookManager } from './bookManager.js';
import { readerUI } from './readerUI.js';
import { settingsManager } from './settingsManager.js';
import { bookmarkManager } from './bookmarkManager.js';
import { searchManager } from './searchManager.js';
import { progressTracker } from './progressTracker.js';
import { libraryManager } from './libraryManager.js';
import { $, $$ } from './utils.js';

// ─── Suppress known epub.js internal errors ──────────
// epub.js throws non-critical errors when processing malformed EPUB files
// (e.g., missing <head>, <base>, <br> instead of <br/>). These errors don't
// affect reading but flood the console. We suppress them globally.
const KNOWN_EPUBJS_ERRORS = [
  'No Element Provided',
  'mismatched tag',
  'root is null',
  'Index or size is negative',
  'getElementsByTagName',
  'injectIdentifier',
  'ownerDocument',
];

function isKnownEpubjsError(msg) {
  return KNOWN_EPUBJS_ERRORS.some((pattern) => msg.includes(pattern));
}

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '');
  if (isKnownEpubjsError(msg)) {
    event.preventDefault(); // Suppress from console
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (isKnownEpubjsError(msg)) {
    event.preventDefault();
  }
});

class App {
  constructor() {
    this._currentChapter = '';
  }

  /**
   * Bootstrap the application.
   */
  async init() {
    // 1. Initialize settings (loads theme, syncs UI)
    settingsManager.init();

    // 2. Initialize library (renders recent books)
    await libraryManager.init();

    // 3. Wire up event bus
    this._wireEvents();

    // 4. Bind UI interactions
    this._bindFileInput();
    this._bindSidebarTabs();
    this._bindToolbar();
    this._bindKeyboard();
    this._bindFullscreenEvent();

    console.log('[PageTurn] App initialized');
  }

  // ─── Event Bus Wiring ────────────────────────────

  _wireEvents() {
    // Book opened
    eventBus.on('book:opened', (data) => this._onBookOpened(data));

    // Book closed
    eventBus.on('book:closed', () => this._onBookClosed());

    // Reader relocated
    eventBus.on('reader:relocated', (location) => this._onRelocated(location));

    // Navigate to CFI
    eventBus.on('navigate:cfi', (cfi) => readerUI.goTo(cfi));

    // Settings changed
    eventBus.on('settings:changed', ({ key, value }) => {
      if (key === 'theme') {
        readerUI.applyTheme(value);
      } else {
        readerUI.updateSetting(key, value);
      }
    });

    // Rendition created
    eventBus.on('rendition:created', () => {
      // Apply current theme to content
      const settings = settingsManager.getSettings();
      readerUI.applyTheme(settings.theme);
    });

    // Reader keydown (from inside iframe)
    eventBus.on('reader:keydown', (e) => this._handleKeyDown(e));

    // Loading overlay
    eventBus.on('loading:show', ({ text }) => this._showLoading(text));
    eventBus.on('loading:hide', () => this._hideLoading());

    // Toast notifications
    eventBus.on('toast', ({ message, type }) => this._showToast(message, type));
  }

  // ─── Book Lifecycle ──────────────────────────────

  async _onBookOpened(data) {
    const { book, metadata, bookId, toc, coverUrl, fileName } = data;

    // Switch to reader view
    this._showReaderView();

    // Update toolbar with book info
    this._updateToolbarInfo(metadata);

    // Initialize reader
    readerUI.init(book, settingsManager.getSettings());

    // Initialize bookmark manager
    bookmarkManager.init(bookId);

    // Initialize search (pass rendition for in-page highlighting)
    searchManager.init(book, readerUI.rendition);

    // Initialize progress tracker
    progressTracker.init(bookId, book);

    // Render TOC
    this._renderTOC(toc);

    // Add to library
    libraryManager.addBook({
      bookId,
      title: metadata.title,
      author: metadata.creator,
      coverUrl,
      fileName,
    });

    // Display book — restore saved position if available
    const savedPosition = progressTracker.getSavedPosition(bookId);
    await readerUI.display(savedPosition);

    // Show book-specific buttons
    this._toggleBookButtons(true);

    eventBus.emit('toast', { message: `Opened: ${metadata.title}`, type: 'success' });
  }

  _onBookClosed() {
    this._showLandingView();
    this._toggleBookButtons(false);
    readerUI.destroy();
    bookmarkManager.destroy();
    searchManager.destroy();
    progressTracker.destroy();
    this._clearTOC();
    this._updateToolbarInfo(null);
  }

  _onRelocated(location) {
    // Update progress
    progressTracker.update(location);

    // Update bookmark position
    if (location.start) {
      bookmarkManager.updateCurrentPosition(location.start.cfi);
    }

    // Track current chapter from TOC
    this._updateCurrentChapter(location);
  }

  // ─── File Input ──────────────────────────────────

  _bindFileInput() {
    const fileInput = $('#file-input');
    const dropZone = $('#drop-zone');
    const btnBrowse = $('#btn-browse');
    const btnOpenFile = $('#btn-open-file');

    // File input change
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) bookManager.openFile(file);
        e.target.value = ''; // Reset so same file can be selected again
      });
    }

    // Browse button
    if (btnBrowse) {
      btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput?.click();
      });
    }

    // Open file button in toolbar
    if (btnOpenFile) {
      btnOpenFile.addEventListener('click', () => fileInput?.click());
    }

    // Drop zone click
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput?.click());

      // Drag and drop
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });

      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const file = e.dataTransfer?.files[0];
        if (file) bookManager.openFile(file);
      });
    }

    // Global drag and drop (for dropping anywhere on the page)
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.name.toLowerCase().endsWith('.epub')) {
        bookManager.openFile(file);
      }
    });
  }

  // ─── Sidebar Tabs ────────────────────────────────

  _bindSidebarTabs() {
    const tabs = $$('.sidebar-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this._activateTab(tabName);
      });
    });
  }

  _activateTab(tabName) {
    // Update tab buttons
    $$('.sidebar-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabName);
      t.setAttribute('aria-selected', t.dataset.tab === tabName ? 'true' : 'false');
    });

    // Update panels
    $$('.sidebar-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === tabName);
    });
  }

  // ─── Toolbar ─────────────────────────────────────

  _bindToolbar() {
    // Sidebar toggle
    const btnSidebar = $('#btn-sidebar-toggle');
    if (btnSidebar) {
      btnSidebar.addEventListener('click', () => this._toggleSidebar());
    }

    // Bookmark
    const btnBookmark = $('#btn-bookmark');
    if (btnBookmark) {
      btnBookmark.addEventListener('click', () => {
        bookmarkManager.toggle(this._currentChapter);
      });
    }

    // Bookmark ribbon click
    const ribbon = $('#page-bookmark-ribbon');
    if (ribbon) {
      ribbon.addEventListener('click', () => {
        bookmarkManager.toggle(this._currentChapter);
      });
    }

    // Fullscreen
    const btnFullscreen = $('#btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => this._toggleFullscreen());
    }

    // Navigation arrows
    const navPrev = $('#nav-prev');
    const navNext = $('#nav-next');
    if (navPrev) navPrev.addEventListener('click', () => readerUI.prev());
    if (navNext) navNext.addEventListener('click', () => readerUI.next());
  }

  // ─── Keyboard Shortcuts ──────────────────────────

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => this._handleKeyDown(e));
  }

  _handleKeyDown(e) {
    // Don't intercept when typing in input fields
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        readerUI.next();
        break;

      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        readerUI.prev();
        break;

      case 'Home':
        e.preventDefault();
        if (bookManager.book) {
          readerUI.goTo(0);
        }
        break;

      default:
        break;
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'o':
          e.preventDefault();
          $('#file-input')?.click();
          break;

        case 'b':
          e.preventDefault();
          this._toggleSidebar();
          break;

        case 'd':
          e.preventDefault();
          bookmarkManager.toggle(this._currentChapter);
          break;

        case ',':
          e.preventDefault();
          settingsManager.toggle();
          break;

        case 'f':
          e.preventDefault();
          this._toggleSidebar();
          this._activateTab('search');
          setTimeout(() => $('#search-input')?.focus(), 100);
          break;

        default:
          break;
      }
    }

    // F11 fullscreen
    if (e.key === 'F11') {
      e.preventDefault();
      this._toggleFullscreen();
    }

    // Escape
    if (e.key === 'Escape') {
      settingsManager.close();
    }
  }

  // ─── View Transitions ───────────────────────────

  _showReaderView() {
    const landing = $('#landing-view');
    const reader = $('#reader-view');
    if (landing) landing.classList.add('hidden');
    if (reader) reader.classList.add('active');
  }

  _showLandingView() {
    const landing = $('#landing-view');
    const reader = $('#reader-view');
    if (landing) landing.classList.remove('hidden');
    if (reader) reader.classList.remove('active');
  }

  // ─── Sidebar ─────────────────────────────────────

  _toggleSidebar() {
    const sidebar = $('#sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  }

  // ─── Fullscreen ──────────────────────────────────

  _toggleFullscreen() {
    const app = $('#app');
    if (!app) return;

    if (!document.fullscreenElement) {
      app.requestFullscreen?.().catch(() => {
        // Fullscreen API not available — toggle CSS class as fallback
        app.classList.toggle('fullscreen');
        this._onFullscreenChange();
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        app.classList.remove('fullscreen');
        this._onFullscreenChange();
      });
    }
  }

  /**
   * Bind the fullscreenchange event.
   * Called once during init — syncs CSS class and resizes the rendition.
   */
  _bindFullscreenEvent() {
    document.addEventListener('fullscreenchange', () => this._onFullscreenChange());
  }

  /**
   * Handle fullscreen state change.
   * Uses document.fullscreenElement as the SOLE source of truth.
   */
  _onFullscreenChange() {
    const app = $('#app');
    if (!app) return;

    // document.fullscreenElement is the definitive state
    const isFullscreen = !!document.fullscreenElement;
    app.classList.toggle('fullscreen', isFullscreen);

    // Give the layout a moment to reflow, then resize the rendition
    setTimeout(() => {
      readerUI.resize();
    }, 200);
  }

  // ─── Toolbar Info ────────────────────────────────

  _updateToolbarInfo(metadata) {
    const infoEl = $('#toolbar-book-info');
    const titleEl = $('#display-title');
    const authorEl = $('#display-author');

    if (metadata) {
      if (titleEl) titleEl.textContent = metadata.title;
      if (authorEl) authorEl.textContent = `by ${metadata.creator}`;
      if (infoEl) infoEl.style.display = 'flex';
    } else {
      if (infoEl) infoEl.style.display = 'none';
    }
  }

  _toggleBookButtons(show) {
    const btnBookmark = $('#btn-bookmark');
    const btnFullscreen = $('#btn-fullscreen');
    if (btnBookmark) btnBookmark.style.display = show ? 'inline-flex' : 'none';
    if (btnFullscreen) btnFullscreen.style.display = show ? 'inline-flex' : 'none';
  }

  // ─── TOC ─────────────────────────────────────────

  _renderTOC(toc) {
    const container = $('#toc-content');
    if (!container) return;

    if (!toc || toc.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📑</div>
          <div class="empty-state-text">No table of contents available</div>
        </div>
      `;
      return;
    }

    const list = this._buildTOCList(toc);
    container.innerHTML = '';
    container.appendChild(list);
  }

  _buildTOCList(items) {
    const ul = document.createElement('ul');
    ul.className = 'toc-list';

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'toc-item';

      const btn = document.createElement('button');
      btn.className = 'toc-link';
      btn.textContent = item.label?.trim() || 'Untitled';
      btn.dataset.href = item.href || '';

      btn.addEventListener('click', () => {
        if (item.href) {
          readerUI.goTo(item.href);
        }
        // On mobile, close sidebar after navigation
        if (window.innerWidth < 900) {
          this._toggleSidebar();
        }
      });

      li.appendChild(btn);

      // Render sub-items
      if (item.subitems && item.subitems.length > 0) {
        const childList = this._buildTOCList(item.subitems);
        childList.className = 'toc-list toc-children';
        li.appendChild(childList);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  _clearTOC() {
    const container = $('#toc-content');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📑</div>
          <div class="empty-state-text">Open a book to see its contents</div>
        </div>
      `;
    }
  }

  /**
   * Update the current chapter based on location.
   * @param {Object} location
   */
  _updateCurrentChapter(location) {
    if (!bookManager.book || !location.start) return;

    try {
      const href = location.start.href;
      const toc = bookManager.toc;

      // Find matching TOC entry
      const match = this._findTocEntry(toc, href);
      if (match) {
        this._currentChapter = match.label?.trim() || '';

        // Update active state in TOC sidebar
        $$('.toc-link').forEach((link) => {
          const entryHref = link.dataset.href || '';
          // Compare by matching the href base (without hash)
          link.classList.toggle(
            'active',
            entryHref.split('#')[0] === href.split('#')[0]
          );
        });
      }
    } catch {
      // Ignore chapter tracking errors
    }
  }

  _findTocEntry(items, href) {
    for (const item of items) {
      const itemHref = (item.href || '').split('#')[0];
      if (href.includes(itemHref) || itemHref.includes(href?.split('#')[0])) {
        return item;
      }
      if (item.subitems && item.subitems.length > 0) {
        const found = this._findTocEntry(item.subitems, href);
        if (found) return found;
      }
    }
    return null;
  }

  // ─── Loading Overlay ─────────────────────────────

  _showLoading(text = 'Loading...') {
    const overlay = $('#loading-overlay');
    const textEl = $('#loading-text');
    if (overlay) overlay.classList.add('active');
    if (textEl) textEl.textContent = text;
  }

  _hideLoading() {
    const overlay = $('#loading-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  // ─── Toast Notifications ─────────────────────────

  _showToast(message, type = 'success') {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  }
}

// ─── Bootstrap ───────────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
