/**
 * Скрипт налаштування бази даних Supabase
 * Створює необхідні таблиці з файлу schema.sql
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config/config.js';
import fetch from 'node-fetch';

// Отримання абсолютного шляху до поточного файлу
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeSQLQuery(url, apiKey, query) {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: query
      })
    });
    
    const status = response.status;
    if (status >= 200 && status < 300) {
      return { success: true };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function setupDatabase() {
  console.log('Налаштування бази даних Supabase...');
  
  if (!config.supabase.url || !config.supabase.key) {
    console.error('❌ Помилка: відсутні SUPABASE_URL або SUPABASE_KEY у вашому .env файлі');
    return;
  }
  
  try {
    // Створення клієнта Supabase
    const supabase = createClient(config.supabase.url, config.supabase.key);
    console.log('✅ Підключення до Supabase успішне');
    
    // Зчитування SQL схеми
    const schemaPath = path.join(__dirname, 'src', 'config', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Виконуємо SQL скрипт для створення таблиць...');
    
    // Виконання кожної таблиці окремо
    // Create sessions table
    console.log('Створення таблиці sessions...');
    const { data: sessionsTable, error: sessionsError } = await supabase.rpc('create_sessions_table');
    
    if (sessionsError) {
      console.error('Помилка при створенні таблиці sessions:', sessionsError.message);
      
      // Пробуємо створити таблицю sessions вручну
      console.log('Спроба створити таблицю sessions вручну...');
      
      const createSessionsTable = `
        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          chat_id BIGINT UNIQUE NOT NULL,
          thread_id TEXT NOT NULL,
          human_handoff BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;
      
      const result1 = await supabase.from('_').select('create_sessions_table').eq('name', 'sessions');
      console.log('Результат створення таблиці sessions:', result1.error ? result1.error.message : 'успішно');
    } else {
      console.log('Таблиця sessions успішно створена');
    }
    
    // Create index on sessions
    console.log('Створення індексу для таблиці sessions...');
    const { data: sessionsIndexData, error: sessionsIndexError } = await supabase.rpc('create_sessions_index');
    
    // Create message_logs table
    console.log('Створення таблиці message_logs...');
    const { data: logsTable, error: logsError } = await supabase.rpc('create_message_logs_table');
    
    if (logsError) {
      console.error('Помилка при створенні таблиці message_logs:', logsError.message);
      
      // Пробуємо створити таблицю message_logs вручну
      console.log('Спроба створити таблицю message_logs вручну...');
      
      const createLogsTable = `
        CREATE TABLE IF NOT EXISTS message_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          chat_id BIGINT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;
      
      const result2 = await supabase.from('_').select('create_message_logs_table').eq('name', 'message_logs');
      console.log('Результат створення таблиці message_logs:', result2.error ? result2.error.message : 'успішно');
    } else {
      console.log('Таблиця message_logs успішно створена');
    }
    
    console.log('✅ Налаштування таблиць завершено');
    
    // Альтернативний спосіб через SQL API
    console.log('Виконуємо SQL запити через REST API...');
    
    // Створення таблиць через SQL API
    const session_table_sql = `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id BIGINT UNIQUE NOT NULL,
        thread_id TEXT NOT NULL,
        human_handoff BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const messages_table_sql = `
      CREATE TABLE IF NOT EXISTS message_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id BIGINT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    // Виконуємо SQL запити напряму
    try {
      const { data, error } = await supabase.from('_').select(`
        create_tables:sql_query(${session_table_sql})
      `);
      console.log('Результат SQL API:', error ? error.message : 'успішно');
    } catch (e) {
      console.error('Помилка SQL API:', e.message);
    }
    
    // Перевірка таблиць
    console.log('Перевіряємо список таблиць в базі даних...');
    const { data, error } = await supabase
      .from('_')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Помилка запиту:', error.message);
    } else {
      console.log('Запит до бази даних успішний');
    }
    
    console.log('Створення тестових записів...');
    
    // Створюємо тестовий запис в таблиці sessions
    try {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          chat_id: 123456789,
          thread_id: 'thread_test_123',
          human_handoff: false
        })
        .select();
      
      if (sessionError) {
        console.error('Помилка при створенні тестової сесії:', sessionError.message);
      } else {
        console.log('Тестова сесія створена:', session);
        
        // Створюємо тестове повідомлення
        const { data: message, error: messageError } = await supabase
          .from('message_logs')
          .insert({
            chat_id: 123456789,
            role: 'user',
            content: 'Тестове повідомлення'
          })
          .select();
        
        if (messageError) {
          console.error('Помилка при створенні тестового повідомлення:', messageError.message);
        } else {
          console.log('Тестове повідомлення створено:', message);
        }
      }
    } catch (e) {
      console.error('Помилка при створенні тестових даних:', e.message);
    }
    
    console.log('✅ Налаштування бази даних завершено');
    
  } catch (error) {
    console.error('❌ Помилка налаштування бази даних:', error);
  }
}

setupDatabase(); 