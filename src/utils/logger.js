/**
 * Розширена система логування
 */

import { dbService } from '../services/dbService.js';

/**
 * Клас для розширеного логування
 */
class Logger {
  /**
   * Логує інформаційне повідомлення
   * @param {string} message - Повідомлення для логування
   * @param {object} meta - Додаткові метадані
   */
  info(message, meta = {}) {
    const logEntry = {
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(JSON.stringify(logEntry));
    
    // Optionally store in DB
    if (meta.persistent && dbService.isInitialized()) {
      dbService.supabase
        .from('logs')
        .insert({
          level: 'info',
          message,
          metadata: meta,
          created_at: new Date().toISOString()
        })
        .then()
        .catch(error => {
          console.error('Failed to store log in database:', error);
        });
    }
  }
  
  /**
   * Логує попередження
   * @param {string} message - Повідомлення для логування
   * @param {object} meta - Додаткові метадані
   */
  warn(message, meta = {}) {
    const logEntry = {
      level: 'warn',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(JSON.stringify(logEntry));
    
    // Optionally store in DB
    if (meta.persistent && dbService.isInitialized()) {
      dbService.supabase
        .from('logs')
        .insert({
          level: 'warn',
          message,
          metadata: meta,
          created_at: new Date().toISOString()
        })
        .then()
        .catch(error => {
          console.error('Failed to store warning in database:', error);
        });
    }
  }
  
  /**
   * Логує помилку
   * @param {string} message - Повідомлення про помилку
   * @param {Error} error - Об'єкт помилки
   * @param {object} meta - Додаткові метадані
   */
  error(message, error, meta = {}) {
    const logEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...meta
    };
    console.log(JSON.stringify(logEntry));
    
    // Always store errors in DB
    if (dbService.isInitialized()) {
      dbService.supabase
        .from('logs')
        .insert({
          level: 'error',
          message,
          error_message: error?.message || String(error),
          error_stack: error?.stack,
          metadata: meta,
          created_at: new Date().toISOString()
        })
        .then()
        .catch(err => {
          console.error('Failed to store error in database:', err);
        });
    }
  }

  async getLogs(level = null, limit = 100) {
    if (dbService.isInitialized()) {
      let query = dbService.supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (level) {
        query = query.eq('level', level);
      }
      
      const { data, error } = await query;
      if (error) {
        console.error('Failed to fetch logs:', error);
        return [];
      }
      
      return data;
    }
    return [];
  }
}

export const logger = new Logger(); 