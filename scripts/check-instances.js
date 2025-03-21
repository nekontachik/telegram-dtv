/**
 * Script to check and clean up bot instances in the database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkInstances() {
  console.log('Checking bot instances in the database...');
  
  // Get Supabase credentials from environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL or SUPABASE_KEY missing in your .env file');
    return;
  }
  
  try {
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Connected to Supabase');
    
    // Try to directly query the bot_instances table
    const { data: instances, error: instancesError } = await supabase
      .from('bot_instances')
      .select('*')
      .limit(1);
    
    // If there's a specific error about the table not existing
    if (instancesError && instancesError.message && 
        (instancesError.message.includes('does not exist') || 
         instancesError.message.includes('relation') || 
         instancesError.code === '42P01')) {
      console.log('⚠️ The bot_instances table does not exist. You need to create it first.');
      console.log('Run node scripts/setup-instance-table.js to create the table.');
      return;
    } else if (instancesError) {
      console.error('❌ Error querying bot_instances table:', instancesError.message);
      return;
    }
    
    // Get all bot instances
    const { data: allInstances, error: allInstancesError } = await supabase
      .from('bot_instances')
      .select('*');
    
    if (allInstancesError) {
      console.error('❌ Error querying all bot instances:', allInstancesError.message);
      return;
    }
    
    if (!allInstances || allInstances.length === 0) {
      console.log('✅ No bot instances found in the database.');
      console.log('If you\'re still getting the "409 Conflict" error, the problem might be outside the database.');
      return;
    }
    
    // Display instances
    console.log(`Found ${allInstances.length} bot instance(s):`);
    allInstances.forEach(instance => {
      const lastHeartbeat = new Date(instance.last_heartbeat);
      const now = new Date();
      const secondsSinceHeartbeat = Math.floor((now - lastHeartbeat) / 1000);
      
      console.log(`- ID: ${instance.instance_id}`);
      console.log(`  Hostname: ${instance.hostname}`);
      console.log(`  Started: ${new Date(instance.started_at).toLocaleString()}`);
      console.log(`  Last heartbeat: ${lastHeartbeat.toLocaleString()} (${secondsSinceHeartbeat} seconds ago)`);
      console.log(`  Created: ${new Date(instance.created_at).toLocaleString()}`);
      console.log('---');
    });
    
    // Ask to clean up stale instances
    console.log('\nWould you like to clean up all bot instances? (yes/no)');
    process.stdin.once('data', async (data) => {
      const answer = data.toString().trim().toLowerCase();
      
      if (answer === 'yes' || answer === 'y') {
        // Delete all instances
        const { error: deleteError } = await supabase
          .from('bot_instances')
          .delete()
          .neq('instance_id', 'no-match-placeholder'); // Delete all
        
        if (deleteError) {
          console.error('❌ Error deleting instances:', deleteError.message);
        } else {
          console.log('✅ All bot instances have been removed from the database.');
          console.log('You can now start your bot without the "409 Conflict" error.');
        }
      } else {
        console.log('No changes made to the database.');
      }
      
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error checking bot instances:', error.message);
  }
}

checkInstances(); 