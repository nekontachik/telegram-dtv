/**
 * Script to safely restart the Telegram bot
 * This script will kill any running bot instances and start a new one
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

// Get directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Kill all running bot processes
 */
async function killAllBotProcesses() {
  console.log('Killing all running bot processes...');
  
  try {
    // Get our own PID to exclude it
    const selfPid = process.pid;
    
    // Find all node processes running app.js
    const { stdout } = await execAsync('ps aux | grep "node.*app.js" | grep -v grep');
    
    // Process each line
    const lines = stdout.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
      console.log('No running bot processes found.');
      return;
    }
    
    console.log(`Found ${lines.length} potential bot process(es):`);
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1]);
      
      // Skip our own process
      if (pid === selfPid) {
        continue;
      }
      
      try {
        await execAsync(`kill ${pid}`);
        console.log(`✅ Process ${pid} killed successfully!`);
      } catch (error) {
        console.error(`❌ Failed to kill process ${pid}:`, error.message);
      }
    }
    
    // Wait a moment for processes to terminate
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('All bot processes should be stopped now.');
    
  } catch (error) {
    console.error('Error killing bot processes:', error.message);
  }
}

/**
 * Clear Telegram webhook
 */
async function clearWebhook() {
  console.log('Clearing Telegram webhook...');
  
  const token = process.env.TELEGRAM_TOKEN;
  
  if (!token) {
    console.warn('No Telegram token found in environment. Skipping webhook clearing.');
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Webhook deleted successfully');
    } else {
      console.warn('⚠️ Failed to delete webhook:', data.description);
    }
  } catch (error) {
    console.warn('⚠️ Error clearing webhook:', error.message);
  }
}

/**
 * Start the bot
 */
function startBot() {
  console.log('Starting the bot...');
  
  // Path to app.js from the scripts directory
  const appPath = path.join(__dirname, '..', 'src', 'app.js');
  
  try {
    // Start the bot as a detached process that will continue running
    const bot = spawn('node', [appPath], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Unref the child process so parent can exit independently
    bot.unref();
    
    console.log(`✅ Bot started with PID ${bot.pid}`);
    console.log('The bot is now running in the background.');
    console.log('You can check its logs or terminate it using:');
    console.log(`  ps aux | grep "node.*app.js" | grep -v grep`);
    console.log(`  kill <PID>`);
  } catch (error) {
    console.error('❌ Failed to start the bot:', error.message);
  }
}

// Main execution
async function main() {
  try {
    // Kill existing processes
    await killAllBotProcesses();
    
    // Clear webhook
    await clearWebhook();
    
    // Start new bot instance
    startBot();
    
  } catch (error) {
    console.error('Error restarting bot:', error);
  }
}

main(); 