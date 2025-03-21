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
    this.userThreads = new Map(); // Simple Map for user sessions
  }

  /**
   * Initialize the Telegram bot
   * @returns {TelegramBot} - The initialized bot instance
   * @throws {Error} - If initialization fails
   */
  async init() {
    try {
      if (this.bot) {
        return this.bot;
      }

      logger.info('Initializing Telegram bot');

      // Initialize bot with appropriate configuration
      const options = process.env.VERCEL ? {
        webHook: {
          port: process.env.PORT || 3000
        }
      } : {
        polling: true
      };

      this.bot = new TelegramBot(config.telegram.token, options);

      // In webhook mode, set up the webhook
      if (process.env.VERCEL) {
        const webhookUrl = `https://${process.env.VERCEL_URL}/webhook`;
        await this.setWebhook(webhookUrl);
      }
      
      // Register message and command handlers
      await registerMessageHandler(this.bot);
      await registerCommandHandlers(this.bot);

      return this.bot;
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', error);
      throw error;
    }
  }

  /**
   * Set webhook for the bot
   * @param {string} url - The webhook URL
   */
  async setWebhook(url) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.telegram.token}/setWebhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(`Failed to set webhook: ${data.description}`);
      }
      logger.info(`Webhook set to ${url}`);
    } catch (error) {
      logger.error('Error setting webhook', error);
      throw error;
    }
  }

  /**
   * Get the bot instance
   * @returns {TelegramBot} - The bot instance
   */
  getBot() {
    return this.bot;
  }

  /**
   * Store a user's thread ID
   * @param {number} chatId - The chat ID
   * @param {string} threadId - The thread ID
   */
  async storeUserThread(chatId, threadId) {
    this.userThreads.set(chatId, threadId);
  }

  /**
   * Check if user has an active thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether the user has an active thread
   */
  async hasActiveThread(chatId) {
    return this.userThreads.has(chatId);
  }

  /**
   * Get a user's thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<string|null>} - The user's thread ID or null if not found
   */
  async getUserThread(chatId) {
    return this.userThreads.get(chatId) || null;
  }

  /**
   * Send a message to a chat
   * @param {number} chatId - The chat ID
   * @param {string} text - The message text
   * @returns {Promise<void>}
   */
  async sendMessage(chatId, text) {
    try {
      await this.bot.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error sending message', error, { chatId });
      throw error;
    }
  }
}

export const botService = new BotService();

