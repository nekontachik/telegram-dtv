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

// Circuit breaker for external services
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
  }

  async execute(operation) {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  isOpen() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF-OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Rate limiter for webhook endpoint
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.maxRequests = options.maxRequests || 100;
    this.requests = new Map();
  }

  isRateLimited(ip) {
    const now = Date.now();
    const userRequests = this.requests.get(ip) || [];
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (recentRequests.length >= this.maxRequests) {
      return true;
    }

    recentRequests.push(now);
    this.requests.set(ip, recentRequests);
    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, times] of this.requests.entries()) {
      const recentRequests = times.filter(time => now - time < this.windowMs);
      if (recentRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, recentRequests);
      }
    }
  }
}

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
    
    // Initialize circuit breakers
    this.openaiCircuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000
    });
    
    this.redisCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 15000
    });
    
    this.dbCircuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 20000
    });
    
    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 100
    });
    
    // Start rate limiter cleanup
    setInterval(() => this.rateLimiter.cleanup(), 60000);
    
    // Service health checks
    this.startHealthChecks();
  }

  startHealthChecks() {
    const interval = 30000; // 30 seconds
    
    setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        // Check Redis connection
        if (this.storage?.ping) {
          await this.redisCircuitBreaker.execute(() => this.storage.ping());
        }
        
        // Check database connection
        if (config.supabase.enabled && dbService.isInitialized()) {
          await this.dbCircuitBreaker.execute(() => dbService.ping());
        }
        
        // Check OpenAI connection
        await this.openaiCircuitBreaker.execute(() => openaiService.validateApiKey());
        
        // Check bot webhook
        if (this.botService?.getBot()) {
          const webhookInfo = await this.botService.getBot().getWebHookInfo();
          if (!webhookInfo.url || webhookInfo.url !== config.telegram.webhookUrl) {
            logger.warn('Webhook URL mismatch, attempting to reset');
            await this.botService.setupWebhook(config.telegram.webhookUrl);
          }
        }
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, interval);
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
      
      // Initialize storage with circuit breaker
      this.storage = config.redis 
        ? new RedisStorage(config.redis)
        : new MemoryStorage();
      
      if (config.redis) {
        await this.redisCircuitBreaker.execute(() => this.storage.ping());
      }
      
      // Initialize database with circuit breaker
      if (config.supabase.enabled) {
        await this.dbCircuitBreaker.execute(async () => {
          await dbService.init(config.supabase.url, config.supabase.key);
          if (!dbService.isInitialized()) {
            throw new Error('Failed to initialize database');
          }
          await dbService.ping();
        });
      }
      
      // Initialize OpenAI with circuit breaker
      await this.openaiCircuitBreaker.execute(async () => {
        const isValidKey = await openaiService.validateApiKey();
        if (!isValidKey) {
          throw new Error("Invalid OpenAI API key");
        }
        await openaiService.createOrGetAssistant();
      });

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
    // Health check route with circuit breaker states
    this.server.registerRoute('get', '/health', (req, res) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      res.json({ 
        status: this.isShuttingDown ? 'shutting_down' : 'ok',
        uptime,
        ...this.server.getStatus(),
        circuitBreakers: {
          openai: this.openaiCircuitBreaker.state,
          redis: this.redisCircuitBreaker.state,
          database: this.dbCircuitBreaker.state
        },
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

    // Webhook route with rate limiting and circuit breakers
    this.server.registerRoute('post', '/webhook', async (req, res) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Service is shutting down' });
      }

      // Rate limiting
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      if (this.rateLimiter.isRateLimited(clientIp)) {
        logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Webhook secret validation
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (config.telegram.webhookSecret && secret !== config.telegram.webhookSecret) {
        logger.warn('Invalid webhook secret received');
        return res.status(403).json({ error: 'Invalid secret token' });
      }

      try {
        // Handle update with circuit breakers
        await this.openaiCircuitBreaker.execute(async () => {
          await this.webhookController.handleUpdate(req, res);
        });
      } catch (error) {
        if (error.message === 'Circuit breaker is OPEN') {
          logger.error('OpenAI circuit breaker is open, service degraded');
          res.status(503).json({ error: 'Service temporarily unavailable' });
        } else {
          logger.error('Webhook handler error:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
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

// Start server with error recovery
const server = new ProductionServer();
server.init().catch(async error => {
  logger.error('Server startup failed:', error);
  
  // Try to cleanup any partially initialized services
  try {
    await server.shutdown();
  } catch (shutdownError) {
    logger.error('Cleanup after failed startup failed:', shutdownError);
  }
  
  process.exit(1);
}); 