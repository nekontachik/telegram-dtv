/**
 * Telegram Bot service module
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { registerMessageHandler } from '../handlers/messageHandler.js';
import { registerCommandHandlers } from '../handlers/commandHandler.js';

export class BotService {
  constructor(userSessionService) {
    if (!userSessionService) {
      throw new Error('UserSessionService is required');
    }
    this.bot = null;
    this.userSessionService = userSessionService;
    this.isInitialized = false;
    this.initializationError = null;
  }

  /**
   * Initialize bot with appropriate configuration
   */
  async init({ mode = 'development', webhookUrl = null } = {}) {
    if (this.isInitialized) {
      logger.info('Bot already initialized');
      return this.bot;
    }

    try {
      logger.info(`Initializing bot in ${mode} mode`);

      const options = this.getBotOptions(mode);
      this.bot = new TelegramBot(config.telegram.token, options);

      // Verify token and connection
      await this.verifyBotConnection();

      if (mode === 'production') {
        await this.setupWebhook(webhookUrl);
      }

      // Register handlers
      await this.registerHandlers();

      this.isInitialized = true;
      this.initializationError = null;
      logger.info('Bot initialized successfully');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      return this.bot;
    } catch (error) {
      this.initializationError = error;
      this.isInitialized = false;
      logger.error('Bot initialization failed:', error);
      throw error;
    }
  }

  /**
   * Verify bot connection and token
   */
  async verifyBotConnection() {
    try {
      const botInfo = await this.bot.getMe();
      logger.info('Bot connection verified:', botInfo.username);
    } catch (error) {
      throw new Error(`Failed to verify bot connection: ${error.message}`);
    }
  }

  /**
   * Register message and command handlers
   */
  async registerHandlers() {
    try {
      await registerMessageHandler(this.bot);
      await registerCommandHandlers(this.bot);
      logger.info('Bot handlers registered successfully');
    } catch (error) {
      throw new Error(`Failed to register handlers: ${error.message}`);
    }
  }

  /**
   * Get bot instance options based on mode
   */
  getBotOptions(mode) {
    const baseOptions = {
      polling: false,
      filepath: false // Disable file downloads for security
    };

    if (mode === 'development') {
      return {
        ...baseOptions,
        polling: true
      };
    }

    return {
      ...baseOptions,
      webHook: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: '0.0.0.0'
      }
    };
  }

  /**
   * Setup webhook for production mode with retries
   */
  async setupWebhook(webhookUrl, maxRetries = 3) {
    if (!webhookUrl) {
      throw new Error('Webhook URL is required in production mode');
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Remove any existing webhook
        await this.bot.deleteWebHook();
        
        // Set new webhook
        await this.bot.setWebHook(webhookUrl, {
          max_connections: 100,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        });
        
        // Verify webhook
        const info = await this.bot.getWebHookInfo();
        if (info.url !== webhookUrl) {
          throw new Error('Webhook verification failed');
        }

        logger.info('Webhook setup successful:', webhookUrl);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Webhook setup attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Webhook setup failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async () => {
      logger.info('Graceful shutdown initiated');
      try {
        if (this.bot) {
          await this.bot.close();
        }
        logger.info('Bot shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  /**
   * Get bot instance with initialization check
   */
  getBot() {
    if (!this.isInitialized) {
      throw new Error(
        this.initializationError 
          ? `Bot not initialized: ${this.initializationError.message}`
          : 'Bot not initialized'
      );
    }
    return this.bot;
  }

  /**
   * Send message with improved retry logic and validation
   */
  async sendMessage(chatId, text, options = {}) {
    if (!chatId || !text) {
      throw new Error('ChatId and text are required');
    }

    const maxRetries = 3;
    const maxLength = 4096; // Telegram message length limit
    let lastError = null;

    // Split long messages
    if (text.length > maxLength) {
      const parts = text.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
      const results = [];
      
      for (const part of parts) {
        results.push(await this.sendMessage(chatId, part, options));
      }
      
      return results;
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        logger.info('Sending message:', { 
          chatId, 
          textLength: text.length,
          attempt: i + 1 
        });

        const result = await this.bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...options
        });
        
        logger.info('Message sent successfully');
        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`Send message attempt ${i + 1} failed:`, error);
        
        // Don't retry if it's a client error
        if (error.response && error.response.statusCode >= 400 && error.response.statusCode < 500) {
          throw error;
        }
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw new Error(`Failed to send message after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Get service health status
   */
  getHealth() {
    return {
      isInitialized: this.isInitialized,
      error: this.initializationError?.message,
      uptime: process.uptime()
    };
  }

  /**
   * Store user thread
   */
  async storeUserThread(chatId, threadId) {
    try {
      await this.userSessionService.storeThread(chatId, threadId);
      logger.info('Thread stored:', { chatId, threadId });
    } catch (error) {
      logger.error('Failed to store thread:', error);
      throw error;
    }
  }

  /**
   * Get user thread
   */
  async getUserThread(chatId) {
    try {
      const threadId = await this.userSessionService.getThread(chatId);
      logger.info('Thread retrieved:', { chatId, threadId });
      return threadId;
    } catch (error) {
      logger.error('Failed to get thread:', error);
      throw error;
    }
  }

  /**
   * Check if user has active thread
   */
  async hasActiveThread(chatId) {
    try {
      const hasThread = await this.userSessionService.hasActiveThread(chatId);
      logger.info('Checking active thread:', { chatId, hasThread });
      return hasThread;
    } catch (error) {
      logger.error('Failed to check thread:', error);
      throw error;
    }
  }
}

export const botService = new BotService();

