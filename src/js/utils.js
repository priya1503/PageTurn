/**
 * Utils — File validation, DOM helpers, debounce/throttle.
 */

// ─── File Validation ─────────────────────────────

const ALLOWED_EXTENSIONS = ['.epub'];
const ALLOWED_MIME_TYPES = ['application/epub+zip'];

/**
 * Validate that a file is an EPUB.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEpubFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  const name = file.name.toLowerCase();
  const ext = name.substring(name.lastIndexOf('.'));

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Invalid file type "${ext}". Only .epub files are supported.` };
  }

  // MIME type check (browser may not always set this correctly)
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && file.type !== '') {
    // Allow empty MIME type (some browsers don't set it)
    console.warn(`[Validate] Unexpected MIME type: ${file.type}`);
  }

  // Reasonable size check (max 500 MB)
  const MAX_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File is too large. Maximum size is 500 MB.' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  return { valid: true };
}

// ─── DOM Helpers ─────────────────────────────────

/**
 * Shorthand for querySelector.
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {Element|null}
 */
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Shorthand for querySelectorAll.
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {NodeList}
 */
export function $$(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

/**
 * Create an element with optional classes and attributes.
 * @param {string} tag
 * @param {{ className?: string, id?: string, text?: string, html?: string, attrs?: Object }} opts
 * @returns {HTMLElement}
 */
export function createElement(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.id) el.id = opts.id;
  if (opts.text) el.textContent = opts.text;
  if (opts.html) el.innerHTML = opts.html;
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

// ─── Timing Utilities ────────────────────────────

/**
 * Debounce function.
 * @param {Function} fn
 * @param {number} delay - Milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function.
 * @param {Function} fn
 * @param {number} limit - Milliseconds
 * @returns {Function}
 */
export function throttle(fn, limit) {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// ─── Formatting ──────────────────────────────────

/**
 * Format a date to a readable string.
 * @param {number|string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate a simple hash from a string (for book IDs).
 * @param {string} str
 * @returns {string}
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
