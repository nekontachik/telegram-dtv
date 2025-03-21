/**
 * Telegram Bot service module
 * Handles initialization and management of the Telegram bot
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { dbService } from './dbService.js';
import { logger } from '../utils/logger.js';
import { SessionCache } from '../utils/cache.js';
import { retryOperation } from '../utils/cache.js';
import { instanceManager } from '../utils/instanceManager.js';
import { messageQueue } from '../utils/messageQueue.js';
import { registerMessageHandler, registerCommandHandlers } from '../utils/messageHandler.js';

class BotService {
  constructor() {
    this.bot = null;
    this.userThreads = {}; // In-memory fallback for user sessions
    this.useDatabase = false; // Will be set to true if dbService is initialized
    this.sessionCache = new SessionCache(3600000); // 1 година кешування
    this.initRetries = 0;
    this.maxInitRetries = 3;
    this.init();
  }

  /**
   * Initialize the Telegram bot
   * @returns {TelegramBot} - The initialized bot instance
   * @throws {Error} - If initialization fails
   */
  async init() {
    try {
      logger.info('Initializing Telegram bot');

      // Check if we can start a bot instance
      if (!(await instanceManager.registerInstance())) {
        if (!process.env.VERCEL) {  // Only throw in non-serverless environment
          logger.error('Another bot instance is already running', new Error('Duplicate instance'), { 
            persistent: true 
          });
          throw new Error('Another bot instance is already running. Please stop it before starting a new one.');
        }
      }

      // Initialize bot with appropriate configuration
      const options = process.env.VERCEL ? {} : {
        polling: true,
        testEnvironment: true,
        polling_interval: 300,
        timeout: 60
      };

      this.bot = new TelegramBot(config.telegram.token, options);
      
      // Register message and command handlers
      registerMessageHandler(this.bot);
      registerCommandHandlers(this.bot);

      return this.bot;
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', error);
      throw error;
    }
  }

  /**
   * Delete any existing webhook
   * @private
   */
  async _deleteWebhook() {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.telegram.token}/deleteWebhook`);
      const data = await response.json();
      
      if (data.ok) {
        logger.info('Successfully deleted webhook (if any)');
      } else {
        logger.warn(`Failed to delete webhook: ${data.description}`);
      }
    } catch (error) {
      logger.warn(`Error deleting webhook: ${error.message}`);
    }
  }

  /**
   * Load sessions from database into memory
   * @private
   */
  async _loadSessionsFromDatabase() {
    try {
      const sessions = await dbService.getAllSessions();
      logger.info(`Loaded ${sessions.length} sessions from database`);
      
      // Map to in-memory structure and cache
      sessions.forEach(session => {
        this.userThreads[session.chat_id] = {
          id: session.thread_id,
          humanHandoff: session.human_handoff
        };
        
        // Also store in cache
        this.sessionCache.set(session.chat_id, {
          id: session.thread_id,
          humanHandoff: session.human_handoff
        });
      });
    } catch (error) {
      logger.error('Error loading sessions from database', error);
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
   * @param {boolean} humanHandoff - Whether human handoff is enabled
   */
  async storeUserThread(chatId, threadId, humanHandoff = false) {
    const sessionData = { id: threadId, humanHandoff };
    
    // Store in memory
    this.userThreads[chatId] = sessionData;
    
    // Store in cache
    this.sessionCache.set(chatId, sessionData);
    
    // Store in database if available
    if (this.useDatabase) {
      await retryOperation(async () => {
        await dbService.storeUserSession(chatId, threadId, humanHandoff);
      });
    }
  }

  /**
   * Check if user has an active thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether the user has an active thread
   */
  async hasActiveThread(chatId) {
    return Boolean(await this.getUserThread(chatId));
  }

  /**
   * Get a user's thread
   * @param {number} chatId - The chat ID
   * @returns {Promise<Object>} - The user's thread or null if not found
   */
  async getUserThread(chatId) {
    // Check cache first
    const cachedThread = this.sessionCache.get(chatId);
    if (cachedThread) {
      return cachedThread;
    }
    
    // Check memory next
    if (this.userThreads[chatId]) {
      // Store in cache
      this.sessionCache.set(chatId, this.userThreads[chatId]);
      return this.userThreads[chatId];
    }
    
    // Finally, check database if available
    if (this.useDatabase) {
      try {
        const session = await dbService.getUserSession(chatId);
        if (session) {
          const threadData = {
            id: session.thread_id,
            humanHandoff: session.human_handoff
          };
          
          // Cache the result
          this.userThreads[chatId] = threadData;
          this.sessionCache.set(chatId, threadData);
          
          return threadData;
        }
      } catch (error) {
        logger.error(`Error getting user thread for chat ${chatId}`, error);
      }
    }
    
    return null;
  }

  /**
   * Set human handoff mode for a user
   * @param {number} chatId - The chat ID
   * @param {boolean} enabled - Whether to enable or disable human handoff
   */
  async setHumanHandoff(chatId, enabled) {
    const thread = await this.getUserThread(chatId);
    if (!thread) return false;
    
    thread.humanHandoff = enabled;
    
    // Update cache
    this.sessionCache.set(chatId, thread);
    
    // Update database if available
    if (this.useDatabase) {
      try {
        await dbService.updateHumanHandoff(chatId, enabled);
      } catch (error) {
        logger.error(`Error updating human handoff for chat ${chatId}`, error);
      }
    }
    
    return true;
  }

  /**
   * Check if a user is in human handoff mode
   * @param {number} chatId - The chat ID
   * @returns {boolean} - Whether the user is in human handoff mode
   */
  async isInHumanHandoff(chatId) {
    const thread = await this.getUserThread(chatId);
    return thread?.humanHandoff || false;
  }

  /**
   * Get all active users
   * @returns {Array} - Array of chat IDs
   */
  async getActiveUsers() {
    // If database is available, get from there for most up-to-date information
    if (this.useDatabase) {
      const sessions = await dbService.getAllSessions();
      return sessions.map(session => session.chat_id.toString());
    }
    
    // Fallback to memory
    return Object.keys(this.userThreads);
  }

  /**
   * Send a message to a user
   * @param {number} chatId - The chat ID
   * @param {string} text - The message text
   * @param {string} role - The role sending the message (default: assistant)
   */
  async sendMessage(chatId, text, role = 'assistant') {
    if (!this.bot) throw new Error("Bot not initialized");
    
    // Check if this is the operator transfer message
    if (text.includes(config.telegram.operatorTransferMessage)) {
      // Send the transfer message first
      await this.bot.sendMessage(chatId, text);
      
      // Then send the operator contact button
      await this.sendOperatorContact(chatId);
      
      // Log the transfer
      logger.info(`User ${chatId} transferred to operator`, {
        persistent: true,
        chatId,
        operatorUsername: config.telegram.operatorUsername
      });
      
      return;
    }
    
    // Log message to database if available
    if (this.useDatabase) {
      await dbService.logMessage(chatId, role, text);
    }
    
    // Використовуємо повторні спроби для надійності
    return retryOperation(async () => {
      return this.bot.sendMessage(chatId, text);
    });
  }

  /**
   * Send operator contact button to user
   * @param {number} chatId - The chat ID
   * @private
   */
  async sendOperatorContact(chatId) {
    try {
      // Log the transfer in database
      if (this.useDatabase) {
        await dbService.logOperatorTransfer(chatId);
      }
      
      await this.bot.sendMessage(chatId, 'Нажмите кнопку ниже, чтобы связаться с оператором:', {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💬 Чат с оператором',
              url: config.telegram.operatorChatLink
            }
          ]]
        }
      });
      
      // Log the action if database is available
      if (this.useDatabase) {
        await dbService.logMessage(chatId, 'system', 'Operator contact button sent');
      }
      
      // Log the transfer
      logger.info(`User ${chatId} transferred to operator`, {
        persistent: true,
        chatId,
        operatorUsername: config.telegram.operatorUsername
      });
    } catch (error) {
      logger.error('Error sending operator contact', error, { chatId });
      
      // Send fallback message with plain text link
      await this.bot.sendMessage(
        chatId, 
        `Для связи с оператором перейдите по ссылке: ${config.telegram.operatorChatLink}`
      );
    }
  }

  /**
   * Check if user was transferred to operator
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether user was transferred
   */
  async wasTransferredToOperator(chatId) {
    if (!this.useDatabase) return false;
    return await dbService.wasTransferredToOperator(chatId);
  }

  /**
   * Log a user message
   * @param {number} chatId - The chat ID
   * @param {string} text - The user's message
   */
  async logUserMessage(chatId, text) {
    if (this.useDatabase) {
      await retryOperation(async () => {
        await dbService.logMessage(chatId, 'user', text);
      });
    }
  }

  /**
   * Get recent conversation history
   * @param {number} chatId - The chat ID
   * @param {number} limit - Maximum number of messages to retrieve
   * @returns {Array} - Array of messages
   */
  async getConversationHistory(chatId, limit = 10) {
    if (!this.useDatabase) return [];
    
    return await retryOperation(async () => {
      return await dbService.getRecentMessages(chatId, limit);
    });
  }
}

export const botService = new BotService();

