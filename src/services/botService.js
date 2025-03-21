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
    this.userThreads = new Map();
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
      } : {
        webHook: true
      };

      this.bot = new TelegramBot(config.telegram.token, options);

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
    this.userThreads.set(chatId, threadId);
  }

  /**
   * Check if user has an active thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether the user has an active thread
   */
  async hasActiveThread(chatId) {
    const hasThread = this.userThreads.has(chatId);
    logger.info('Checking active thread', { chatId, hasThread });
    return hasThread;
  }

  /**
   * Get a user's thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<string|null>} - The user's thread ID or null if not found
   */
  async getUserThread(chatId) {
    const threadId = this.userThreads.get(chatId) || null;
    logger.info('Getting user thread', { chatId, threadId });
    return threadId;
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

