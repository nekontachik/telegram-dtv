/**
 * Утиліта для управління єдиним екземпляром бота
 */

import crypto from 'crypto';
import os from 'os';
import { dbService } from '../services/dbService.js';
import { logger } from './logger.js';

/**
 * Управляє єдиним екземпляром бота
 */
class InstanceManager {
  constructor() {
    this.instanceId = crypto.randomUUID();
    this.hostname = os.hostname();
    this.heartbeatInterval = null;
    this.isRegistered = false;
    this.staleInstanceTimeout = 30000; // 30 seconds
    
    // Обробник для коректного завершення при виході
    process.on('SIGINT', this.cleanupOnExit.bind(this));
    process.on('SIGTERM', this.cleanupOnExit.bind(this));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in instance manager', error, { persistent: true });
      this.cleanupOnExit().catch(err => {
        logger.error('Failed to cleanup on uncaught exception', err);
      }).finally(() => {
        process.exit(1);
      });
    });
  }
  
  /**
   * Реєструє екземпляр бота
   * @returns {Promise<boolean>} - true, якщо екземпляр успішно зареєстровано
   */
  async registerInstance() {
    try {
      if (!dbService.isInitialized()) {
        logger.warn('Database not initialized, cannot register bot instance');
        return true; // allow running without database
      }
      
      // First, delete ALL existing instances for this hostname
      const { error: deleteHostError } = await dbService.supabase
        .from('bot_instances')
        .delete()
        .eq('hostname', this.hostname);
      
      if (deleteHostError) {
        logger.warn(`Error cleaning up instances for hostname: ${deleteHostError.message}`);
      }

      // Delete any stale instances
      const staleTime = new Date(Date.now() - this.staleInstanceTimeout).toISOString();
      const { error: staleError } = await dbService.supabase
        .from('bot_instances')
        .delete()
        .lt('last_heartbeat', staleTime);
      
      if (staleError) {
        logger.warn(`Error cleaning up stale instances: ${staleError.message}`);
      }

      // Register new instance
      const { error: insertError } = await dbService.supabase
        .from('bot_instances')
        .insert({
          instance_id: this.instanceId,
          hostname: this.hostname,
          last_heartbeat: new Date().toISOString(),
          started_at: new Date().toISOString()
        });
      
      if (insertError) {
        throw insertError;
      }
      
      // Start heartbeat and mark as registered
      this.startHeartbeat();
      this.isRegistered = true;
      
      logger.info(`Bot instance registered with ID: ${this.instanceId}`, { persistent: true });
      return true;
    } catch (error) {
      logger.error('Failed to register bot instance', error, { persistent: true });
      return false;
    }
  }
  
  /**
   * Запускає періодичне оновлення heartbeat
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        await dbService.supabase
          .from('bot_instances')
          .update({ last_heartbeat: new Date().toISOString() })
          .eq('instance_id', this.instanceId);
      } catch (error) {
        logger.error('Failed to update heartbeat', error);
      }
    }, 10000); // 10 секунд
  }
  
  /**
   * Видаляє екземпляр з бази даних при завершенні
   */
  async cleanupOnExit() {
    logger.info('Bot shutting down, cleaning up...', { persistent: true });
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (dbService.isInitialized() && this.isRegistered) {
      try {
        await dbService.supabase
          .from('bot_instances')
          .delete()
          .eq('instance_id', this.instanceId);
        logger.info('Bot instance unregistered', { persistent: true });
      } catch (error) {
        logger.error('Failed to unregister bot instance', error);
      }
    }
  }
}

export const instanceManager = new InstanceManager(); 