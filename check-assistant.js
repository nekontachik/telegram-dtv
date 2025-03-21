/**
 * Скрипт для перевірки асистента Capy-Concierge
 */

import OpenAI from 'openai';
import { config } from './src/config/config.js';

async function checkAssistant() {
  console.log('Перевірка асистента в OpenAI...');
  
  if (!config.openai.apiKey) {
    console.error('❌ Помилка: відсутній OPENAI_API_KEY у вашому .env файлі');
    return;
  }
  
  try {
    // Створення клієнта OpenAI
    const openai = new OpenAI({ apiKey: config.openai.apiKey });
    console.log('✅ Підключення до OpenAI успішне');
    
    // Перевірка наявності ID асистента
    if (!config.openai.assistantId) {
      console.error('❌ Помилка: відсутній ASSISTANT_ID у вашому .env файлі');
      return;
    }
    
    console.log(`Отримання інформації про асистента з ID: ${config.openai.assistantId}`);
    
    try {
      // Отримання інформації про асистента
      const assistant = await openai.beta.assistants.retrieve(config.openai.assistantId);
      
      console.log('✅ Інформація про асистента:');
      console.log(`- Назва: ${assistant.name}`);
      console.log(`- Модель: ${assistant.model}`);
      console.log(`- Створений: ${assistant.created_at}`);
      console.log(`- Інструкції:`, assistant.instructions ? assistant.instructions.substring(0, 100) + '...' : 'Не вказані');
      
    } catch (error) {
      console.error(`❌ Помилка отримання асистента: ${error.message}`);
      console.error('Перевірте правильність ID асистента в .env файлі');
    }
    
  } catch (error) {
    console.error('❌ Помилка підключення до OpenAI:', error);
  }
}

checkAssistant(); 