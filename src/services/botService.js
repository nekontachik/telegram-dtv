/**
 * Telegram Bot service module
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

  async init({ mode = 'development' } = {}) {
    try {
      if (this.bot) return this.bot;

      logger.info(`Initializing bot in ${mode} mode`);

      // Initialize bot with appropriate configuration
      const options = mode === 'development' ? {
        polling: true
      } : {
        webHook: {
          port: process.env.PORT || 3000
        }
      };

      this.bot = new TelegramBot(config.telegram.token, options);

      // Set webhook in production
      if (mode === 'production') {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
          throw new Error('WEBHOOK_URL environment variable is required in production mode');
        }
        
        await this.bot.setWebHook(webhookUrl);
        logger.info('Webhook set:', webhookUrl);
      }

      // Register handlers
      await registerMessageHandler(this.bot);
      await registerCommandHandlers(this.bot);

      logger.info('Bot initialized successfully');
      return this.bot;
    } catch (error) {
      logger.error('Bot init failed:', error);
      throw error;
    }
  }

  getBot() {
    if (!this.bot) throw new Error('Bot not initialized');
    return this.bot;
  }

  async storeUserThread(chatId, threadId) {
    this.userThreads.set(chatId, threadId);
    logger.info('Thread stored:', { chatId, threadId });
  }

  async getUserThread(chatId) {
    const threadId = this.userThreads.get(chatId);
    logger.info('Thread retrieved:', { chatId, threadId });
    return threadId || null;
  }

  async hasActiveThread(chatId) {
    const hasThread = this.userThreads.has(chatId);
    logger.info('Checking active thread:', { chatId, hasThread });
    return hasThread;
  }

  async sendMessage(chatId, text) {
    try {
      logger.info('Sending message:', { chatId, textLength: text.length });
      await this.bot.sendMessage(chatId, text);
      logger.info('Message sent successfully');
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }
}

export const botService = new BotService();

