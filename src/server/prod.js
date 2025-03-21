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
    
    // Initialize OpenAI
    const isValidKey = await openaiService.validateApiKey();
    if (!isValidKey) {
      throw new Error("Invalid OpenAI API key");
    }
    
    await openaiService.createOrGetAssistant();
    logger.info("Assistant ready:", openaiService.assistantId);
    
    // Initialize bot
    await botService.init({ mode: 'production' });
    initialized = true;
    
    logger.info("Bot initialization complete");
  } catch (error) {
    logger.error('Failed to initialize:', error);
    throw error;
  }
}

// Vercel serverless handler
export default async function handler(req, res) {
  try {
    logger.info('Request received:', { 
      method: req.method, 
      url: req.url
    });

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      await initializeBot();
      return res.status(200).json({ 
        status: 'ok',
        initialized,
        assistantId: openaiService.assistantId
      });
    }

    // Webhook handler
    if (req.method === 'POST' && req.url === '/webhook') {
      await initializeBot();
      
      const update = req.body;
      if (!update) {
        logger.error('Empty webhook body');
        return res.status(400).json({ error: 'Empty webhook body' });
      }

      logger.info('Processing update:', { 
        updateId: update.update_id,
        type: update.message ? 'message' : update.callback_query ? 'callback' : 'other',
        chatId: update.message?.chat?.id || update.callback_query?.message?.chat?.id
      });

      const bot = botService.getBot();
      await bot.handleUpdate(update);
      
      return res.status(200).end();
    }

    // Not found
    logger.warn('Route not found:', req.url);
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    logger.error('Request failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 