/**
 * Legacy entry point
 * 
 * This file is kept for backward compatibility.
 * The application has been refactored to a modular architecture.
 * 
 * Please use the new entry point:
 * 
 * npm start
 * 
 * or
 * 
 * node src/app.js
 */

console.log('\n=============================================');
console.log('NOTICE: The application has been refactored to a modular architecture.');
console.log('Please use the new entry point:');
console.log('\nnpm start\n');
console.log('or\n');
console.log('node src/app.js\n');
console.log('The new architecture follows SOLID, KISS, and DRY principles');
console.log('with improved modularity and maintainability.');
console.log('=============================================\n');

// Import the new app and run it
import './src/app.js';

// Load environment variables from .env file using dotenv
import dotenv from 'dotenv';
dotenv.config();

// Import the Telegram Bot API library using ESM
import TelegramBot from 'node-telegram-bot-api';

// Import OpenAI package (new structure)
import OpenAI from 'openai';

// Retrieve values from the environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID; // Assistant ID (optional)
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || 'gpt-4o'; // Default to GPT-4o if not specified

// Check if all required environment variables are provided
if (!TELEGRAM_TOKEN || !OPENAI_API_KEY) {
  console.error("Error: Missing required environment variables!");
  process.exit(1);
}

// Check if the Telegram token format is valid (should start with a number, not a letter)
if (TELEGRAM_TOKEN.startsWith('y')) {
  console.error("Error: Invalid Telegram token format. The token should start with a number, not 'y'.");
  console.error("Please check your .env file and make sure the token is correct.");
  console.error("Current token: " + TELEGRAM_TOKEN);
  console.error("Correct format example: 1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  process.exit(1);
}

// Initialize the Telegram bot with polling enabled
let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  
  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
    if (error.message.includes('404 Not Found')) {
      console.error('This usually means your Telegram token is invalid.');
      console.error('Please check your .env file and update the TELEGRAM_TOKEN value.');
    }
  });
} catch (error) {
  console.error('Failed to initialize Telegram bot:', error.message);
  process.exit(1);
}

// Initialize the OpenAI client with the new API structure
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Helper function to keep the typing indicator active during long operations
async function keepTypingIndicator(chatId, abortSignal) {
  try {
    // Send typing indicator every 4 seconds until aborted
    // Telegram typing indicators typically last around 5 seconds
    const intervalId = setInterval(() => {
      if (abortSignal.aborted) {
        clearInterval(intervalId);
        return;
      }
      
      bot.sendChatAction(chatId, 'typing').catch(error => {
        console.error("Error sending typing indicator:", error);
        clearInterval(intervalId);
      });
    }, 4000);
    
    // Return a cleanup function
    return () => clearInterval(intervalId);
  } catch (error) {
    console.error("Error in typing indicator:", error);
  }
}

// Store the assistant ID
let assistantId = ASSISTANT_ID;

// Validate the OpenAI API key by making a simple API call
async function validateOpenAIKey() {
  try {
    // Try to list models as a simple API test
    await openai.models.list({ limit: 1 });
    console.log("OpenAI API key is valid.");
    return true;
  } catch (error) {
    console.error("Error validating OpenAI API key:", error.message);
    console.error("Please check your .env file and update the OPENAI_API_KEY value.");
    console.error("Make sure you're using a valid API key from https://platform.openai.com/api-keys");
    return false;
  }
}

// Create an assistant if one doesn't exist
async function createAssistant() {
  if (assistantId) {
    try {
      // Try to retrieve the existing assistant
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      console.log("Using existing assistant:", assistant.id);
      return assistant.id;
    } catch (error) {
      console.error("Error retrieving assistant:", error.message);
      console.log("Will create a new assistant instead.");
      assistantId = null;
    }
  }

  try {
    // Create a new assistant
    const assistant = await openai.beta.assistants.create({
      name: "Telegram Bot Assistant",
      instructions: "You are a helpful assistant that responds to user queries via Telegram.",
      model: ASSISTANT_MODEL,
    });
    
    console.log("Created new assistant:", assistant.id);
    return assistant.id;
  } catch (error) {
    console.error("Error creating assistant:", error);
    throw error;
  }
}

// Object to store session (thread) IDs for each chat
const userThreads = {};

// Initialize the assistant when the bot starts
(async () => {
  try {
    // Validate the API key
    const isValidKey = await validateOpenAIKey();
    if (!isValidKey) {
      console.error("Invalid OpenAI API key. Exiting...");
      process.exit(1);
    }
    
    // Create or retrieve the assistant
    assistantId = await createAssistant();
    console.log("Bot initialized with assistant ID:", assistantId);
  } catch (error) {
    console.error("Error initializing bot:", error);
    process.exit(1);
  }
})();

// Handle the /start command to initialize a session
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!assistantId) {
    bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
    return;
  }
  
  try {
    // Create a new thread (session) via the OpenAI API
    const thread = await openai.beta.threads.create();
    console.log("Created thread:", thread);
    
    // Save the thread ID as a string for the current chat
    userThreads[chatId] = { id: thread.id, humanHandoff: false };
    console.log(`Stored thread ID for chat ${chatId}:`, userThreads[chatId].id);
    
    // Send a welcome message to initiate the conversation
    bot.sendMessage(chatId, "Hello! I'm your AI assistant. How can I help you today?");
  } catch (error) {
    console.error("Error creating thread:", error);
    bot.sendMessage(chatId, "Failed to create session. Please try again later.");
  }
});

