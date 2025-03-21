/**
 * Redis storage adapter using ioredis with connection pooling
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// Exponential backoff utility
class ExponentialBackoff {
  constructor(options = {}) {
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter !== undefined ? options.jitter : true;
  }

  getDelay(attempt) {
    let delay = Math.min(
      this.initialDelay * Math.pow(this.factor, attempt),
      this.maxDelay
    );

    if (this.jitter) {
      delay = delay * (0.5 + Math.random());
    }

    return delay;
  }
}

export class RedisStorage {
  constructor(config) {
    if (!config?.url) {
      throw new Error('Redis URL is required');
    }

    this.config = {
      ...config,
      maxPoolSize: config.maxPoolSize || 10,
      minPoolSize: config.minPoolSize || 2
    };

    this.isConnected = false;
    this.connectionError = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    
    // Connection pool
    this.pool = new Map();
    this.availableConnections = [];
    
    // Backoff strategy
    this.backoff = new ExponentialBackoff({
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2
    });

    // Initialize minimum pool size
    this.initializePool();
  }

  async initializePool() {
    try {
      for (let i = 0; i < this.config.minPoolSize; i++) {
        await this.addConnectionToPool();
      }
    } catch (error) {
      logger.error('Failed to initialize Redis pool:', error);
      throw error;
    }
  }

  async addConnectionToPool() {
    const connection = new Redis(this.config.url, {
      maxRetriesPerRequest: this.config.maxRetries || 3,
      retryStrategy: (times) => {
        if (times > this.maxReconnectAttempts) {
          logger.error('Max Redis reconnection attempts reached');
          return null;
        }
        const delay = this.backoff.getDelay(times);
        logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      connectTimeout: 5000,
      lazyConnect: true
    });

    const id = Date.now().toString() + Math.random().toString(36).substr(2);
    
    this.setupConnectionEventHandlers(connection, id);
    await connection.connect();
    
    this.pool.set(id, connection);
    this.availableConnections.push(id);
    
    return id;
  }

  setupConnectionEventHandlers(connection, id) {
    connection.on('connect', () => {
      this.isConnected = true;
      this.connectionError = null;
      this.reconnectAttempts = 0;
      logger.info(`Redis connection ${id} established`);
    });

    connection.on('error', (error) => {
      this.connectionError = error;
      logger.error(`Redis connection ${id} error:`, error);
    });

    connection.on('close', () => {
      this.removeConnectionFromPool(id);
      logger.warn(`Redis connection ${id} closed`);
    });

    connection.on('end', () => {
      this.removeConnectionFromPool(id);
      logger.info(`Redis connection ${id} ended`);
    });
  }

  async getConnection() {
    // Check if we need to add more connections
    if (this.availableConnections.length === 0 && this.pool.size < this.config.maxPoolSize) {
      const id = await this.addConnectionToPool();
      return this.pool.get(id);
    }

    // Get an available connection
    while (this.availableConnections.length > 0) {
      const id = this.availableConnections.shift();
      const conn = this.pool.get(id);
      
      if (conn && conn.status === 'ready') {
        this.availableConnections.push(id); // Return to pool
        return conn;
      } else {
        this.removeConnectionFromPool(id);
      }
    }

    throw new Error('No Redis connections available');
  }

  removeConnectionFromPool(id) {
    const conn = this.pool.get(id);
    if (conn) {
      conn.disconnect();
      this.pool.delete(id);
    }
    this.availableConnections = this.availableConnections.filter(cid => cid !== id);
    
    // Check if we need to create new connections
    if (this.pool.size < this.config.minPoolSize) {
      this.addConnectionToPool().catch(error => {
        logger.error('Failed to add new connection to pool:', error);
      });
    }
  }

  async executeWithRetry(operation) {
    let lastError = null;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const connection = await this.getConnection();
        return await operation(connection);
      } catch (error) {
        lastError = error;
        logger.warn(`Redis operation failed (attempt ${attempt + 1}):`, error);
        
        if (error.message.includes('READONLY')) {
          await this.handleReadOnlyError();
          continue;
        }
        
        const delay = this.backoff.getDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async handleReadOnlyError() {
    logger.warn('Redis in read-only mode, attempting to recover');
    // Clear pool and reinitialize
    for (const [id, conn] of this.pool.entries()) {
      await conn.disconnect();
      this.pool.delete(id);
    }
    this.availableConnections = [];
    await this.initializePool();
  }

  /**
   * Check Redis connection
   */
  async ping() {
    return this.executeWithRetry(async (connection) => {
      const result = await connection.ping();
      this.isConnected = result === 'PONG';
      return this.isConnected;
    });
  }

  /**
   * Set a value with automatic reconnection and retry
   */
  async set(key, value, ttl = null) {
    return this.executeWithRetry(async (connection) => {
      if (ttl) {
        await connection.setex(key, ttl, value);
      } else {
        await connection.set(key, value);
      }
    });
  }

  /**
   * Get a value with automatic reconnection and retry
   */
  async get(key) {
    return this.executeWithRetry(async (connection) => {
      const value = await connection.get(key);
      logger.debug('Redis get:', { key, exists: !!value });
      return value;
    });
  }

  /**
   * Delete a value with automatic reconnection and retry
   */
  async del(key) {
    return this.executeWithRetry(async (connection) => {
      await connection.del(key);
      logger.debug('Redis del:', { key });
    });
  }

  /**
   * Check if key exists with automatic reconnection and retry
   */
  async exists(key) {
    return this.executeWithRetry(async (connection) => {
      const exists = await connection.exists(key);
      logger.debug('Redis exists:', { key, exists: !!exists });
      return !!exists;
    });
  }

  /**
   * Set value with expiration and automatic reconnection
   */
  async setEx(key, value, ttl) {
    return this.executeWithRetry(async (connection) => {
      await connection.setex(key, ttl, value);
      logger.debug('Redis setEx:', { key, ttl });
    });
  }

  /**
   * Get keys matching pattern with automatic reconnection
   */
  async keys(pattern) {
    return this.executeWithRetry(async (connection) => {
      const keys = await connection.keys(pattern);
      logger.debug('Redis keys:', { pattern, count: keys.length });
      return keys;
    });
  }

  /**
   * Get connection status and pool information
   */
  getStatus() {
    return {
      connected: this.isConnected,
      error: this.connectionError?.message,
      reconnectAttempts: this.reconnectAttempts,
      pool: {
        size: this.pool.size,
        available: this.availableConnections.length,
        max: this.config.maxPoolSize,
        min: this.config.minPoolSize
      }
    };
  }

  /**
   * Gracefully close all Redis connections
   */
  async quit() {
    logger.info('Closing all Redis connections...');
    
    const closePromises = Array.from(this.pool.values()).map(async (connection) => {
      try {
        await connection.quit();
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    });

    await Promise.allSettled(closePromises);
    
    this.pool.clear();
    this.availableConnections = [];
    this.isConnected = false;
    
    logger.info('All Redis connections closed');
  }
} 