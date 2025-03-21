/**
 * Утиліта для обробки повідомлень через чергу
 */

import { logger } from './logger.js';

/**
 * Клас для керування чергою повідомлень
 */
export class MessageQueue {
  /**
   * Створює нову чергу повідомлень
   * @param {number} concurrency - Кількість одночасних обробок (за замовчуванням 5)
   */
  constructor(concurrency = 5) {
    this.queue = [];
    this.processing = 0;
    this.concurrency = concurrency;
    this.isProcessing = false;
  }
  
  /**
   * Додає повідомлення до черги на обробку
   * @param {object} message - Повідомлення для обробки
   * @param {Function} processor - Функція обробки
   * @returns {Promise} - Результат обробки
   */
  add(message, processor) {
    return new Promise((resolve, reject) => {
      // Додаємо до черги
      this.queue.push({
        message,
        processor,
        resolve,
        reject,
        addedAt: Date.now()
      });
      
      logger.info(`Message added to queue, length: ${this.queue.length}`, { 
        chatId: message.chat?.id 
      });
      
      // Запускаємо обробку, якщо вона ще не йде
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Обробляє чергу повідомлень
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      while (this.queue.length > 0 && this.processing < this.concurrency) {
        // Беремо наступне повідомлення з черги
        const item = this.queue.shift();
        this.processing++;
        
        // Логуємо час очікування
        const waitTime = Date.now() - item.addedAt;
        logger.info(`Processing message, wait time: ${waitTime}ms`, { 
          chatId: item.message.chat?.id 
        });
        
        // Обробляємо асинхронно
        this.processItem(item).finally(() => {
          this.processing--;
          // Продовжуємо обробку черги
          this.processQueue();
        });
      }
    } finally {
      if (this.queue.length === 0 && this.processing === 0) {
        this.isProcessing = false;
      }
    }
  }
  
  /**
   * Обробляє один елемент черги
   * @param {object} item - Елемент черги
   */
  async processItem(item) {
    try {
      const result = await item.processor(item.message);
      item.resolve(result);
    } catch (error) {
      logger.error('Error processing message', error, { 
        chatId: item.message.chat?.id 
      });
      item.reject(error);
    }
  }
}

// Експортуємо глобальний екземпляр черги
export const messageQueue = new MessageQueue(); 