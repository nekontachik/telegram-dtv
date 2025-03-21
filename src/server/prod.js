/**
 * Production server module
 * Handles bot initialization in webhook mode
 */

import { config } from '../config/config.js';
import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

let initialized = false;

// Initialize bot and services
async function initializeBot() {
  if (initialized) return;

  try {
    logger.info("Initializing bot in production mode...");
    
    // Validate configuration
    config.validate();
    
    // Validate OpenAI API key
    const isValidKey = await openaiService.validateApiKey();
    if (!isValidKey) {
      throw new Error("Invalid OpenAI API key");
    }
    
    // Create or retrieve the assistant
    await openaiService.createOrGetAssistant();
    logger.info("Assistant initialized with ID: " + openaiService.assistantId);
    
    // Initialize Telegram bot in webhook mode
    await botService.init({ mode: 'production' });
    initialized = true;
    
    logger.info("Production bot initialization complete");
  } catch (error) {
    logger.error('Error initializing production bot', error);
    throw error;
  }
}

// Vercel serverless handler
export default async function handler(req, res) {
  logger.info('Received request:', { 
    method: req.method, 
    path: req.path || req.url,
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
        mode: 'production',
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
  logger.info('Route not found:', req.path || req.url);
  return res.status(404).json({ error: 'Not found' });
} 