/**
 * Тестовий скрипт для перевірки підключення до Supabase
 */

import { dbService } from './src/services/dbService.js';

async function testConnection() {
  console.log('Тестування підключення до Supabase...');
  
  try {
    const db = dbService.getInstance();
    if (!db.isInitialized()) {
      console.error('❌ База даних не ініціалізована');
      process.exit(1);
    }

    console.log('✅ База даних успішно ініціалізована');

    // Get all sessions
    const sessions = await db.getAllSessions();
    console.log(`Знайдено ${sessions.length} сесій у базі даних`);
    if (sessions.length > 0) {
      console.log('Приклад сесії:', sessions[0]);
    }
    
    // Отримання повідомлень (для першої сесії, якщо вона існує)
    if (sessions.length > 0) {
      const chatId = sessions[0].chat_id;
      console.log(`\nОстанні повідомлення для chat_id ${chatId}:`);
      const messages = await db.getRecentMessages(chatId, 5);
      console.log(`Знайдено ${messages.length} повідомлень для chat_id ${chatId}`);
      if (messages.length > 0) {
        console.log('Приклад повідомлення:', messages[0]);
      }
    }
    
    console.log('✅ Тест підключення до бази даних успішно завершено');
  } catch (error) {
    console.error('❌ Помилка під час тестування підключення до бази даних:', error);
  }
}

testConnection(); 