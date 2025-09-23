/**
 * API Routes Index
 * Centralized registration of all API endpoints
 */

import { FastifyInstance } from 'fastify';
import { registerUserRoutes } from './routes/UserRoutes';
import { registerChannelRoutes } from './routes/ChannelRoutes';
import { registerTaskRoutes } from './routes/TaskRoutes';
import { registerDocsRoutes } from './routes/DocsRoutes';
import { registerMessageRoutes } from './routes/MessageRoutes';
import { registerActivityRoutes } from './routes/ActivityRoutes';
import { notificationRoutes } from './routes/NotificationRoutes';
import { announcementRoutes } from './routes/AnnouncementRoutes';
import { logger } from '../utils/logger';

/**
 * Register all API routes
 */
export const registerAPIRoutes = async (fastify: FastifyInstance): Promise<void> => {
  try {
    // Register route modules
    await fastify.register(registerUserRoutes);
    await fastify.register(registerChannelRoutes);
    await fastify.register(registerTaskRoutes);
    await fastify.register(registerMessageRoutes); // Now includes threads and reactions
    await fastify.register(registerActivityRoutes);
    await fastify.register(registerDocsRoutes);
    await fastify.register(notificationRoutes);
    await fastify.register(announcementRoutes);

    logger.debug('All API routes registered');
  } catch (error) {
    console.error('API Registration Error Details:', error);
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to register API routes');
    throw error;
  }
};

export default registerAPIRoutes;