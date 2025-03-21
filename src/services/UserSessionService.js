/**
 * Service for managing user sessions and threads
 */

import { logger } from '../utils/logger.js';

export class UserSessionService {
  constructor(storage) {
    if (!storage) {
      throw new Error('Storage is required');
    }
    this.storage = storage;
    this.keyPrefix = 'thread:';
    this.defaultTTL = 24 * 60 * 60; // 24 hours
    this.maxTTL = 7 * 24 * 60 * 60; // 7 days
  }

  /**
   * Validate chat ID
   */
  validateChatId(chatId) {
    if (!chatId || typeof chatId !== 'number') {
      throw new Error('Invalid chat ID');
    }
  }

  /**
   * Validate thread ID
   */
  validateThreadId(threadId) {
    if (!threadId || typeof threadId !== 'string') {
      throw new Error('Invalid thread ID');
    }
  }

  /**
   * Validate TTL
   */
  validateTTL(ttl) {
    if (!Number.isInteger(ttl) || ttl <= 0 || ttl > this.maxTTL) {
      throw new Error(`TTL must be between 1 and ${this.maxTTL} seconds`);
    }
  }

  /**
   * Generate storage key for chat
   */
  getKey(chatId) {
    this.validateChatId(chatId);
    return `${this.keyPrefix}${chatId}`;
  }

  /**
   * Store user thread with TTL and validation
   */
  async storeThread(chatId, threadId, ttl = this.defaultTTL) {
    try {
      this.validateChatId(chatId);
      this.validateThreadId(threadId);
      this.validateTTL(ttl);

      const key = this.getKey(chatId);
      await this.storage.setEx(key, threadId, ttl);
      
      logger.info('Thread stored:', { 
        chatId, 
        threadId, 
        ttl,
        key 
      });
    } catch (error) {
      logger.error('Failed to store thread:', { 
        chatId, 
        threadId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get user thread and refresh TTL with validation
   */
  async getThread(chatId, shouldRefreshTTL = true) {
    try {
      this.validateChatId(chatId);
      const key = this.getKey(chatId);
      const threadId = await this.storage.get(key);
      
      if (!threadId) {
        logger.info('No thread found:', { chatId });
        return null;
      }

      if (shouldRefreshTTL) {
        await this.storage.setEx(key, threadId, this.defaultTTL);
        logger.info('Thread TTL refreshed:', { 
          chatId, 
          threadId,
          ttl: this.defaultTTL 
        });
      }

      return threadId;
    } catch (error) {
      logger.error('Failed to get thread:', { 
        chatId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if user has active thread with validation
   */
  async hasActiveThread(chatId) {
    try {
      this.validateChatId(chatId);
      const key = this.getKey(chatId);
      const exists = await this.storage.exists(key);
      
      logger.info('Thread existence checked:', { 
        chatId, 
        exists 
      });
      
      return exists;
    } catch (error) {
      logger.error('Failed to check thread:', { 
        chatId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete user thread with validation
   */
  async deleteThread(chatId) {
    try {
      this.validateChatId(chatId);
      const key = this.getKey(chatId);
      await this.storage.del(key);
      
      logger.info('Thread deleted:', { chatId });
    } catch (error) {
      logger.error('Failed to delete thread:', { 
        chatId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update thread TTL with validation
   */
  async updateThreadTTL(chatId, ttl = this.defaultTTL) {
    try {
      this.validateChatId(chatId);
      this.validateTTL(ttl);

      const key = this.getKey(chatId);
      const threadId = await this.storage.get(key);
      
      if (!threadId) {
        logger.warn('Cannot update TTL - thread not found:', { chatId });
        return false;
      }

      await this.storage.setEx(key, threadId, ttl);
      logger.info('Thread TTL updated:', { 
        chatId, 
        threadId, 
        ttl 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to update thread TTL:', { 
        chatId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all active threads
   */
  async getAllActiveThreads() {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.storage.keys(pattern);
      const threads = [];

      for (const key of keys) {
        const chatId = parseInt(key.replace(this.keyPrefix, ''), 10);
        const threadId = await this.storage.get(key);
        if (threadId) {
          threads.push({ chatId, threadId });
        }
      }

      logger.info('Retrieved all active threads:', { 
        count: threads.length 
      });
      
      return threads;
    } catch (error) {
      logger.error('Failed to get all active threads:', error);
      throw error;
    }
  }

  /**
   * Clean up expired threads
   */
  async cleanupExpiredThreads() {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.storage.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const exists = await this.storage.exists(key);
        if (!exists) {
          await this.storage.del(key);
          cleanedCount++;
        }
      }

      logger.info('Cleaned up expired threads:', { 
        total: keys.length, 
        cleaned: cleanedCount 
      });
      
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired threads:', error);
      throw error;
    }
  }
} 