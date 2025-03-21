/**
 * Development server module
 * Handles bot initialization in polling mode
 */

import express from 'express';
import { config } from '../config/config.js';
import { botService } from '../services/botService.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

// Create Express app
const app = express();
app.use(express.json());

// Initialize bot and services
async function initializeBot() {
  try {
    logger.info("Initializing bot in development mode...");
    
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
    
    // Initialize Telegram bot in polling mode
    await botService.init({ mode: 'development' });
    
    logger.info("Development bot initialization complete");
  } catch (error) {
    logger.error('Error initializing development bot', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      mode: 'development',
      assistantId: openaiService.assistantId
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message
    });
  }
});

// Start development server
export async function startDevServer(port = process.env.PORT || 3000) {
  try {
    // Initialize bot first
    await initializeBot();
    
    // Start server
    app.listen(port, () => {
      logger.info(`Development server running on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start development server:', error);
    process.exit(1);
  }
} 