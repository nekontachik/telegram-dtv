/**
 * Утиліти для кешування даних
 */

/**
 * Клас для кешування сесій користувачів
 */
export class SessionCache {
  /**
   * Створює новий екземпляр кешу
   * @param {number} ttl - Час життя елементів кешу в мілісекундах (за замовчуванням 1 година)
   */
  constructor(ttl = 3600000) {
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  /**
   * Додає або оновлює елемент в кеші
   * @param {string|number} chatId - ID чату
   * @param {object} data - Дані для збереження
   */
  set(chatId, data) {
    this.cache.set(chatId, {
      data,
      expires: Date.now() + this.ttl
    });
  }
  
  /**
   * Отримує елемент з кешу
   * @param {string|number} chatId - ID чату
   * @returns {object|null} - Дані або null, якщо елемент не знайдено або прострочений
   */
  get(chatId) {
    const item = this.cache.get(chatId);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(chatId);
      return null;
    }
    
    return item.data;
  }
  
  /**
   * Видаляє елемент з кешу
   * @param {string|number} chatId - ID чату
   */
  delete(chatId) {
    this.cache.delete(chatId);
  }
  
  /**
   * Очищує всі прострочені елементи кешу
   */
  cleanup() {
    const now = Date.now();
    for (const [chatId, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(chatId);
      }
    }
  }
}

/**
 * Допоміжна функція для повторних спроб виконання асинхронних операцій
 * @param {Function} operation - Асинхронна функція для виконання
 * @param {number} maxRetries - Максимальна кількість спроб
 * @param {number} delay - Затримка між спробами в мілісекундах
 * @returns {Promise} - Результат виконання операції
 */
export const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
      lastError = error;
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}; 