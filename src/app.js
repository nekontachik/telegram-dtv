/**
 * Main application file
 * Integrates all modules and starts the bot
 */

import { config } from './config/config.js';
import { botService } from './services/botService.js';
import { openaiService } from './services/openaiService.js';
import { dbService } from './services/dbService.js';
import { logger } from './utils/logger.js';
import express from 'express';

// Create Express app for webhook handling
const app = express();
app.use(express.json());

// Add CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error, { persistent: true });
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    persistent: true
  });
});

// Health check endpoint - no auth required
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    initialized: initialized
  });
});

// Initialize and export for Vercel
let initialized = false;
let cachedBot = null;

export default async function handler(req, res) {
  // Health check endpoint - no initialization required
  if (req.method === 'GET' && req.url === '/health') {
    return res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      initialized: initialized
    });
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  try {
    if (!initialized) {
      logger.info("Initializing bot in serverless environment...");
      
      // Validate configuration
      config.validate();
      
      // Initialize database service
      dbService.init(config.supabase.url, config.supabase.key);
      logger.info(`Database integration: ${dbService.isInitialized() ? 'Enabled' : 'Disabled'}`);
      
      // Validate OpenAI API key
      const isValidKey = await openaiService.validateApiKey();
      if (!isValidKey) {
        throw new Error("Invalid OpenAI API key");
      }
      
      // Create or retrieve the assistant
      await openaiService.createOrGetAssistant();
      logger.info("Bot initialized with assistant ID: " + openaiService.assistantId);
      
      // Initialize Telegram bot
      cachedBot = await botService.init();
      initialized = true;
      
      logger.info("Bot initialization complete");
    }

    if (req.method === 'POST' && req.url === '/webhook') {
      try {
        logger.info('Received webhook update', { 
          update_id: req.body.update_id,
          message_id: req.body.message?.message_id,
          text: req.body.message?.text
        });
        
        await cachedBot.handleUpdate(req.body);
        return res.status(200).end();
      } catch (error) {
        logger.error('Error handling webhook update', error, {
          body: req.body,
          persistent: true
        });
        // Still return 200 to prevent Telegram from retrying
        return res.status(200).end();
      }
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    logger.error('Error in serverless handler', error, { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
