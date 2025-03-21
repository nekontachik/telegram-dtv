/**
 * Database Service using Supabase
 * Handles all database operations
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

class DbService {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection with credentials
   */
  init(supabaseUrl, supabaseKey) {
    if (!this.initialized && supabaseUrl && supabaseKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.initialized = true;
        logger.info('Database service initialized');
      } catch (error) {
        logger.error('Failed to initialize database service', error);
        this.initialized = false;
      }
    }
    return this;
  }

  /**
   * Check if database service is initialized
   * @returns {boolean} - Whether database service is initialized
   */
  isInitialized() {
    return this.initialized;
  }
  
  /**
   * Store a user session
   * @param {number} chatId - The Telegram chat ID
   * @param {string} threadId - The OpenAI thread ID
   * @param {boolean} humanHandoff - Whether the user is in human handoff mode
   * @returns {Promise<Object>} - The created/updated session
   */
  async storeUserSession(chatId, threadId, humanHandoff = false) {
    if (!this.initialized) return null;
    
    try {
      const { error } = await this.supabase
        .from('sessions')
        .upsert({
          chat_id: chatId,
          thread_id: threadId,
          human_handoff: humanHandoff,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
    } catch (error) {
      logger.error('Error storing user session', error, { chatId, threadId });
      return null;
    }
  }
  
  /**
   * Get a user session
   * @param {number} chatId - The Telegram chat ID
   * @returns {Promise<Object>} - The user session
   */
  async getUserSession(chatId) {
    if (!this.initialized) return null;
    
    try {
      const { data, error } = await this.supabase
        .from('sessions')
        .select('*')
        .eq('chat_id', chatId)
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') { // Record not found
          return null;
        }
        throw error;
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting user session', error, { chatId });
      return null;
    }
  }
  
  /**
   * Update human handoff status
   * @param {number} chatId - The Telegram chat ID
   * @param {boolean} enabled - Whether to enable human handoff
   * @returns {Promise<boolean>} - Success status
   */
  async setHumanHandoff(chatId, enabled) {
    if (!this.initialized) return false;
    
    try {
      const { error } = await this.supabase
        .from('sessions')
        .update({
          human_handoff: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('chat_id', chatId);
        
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Error updating human handoff', error, { chatId, enabled });
      return false;
    }
  }
  
  /**
   * Get all active user sessions
   * @returns {Promise<Array>} - Array of user sessions
   */
  async getAllSessions() {
    if (!this.initialized) return [];
    
    try {
      const { data, error } = await this.supabase
        .from('sessions')
        .select('*')
        .order('updated_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting all sessions', error);
      return [];
    }
  }
  
  /**
   * Log a message
   * @param {number} chatId - The Telegram chat ID
   * @param {string} role - The message role (user/assistant/system)
   * @param {string} content - The message content
   * @returns {Promise<Object>} - The created message log
   */
  async logMessage(chatId, role, content) {
    if (!this.initialized) return null;
    
    try {
      const { error } = await this.supabase
        .from('message_logs')
        .insert({
          chat_id: chatId,
          role,
          content
        });
        
      if (error) throw error;
    } catch (error) {
      logger.error('Error logging message', error, { chatId, role });
      return null;
    }
  }
  
  /**
   * Get recent messages for a chat
   * @param {number} chatId - The Telegram chat ID
   * @param {number} limit - Maximum number of messages to retrieve
   * @returns {Promise<Array>} - Array of messages
   */
  async getRecentMessages(chatId, limit = 10) {
    if (!this.initialized) return [];
    
    try {
      const { data, error } = await this.supabase
        .from('message_logs')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (error) throw error;
      return data.reverse();
    } catch (error) {
      logger.error('Error getting recent messages', error, { chatId });
      return [];
    }
  }

  /**
   * Log operator transfer
   * @param {number} chatId - The chat ID
   */
  async logOperatorTransfer(chatId) {
    if (!this.initialized) return;
    
    try {
      const { error } = await this.supabase
        .from('sessions')
        .update({ 
          transferred_to_operator: true,
          operator_transfer_time: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('chat_id', chatId);
      
      if (error) throw error;
      
      // Log the transfer in message_logs
      await this.logMessage(chatId, 'system', 'User transferred to operator');
      
    } catch (error) {
      logger.error('Error logging operator transfer', error, { chatId });
    }
  }

  /**
   * Check if user was transferred to operator
   * @param {number} chatId - The chat ID
   * @returns {Promise<boolean>} - Whether user was transferred
   */
  async wasTransferredToOperator(chatId) {
    if (!this.initialized) return false;
    
    try {
      const { data, error } = await this.supabase
        .from('sessions')
        .select('transferred_to_operator')
        .eq('chat_id', chatId)
        .single();
      
      if (error) throw error;
      return data?.transferred_to_operator || false;
    } catch (error) {
      logger.error('Error checking operator transfer status', error, { chatId });
      return false;
    }
  }
}

// Create singleton instance
const dbService = new DbService();

// Export singleton
export { dbService }; 