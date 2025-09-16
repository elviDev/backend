#!/usr/bin/env node

/**
 * CEO Communication Platform - Main Entry Point
 * High-performance backend API server with comprehensive features
 */

import { config } from '@config/index';
import { logger } from '@utils/logger';
import { server } from './server';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    // Log startup information
    logger.info({
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: config.app.env,
      pid: process.pid,
    }, 'Starting CEO Communication Platform API');

    // Validate configuration
    logger.info('Validating configuration...');
    // Configuration is already validated in config/index.ts

    // Start the server
    await server.start();

  } catch (error) {
    logger.fatal({ error }, 'Failed to start application');
    process.exit(1);
  }
}

// Handle top-level errors
process.on('uncaughtException', (error: Error) => {
  logger.fatal({ error }, 'Uncaught exception in main process');
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection in main process');
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

export { server };
export default main;