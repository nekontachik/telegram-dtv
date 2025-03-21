/**
 * Redis storage adapter using ioredis
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

export class RedisStorage {
  constructor(config) {
    if (!config?.url) {
      throw new Error('Redis URL is required');
    }

    this.redis = new Redis(config.url, {
      maxRetriesPerRequest: config.maxRetries || 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * (config.retryDelay || 1000), 5000);
        logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      }
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });
  }

  /**
   * Set a value
   */
  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
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
      const value = await this.redis.get(key);
      logger.debug('Redis get:', { key, exists: !!value });
      return value;
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
      await this.redis.del(key);
      logger.debug('Redis del:', { key });
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
      const exists = await this.redis.exists(key);
      logger.debug('Redis exists:', { key, exists: !!exists });
      return !!exists;
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
      await this.redis.setex(key, ttl, value);
      logger.debug('Redis setEx:', { key, ttl });
    } catch (error) {
      logger.error('Redis setEx failed:', error);
      throw error;
    }
  }

  async keys(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      logger.debug('Redis keys:', { pattern, count: keys.length });
      return keys;
    } catch (error) {
      logger.error('Redis keys error:', error, { pattern });
      throw error;
    }
  }

  async quit() {
    try {
      await this.redis.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Redis quit error:', error);
      throw error;
    }
  }
} 