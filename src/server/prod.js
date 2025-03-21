/**
 * Production server module
 * Handles bot initialization in webhook mode
 */

import express from 'express';
import { config } from '../config/config.js';
import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    await botService.getBot().handleUpdate(update);
    res.sendStatus(200);
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.sendStatus(200); // Always return 200 to Telegram
  }
});

// Initialize bot and services
async function initializeServices() {
  try {
    logger.info("Initializing services...");
    
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
    
    logger.info("Services initialized successfully");
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// Start the server
const PORT = process.env.PORT || 3000;

initializeServices()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }); 