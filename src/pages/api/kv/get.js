import { kv } from '@vercel/kv';
import { logger } from '../../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'Missing key parameter' });
    }

    const value = await kv.get(key);
    logger.info('KV value retrieved', { key, hasValue: !!value });
    
    return res.status(200).json({ value });
  } catch (error) {
    logger.error('Error getting KV value:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 