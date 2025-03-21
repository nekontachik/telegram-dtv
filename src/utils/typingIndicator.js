/**
 * Typing indicator utilities
 * Provides functions to show typing indicators to users
 */

import { logger } from './logger.js';
import { retryOperation } from './cache.js';

/**
 * Show a single typing indicator
 * @param {number} chatId - Chat ID to show typing indicator in
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<void>}
 */
export const showTypingIndicator = async (chatId, bot) => {
  try {
    if (!bot) {
      logger.error('Cannot show typing indicator: bot is null', new Error('Bot is null'));
      return;
    }
    
    await retryOperation(async () => {
      await bot.sendChatAction(chatId, 'typing');
    });
  } catch (error) {
    logger.error('Failed to show typing indicator', error, { chatId });
  }
};

/**
 * Keep showing typing indicator until signal is aborted
 * @param {number} chatId - Chat ID to show typing indicator in
 * @param {AbortSignal} signal - Signal to abort the typing indicator
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<Function>} - Function to stop the typing indicator
 */
export const keepTypingIndicator = async (chatId, signal, bot) => {
  if (!bot) {
    logger.error('Cannot keep typing indicator: bot is null', new Error('Bot is null'));
    return null;
  }
  
  // Create interval to repeatedly show typing indicator
  // Telegram typing indicators last about 5 seconds, so we send every 4 seconds
  const interval = setInterval(async () => {
    try {
      if (signal.aborted) {
        clearInterval(interval);
        return;
      }
      
      await retryOperation(async () => {
        await bot.sendChatAction(chatId, 'typing');
      }, 2);
    } catch (error) {
      if (!signal.aborted) {
        logger.error('Failed to show typing indicator in interval', error, { chatId });
      }
    }
  }, 4000);
  
  // Immediately show first typing indicator
  await showTypingIndicator(chatId, bot);
  
  // Return function to stop the interval
  return () => {
    clearInterval(interval);
  };
};
