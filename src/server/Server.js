/**
 * Server class responsible for HTTP server management
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export class Server {
  constructor(port) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.isInitialized = false;
    
    // Setup middleware
    this.app.use(express.json());
    
    // Setup error handling
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown();
    });
  }

  registerRoute(method, path, handler) {
    this.app[method](path, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        logger.error(`Error handling ${method.toUpperCase()} ${path}:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`Server is running on port ${this.port}`);
          this.isInitialized = true;
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  async shutdown() {
    logger.info('Shutting down server gracefully...');
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });

        // Force shutdown after 10s
        setTimeout(() => {
          logger.error('Could not close connections in time, forcing shutdown');
          resolve();
        }, 10000);
      });
    }
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      uptime: process.uptime()
    };
  }
} 