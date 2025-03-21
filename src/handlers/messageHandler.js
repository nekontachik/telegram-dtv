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

  logger.info('Registering message handler');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userText = msg.text;

    logger.info('Received message', {
      chatId,
      messageId,
      text: userText?.substring(0, 50),
      from: msg.from?.username
    });

    // Ignore commands - they're handled separately
    if (msg.text && msg.text.startsWith('/')) {
      logger.info('Ignoring command message', { chatId, command: msg.text });
      return;
    }

    // Check if the message contains text
    if (!userText) {
      logger.info('Received non-text message', { chatId, messageId });
      await bot.sendMessage(chatId, "Sorry, I can only process text messages for now.");
      return;
    }

    try {
      // Check if assistantId exists
      if (!openaiService.assistantId) {
        logger.error('Assistant ID not found', { chatId });
        await bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
        return;
      }

      // If the session is not initialized, prompt the user to send /start
      const hasThread = await botService.hasActiveThread(chatId);
      if (!hasThread) {
        logger.info('No active thread found', { chatId });
        await bot.sendMessage(chatId, "Please send /start to begin a session.");
        return;
      }

      // Get thread ID
      const threadId = await botService.getUserThread(chatId);
      if (!threadId) {
        logger.error('Thread ID not found for active chat', { chatId });
        await bot.sendMessage(chatId, "Session error. Please send /start to begin a new session.");
        return;
      }

      logger.info('Processing message with OpenAI', { chatId, threadId });

      // Show typing indicator
      await bot.sendChatAction(chatId, 'typing');

      // Add message to OpenAI thread
      await openaiService.addMessageToThread(threadId, userText);
      logger.info('Message added to OpenAI thread', { chatId, threadId });

      // Get response from the assistant
      const response = await openaiService.runAssistantAndGetResponse(threadId);
      logger.info('Received response from OpenAI', { 
        chatId, 
        threadId, 
        hasResponse: !!response,
        responseLength: response?.length
      });

      if (response) {
        await bot.sendMessage(chatId, response);
        logger.info('Response sent to user', { chatId, threadId });
      } else {
        logger.error('Empty response from assistant', { chatId, threadId });
        await bot.sendMessage(chatId, "I'm sorry, I couldn't process your request. Please try again.");
      }
    } catch (error) {
      logger.error('Error processing message', error, { 
        chatId,
        messageId,
        error: error.message
      });
      await bot.sendMessage(chatId, "Unable to process your message. Please try again.");
    }
  });

  logger.info('Message handler registered successfully');
};
