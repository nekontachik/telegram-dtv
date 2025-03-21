/**
 * Redis storage implementation
 */

import { createClient } from '@upstash/redis';
import { logger } from '../utils/logger.js';

export class RedisStorage {
  constructor(config) {
    this.client = createClient({
      url: config.url,
      token: config.token
    });
  }

  /**
   * Set a value
   */
  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await this.client.set(key, value, { ex: ttl });
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Redis set failed:', error);
      throw error;
    }
  }

  /**
   * Get a value
   */
  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis get failed:', error);
      throw error;
    }
  }

  /**
   * Delete a value
   */
  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis delete failed:', error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      return await this.client.exists(key) === 1;
    } catch (error) {
      logger.error('Redis exists check failed:', error);
      throw error;
    }
  }

  /**
   * Set value with expiration
   */
  async setEx(key, value, ttl) {
    try {
      await this.client.set(key, value, { ex: ttl });
    } catch (error) {
      logger.error('Redis setEx failed:', error);
      throw error;
    }
  }
} 