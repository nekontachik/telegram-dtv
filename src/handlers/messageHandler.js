/**
 * Message handler module
 * Handles processing of user messages
 */

import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { showTypingIndicator, keepTypingIndicator } from '../utils/typingIndicator.js';
import { logger } from '../utils/logger.js';
import { messageQueue } from '../utils/messageQueue.js';
import { retryOperation } from '../utils/cache.js';

/**
 * Register message handler on bot
 * @param {TelegramBot} bot - The Telegram bot instance
 */
export const registerMessageHandler = async (bot) => {
  // Ensure bot exists
  if (!bot) {
    logger.error('Cannot register message handler: bot is null', new Error('Bot is null'));
    return;
  }

  // Register message handler directly on the bot
  bot.on('message', async (msg) => {
    // Ignore commands - they're handled separately
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }

    // Add message to queue for processing
    messageQueue.addItem({ message: msg });
  });
  
  // Set up message queue processor
  messageQueue.processItem = async (item) => {
    const msg = item.message;
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

    // Check if this chat is in human handoff mode
    try {
      const isInHandoff = await botService.isInHumanHandoff(chatId);
      if (isInHandoff) {
        // Log the user message to database
        await botService.logUserMessage(chatId, userText);
        
        // In a real implementation, this would forward the message to a human operator
        await bot.sendMessage(chatId, "Your message has been forwarded to a human operator. They will respond shortly.");
        return;
      }
    } catch (error) {
      logger.error('Error checking human handoff status', error, { chatId });
    }

    // If the session is not initialized, prompt the user to send /start
    try {
      const hasThread = await botService.hasActiveThread(chatId);
      if (!hasThread) {
        await bot.sendMessage(chatId, "Please send /start to begin a session.");
        return;
      }
    } catch (error) {
      logger.error('Error checking active thread', error, { chatId });
      await bot.sendMessage(chatId, "An error occurred. Please try again later.");
      return;
    }

    // Get thread ID
    let threadId;
    try {
      const userThread = await botService.getUserThread(chatId);
      if (!userThread || !userThread.id) {
        await bot.sendMessage(chatId, "Session error. Please send /start to begin a new session.");
        return;
      }
      
      threadId = userThread.id;
      logger.info(`Retrieved thread ID for chat ${chatId}: ${threadId}`);
    } catch (error) {
      logger.error('Error getting thread ID', error, { chatId });
      await bot.sendMessage(chatId, "An error occurred. Please try again later.");
      return;
    }

    try {
      // Show typing indicator to the user
      await bot.sendChatAction(chatId, 'typing');
      
      // Add the user's message to the thread and log it to the database
      logger.info(`Adding message to thread ${threadId}: ${userText.substring(0, 50)}${userText.length > 50 ? '...' : ''}`);
      
      // Log message to database
      await botService.logUserMessage(chatId, userText);
      
      // Add message to OpenAI thread
      await retryOperation(async () => {
        await openaiService.addMessageToThread(threadId, userText);
      });

      // Show typing indicator again before waiting for response
      await bot.sendChatAction(chatId, 'typing');

      // Create an abort controller for the typing indicator
      const abortController = new AbortController();
      
      // Start continuous typing indicator
      const stopTyping = await keepTypingIndicator(chatId, abortController.signal, bot);
      
      try {
        // Get response from the assistant
        const response = await retryOperation(async () => {
          return await openaiService.runAssistantAndGetResponse(threadId);
        });
        
        // Stop typing indicator
        abortController.abort();
        if (stopTyping) stopTyping();
        
        // Send the response to the user
        if (response) {
          await bot.sendMessage(chatId, response);
        } else {
          logger.error('Empty response from assistant', new Error('Empty response'), { 
            chatId, threadId 
          });
          await bot.sendMessage(chatId, "I'm sorry, I couldn't process your request. Please try again.");
        }
      } catch (error) {
        // Stop typing indicator in case of error
        abortController.abort();
        if (stopTyping) stopTyping();
        
        logger.error('Error getting response from assistant', error, { chatId, threadId });
        await bot.sendMessage(chatId, "I'm sorry, I encountered an error processing your message. Please try again.");
      }
    } catch (error) {
      logger.error('Error processing message', error, { chatId });
      await bot.sendMessage(chatId, "Unable to process your message. Please try again.");
    }
  };

  // Start processing the message queue
  messageQueue.startProcessing();
};
