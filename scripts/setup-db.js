/**
 * Database setup script
 * Creates necessary tables in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

/**
 * Execute SQL query via REST API
 * @param {string} query - SQL query to execute
 * @returns {Promise<Object>} Query result
 */
async function executeSQLQuery(query) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
    },
    body: JSON.stringify({ query })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to execute query: ${await response.text()}`);
  }
  
  return await response.json();
}

/**
 * Setup database tables
 */
async function setupDatabase() {
  console.log('Setting up database...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY are required');
    process.exit(1);
  }
  
  try {
    // Create Supabase client
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log('Connected to Supabase');
    
    // Create sessions table
    const sessionsSQL = `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id BIGINT NOT NULL,
        thread_id TEXT NOT NULL,
        human_handoff BOOLEAN DEFAULT false,
        transferred_to_operator BOOLEAN DEFAULT false,
        operator_transfer_time TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
      );
      
      CREATE INDEX IF NOT EXISTS sessions_chat_id_idx ON sessions(chat_id);
      
      -- Add trigger to update updated_at
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = timezone('utc', now());
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
      
      CREATE TRIGGER update_sessions_updated_at
        BEFORE UPDATE ON sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `;
    
    console.log('Creating sessions table...');
    await executeSQLQuery(sessionsSQL);
    console.log('Sessions table created successfully');
    
    // Create message_logs table
    const messageLogsSQL = `
      CREATE TABLE IF NOT EXISTS message_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id BIGINT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
      );
      
      CREATE INDEX IF NOT EXISTS message_logs_chat_id_idx ON message_logs(chat_id);
    `;
    
    console.log('Creating message_logs table...');
    await executeSQLQuery(messageLogsSQL);
    console.log('Message logs table created successfully');
    
    // Create bot_instances table
    const instancesSQL = `
      CREATE TABLE IF NOT EXISTS bot_instances (
        instance_id UUID PRIMARY KEY,
        hostname TEXT NOT NULL,
        last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
      );
      
      CREATE INDEX IF NOT EXISTS bot_instances_last_heartbeat_idx ON bot_instances(last_heartbeat);
    `;
    
    console.log('Creating bot_instances table...');
    await executeSQLQuery(instancesSQL);
    console.log('Bot instances table created successfully');
    
    console.log('Database setup completed successfully');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

// Run setup
setupDatabase(); 