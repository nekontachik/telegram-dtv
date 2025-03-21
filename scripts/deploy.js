import { config } from '../src/config/config.js';
import { logger } from '../src/utils/logger.js';

async function setupWebhook() {
  try {
    const webhookUrl = `${process.env.VERCEL_URL}/webhook`;
    
    // Delete any existing webhook
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${config.telegram.token}/deleteWebhook`
    );
    const deleteData = await deleteResponse.json();
    
    if (!deleteData.ok) {
      throw new Error(`Failed to delete webhook: ${deleteData.description}`);
    }
    
    logger.info('Successfully deleted existing webhook');
    
    // Set new webhook
    const setResponse = await fetch(
      `https://api.telegram.org/bot${config.telegram.token}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );
    const setData = await setResponse.json();
    
    if (!setData.ok) {
      throw new Error(`Failed to set webhook: ${setData.description}`);
    }
    
    logger.info(`Successfully set webhook to ${webhookUrl}`);
    
    // Get webhook info
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${config.telegram.token}/getWebhookInfo`
    );
    const infoData = await infoResponse.json();
    
    if (infoData.ok) {
      logger.info('Webhook info:', infoData.result);
    }
  } catch (error) {
    logger.error('Error setting up webhook', error);
    process.exit(1);
  }
}

setupWebhook(); 