/**
 * Main application file
 * Integrates all modules and starts the bot
 */

import { config } from './config/config.js';
import { botService } from './services/botService.js';
import { openaiService } from './services/openaiService.js';
import { logger } from './utils/logger.js';
import express from 'express';

// Create Express app for webhook handling
const app = express();
app.use(express.json());

// Initialize and export for Vercel
let initialized = false;

// Initialize bot and services
async function initializeBot() {
  if (initialized) return;

  try {
    logger.info("Initializing bot...");
    
    // Validate configuration
    config.validate();
    
    // Validate OpenAI API key
    const isValidKey = await openaiService.validateApiKey();
    if (!isValidKey) {
      throw new Error("Invalid OpenAI API key");
    }
    
    // Create or retrieve the assistant
    await openaiService.createOrGetAssistant();
    logger.info("Bot initialized with assistant ID: " + openaiService.assistantId);
    
    // Initialize Telegram bot
    await botService.init();
    initialized = true;
    
    logger.info("Bot initialization complete");
  } catch (error) {
    logger.error('Error initializing bot', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await initializeBot();
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      initialized,
      assistantId: openaiService.assistantId
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message
    });
  }
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    await initializeBot();
    
    const update = req.body;
    logger.info('Received webhook update', { 
      update_id: update.update_id,
      message_id: update.message?.message_id,
      text: update.message?.text
    });

    const bot = botService.getBot();
    if (!bot) {
      throw new Error('Bot not initialized');
    }

    await bot.handleUpdate(update);
    res.sendStatus(200);
  } catch (error) {
    logger.error('Error handling webhook update', error);
    // Return 200 to prevent Telegram from retrying
    res.sendStatus(200);
  }
});

// Handle all other routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Export for Vercel
export default app;
