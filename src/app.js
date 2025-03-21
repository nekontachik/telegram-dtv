/**
 * Main application file
 * Integrates all modules and starts the bot
 */

import { config } from './config/config.js';
import { botService } from './services/botService.js';
import { openaiService } from './services/openaiService.js';
import { dbService } from './services/dbService.js';
import { registerMessageHandler } from './handlers/messageHandler.js';
import { registerCommandHandlers } from './handlers/commandHandler.js';
import { logger } from './utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import process from 'process';
import express from 'express';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Create Express app for webhook handling
const app = express();
app.use(express.json());

// Глобальна обробка необроблених помилок
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error, { persistent: true });
  
  // Даємо час на запис логів перед виходом
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    persistent: true
  });
});

/**
 * Перевірка і закриття конфліктуючих процесів
 */
async function checkForRunningBots() {
  try {
    logger.info("Checking for conflicting bot processes...");
    
    // Отримуємо PID поточного процесу
    const currentPid = process.pid;
    
    // Шукаємо інші екземпляри app.js, крім поточного
    const { stdout } = await execAsync('ps aux | grep "node.*app.js" | grep -v grep');
    const processes = stdout.split('\n')
      .filter(line => line.trim() !== '')
      .filter(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1]);
        return pid !== currentPid; // Виключаємо поточний процес
      });
    
    if (processes.length > 0) {
      logger.warn(`Found ${processes.length} other bot processes running. Stopping them...`);
      
      for (const proc of processes) {
        try {
          const pid = proc.trim().split(/\s+/)[1];
          await execAsync(`kill ${pid}`);
          logger.info(`Stopped process with PID ${pid}`);
        } catch (err) {
          logger.warn(`Failed to stop process: ${err.message}`);
        }
      }
      
      // Чекаємо, щоб процеси завершились
      await new Promise(resolve => setTimeout(resolve, 2000));
      logger.info("All conflicting processes should be stopped now");
    } else {
      logger.info("No conflicting bot processes found");
    }
  } catch (error) {
    logger.warn(`Error checking for bot processes: ${error.message}`);
  }
}

/**
 * Initialize the application
 */
async function init() {
  try {
    logger.info("Starting Telegram bot with OpenAI and Supabase integration...", { persistent: true });
    
    // Validate configuration
    config.validate();
    
    // Initialize database service
    dbService.init(config.supabase.url, config.supabase.key);
    logger.info(`Database integration: ${dbService.isInitialized() ? 'Enabled' : 'Disabled'}`);
    if (!dbService.isInitialized()) {
      logger.warn("Database not initialized. Add SUPABASE_URL and SUPABASE_KEY to your .env file", { 
        persistent: true 
      });
      logger.warn("The bot will work without database, but sessions will not persist across restarts");
    }
    
    // Validate OpenAI API key
    const isValidKey = await openaiService.validateApiKey();
    if (!isValidKey) {
      logger.error("Invalid OpenAI API key. Exiting...", new Error("Invalid API key"), { 
        persistent: true 
      });
      process.exit(1);
    }
    
    // Create or retrieve the assistant
    await openaiService.createOrGetAssistant();
    logger.info("Bot initialized with assistant ID: " + openaiService.assistantId, { 
      persistent: true,
      assistantId: openaiService.assistantId
    });
    
    // Initialize Telegram bot
    const bot = await botService.init();
    
    // Register message and command handlers
    registerMessageHandler(bot);
    registerCommandHandlers(bot);

    // Set up webhook handling
    app.post('/webhook', async (req, res) => {
      try {
        logger.info('Received webhook update', { 
          update_id: req.body.update_id,
          message_id: req.body.message?.message_id 
        });
        
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (error) {
        logger.error('Error handling webhook update', error, {
          body: req.body,
          persistent: true
        });
        // Still return 200 to prevent Telegram from retrying
        res.sendStatus(200);
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        initialized: initialized,
        bot_info: {
          username: bot.botInfo?.username,
          webhook_set: true
        }
      });
    });

    // In development, check for conflicting processes
    await checkForRunningBots();
    
    logger.info("Bot is running and waiting for messages...", { persistent: true });
    
    return app;
  } catch (error) {
    logger.error("Error initializing bot", error, { persistent: true });
    throw error;
  }
}

// Initialize and export for Vercel
let initialized = false;
let cachedApp = null;

export default async function handler(req, res) {
  if (!initialized) {
    try {
      cachedApp = await init();
      initialized = true;
    } catch (error) {
      return res.status(500).json({ error: 'Failed to initialize bot' });
    }
  }
  return cachedApp(req, res);
}
