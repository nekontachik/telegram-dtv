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

// Vercel serverless handler
export default async function handler(req, res) {
  logger.info('Received request:', { 
    method: req.method, 
    path: req.path,
    body: req.method === 'POST' ? req.body : undefined 
  });

  // Health check endpoint
  if (req.method === 'GET' && (req.path === '/health' || req.url === '/health')) {
    try {
      await initializeBot();
      return res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        initialized,
        assistantId: openaiService.assistantId
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return res.status(500).json({ 
        status: 'error',
        error: error.message
      });
    }
  }

  // Webhook endpoint
  if (req.method === 'POST' && (req.path === '/webhook' || req.url === '/webhook')) {
    try {
      await initializeBot();
      
      const update = req.body;
      logger.info('Processing webhook update:', { 
        update_id: update.update_id,
        message_id: update.message?.message_id,
        text: update.message?.text,
        chat_id: update.message?.chat?.id
      });

      const bot = botService.getBot();
      if (!bot) {
        throw new Error('Bot not initialized');
      }

      await bot.handleUpdate(update);
      return res.sendStatus(200);
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      // Return 200 to prevent Telegram from retrying
      return res.sendStatus(200);
    }
  }

  // Handle all other routes
  logger.info('Route not found:', req.path);
  return res.status(404).json({ error: 'Not found' });
}
