/**
 * Command handler module
 * Handles Telegram bot commands
 */

import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

/**
 * Register command handlers on bot
 * @param {TelegramBot} bot - The Telegram bot instance
 */
export const registerCommandHandlers = async (bot) => {
  // Handle the /start command to initialize a session
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!openaiService.assistantId) {
      await bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
      return;
    }
    
    try {
      // Create a new thread (session) via the OpenAI API
      const threadId = await openaiService.createThread();
      logger.info("Created thread:", { threadId, chatId });
      
      // Save the thread ID for the current chat
      await botService.storeUserThread(chatId, threadId);
      
      // Send a welcome message to initiate the conversation
      await bot.sendMessage(chatId, "Hello! I'm your AI assistant. How can I help you today?");
    } catch (error) {
      logger.error("Error creating thread:", error, { chatId });
      await bot.sendMessage(chatId, "Failed to create session. Please try again later.");
    }
  });

  // Handle the /help command
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpText = 
      "Available commands:\n" +
      "/start - Start a new conversation\n" +
      "/help - Show this help message";
    
    await bot.sendMessage(chatId, helpText);
  });

  // Command to enable human handoff mode for a specific chat
  bot.onText(/\/handoff (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    try {
      const hasThread = await botService.hasActiveThread(targetChatId);
      if (hasThread) {
        const success = await botService.setHumanHandoff(targetChatId, true);
        
        if (success) {
          await bot.sendMessage(operatorId, `Human handoff enabled for chat ${targetChatId}`);
          await bot.sendMessage(targetChatId, "You are now connected to a human operator.");
        } else {
          await bot.sendMessage(operatorId, `Failed to enable human handoff for chat ${targetChatId}`);
        }
      } else {
        await bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
      }
    } catch (error) {
      logger.error("Error handling handoff command:", error, { operatorId, targetChatId });
      await bot.sendMessage(operatorId, "An error occurred while processing the command.");
    }
  });

  // Command to disable human handoff mode for a specific chat
  bot.onText(/\/ai (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    try {
      const hasThread = await botService.hasActiveThread(targetChatId);
      if (hasThread) {
        const success = await botService.setHumanHandoff(targetChatId, false);
        
        if (success) {
          await bot.sendMessage(operatorId, `AI mode reactivated for chat ${targetChatId}`);
          await bot.sendMessage(targetChatId, "You are now connected to the AI assistant again.");
        } else {
          await bot.sendMessage(operatorId, `Failed to reactivate AI mode for chat ${targetChatId}`);
        }
      } else {
        await bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
      }
    } catch (error) {
      logger.error("Error handling ai command:", error, { operatorId, targetChatId });
      await bot.sendMessage(operatorId, "An error occurred while processing the command.");
    }
  });

  // Command for operators to answer to users
  bot.onText(/\/answer (.+?) (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    const responseText = match[2];
    
    try {
      const hasThread = await botService.hasActiveThread(targetChatId);
      const isInHandoff = await botService.isInHumanHandoff(targetChatId);
      
      if (hasThread && isInHandoff) {
        await bot.sendMessage(targetChatId, responseText);
        await bot.sendMessage(operatorId, `Message sent to ${targetChatId}`);
      } else {
        await bot.sendMessage(operatorId, 
          `Cannot send message. Either chat ${targetChatId} doesn't exist or it's not in human handoff mode.`);
      }
    } catch (error) {
      logger.error("Error handling answer command:", error, { operatorId, targetChatId });
      await bot.sendMessage(operatorId, "An error occurred while processing the command.");
    }
  });

  // Command to list all active users
  bot.onText(/\/users/, async (msg) => {
    const operatorId = msg.chat.id;
    
    try {
      const userList = await botService.getActiveUsers();
      
      if (userList.length === 0) {
        await bot.sendMessage(operatorId, "No active users.");
        return;
      }
      
      let response = "Active users:\n";
      
      // Process each user synchronously to avoid race conditions
      for (const chatId of userList) {
        const isInHandoff = await botService.isInHumanHandoff(chatId);
        const handoffStatus = isInHandoff ? "🔴 Human handoff" : "🟢 AI mode";
        response += `- ${chatId} (${handoffStatus})\n`;
      }
      
      response += "\nTo enable human handoff: /handoff [chatId]\n";
      response += "To return to AI mode: /ai [chatId]\n";
      response += "To answer a user: /answer [chatId] [message]";
      
      await bot.sendMessage(operatorId, response);
    } catch (error) {
      logger.error("Error handling users command:", error, { operatorId });
      await bot.sendMessage(operatorId, "An error occurred while processing the command.");
    }
  });

  // Command to view recent conversation history
  bot.onText(/\/history (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    try {
      const hasThread = await botService.hasActiveThread(targetChatId);
      if (!hasThread) {
        await bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
        return;
      }
      
      // Get recent messages
      const messages = await botService.getConversationHistory(targetChatId, 10);
      
      if (messages.length === 0) {
        await bot.sendMessage(operatorId, `No conversation history found for chat ${targetChatId}.`);
        return;
      }
      
      // Format messages
      let response = `Recent conversation for chat ${targetChatId}:\n\n`;
      
      // Display messages in chronological order (oldest first)
      const sortedMessages = [...messages].reverse();
      
      sortedMessages.forEach(msg => {
        const role = msg.role === 'user' ? '👤 User' : 
                    msg.role === 'assistant' ? '🤖 Bot' : '👨‍💼 Operator';
        
        const timestamp = new Date(msg.created_at).toLocaleString();
        response += `${role} (${timestamp}):\n${msg.content}\n\n`;
      });
      
      await bot.sendMessage(operatorId, response);
    } catch (error) {
      logger.error("Error handling history command:", error, { operatorId, targetChatId });
      await bot.sendMessage(operatorId, "An error occurred while processing the command.");
    }
  });
};
