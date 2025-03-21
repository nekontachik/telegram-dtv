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
    this.telegram = {
      token: process.env.TELEGRAM_TOKEN,
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
    
    this.supabase = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_KEY
    };
  }
  
  /**
   * Validate required configuration
   * @throws {Error} If required configuration is missing
   */
  validate() {
    if (!this.telegram.token) {
      throw new Error('TELEGRAM_TOKEN is required');
    }
    
    if (!this.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    if (!this.openai.assistantId) {
      throw new Error('ASSISTANT_ID is required');
    }
    
    // Log warnings for optional configs
    if (!this.telegram.operatorUsername) {
      logger.warn('TELEGRAM_OPERATOR_USERNAME not set, using default: capyoperator');
    }
    
    if (!this.telegram.operatorChatLink) {
      logger.warn('TELEGRAM_OPERATOR_CHAT_LINK not set, using default t.me link');
    }
    
    // Validate Supabase configuration if both URL and key are provided
    if (this.supabase.url && this.supabase.key) {
      logger.info('Supabase configuration found');
    } else if (!this.supabase.url && !this.supabase.key) {
      logger.warn('Supabase configuration not found, running without database');
    } else {
      throw new Error('Both SUPABASE_URL and SUPABASE_KEY are required for database integration');
    }

    logger.info('Configuration validated successfully', {
      hasToken: !!this.telegram.token,
      hasOpenAIKey: !!this.openai.apiKey,
      hasAssistantId: !!this.openai.assistantId,
      model: this.openai.model
    });
  }
}

export const config = new Config();
