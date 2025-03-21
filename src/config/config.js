/**
 * Configuration module
 * Loads and validates environment variables
 */

import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

class Config {
  constructor() {
    this.server = {
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    };

    this.telegram = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      webhookUrl: this.getWebhookUrl(),
      operatorUsername: process.env.TELEGRAM_OPERATOR_USERNAME || 'capyoperator',
      operatorChatLink: process.env.TELEGRAM_OPERATOR_CHAT_LINK || `https://t.me/${process.env.TELEGRAM_OPERATOR_USERNAME || 'capyoperator'}`,
      operatorTransferMessage: process.env.TELEGRAM_OPERATOR_TRANSFER_MESSAGE || 
        'Отлично! Передаю вас специалисту, который поможет с оплатой и оформлением документов.'
    };
    
    this.openai = {
      apiKey: process.env.OPENAI_API_KEY,
      assistantId: process.env.ASSISTANT_ID,
      model: process.env.ASSISTANT_MODEL || 'gpt-4-turbo-preview'
    };
    
    // Make Redis optional
    this.redis = process.env.REDIS_URL ? {
      url: process.env.REDIS_URL,
      maxRetries: 10,
      retryDelay: 3000
    } : null;

    // Use in-memory storage if Redis is not configured
    this.useInMemoryStorage = !this.redis;

    // Supabase configuration
    this.supabase = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_KEY,
      enabled: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    };
  }

  /**
   * Get webhook URL based on environment
   */
  getWebhookUrl() {
    // For Render deployment
    if (process.env.RENDER_EXTERNAL_URL) {
      return `${process.env.RENDER_EXTERNAL_URL}/webhook`;
    }
    
    // For local development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // For custom domain
    if (process.env.WEBHOOK_URL) {
      return process.env.WEBHOOK_URL;
    }

    throw new Error('No webhook URL configured');
  }
  
  /**
   * Validate required configuration
   * @throws {Error} If required configuration is missing
   */
  validate() {
    if (!this.telegram.token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    
    if (!this.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    if (!this.openai.assistantId) {
      throw new Error('ASSISTANT_ID is required');
    }

    if (!this.redis) {
      logger.warn('REDIS_URL not set, using in-memory storage (not recommended for production)');
    }

    if (!this.supabase.enabled) {
      logger.warn('Supabase not configured, message logging will be disabled');
    }
    
    // Log warnings for optional configs
    if (!this.telegram.operatorUsername) {
      logger.warn('TELEGRAM_OPERATOR_USERNAME not set, using default: capyoperator');
    }
    
    if (!this.telegram.operatorChatLink) {
      logger.warn('TELEGRAM_OPERATOR_CHAT_LINK not set, using default t.me link');
    }

    logger.info('Configuration validated successfully', {
      hasToken: !!this.telegram.token,
      hasOpenAIKey: !!this.openai.apiKey,
      hasAssistantId: !!this.openai.assistantId,
      storage: this.redis ? 'redis' : 'memory',
      database: this.supabase.enabled ? 'supabase' : 'disabled',
      model: this.openai.model,
      webhookUrl: this.telegram.webhookUrl
    });
  }
}

export const config = new Config();
