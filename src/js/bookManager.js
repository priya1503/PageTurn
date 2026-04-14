/**
 * BookManager — Handles EPUB file loading, metadata extraction, and book lifecycle.
 */

import ePub from 'epubjs';
import { eventBus } from './eventBus.js';
import { validateEpubFile, simpleHash } from './utils.js';

class BookManager {
  constructor() {
    /** @type {import('epubjs').Book|null} */
    this.book = null;
    /** @type {Object|null} */
    this.metadata = null;
    /** @type {string|null} */
    this.bookId = null;
    /** @type {Array} */
    this.toc = [];
    /** @type {string|null} */
    this.coverUrl = null;
  }

  /**
   * Open an EPUB from a File object.
   * @param {File} file
   * @returns {Promise<void>}
   */
  async openFile(file) {
    // Validate file
    const validation = validateEpubFile(file);
    if (!validation.valid) {
      eventBus.emit('toast', { message: validation.error, type: 'error' });
      return;
    }

    // Close any existing book
    await this.close();

    eventBus.emit('loading:show', { text: 'Opening book...' });

    try {
      // Read file as ArrayBuffer
      const buffer = await this._readFileAsArrayBuffer(file);

      // Create epub.js Book
      this.book = ePub();
      await this.book.open(buffer, 'binary');

      // Wait for book to be ready
      await this.book.ready;

      // Extract metadata
      this.metadata = await this._extractMetadata();
      this.bookId = simpleHash(
        (this.metadata.identifier || '') + (this.metadata.title || file.name)
      );

      // Extract TOC
      this.toc = await this._extractTOC();

      // Extract cover
      this.coverUrl = await this._extractCover();

      eventBus.emit('book:opened', {
        book: this.book,
        metadata: this.metadata,
        bookId: this.bookId,
        toc: this.toc,
        coverUrl: this.coverUrl,
        fileName: file.name,
      });
    } catch (err) {
      console.error('[BookManager] Failed to open book:', err);
      eventBus.emit('toast', { message: 'Failed to open the book. The file may be corrupted.', type: 'error' });
      await this.close();
    } finally {
      eventBus.emit('loading:hide');
    }
  }

  /**
   * Open an EPUB from an ArrayBuffer (for reopening from library cache).
   * @param {ArrayBuffer} buffer
   * @param {string} fileName
   * @returns {Promise<void>}
   */
  async openFromBuffer(buffer, fileName) {
    await this.close();
    eventBus.emit('loading:show', { text: 'Opening book...' });

    try {
      this.book = ePub();
      await this.book.open(buffer, 'binary');
      await this.book.ready;

      this.metadata = await this._extractMetadata();
      this.bookId = simpleHash(
        (this.metadata.identifier || '') + (this.metadata.title || fileName)
      );
      this.toc = await this._extractTOC();
      this.coverUrl = await this._extractCover();

      eventBus.emit('book:opened', {
        book: this.book,
        metadata: this.metadata,
        bookId: this.bookId,
        toc: this.toc,
        coverUrl: this.coverUrl,
        fileName,
      });
    } catch (err) {
      console.error('[BookManager] Failed to open book from buffer:', err);
      eventBus.emit('toast', { message: 'Failed to open the book.', type: 'error' });
      await this.close();
    } finally {
      eventBus.emit('loading:hide');
    }
  }

  /**
   * Close the current book and clean up resources.
   */
  async close() {
    if (this.book) {
      try {
        this.book.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.book = null;
      this.metadata = null;
      this.bookId = null;
      this.toc = [];
      if (this.coverUrl) {
        URL.revokeObjectURL(this.coverUrl);
        this.coverUrl = null;
      }
      eventBus.emit('book:closed');
    }
  }

  /**
   * Read a File as ArrayBuffer.
   * @param {File} file
   * @returns {Promise<ArrayBuffer>}
   */
  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract book metadata.
   * @returns {Promise<Object>}
   */
  async _extractMetadata() {
    try {
      const meta = await this.book.loaded.metadata;
      return {
        title: meta.title || 'Untitled',
        creator: meta.creator || 'Unknown Author',
        identifier: meta.identifier || '',
        publisher: meta.publisher || '',
        language: meta.language || '',
        description: meta.description || '',
      };
    } catch {
      return { title: 'Untitled', creator: 'Unknown Author', identifier: '' };
    }
  }

  /**
   * Extract table of contents.
   * @returns {Promise<Array>}
   */
  async _extractTOC() {
    try {
      const navigation = await this.book.loaded.navigation;
      return navigation.toc || [];
    } catch {
      return [];
    }
  }

  /**
   * Extract cover image URL.
   * @returns {Promise<string|null>}
   */
  async _extractCover() {
    try {
      const coverUrl = await this.book.coverUrl();
      return coverUrl || null;
    } catch {
      return null;
    }
  }
}

export const bookManager = new BookManager();
