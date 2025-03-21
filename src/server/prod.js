/**
 * Production server module
 */

import { config } from '../config/config.js';
import { Server } from './Server.js';
import { BotService } from '../services/botService.js';
import { UserSessionService } from '../services/UserSessionService.js';
import { WebhookController } from '../controllers/WebhookController.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';
import { RedisStorage } from '../storage/RedisStorage.js';

class ProductionServer {
  constructor() {
    this.server = null;
    this.botService = null;
    this.webhookController = null;
    this.storage = null;
    this.isShuttingDown = false;
  }

  async init() {
    try {
      // Initialize services
      await this.initializeServices();
      
      // Setup routes
      this.setupRoutes();
      
      // Start server
      await this.server.start();

      // Setup shutdown handlers
      this.setupShutdownHandlers();

      logger.info('Production server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize production server:', error);
      await this.shutdown();
      throw error;
    }
  }

  setupShutdownHandlers() {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  async initializeServices() {
    try {
      // Validate configuration
      config.validate();
      
      // Initialize storage
      this.storage = new RedisStorage(config.redis);
      
      // Initialize services
      const userSessionService = new UserSessionService(this.storage);
      this.botService = new BotService(userSessionService);
      
      // Initialize OpenAI
      const isValidKey = await openaiService.validateApiKey();
      if (!isValidKey) {
        throw new Error("Invalid OpenAI API key");
      }
      await openaiService.createOrGetAssistant();
      
      // Initialize bot with webhook
      await this.botService.init({ 
        mode: 'production',
        webhookUrl: config.telegram.webhookUrl
      });
      
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
    // Health check route
    this.server.registerRoute('get', '/health', (req, res) => {
      res.json({ 
        status: this.isShuttingDown ? 'shutting_down' : 'ok',
        ...this.server.getStatus(),
        redis: this.storage ? 'connected' : 'disconnected',
        bot: this.botService?.getBot() ? 'initialized' : 'not_initialized'
      });
    });

    // Webhook route
    this.server.registerRoute('post', '/webhook', async (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Service is shutting down' });
      }
      await this.webhookController.handleUpdate(req, res);
    });
  }

  async shutdown() {
    if (this.isShuttingDown) {
      logger.info('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
      // Stop accepting new requests
      if (this.server) {
        await this.server.shutdown();
      }

      // Cleanup bot resources
      if (this.botService?.getBot()) {
        await this.botService.getBot().deleteWebHook();
      }

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