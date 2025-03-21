import { kv } from '@vercel/kv';
import { logger } from '../../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key, value } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({ error: 'Missing key or value' });
    }

    await kv.set(key, value);
    logger.info('KV value set', { key });
    
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error setting KV value:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 