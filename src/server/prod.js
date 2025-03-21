/**
 * Production server module
 */

import { config } from '../config/config.js';
import { Server } from './Server.js';
import { BotService } from '../services/botService.js';
import { UserSessionService } from '../services/UserSessionService.js';
import { WebhookController } from '../controllers/WebhookController.js';
import { openaiService } from '../services/openaiService.js';
import { dbService } from '../services/dbService.js';
import { logger } from '../utils/logger.js';
import { RedisStorage } from '../storage/RedisStorage.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';

class ProductionServer {
  constructor() {
    this.server = null;
    this.botService = null;
    this.webhookController = null;
    this.storage = null;
    this.userSessionService = null;
    this.isShuttingDown = false;
    this.startTime = Date.now();
    this.initTimeout = null;
  }

  async init() {
    // Set initialization timeout
    this.initTimeout = setTimeout(() => {
      logger.error('Server initialization timed out after 30 seconds');
      this.shutdown().then(() => process.exit(1));
    }, 30000);

    try {
      // Initialize services
      await this.initializeServices();
      
      // Setup routes
      this.setupRoutes();
      
      // Start server
      await this.server.start();

      // Setup shutdown handlers
      this.setupShutdownHandlers();

      // Clear initialization timeout
      clearTimeout(this.initTimeout);

      logger.info('Production server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize production server:', error);
      await this.shutdown();
      throw error;
    }
  }

  setupShutdownHandlers() {
    let isShuttingDown = false;

    const shutdownHandler = async (signal) => {
      if (isShuttingDown) {
        logger.warn(`Received ${signal} while shutting down, forcing exit`);
        process.exit(1);
      }
      isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await shutdownHandler('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await shutdownHandler('unhandledRejection');
    });
  }

  async initializeServices() {
    try {
      // Validate configuration
      config.validate();
      
      // Initialize storage with connection check
      this.storage = config.redis 
        ? new RedisStorage(config.redis)
        : new MemoryStorage();
      
      if (config.redis) {
        await this.storage.ping();
      }
      
      // Initialize database if configured
      if (config.supabase.enabled) {
        await dbService.init(config.supabase.url, config.supabase.key);
        if (!dbService.isInitialized()) {
          throw new Error('Failed to initialize database');
        }
        await dbService.ping();
      }
      
      // Initialize OpenAI with retries
      let openAiRetries = 3;
      while (openAiRetries > 0) {
        try {
          const isValidKey = await openaiService.validateApiKey();
          if (!isValidKey) {
            throw new Error("Invalid OpenAI API key");
          }
          await openaiService.createOrGetAssistant();
          break;
        } catch (error) {
          openAiRetries--;
          if (openAiRetries === 0) throw error;
          logger.warn(`OpenAI initialization failed, retrying... (${openAiRetries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Initialize user session service
      this.userSessionService = new UserSessionService(this.storage);
      await this.userSessionService.init();
      
      // Initialize bot service with user session service
      this.botService = new BotService(this.userSessionService);
      
      // Initialize bot with webhook and verify
      await this.botService.init({ 
        mode: 'production',
        webhookUrl: config.telegram.webhookUrl
      });

      // Verify bot webhook is set correctly
      const webhookInfo = await this.botService.getBot().getWebHookInfo();
      if (!webhookInfo.url || webhookInfo.url !== config.telegram.webhookUrl) {
        throw new Error('Webhook verification failed');
      }
      
      // Initialize controllers
      this.webhookController = new WebhookController(this.botService);
      
      // Initialize server
      this.server = new Server(config.server.port);

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Service initialization failed:', error);
      throw error;
    }
  }

  setupRoutes() {
    // Health check route with detailed status
    this.server.registerRoute('get', '/health', (req, res) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      res.json({ 
        status: this.isShuttingDown ? 'shutting_down' : 'ok',
        uptime,
        ...this.server.getStatus(),
        storage: {
          type: config.redis ? 'redis' : 'memory',
          status: this.storage?.isConnected() ? 'connected' : 'disconnected'
        },
        database: {
          enabled: config.supabase.enabled,
          status: config.supabase.enabled && dbService.isInitialized() ? 'connected' : 'disabled'
        },
        bot: {
          initialized: this.botService?.isInitialized || false,
          webhook: this.botService?.getBot() ? 'active' : 'not_set'
        },
        userSessions: {
          service: this.userSessionService ? 'initialized' : 'not_initialized',
          activeCount: this.userSessionService?.getActiveSessionsCount() || 0
        },
        openai: {
          status: openaiService.isInitialized() ? 'connected' : 'disconnected'
        }
      });
    });

    // Webhook route with validation
    this.server.registerRoute('post', '/webhook', async (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Service is shutting down' });
      }

      // Validate webhook secret if configured
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (config.telegram.webhookSecret && secret !== config.telegram.webhookSecret) {
        logger.warn('Invalid webhook secret received');
        return res.status(403).json({ error: 'Invalid secret token' });
      }

      try {
        await this.webhookController.handleUpdate(req, res);
      } catch (error) {
        logger.error('Webhook handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  async shutdown() {
    if (this.isShuttingDown) {
      logger.info('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timed out after 10 seconds, forcing exit');
      process.exit(1);
    }, 10000);

    try {
      // Stop accepting new requests
      if (this.server) {
        await this.server.shutdown();
      }

      // Cleanup bot resources
      if (this.botService?.getBot()) {
        await this.botService.getBot().deleteWebHook();
        await this.botService.getBot().close();
      }

      // Close Redis connection if using Redis
      if (this.storage?.quit) {
        await this.storage.quit();
      }

      // Close database connection if using Supabase
      if (config.supabase.enabled && dbService.isInitialized()) {
        await dbService.close();
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }
}

// Start server
const server = new ProductionServer();
server.init().catch(error => {
  logger.error('Server startup failed:', error);
  process.exit(1);
}); 