/**
 * In-memory storage adapter
 * Note: This is not recommended for production use
 */

import { logger } from '../utils/logger.js';

export class MemoryStorage {
  constructor() {
    this.store = new Map();
    this.timeouts = new Map();
  }

  async setEx(key, value, ttl) {
    // Clear any existing timeout
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }

    // Store the value
    this.store.set(key, value);

    // Set expiration
    const timeout = setTimeout(() => {
      this.store.delete(key);
      this.timeouts.delete(key);
    }, ttl * 1000);

    this.timeouts.set(key, timeout);
    logger.debug('Memory storage set:', { key, ttl });
  }

  async get(key) {
    const value = this.store.get(key);
    logger.debug('Memory storage get:', { key, exists: !!value });
    return value;
  }

  async exists(key) {
    const exists = this.store.has(key);
    logger.debug('Memory storage exists:', { key, exists });
    return exists;
  }

  async del(key) {
    // Clear timeout if exists
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
      this.timeouts.delete(key);
    }

    const deleted = this.store.delete(key);
    logger.debug('Memory storage delete:', { key, deleted });
    return deleted;
  }

  async keys(pattern) {
    // Simple pattern matching (only supports *)
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    const keys = Array.from(this.store.keys()).filter(key => regex.test(key));
    logger.debug('Memory storage keys:', { pattern, count: keys.length });
    return keys;
  }
} 