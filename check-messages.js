/**
 * Скрипт для перевірки останніх повідомлень у базі даних
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './src/config/config.js';

async function checkMessages() {
  console.log('Перевірка останніх повідомлень у Supabase...');
  
  if (!config.supabase.url || !config.supabase.key) {
    console.error('❌ Помилка: відсутні SUPABASE_URL або SUPABASE_KEY у вашому .env файлі');
    return;
  }
  
  try {
    // Створення клієнта Supabase
    const supabase = createClient(config.supabase.url, config.supabase.key);
    console.log('✅ Підключення до Supabase успішне');
    
    // Отримання останніх сесій
    console.log('Отримання списку сесій...');
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (sessionsError) {
      console.error('❌ Помилка отримання сесій:', sessionsError.message);
      return;
    }
    
    console.log(`Знайдено ${sessions.length} сесій в базі даних:`);
    sessions.forEach(session => {
      console.log(`- Сесія ${session.id}: chat_id=${session.chat_id}, thread_id=${session.thread_id}, human_handoff=${session.human_handoff}, created_at=${session.created_at}`);
    });
    
    // Отримання останніх повідомлень (обмеження 20)
    console.log('\nОтримання останніх повідомлень...');
    const { data: messages, error: messagesError } = await supabase
      .from('message_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (messagesError) {
      console.error('❌ Помилка отримання повідомлень:', messagesError.message);
      return;
    }
    
    console.log(`Знайдено ${messages.length} останніх повідомлень в базі даних:`);
    messages.forEach(message => {
      console.log(`- Повідомлення ${message.id}: chat_id=${message.chat_id}, role=${message.role}`);
      console.log(`  Створено: ${message.created_at}`);
      console.log(`  Вміст: ${message.content}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('❌ Помилка підключення до бази даних:', error);
  }
}

checkMessages(); 