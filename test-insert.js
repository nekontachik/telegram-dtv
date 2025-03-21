/**
 * Тестовий скрипт для додавання записів у Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './src/config/config.js';

async function testInsert() {
  console.log('Тестування додавання записів до Supabase...');
  
  if (!config.supabase.url || !config.supabase.key) {
    console.error('❌ Помилка: відсутні SUPABASE_URL або SUPABASE_KEY у вашому .env файлі');
    return;
  }
  
  try {
    // Створення клієнта Supabase
    const supabase = createClient(config.supabase.url, config.supabase.key);
    console.log('✅ Підключення до Supabase успішне');
    
    // Перевірка існування таблиць
    try {
      console.log('Перевірка структури таблиці sessions...');
      const { data: sessionsInfo, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .limit(1);
      
      if (sessionsError) {
        console.error('❌ Помилка доступу до таблиці sessions:', sessionsError.message);
        if (sessionsError.message.includes('does not exist')) {
          console.error('Таблиця sessions не існує. Будь ласка, створіть таблицю за допомогою SQL запитів.');
        }
      } else {
        console.log('✅ Таблиця sessions існує та доступна');
        
        // Додавання тестового запису в таблицю sessions
        console.log('Додавання тестового запису в таблицю sessions...');
        const { data: session, error: insertError } = await supabase
          .from('sessions')
          .insert({
            chat_id: 987654321, // Тестовий chat_id
            thread_id: 'thread_test_456',
            human_handoff: false
          })
          .select();
        
        if (insertError) {
          console.error('❌ Помилка додавання запису до таблиці sessions:', insertError.message);
        } else {
          console.log('✅ Запис успішно додано до таблиці sessions:', session);
        }
      }
      
      console.log('Перевірка структури таблиці message_logs...');
      const { data: logsInfo, error: logsError } = await supabase
        .from('message_logs')
        .select('*')
        .limit(1);
      
      if (logsError) {
        console.error('❌ Помилка доступу до таблиці message_logs:', logsError.message);
        if (logsError.message.includes('does not exist')) {
          console.error('Таблиця message_logs не існує. Будь ласка, створіть таблицю за допомогою SQL запитів.');
        }
      } else {
        console.log('✅ Таблиця message_logs існує та доступна');
        
        // Додавання тестового запису в таблицю message_logs
        console.log('Додавання тестового запису в таблицю message_logs...');
        const { data: message, error: insertError } = await supabase
          .from('message_logs')
          .insert({
            chat_id: 987654321, // Той самий chat_id, що й у сесії
            role: 'user',
            content: 'Це тестове повідомлення для перевірки бази даних'
          })
          .select();
        
        if (insertError) {
          console.error('❌ Помилка додавання запису до таблиці message_logs:', insertError.message);
        } else {
          console.log('✅ Запис успішно додано до таблиці message_logs:', message);
        }
      }
      
    } catch (error) {
      console.error('❌ Помилка перевірки таблиць:', error);
    }
    
  } catch (error) {
    console.error('❌ Помилка підключення до бази даних:', error);
  }
}

testInsert(); 