/**
 * SettingsManager — Theme, font, typography, and page animation settings with persistence.
 */

import { eventBus } from './eventBus.js';
import { getLocal, setLocal } from './storage.js';
import { $, $$ } from './utils.js';

const SETTINGS_KEY = 'pt_settings';

const DEFAULT_SETTINGS = {
  theme: 'light',
  pageAnimation: 'slide',
  fontFamily: 'sans',
  fontSize: 100,
  lineHeight: 1.6,
  contentWidth: 700,
};

class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._panelOpen = false;
  }

  /**
   * Initialize: load saved settings and bind UI events.
   */
  init() {
    // Load saved settings
    const saved = getLocal(SETTINGS_KEY, {});
    this.settings = { ...DEFAULT_SETTINGS, ...saved };

    // Apply theme to <html>
    this._applyTheme(this.settings.theme);

    // Apply page animation setting
    this._applyPageAnimation(this.settings.pageAnimation);

    // Sync UI controls
    this._syncUI();

    // Bind events
    this._bindEvents();
  }

  /**
   * Get current settings.
   * @returns {Object}
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Persist settings to localStorage.
   */
  _save() {
    setLocal(SETTINGS_KEY, this.settings);
  }

  /**
   * Apply a theme.
   * @param {string} theme
   */
  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.settings.theme = theme;

    // Update meta theme-color for the browser
    const meta = document.querySelector('meta[name="theme-color"]');
    const themeColors = {
      light: '#6366F1',
      dark: '#818CF8',
      sepia: '#B45309',
      'high-contrast': '#FFFF00',
      ocean: '#38BDF8',
      forest: '#4ADE80',
      rose: '#E11D48',
      lavender: '#7C3AED',
      nord: '#88C0D0',
    };
    if (meta) {
      meta.content = themeColors[theme] || themeColors.light;
    }
  }

  /**
   * Apply page turn animation setting.
   * @param {string} animType
   */
  _applyPageAnimation(animType) {
    document.documentElement.setAttribute('data-page-anim', animType);
    this.settings.pageAnimation = animType;
  }

  /**
   * Sync UI controls with current settings.
   */
  _syncUI() {
    // Theme buttons
    $$('.theme-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeValue === this.settings.theme);
    });

    // Animation buttons
    $$('.anim-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.anim === this.settings.pageAnimation);
    });

    // Font buttons
    $$('.font-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.font === this.settings.fontFamily);
    });

    // Sliders
    const fontSizeSlider = $('#font-size-slider');
    const lineHeightSlider = $('#line-height-slider');
    const contentWidthSlider = $('#content-width-slider');

    if (fontSizeSlider) {
      fontSizeSlider.value = this.settings.fontSize;
      $('#font-size-value').textContent = `${this.settings.fontSize}%`;
    }
    if (lineHeightSlider) {
      lineHeightSlider.value = this.settings.lineHeight;
      $('#line-height-value').textContent = this.settings.lineHeight;
    }
    if (contentWidthSlider) {
      contentWidthSlider.value = this.settings.contentWidth;
      $('#content-width-value').textContent = `${this.settings.contentWidth}px`;
    }

    // Apply content width
    const viewer = $('#viewer');
    if (viewer) {
      viewer.style.maxWidth = `${this.settings.contentWidth}px`;
    }
  }

  /**
   * Toggle the settings panel.
   */
  toggle() {
    this._panelOpen = !this._panelOpen;
    const panel = $('#settings-panel');
    const backdrop = $('#overlay-backdrop');

    if (panel) panel.classList.toggle('open', this._panelOpen);
    if (backdrop) backdrop.classList.toggle('active', this._panelOpen);
  }

  /**
   * Close the settings panel.
   */
  close() {
    this._panelOpen = false;
    const panel = $('#settings-panel');
    const backdrop = $('#overlay-backdrop');

    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  /**
   * Bind all settings UI events.
   */
  _bindEvents() {
    // Settings toggle
    const btnSettings = $('#btn-settings');
    if (btnSettings) btnSettings.addEventListener('click', () => this.toggle());

    const btnClose = $('#btn-close-settings');
    if (btnClose) btnClose.addEventListener('click', () => this.close());

    // Backdrop click
    const backdrop = $('#overlay-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => this.close());

    // Theme selection
    const themeGrid = $('#theme-grid');
    if (themeGrid) {
      themeGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-option');
        if (!btn) return;
        const theme = btn.dataset.themeValue;
        this._applyTheme(theme);
        this._save();
        this._syncUI();
        eventBus.emit('settings:changed', { key: 'theme', value: theme, settings: this.settings });
      });
    }

    // Page animation selection
    const animSelector = $('#anim-selector');
    if (animSelector) {
      animSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.anim-option');
        if (!btn) return;
        const anim = btn.dataset.anim;
        this._applyPageAnimation(anim);
        this._save();
        this._syncUI();
        eventBus.emit('settings:changed', { key: 'pageAnimation', value: anim, settings: this.settings });
      });
    }

    // Font family selection
    const fontSelector = $('#font-selector');
    if (fontSelector) {
      fontSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.font-option');
        if (!btn) return;
        this.settings.fontFamily = btn.dataset.font;
        this._save();
        this._syncUI();
        eventBus.emit('settings:changed', { key: 'fontFamily', value: this.settings.fontFamily, settings: this.settings });
      });
    }

    // Font size slider
    const fontSizeSlider = $('#font-size-slider');
    if (fontSizeSlider) {
      fontSizeSlider.addEventListener('input', (e) => {
        this.settings.fontSize = parseInt(e.target.value, 10);
        $('#font-size-value').textContent = `${this.settings.fontSize}%`;
        eventBus.emit('settings:changed', { key: 'fontSize', value: this.settings.fontSize, settings: this.settings });
      });
      fontSizeSlider.addEventListener('change', () => this._save());
    }

    // Line height slider
    const lineHeightSlider = $('#line-height-slider');
    if (lineHeightSlider) {
      lineHeightSlider.addEventListener('input', (e) => {
        this.settings.lineHeight = parseFloat(e.target.value);
        $('#line-height-value').textContent = this.settings.lineHeight;
        eventBus.emit('settings:changed', { key: 'lineHeight', value: this.settings.lineHeight, settings: this.settings });
      });
      lineHeightSlider.addEventListener('change', () => this._save());
    }

    // Content width slider
    const contentWidthSlider = $('#content-width-slider');
    if (contentWidthSlider) {
      contentWidthSlider.addEventListener('input', (e) => {
        this.settings.contentWidth = parseInt(e.target.value, 10);
        $('#content-width-value').textContent = `${this.settings.contentWidth}px`;
        const viewer = $('#viewer');
        if (viewer) viewer.style.maxWidth = `${this.settings.contentWidth}px`;
      });
      contentWidthSlider.addEventListener('change', () => this._save());
    }
  }
}

export const settingsManager = new SettingsManager();
