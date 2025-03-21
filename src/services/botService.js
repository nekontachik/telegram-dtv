/**
 * Telegram Bot service module
 * Handles initialization and management of the Telegram bot
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { registerMessageHandler } from '../handlers/messageHandler.js';
import { registerCommandHandlers } from '../handlers/commandHandler.js';
import { Redis } from '@upstash/redis';

const redis = process.env.KV_REST_API_URL ? 
  new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  }) : null;

class BotService {
  constructor() {
    this.bot = null;
    this.storage = process.env.VERCEL ? redis : new Map();
    
    if (!this.storage) {
      logger.error('No storage initialized:', { 
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN
      });
    }
  }

  /**
   * Initialize the Telegram bot
   * @param {Object} options - Initialization options
   * @param {string} options.mode - Either 'development' or 'production'
   * @returns {TelegramBot} - The initialized bot instance
   * @throws {Error} - If initialization fails
   */
  async init({ mode = 'development' } = {}) {
    try {
      if (this.bot) {
        logger.info('Bot already initialized');
        return this.bot;
      }

      logger.info(`Initializing Telegram bot in ${mode} mode`);

      // Initialize bot with appropriate configuration
      this.bot = new TelegramBot(config.telegram.token, {
        webHook: mode === 'production'
      });

      // Configure webhook in production mode
      if (mode === 'production') {
        logger.info('Configuring webhook in production mode');
        const webhookUrl = 'https://telegram-6x6tztptu-bekihueki-gmailcoms-projects.vercel.app/webhook';
        
        // Remove any existing webhook first
        await this.bot.deleteWebHook();
        
        // Set the new webhook with allowed updates
        await this.bot.setWebHook(webhookUrl, {
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        });
        
        // Verify webhook was set
        const webhookInfo = await this.bot.getWebHookInfo();
        logger.info('Webhook configured:', webhookInfo);
        
        if (!webhookInfo.url) {
          throw new Error('Webhook setup failed - URL is empty');
        }
      }

      // Register message and command handlers
      logger.info('Registering message and command handlers');
      await registerMessageHandler(this.bot);
      await registerCommandHandlers(this.bot);

      if (mode === 'development') {
        logger.info('Starting polling in development mode');
        await this.bot.startPolling();
      }

      logger.info(`Bot initialization complete in ${mode} mode`);
      return this.bot;
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', error);
      throw error;
    }
  }

  /**
   * Get the bot instance
   * @returns {TelegramBot} - The bot instance
   */
  getBot() {
    if (!this.bot) {
      logger.error('Bot not initialized');
      throw new Error('Bot not initialized');
    }
    return this.bot;
  }

  /**
   * Store a user's thread ID
   * @param {number} chatId - The chat ID
   * @param {string} threadId - The thread ID
   */
  async storeUserThread(chatId, threadId) {
    try {
      const key = `thread:${chatId}`;
      logger.info('Storing thread:', { chatId, threadId, storageType: this.storage instanceof Map ? 'Map' : 'Redis' });
      
      if (this.storage instanceof Map) {
        this.storage.set(key, threadId);
      } else {
        await this.storage.set(key, threadId);
      }
      
      logger.info('Thread stored successfully');
    } catch (error) {
      logger.error('Failed to store thread:', error, { chatId, threadId });
      throw error;
    }
  }

  /**
   * Check if user has an active thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether the user has an active thread
   */
  async hasActiveThread(chatId) {
    try {
      const threadId = await this.getUserThread(chatId);
      const hasThread = !!threadId;
      logger.info('Checking active thread', { chatId, hasThread });
      return hasThread;
    } catch (error) {
      logger.error('Error checking active thread', error, { chatId });
      return false;
    }
  }

  /**
   * Get a user's thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<string|null>} - The user's thread ID or null if not found
   */
  async getUserThread(chatId) {
    try {
      let threadId = null;
      const key = `thread:${chatId}`;
      if (this.storage instanceof Map) {
        threadId = this.storage.get(key);
      } else {
        threadId = await this.storage.get(key);
      }
      logger.info('Getting user thread', { chatId, threadId });
      return threadId || null;
    } catch (error) {
      logger.error('Error getting user thread', error, { chatId });
      return null;
    }
  }

  /**
   * Send a message to a chat
   * @param {number} chatId - The chat ID
   * @param {string} text - The message text
   * @returns {Promise<void>}
   */
  async sendMessage(chatId, text) {
    try {
      logger.info('Sending message:', { chatId, textLength: text.length });
      await this.bot.sendMessage(chatId, text);
      logger.info('Message sent successfully');
    } catch (error) {
      logger.error('Failed to send message:', error, { chatId });
      throw error;
    }
  }
}

export const botService = new BotService();

