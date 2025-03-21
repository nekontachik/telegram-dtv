/**
 * Тестовий скрипт для перевірки підключення до Supabase
 */

import { config } from './src/config/config.js';
import { dbService } from './src/services/dbService.js';
import { logger } from './src/utils/logger.js';

async function testConnection() {
  try {
    // Initialize the database service
    dbService.init(config.supabase.url, config.supabase.key);
    
    if (!dbService.isInitialized()) {
      throw new Error('Database service not initialized');
    }

    // Test getting all sessions
    const sessions = await dbService.getAllSessions();
    console.log('Successfully retrieved sessions:', sessions);

    console.log('✅ Database connection test successful!');
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    process.exit(1);
  }
}

testConnection(); 