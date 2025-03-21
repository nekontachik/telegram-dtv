/**
 * Command handler module
 * Handles Telegram bot commands
 */

import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';

/**
 * Register command handlers on bot
 * @param {TelegramBot} bot - The Telegram bot instance
 */
export const registerCommandHandlers = (bot) => {
  // Handle the /start command to initialize a session
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!openaiService.assistantId) {
      bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
      return;
    }
    
    try {
      // Create a new thread (session) via the OpenAI API
      const threadId = await openaiService.createThread();
      console.log("Created thread:", threadId);
      
      // Save the thread ID for the current chat
      await botService.storeUserThread(chatId, threadId);
      
      // Send a welcome message to initiate the conversation
      await botService.sendMessage(chatId, "Hello! I'm your AI assistant. How can I help you today?");
    } catch (error) {
      console.error("Error creating thread:", error);
      bot.sendMessage(chatId, "Failed to create session. Please try again later.");
    }
  });

  // Command to enable human handoff mode for a specific chat
  bot.onText(/\/handoff (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    // Simple authorization: In a real app, you would have a list of authorized operators
    // This is just a simple example - add proper authorization in production
    
    const hasThread = await botService.hasActiveThread(targetChatId);
    if (hasThread) {
      const success = await botService.setHumanHandoff(targetChatId, true);
      
      if (success) {
        bot.sendMessage(operatorId, `Human handoff enabled for chat ${targetChatId}`);
        bot.sendMessage(targetChatId, "You are now connected to a human operator.");
      } else {
        bot.sendMessage(operatorId, `Failed to enable human handoff for chat ${targetChatId}`);
      }
    } else {
      bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
    }
  });

  // Command to disable human handoff mode for a specific chat
  bot.onText(/\/ai (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    // Simple authorization check (should be improved in production)
    
    const hasThread = await botService.hasActiveThread(targetChatId);
    if (hasThread) {
      const success = await botService.setHumanHandoff(targetChatId, false);
      
      if (success) {
        bot.sendMessage(operatorId, `AI mode reactivated for chat ${targetChatId}`);
        bot.sendMessage(targetChatId, "You are now connected to the AI assistant again.");
      } else {
        bot.sendMessage(operatorId, `Failed to reactivate AI mode for chat ${targetChatId}`);
      }
    } else {
      bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
    }
  });

  // Command for operators to answer to users
  bot.onText(/\/answer (.+?) (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    const responseText = match[2];
    
    // Simple authorization check (should be improved in production)
    
    const hasThread = await botService.hasActiveThread(targetChatId);
    const isInHandoff = await botService.isInHumanHandoff(targetChatId);
    
    if (hasThread && isInHandoff) {
      // Send operator's message to the user with role 'system'
      await botService.sendMessage(targetChatId, responseText, 'system');
      bot.sendMessage(operatorId, `Message sent to ${targetChatId}`);
    } else {
      bot.sendMessage(operatorId, 
        `Cannot send message. Either chat ${targetChatId} doesn't exist or it's not in human handoff mode.`);
    }
  });

  // Command to list all active users
  bot.onText(/\/users/, async (msg) => {
    const operatorId = msg.chat.id;
    
    // Simple authorization check (should be improved in production)
    
    const userList = await botService.getActiveUsers();
    
    if (userList.length === 0) {
      bot.sendMessage(operatorId, "No active users.");
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
    
    bot.sendMessage(operatorId, response);
  });

  // Command to view recent conversation history
  bot.onText(/\/history (.+)/, async (msg, match) => {
    const operatorId = msg.chat.id;
    const targetChatId = match[1];
    
    // Simple authorization check (should be improved in production)
    
    const hasThread = await botService.hasActiveThread(targetChatId);
    if (!hasThread) {
      bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
      return;
    }
    
    // Get recent messages
    const messages = await botService.getConversationHistory(targetChatId, 10);
    
    if (messages.length === 0) {
      bot.sendMessage(operatorId, `No conversation history found for chat ${targetChatId}.`);
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
    
    bot.sendMessage(operatorId, response);
  });
};
