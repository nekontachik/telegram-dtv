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

    this.isConnected = false;
    this.connectionError = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;

    this.redis = new Redis(config.url, {
      maxRetriesPerRequest: config.maxRetries || 3,
      retryStrategy: (times) => {
        if (times > this.maxReconnectAttempts) {
          logger.error('Max Redis reconnection attempts reached');
          return null; // Stop retrying
        }
        const delay = Math.min(times * (config.retryDelay || 1000), 5000);
        logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      connectTimeout: 5000,
      lazyConnect: true // Don't connect immediately
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.redis.on('connect', () => {
      this.isConnected = true;
      this.connectionError = null;
      this.reconnectAttempts = 0;
      logger.info('Redis connected');
    });

    this.redis.on('error', (error) => {
      this.connectionError = error;
      logger.error('Redis error:', error);
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', (timeBeforeReconnect) => {
      this.reconnectAttempts++;
      logger.info(`Redis reconnecting in ${timeBeforeReconnect}ms (attempt ${this.reconnectAttempts})`);
    });

    this.redis.on('end', () => {
      this.isConnected = false;
      logger.info('Redis connection ended');
    });
  }

  /**
   * Connect to Redis if not already connected
   */
  async connect() {
    if (this.isConnected) return;

    try {
      await this.redis.connect();
      await this.ping();
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw error;
    }
  }

  /**
   * Check Redis connection
   */
  async ping() {
    try {
      const result = await this.redis.ping();
      this.isConnected = result === 'PONG';
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      logger.error('Redis ping failed:', error);
      throw error;
    }
  }

  /**
   * Set a value with automatic reconnection
   */
  async set(key, value, ttl = null) {
    try {
      await this.ensureConnection();
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
   * Get a value with automatic reconnection
   */
  async get(key) {
    try {
      await this.ensureConnection();
      const value = await this.redis.get(key);
      logger.debug('Redis get:', { key, exists: !!value });
      return value;
    } catch (error) {
      logger.error('Redis get failed:', error);
      throw error;
    }
  }

  /**
   * Delete a value with automatic reconnection
   */
  async del(key) {
    try {
      await this.ensureConnection();
      await this.redis.del(key);
      logger.debug('Redis del:', { key });
    } catch (error) {
      logger.error('Redis delete failed:', error);
      throw error;
    }
  }

  /**
   * Check if key exists with automatic reconnection
   */
  async exists(key) {
    try {
      await this.ensureConnection();
      const exists = await this.redis.exists(key);
      logger.debug('Redis exists:', { key, exists: !!exists });
      return !!exists;
    } catch (error) {
      logger.error('Redis exists check failed:', error);
      throw error;
    }
  }

  /**
   * Set value with expiration and automatic reconnection
   */
  async setEx(key, value, ttl) {
    try {
      await this.ensureConnection();
      await this.redis.setex(key, ttl, value);
      logger.debug('Redis setEx:', { key, ttl });
    } catch (error) {
      logger.error('Redis setEx failed:', error);
      throw error;
    }
  }

  /**
   * Get keys matching pattern with automatic reconnection
   */
  async keys(pattern) {
    try {
      await this.ensureConnection();
      const keys = await this.redis.keys(pattern);
      logger.debug('Redis keys:', { pattern, count: keys.length });
      return keys;
    } catch (error) {
      logger.error('Redis keys error:', error, { pattern });
      throw error;
    }
  }

  /**
   * Ensure Redis connection is active
   */
  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      error: this.connectionError?.message,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Gracefully close Redis connection
   */
  async quit() {
    try {
      if (this.isConnected) {
        await this.redis.quit();
      }
      this.isConnected = false;
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Redis quit error:', error);
      throw error;
    }
  }
} 