// Handle all incoming messages (except /start)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;
  
  // Ignore /start command as it's handled separately
  if (userText === '/start') {
    return;
  }

  // If the session is not initialized, prompt the user to send /start
  if (!userThreads[chatId]) {
    bot.sendMessage(chatId, "Please send /start to begin a session.");
    return;
  }

  // Check if the message contains text
  if (!userText) {
    bot.sendMessage(chatId, "Sorry, I can only process text messages for now.");
    return;
  }

  if (!assistantId) {
    bot.sendMessage(chatId, "Bot is still initializing. Please try again in a moment.");
    return;
  }

  // Check if this chat is in human handoff mode
  if (userThreads[chatId].humanHandoff) {
    // In a real implementation, this would forward the message to a human operator
    bot.sendMessage(chatId, "Your message has been forwarded to a human operator. They will respond shortly.");
    return;
  }

  // Retrieve the thread ID for the current chat
  const threadId = userThreads[chatId].id;
  console.log(`Retrieved thread ID for chat ${chatId}:`, threadId);
  
  try {
    // Show typing indicator to the user
    bot.sendChatAction(chatId, 'typing');
    
    // Add the user's message to the thread
    console.log(`Adding message to thread ${threadId}:`, userText);
    
    await openai.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content: userText
      }
    );

    // Show typing indicator again before waiting for response (which might take time)
    bot.sendChatAction(chatId, 'typing');

    // Start a run with the assistant
    console.log(`Starting run with assistant ${assistantId} on thread ${threadId}`);
    
    // Create an abort controller for the typing indicator
    const abortController = new AbortController();
    
    // Start continuous typing indicator
    const stopTyping = await keepTypingIndicator(chatId, abortController.signal);
    
    try {
      // Create and poll for the run to complete
      const run = await openai.beta.threads.runs.createAndPoll(
        threadId, 
        { assistant_id: assistantId }
      );
      
      // Stop typing indicator
      abortController.abort();
      if (stopTyping) stopTyping();
      
      console.log("Run completed:", run.status);
      
      // Get the latest messages from the thread
      const messages = await openai.beta.threads.messages.list(
        threadId,
        { order: "desc", limit: 1 }
      );
      
      // Extract the assistant's response
      if (messages.data.length > 0) {
        const assistantMessage = messages.data[0];
        if (assistantMessage.role === "assistant") {
          let assistantResponse = "";
          
          // Extract text content from the message
          for (const content of assistantMessage.content) {
            if (content.type === "text") {
              assistantResponse += content.text.value;
            }
          }
          
          // Send the response to the user
          bot.sendMessage(chatId, assistantResponse);
        }
      }
    } catch (error) {
      // Stop typing indicator in case of error
      abortController.abort();
      if (stopTyping) stopTyping();
      
      console.error("Error processing message:", error);
      bot.sendMessage(chatId, "Unable to process your message. Please try again.");
    }
  } catch (error) {
    console.error("Error processing message:", error);
    bot.sendMessage(chatId, "Unable to process your message. Please try again.");
  }
});

// Log that the bot is running
console.log("Bot is running and waiting for messages...");

// Human handoff commands for operators

// Command to enable human handoff mode for a specific chat
bot.onText(/\/handoff (.+)/, async (msg, match) => {
  const operatorId = msg.chat.id;
  const targetChatId = match[1];
  
  // Simple authorization: In a real app, you would have a list of authorized operators
  // This is just a simple example - add proper authorization in production
  
  if (userThreads[targetChatId]) {
    userThreads[targetChatId].humanHandoff = true;
    bot.sendMessage(operatorId, `Human handoff enabled for chat ${targetChatId}`);
    bot.sendMessage(targetChatId, "You are now connected to a human operator.");
  } else {
    bot.sendMessage(operatorId, `Chat ${targetChatId} does not exist.`);
  }
});

// Command to disable human handoff mode for a specific chat
bot.onText(/\/ai (.+)/, async (msg, match) => {
  const operatorId = msg.chat.id;
  const targetChatId = match[1];
  
  // Simple authorization check (should be improved in production)
  
  if (userThreads[targetChatId]) {
    userThreads[targetChatId].humanHandoff = false;
    bot.sendMessage(operatorId, `AI mode reactivated for chat ${targetChatId}`);
    bot.sendMessage(targetChatId, "You are now connected to the AI assistant again.");
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
  
  if (userThreads[targetChatId] && userThreads[targetChatId].humanHandoff) {
    // Send operator's message to the user
    bot.sendMessage(targetChatId, responseText);
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
  
  const userList = Object.keys(userThreads);
  
  if (userList.length === 0) {
    bot.sendMessage(operatorId, "No active users.");
    return;
  }
  
  let response = "Active users:\n";
  userList.forEach(chatId => {
    const handoffStatus = userThreads[chatId].humanHandoff ? "🔴 Human handoff" : "🟢 AI mode";
    response += `- ${chatId} (${handoffStatus})\n`;
  });
  
  response += "\nTo enable human handoff: /handoff [chatId]\n";
  response += "To return to AI mode: /ai [chatId]\n";
  response += "To answer a user: /answer [chatId] [message]";
  
  bot.sendMessage(operatorId, response);
});
