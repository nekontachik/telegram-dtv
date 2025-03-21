/**
 * Controller for handling Telegram webhook updates
 */

import { logger } from '../utils/logger.js';

export class WebhookController {
  constructor(botService) {
    this.botService = botService;
  }

  /**
   * Handle incoming webhook updates
   */
  async handleUpdate(req, res) {
    try {
      const update = req.body;
      
      if (!this.isValidUpdate(update)) {
        logger.warn('Invalid webhook data received');
        return res.status(400).json({ error: 'Invalid update format' });
      }

      logger.info('Processing update:', this.formatUpdateLog(update));

      await this.botService.getBot().handleUpdate(update);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      // Always return 200 to Telegram to prevent retries
      res.sendStatus(200);
    }
  }

  /**
   * Validate webhook update format
   */
  isValidUpdate(update) {
    return update && 
           typeof update === 'object' && 
           typeof update.update_id === 'number';
  }

  /**
   * Format update object for logging
   */
  formatUpdateLog(update) {
    return {
      updateId: update.update_id,
      type: this.getUpdateType(update),
      chatId: this.getChatId(update),
      text: update.message?.text?.substring(0, 50)
    };
  }

  /**
   * Get update type
   */
  getUpdateType(update) {
    if (update.message) return 'message';
    if (update.callback_query) return 'callback';
    if (update.edited_message) return 'edited_message';
    if (update.channel_post) return 'channel_post';
    return 'other';
  }

  /**
   * Get chat ID from update
   */
  getChatId(update) {
    return update.message?.chat?.id || 
           update.callback_query?.message?.chat?.id ||
           update.edited_message?.chat?.id ||
           update.channel_post?.chat?.id;
  }
} 