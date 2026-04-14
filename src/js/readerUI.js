/**
 * ReaderUI — Creates and manages the epub.js Rendition, page navigation, layout modes,
 * page turn animations, and deep iframe content theming.
 */

import { eventBus } from './eventBus.js';
import { $ } from './utils.js';

/**
 * Complete theme-to-color mapping for all 9 themes.
 * These colors are injected directly into the epub iframe content.
 */
const THEME_COLORS = {
  light:           { bg: '#FFFFFF', text: '#2D3142', accent: '#6366F1', heading: '#1A1D2E', muted: '#5C6070' },
  dark:            { bg: '#181A24', text: '#D0D4E0', accent: '#818CF8', heading: '#E8EAF0', muted: '#9098B0' },
  sepia:           { bg: '#FAF6EE', text: '#3E2F1C', accent: '#B45309', heading: '#2E2112', muted: '#6B5840' },
  'high-contrast': { bg: '#000000', text: '#FFFFFF', accent: '#FFFF00', heading: '#FFFFFF', muted: '#CCCCCC' },
  ocean:           { bg: '#14253E', text: '#C8DDF0', accent: '#38BDF8', heading: '#D4E5F7', muted: '#7FACC8' },
  forest:          { bg: '#172E1D', text: '#C5DFCB', accent: '#4ADE80', heading: '#D1E8D5', muted: '#82B490' },
  rose:            { bg: '#FFF0F0', text: '#3D1F2B', accent: '#E11D48', heading: '#2E1420', muted: '#7A4A5C' },
  lavender:        { bg: '#F0EAFF', text: '#2D1F5E', accent: '#7C3AED', heading: '#201548', muted: '#5E4E90' },
  nord:            { bg: '#353C4A', text: '#ECEFF4', accent: '#88C0D0', heading: '#ECEFF4', muted: '#A0AAB8' },
};

/**
 * Generate a full CSS stylesheet string for injecting into iframe content.
 * Uses !important on every rule to guarantee override of EPUB's own styles.
 * @param {Object} colors - Theme color object
 * @returns {string}
 */
