import { config } from '../src/config/config.js';
import fetch from 'node-fetch';

const VERCEL_URL = process.env.VERCEL_URL || process.argv[2];

if (!VERCEL_URL) {
  console.error('Please provide the Vercel URL as an argument or set VERCEL_URL environment variable');
  process.exit(1);
}

const webhookUrl = `https://${VERCEL_URL}/webhook`;
const telegramUrl = `https://api.telegram.org/bot${config.telegram.token}/setWebhook`;

async function setWebhook() {
  try {
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
      }),
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Webhook set successfully to:', webhookUrl);
    } else {
      console.error('❌ Failed to set webhook:', data.description);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
  }
}

setWebhook(); 