/**
 * Main application file
 * Entry point for both development and production environments
 */

import { logger } from './utils/logger.js';

// Development mode
if (!process.env.VERCEL) {
  import('./server/dev.js')
    .then(({ startDevServer }) => {
      startDevServer()
        .catch(error => {
          logger.error('Failed to start development server:', error);
          process.exit(1);
        });
    })
    .catch(error => {
      logger.error('Failed to import development server:', error);
      process.exit(1);
    });
}

// Production mode (Vercel)
export { default } from './server/prod.js';
