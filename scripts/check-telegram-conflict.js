/**
 * Script to check for running Telegram bots and stop them
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

async function checkTelegramWebhook() {
  console.log('Checking Telegram bot webhook status...');
  
  // Try both possible environment variable names
  const token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.error('❌ Error: Telegram token missing in your .env file');
    console.error('Please make sure you have TELEGRAM_TOKEN set in your .env file');
    
    // Continue with process checking even without token
    await checkRunningProcesses();
    return;
  }
  
  try {
    // Get webhook info
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await response.json();
    
    if (!data.ok) {
      console.error('❌ Error getting webhook info:', data.description);
      await checkRunningProcesses();
      return;
    }
    
    console.log('\n=== Webhook Info ===');
    console.log(JSON.stringify(data.result, null, 2));
    
    if (data.result.url) {
      console.log('\n⚠️ Your bot has a webhook set!');
      console.log('This could be causing conflicts with the bot running in polling mode.');
      console.log('\nWould you like to delete the webhook? (yes/no)');
      
      process.stdin.once('data', async (input) => {
        const answer = input.toString().trim().toLowerCase();
        
        if (answer === 'yes' || answer === 'y') {
          const deleteResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
          const deleteData = await deleteResponse.json();
          
          if (deleteData.ok) {
            console.log('✅ Webhook deleted successfully!');
          } else {
            console.error('❌ Failed to delete webhook:', deleteData.description);
          }
        } else {
          console.log('No changes made to webhook.');
        }
        
        // Continue with process checking
        await checkRunningProcesses();
      });
    } else {
      console.log('\n✅ No webhook set. This is good for polling mode.');
      // Continue with process checking
      await checkRunningProcesses();
    }
  } catch (error) {
    console.error('❌ Error checking Telegram webhook:', error.message);
    // Continue with process checking
    await checkRunningProcesses();
  }
}

async function checkRunningProcesses() {
  console.log('\n=== Checking for running bot processes ===');
  
  try {
    // Get list of running Node.js processes, including our app.js
    const { stdout } = await execAsync('ps aux | grep "node" | grep -v grep');
    
    // Split output into lines and filter for potential bot processes
    const lines = stdout.split('\n').filter(line => 
      line.includes('app.js') || 
      line.includes('bot') || 
      line.includes('telegram')
    );
    
    if (lines.length === 0) {
      console.log('✅ No bot processes found running.');
      process.exit(0);
      return;
    }
    
    console.log(`Found ${lines.length} potential bot process(es):`);
    
    lines.forEach((line, index) => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];
      const command = parts.slice(10).join(' ');
      
      console.log(`${index + 1}. PID: ${pid}, Command: ${command}`);
    });
    
    console.log('\nWould you like to kill these processes? (yes/no)');
    
    process.stdin.once('data', async (input) => {
      const answer = input.toString().trim().toLowerCase();
      
      if (answer === 'yes' || answer === 'y') {
        for (const line of lines) {
          const pid = line.trim().split(/\s+/)[1];
          try {
            await execAsync(`kill ${pid}`);
            console.log(`✅ Process ${pid} killed successfully!`);
          } catch (error) {
            console.error(`❌ Failed to kill process ${pid}:`, error.message);
          }
        }
        console.log('\nAll identified bot processes killed.');
        console.log('You can now try starting your bot again without the "409 Conflict" error.');
      } else {
        console.log('No processes were killed.');
      }
      
      process.exit(0);
    });
    
  } catch (error) {
    if (error.stderr && error.stderr.includes('No such file or directory')) {
      console.log('✅ No bot processes found running.');
    } else {
      console.error('❌ Error checking running processes:', error.message);
    }
    process.exit(0);
  }
}

checkTelegramWebhook(); 