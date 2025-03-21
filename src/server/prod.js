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
  try {
    logger.info('Received request:', { 
      method: req.method, 
      url: req.url,
      body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 100) : undefined 
    });

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      await initializeBot();
      return res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        initialized,
        mode: 'production',
        assistantId: openaiService.assistantId
      });
    }

    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook') {
      await initializeBot();
      
      const update = req.body;
      if (!update) {
        logger.error('No update body received');
        return res.status(400).json({ error: 'No update body' });
      }

      logger.info('Processing webhook update:', { 
        update_id: update.update_id,
        message_id: update.message?.message_id,
        text: update.message?.text?.substring(0, 50),
        chat_id: update.message?.chat?.id
      });

      const bot = botService.getBot();
      if (!bot) {
        throw new Error('Bot not initialized');
      }

      // Process the update
      await bot.handleUpdate(update);
      
      // Always return 200 to Telegram
      return res.status(200).end();
    }

    // Handle all other routes
    logger.info('Route not found:', req.url);
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    logger.error('Request handler error:', error);
    // Don't expose internal errors
    return res.status(500).json({ error: 'Internal server error' });
  }
} 