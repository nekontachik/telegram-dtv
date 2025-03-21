/**
 * Скрипт для створення таблиць для відслідковування екземплярів бота і логів
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/config.js';

async function setupTables() {
  console.log('Налаштування таблиць для відслідковування екземплярів бота і логів...');
  
  if (!config.supabase.url || !config.supabase.key) {
    console.error('❌ Помилка: відсутні SUPABASE_URL або SUPABASE_KEY у вашому .env файлі');
    return;
  }
  
  try {
    // Створення клієнта Supabase
    const supabase = createClient(config.supabase.url, config.supabase.key);
    console.log('✅ Підключення до Supabase успішне');
    
    // Функція для виконання SQL запитів
    async function executeSql(query, params = {}) {
      try {
        const { data, error } = await supabase.rpc('execute_sql', { query });
        
        if (error) {
          // Спроба через REST API
          const response = await fetch(`${config.supabase.url}/rest/v1/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': config.supabase.key,
              'Authorization': `Bearer ${config.supabase.key}`,
              'Prefer': 'params=single-object',
            },
            body: JSON.stringify({
              query,
              params
            })
          });
          
          if (!response.ok) {
            throw new Error(`SQL виконання не вдалося: ${response.statusText}`);
          }
          
          console.log(`✅ SQL запит виконано через REST API`);
          return;
        }
        
        console.log(`✅ SQL запит виконано через RPC`);
      } catch (error) {
        console.error(`❌ Помилка виконання SQL:`, error.message);
        throw error;
      }
    }
    
    // Створення таблиці bot_instances
    console.log('Створення таблиці bot_instances...');
    await executeSql(`
      CREATE TABLE IF NOT EXISTS bot_instances (
        instance_id UUID PRIMARY KEY,
        hostname TEXT NOT NULL,
        last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    
    // Створення таблиці logs
    console.log('Створення таблиці logs...');
    await executeSql(`
      CREATE TABLE IF NOT EXISTS logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        error_message TEXT,
        error_stack TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    
    console.log('✅ Таблиці успішно створені');
    
  } catch (error) {
    console.error('❌ Помилка налаштування таблиць:', error);
  }
}

setupTables(); 