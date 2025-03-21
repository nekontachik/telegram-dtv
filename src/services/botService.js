/**
 * Telegram Bot service module
 * Handles initialization and management of the Telegram bot
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { registerMessageHandler } from '../handlers/messageHandler.js';
import { registerCommandHandlers } from '../handlers/commandHandler.js';

class BotService {
  constructor() {
    this.bot = null;
    // We'll use Redis KV in production and Map in development
    this.storage = process.env.VERCEL ? null : new Map();
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
      const options = mode === 'development' ? {
        polling: {
          interval: 300,
          autoStart: true
        }
      } : {};  // In production, we don't need any options as we're using webhooks

      this.bot = new TelegramBot(config.telegram.token, options);

      // Configure webhook in production mode
      if (mode === 'production') {
        logger.info('Configuring webhook in production mode');
        const webhookUrl = 'https://telegram-dtv.vercel.app/webhook';
        
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
    logger.info('Storing thread for chat', { chatId, threadId });
    if (process.env.VERCEL) {
      // In production, store in Redis KV
      const key = `thread:${chatId}`;
      await fetch(`${process.env.VERCEL_URL}/api/kv/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: threadId })
      });
    } else {
      // In development, use Map
      this.storage.set(chatId, threadId);
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
      if (process.env.VERCEL) {
        // In production, get from Redis KV
        const key = `thread:${chatId}`;
        const response = await fetch(`${process.env.VERCEL_URL}/api/kv/get?key=${key}`);
        const data = await response.json();
        threadId = data.value;
      } else {
        // In development, use Map
        threadId = this.storage.get(chatId);
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
      logger.info('Sending message', { chatId, text: text.substring(0, 50) });
      await this.bot.sendMessage(chatId, text);
      logger.info('Message sent successfully', { chatId });
    } catch (error) {
      logger.error('Error sending message', error, { chatId });
      throw error;
    }
  }
}

export const botService = new BotService();

