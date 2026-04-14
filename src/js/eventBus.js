/**
 * EventBus — Simple publish/subscribe event system for decoupled module communication.
 *
 * Usage:
 *   import { eventBus } from './eventBus.js';
 *   eventBus.on('book:opened', (data) => { ... });
 *   eventBus.emit('book:opened', { title: 'My Book' });
 *   eventBus.off('book:opened', handler);
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return unsubscribe function for convenience
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in handler for "${event}":`, err);
        }
      });
    }
  }

  /**
   * Remove all listeners for a given event, or all events.
   * @param {string} [event]
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