function buildContentCSS(colors, fontSize, fontFamily, lineHeight) {
  const fontMap = {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "'Merriweather', Georgia, serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  };
  const fontStack = fontMap[fontFamily] || fontMap.sans;
  const isLight = ['#FFFFFF', '#FFF0F0', '#F0EAFF', '#FAF6EE', '#FFF5F5'].includes(colors.bg);

  return `
    /* === PageTurn Injected Theme + Typography === */
    html, body {
      background-color: ${colors.bg} !important;
      color: ${colors.text} !important;
      font-size: ${fontSize}% !important;
      font-family: ${fontStack} !important;
      line-height: ${lineHeight} !important;
    }
    body {
      padding: 0 20px !important;
    }
    p, div, span, li, td, th, dd, dt, figcaption, blockquote, cite {
      color: ${colors.text} !important;
      font-family: inherit !important;
      line-height: inherit !important;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${colors.heading} !important;
      font-family: inherit !important;
    }
    a, a:visited {
      color: ${colors.accent} !important;
    }
    pre, code, kbd, samp {
      background-color: ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'} !important;
      color: ${colors.text} !important;
    }
    table, tr, td, th {
      border-color: ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'} !important;
    }
    hr {
      border-color: ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'} !important;
    }
    img, svg, video {
      opacity: ${colors.bg === '#000000' ? '0.85' : '1'};
    }
    ::selection {
      background: ${colors.accent}44 !important;
      color: ${colors.text} !important;
    }
  `;
}

class ReaderUI {
  constructor() {
    /** @type {import('epubjs').Rendition|null} */
    this.rendition = null;
    /** @type {import('epubjs').Book|null} */
    this.book = null;
    this._isNavigating = false;
    this._animationTimer = null;
    /** @type {string} Current theme name */
    this._currentTheme = 'light';
    /** @type {string|null} ID of the injected style element inside iframes */
    this._styleTagId = 'pageturn-theme-style';

    /** Current typography settings — tracked so we can inject them into iframes */
    this._fontSize = 100;
    this._fontFamily = 'sans';
    this._lineHeight = 1.6;
  }

  /**
   * Initialize the reader with a book.
   * @param {import('epubjs').Book} book
   * @param {Object} settings - Current reader settings
   */
  init(book, settings = {}) {
    this.book = book;
    this._currentTheme = settings.theme || 'light';

    const viewerEl = $('#viewer');
    if (!viewerEl) return;

    // Clear previous content
    viewerEl.innerHTML = '';

    // Create rendition
    this.rendition = book.renderTo(viewerEl, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
      allowScriptedContent: true,
    });

    // Patch epub.js to handle malformed EPUBs gracefully
    this._patchRenditionForMalformedEpubs();

    // Apply saved settings (font, size, line-height)
    this._applySettings(settings);

    // Hook into content rendering to inject theme CSS into every iframe
    this._setupContentHook();

    // Set up rendition event listeners
    this._setupEvents();

    eventBus.emit('rendition:created', { rendition: this.rendition });
  }

  /**
   * Display the book, optionally at a saved location.
   * @param {string} [location] - EpubCFI or href to display
   */
  async display(location) {
    if (!this.rendition) return;
    try {
      if (location) {
        await this.rendition.display(location);
      } else {
        await this.rendition.display();
      }
    } catch (err) {
      // CFI range errors, index errors, or malformed saved positions
      console.warn('[ReaderUI] Display error (falling back to start):', err.message || err);
      try {
        await this.rendition.display();
      } catch (err2) {
        console.warn('[ReaderUI] Fallback display also failed:', err2.message || err2);
        // Last resort: try displaying the first spine item
        try {
          const firstSection = this.book?.spine?.spineItems?.[0];
          if (firstSection) {
            await this.rendition.display(firstSection.href);
          }
        } catch {
          // Give up silently
        }
      }
    }
  }

  /**
   * Navigate to the next page with page turn animation.
   */
  async next() {
    if (!this.rendition || this._isNavigating) return;
    this._isNavigating = true;
    this._triggerPageAnimation('next');
    try {
      await this.rendition.next();
    } catch {
      // Ignore navigation errors
    }
    this._isNavigating = false;
  }

  /**
   * Navigate to the previous page with page turn animation.
   */
  async prev() {
    if (!this.rendition || this._isNavigating) return;
    this._isNavigating = true;
    this._triggerPageAnimation('prev');
    try {
      await this.rendition.prev();
    } catch {
      // Ignore navigation errors
    }
    this._isNavigating = false;
  }

  /**
   * Navigate to a specific location.
   * @param {string} target - EpubCFI or href
   */
  async goTo(target) {
    if (!this.rendition) return;
    try {
      await this.rendition.display(target);
    } catch (err) {
      console.error('[ReaderUI] GoTo error:', err);
    }
  }

  /**
   * Trigger a page turn animation on the reader container.
   * @param {'next'|'prev'} direction
   */
  _triggerPageAnimation(direction) {
    const container = $('#reader-container');
    if (!container) return;

    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
    }
    container.classList.remove('page-turn-next', 'page-turn-prev');

    // Force reflow to restart animation
    void container.offsetWidth;

    const className = direction === 'next' ? 'page-turn-next' : 'page-turn-prev';
    container.classList.add(className);

    this._animationTimer = setTimeout(() => {
      container.classList.remove('page-turn-next', 'page-turn-prev');
      this._animationTimer = null;
    }, 650);
  }

  // ────────────────────────────────────────────────
  //  EPUB.JS PATCHING — Handle malformed EPUBs
  // ────────────────────────────────────────────────

  /**
   * Patch the book's spine hooks to fix malformed EPUB section documents
   * BEFORE epub.js's own hooks (replaceBase, replaceCanonical, etc.) try
   * to find elements that may not exist.
   *
   * This prevents:
   * - "No Element Provided" (missing <base>, <link>, <meta>)
   * - "getElementsByTagName(...)[0] is undefined" (missing <head>)
   * - "injectIdentifier" crash
   */
  _patchRenditionForMalformedEpubs() {
    if (!this.book || !this.rendition) return;

    // Register a serialize hook on the spine.
    // This runs when each section's raw HTML is loaded, BEFORE epub.js processes it.
    try {
      this.book.spine.hooks.serialize.register((output, section) => {
        try {
          // Parse the section HTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(output.html, 'application/xhtml+xml');

          // Check for parse errors (malformed XML like <br> instead of <br/>)
          const parseError = doc.querySelector('parsererror');
          if (parseError) {
            // Re-parse as HTML (more lenient)
            const htmlDoc = parser.parseFromString(output.html, 'text/html');
            const head = htmlDoc.head || htmlDoc.createElement('head');
            const body = htmlDoc.body;

            // Ensure <head> has required elements
            if (!head.querySelector('base')) {
              head.appendChild(htmlDoc.createElement('base'));
            }

            // Rebuild as XHTML
            const serializer = new XMLSerializer();
            output.html = serializer.serializeToString(htmlDoc);
            return;
          }

          // Ensure <head> exists
          let head = doc.querySelector('head');
          if (!head) {
            head = doc.createElementNS('http://www.w3.org/1999/xhtml', 'head');
            if (doc.documentElement) {
              doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
            }
          }

          // Ensure <base> exists (epub.js replaceBase needs this)
          if (!head.querySelector('base')) {
            const base = doc.createElementNS('http://www.w3.org/1999/xhtml', 'base');
            head.appendChild(base);
          }

          // Serialize back
          const serializer = new XMLSerializer();
          output.html = serializer.serializeToString(doc);
        } catch {
          // If patching fails, let epub.js handle the original content
        }
      });
    } catch {
      // Spine hooks not available — not critical
    }
  }

  // ────────────────────────────────────────────────
  //  CONTENT THEMING — Inject CSS directly into iframes
  // ────────────────────────────────────────────────

  /**
   * Hook into epub.js content lifecycle to inject theme styles into every
   * rendered section (iframe). This ensures the *actual book text* is themed.
   */
  _setupContentHook() {
    if (!this.rendition) return;

    this.rendition.hooks.content.register((contents) => {
      this._injectThemeIntoContents(contents);
    });
  }

  /**
   * Inject the current theme's CSS into a specific Contents object.
   * @param {import('epubjs').Contents} contents
   */
  _injectThemeIntoContents(contents) {
    try {
      const doc = contents.document;
      if (!doc) return;

      // Guard: some malformed EPUBs lack <head>
      const head = doc.head || doc.querySelector('head');
      if (!head) {
        console.warn('[ReaderUI] No <head> in iframe document, skipping theme injection');
        return;
      }

      const colors = THEME_COLORS[this._currentTheme] || THEME_COLORS.light;
      const css = buildContentCSS(colors, this._fontSize, this._fontFamily, this._lineHeight);

      // Remove old style tag if it exists
      const existing = doc.getElementById(this._styleTagId);
      if (existing) {
        existing.remove();
      }

      // Create and inject new style tag
      const style = doc.createElement('style');
      style.id = this._styleTagId;
      style.textContent = css;
      head.appendChild(style);
    } catch (err) {
      console.warn('[ReaderUI] Failed to inject theme into iframe:', err);
    }
  }

  /**
   * Re-inject theme CSS into ALL currently rendered iframes.
   * Called when the user switches themes mid-read.
   */
  _reinjectThemeIntoAllFrames() {
    if (!this.rendition || !this.rendition.manager) return;

    try {
      const views = this.rendition.manager.views;
      if (views && views._views) {
        views._views.forEach((view) => {
          if (view && view.contents) {
            this._injectThemeIntoContents(view.contents);
          }
        });
      }
    } catch (err) {
      console.warn('[ReaderUI] Failed to re-inject theme:', err);
    }
  }

  /**
   * Apply theme colors to the reader content.
   * This is the main method called when the user changes themes.
   * @param {string} themeName
   */
  applyTheme(themeName) {
    this._currentTheme = themeName;

    if (!this.rendition) return;

    const colors = THEME_COLORS[themeName] || THEME_COLORS.light;

    // 1. Use epub.js override API (partial — works for some props)
    this.rendition.themes.override('color', colors.text);
    this.rendition.themes.override('background', colors.bg);

    // 2. Re-inject full CSS into all active iframes (the real fix)
    this._reinjectThemeIntoAllFrames();
  }

  // ────────────────────────────────────────────────
  //  SETTINGS
  // ────────────────────────────────────────────────

  /**
   * Apply settings to the rendition.
   * @param {Object} settings
   */
  _applySettings(settings) {
    if (!this.rendition) return;

    this._fontFamily = settings.fontFamily || 'sans';
    this._fontSize = settings.fontSize || 100;
    this._lineHeight = settings.lineHeight || 1.6;
  }

  /**
   * Update a specific setting on the rendition.
   * Re-injects the full CSS into all iframes with !important.
   * @param {string} key
   * @param {*} value
   */
  updateSetting(key, value) {
    if (!this.rendition) return;

    switch (key) {
      case 'fontSize':
        this._fontSize = value;
        break;
      case 'fontFamily':
        this._fontFamily = value;
        break;
      case 'lineHeight':
        this._lineHeight = value;
        break;
      default:
        return;
    }

    // Re-inject all styles (theme + typography) into every iframe
    this._reinjectThemeIntoAllFrames();
  }

  /**
   * Resize the rendition (call after fullscreen changes or window resizes).
   */
  resize() {
    if (!this.rendition) return;
    try {
      this.rendition.resize();
    } catch (err) {
      console.warn('[ReaderUI] Resize error:', err.message || err);
    }
  }

  // ────────────────────────────────────────────────
  //  EVENTS
  // ────────────────────────────────────────────────

  /**
   * Set up rendition event listeners.
   */
  _setupEvents() {
    if (!this.rendition) return;

    this.rendition.on('relocated', (location) => {
      eventBus.emit('reader:relocated', location);
    });

    this.rendition.on('keydown', (e) => {
      eventBus.emit('reader:keydown', e);
    });

    this.rendition.on('displayed', (section) => {
      eventBus.emit('reader:displayed', section);
    });
  }

  /**
   * Destroy the rendition and clean up.
   */
  destroy() {
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch {
        // Ignore
      }
      this.rendition = null;
      this.book = null;
    }
  }
}

export const readerUI = new ReaderUI();
