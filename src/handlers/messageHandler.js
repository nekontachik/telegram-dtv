/**
 * Message handler module
 * Handles processing of user messages
 */

import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

/**
 * Register message handler on bot
 * @param {TelegramBot} bot - The Telegram bot instance
 */
export const registerMessageHandler = async (bot) => {
  if (!bot) {
    logger.error('Cannot register message handler: bot is null');
    return;
  }

  bot.on('message', async (msg) => {
    // Ignore commands - they're handled separately
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }

    const chatId = msg.chat.id;
    const userText = msg.text;

    // Check if the message contains text
    if (!userText) {
      await bot.sendMessage(chatId, "Sorry, I can only process text messages for now.");
      return;
    }

    // Check if assistantId exists
    if (!openaiService.assistantId) {
      await bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
      return;
    }

    // If the session is not initialized, prompt the user to send /start
    try {
      const hasThread = await botService.hasActiveThread(chatId);
      if (!hasThread) {
        await bot.sendMessage(chatId, "Please send /start to begin a session.");
        return;
      }

      // Get thread ID
      const threadId = await botService.getUserThread(chatId);
      if (!threadId) {
        await bot.sendMessage(chatId, "Session error. Please send /start to begin a new session.");
        return;
      }

      // Show typing indicator
      await bot.sendChatAction(chatId, 'typing');

      // Add message to OpenAI thread
      await openaiService.addMessageToThread(threadId, userText);

      // Get response from the assistant
      const response = await openaiService.runAssistantAndGetResponse(threadId);

      if (response) {
        await bot.sendMessage(chatId, response);
      } else {
        logger.error('Empty response from assistant', { chatId, threadId });
        await bot.sendMessage(chatId, "I'm sorry, I couldn't process your request. Please try again.");
      }
    } catch (error) {
      logger.error('Error processing message', error, { chatId });
      await bot.sendMessage(chatId, "Unable to process your message. Please try again.");
    }
  });
};
