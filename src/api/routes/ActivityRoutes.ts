import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import ActivityRepository from '../../db/ActivityRepository';
import UserRepository from '../../db/UserRepository';
import { authenticate } from '../../auth/middleware';
import { logger } from '../../utils/logger';

interface ActivityFilters {
  type?: string[];
  channel_id?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
  from_date?: string;
  to_date?: string;
}

interface CreateActivityBody {
  type: string;
  title: string;
  description: string;
  metadata?: any;
  related_id?: string;
  channel_id?: string;
}

/**
 * Activity API Routes
 * Handles activity feed, notifications, and activity logging
 */
export async function registerActivityRoutes(fastify: FastifyInstance) {
  const activityRepo = new ActivityRepository();
  const userRepo = new UserRepository();

  // All routes require authentication
  await fastify.register(async function (fastify) {
    fastify.addHook('onRequest', authenticate);

    /**
     * GET /activities - Get activities with filters and pagination
     */
    fastify.get('/', async (request: FastifyRequest<{
      Querystring: ActivityFilters;
    }>, reply: FastifyReply) => {
      try {
        const {
          type,
          channel_id,
          user_id,
          limit = 50,
          offset = 0,
          from_date,
          to_date
        } = request.query;

        // Validate pagination parameters
        if (limit > 100) {
          return reply.code(400).send({
            error: {
              message: 'Limit cannot exceed 100',
              code: 'INVALID_LIMIT',
            }
          });
        }

        // Build filters
        const filters: any = {};
        if (type) filters.type = Array.isArray(type) ? type : [type];
        if (channel_id) filters.channel_id = channel_id;
        if (user_id) filters.user_id = user_id;
        if (from_date) filters.from_date = from_date;
        if (to_date) filters.to_date = to_date;

        // Get activities with user information
        const activities = await activityRepo.findManyActivities({
          ...filters,
          limit,
          offset,
          includeUser: true,
        });

        const total = await activityRepo.count(filters);
        const hasMore = offset + limit < total;

        reply.send({
          success: true,
          data: activities,
          pagination: {
            total,
            limit,
            offset,
            hasMore,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: request.user?.userId }, 'Error fetching activities');
        reply.code(500).send({
          error: {
            message: 'Failed to fetch activities',
            code: 'ACTIVITY_FETCH_ERROR',
          }
        });
      }
    });

    /**
     * GET /activities/feed - Get personalized activity feed
     */
    fastify.get('/feed', async (request: FastifyRequest<{
      Querystring: {
        limit?: number;
        offset?: number;
      };
    }>, reply: FastifyReply) => {
      try {
        const { limit = 20, offset = 0 } = request.query;
        const userId = request.user!.userId;

        // Get activities for channels the user is a member of
        // and activities directly related to the user
        const activities = await activityRepo.getUserFeed(userId, limit, offset);
        const total = await activityRepo.getUserFeedCount(userId);
        const hasMore = offset + limit < total;

        reply.send({
          success: true,
          data: activities,
          pagination: {
            total,
            limit,
            offset,
            hasMore,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: request.user?.userId }, 'Error fetching activity feed');
        reply.code(500).send({
          error: {
            message: 'Failed to fetch activity feed',
            code: 'ACTIVITY_FEED_ERROR',
          }
        });
      }
    });

    /**
     * POST /activities - Create new activity
     */
    fastify.post('/', async (request: FastifyRequest<{
      Body: CreateActivityBody;
    }>, reply: FastifyReply) => {
      try {
        const {
          type,
          title,
          description,
          metadata = {},
          related_id,
          channel_id
        } = request.body;
        const userId = request.user!.userId;

        // Validate required fields
        if (!type || !title || !description) {
          return reply.code(400).send({
            error: {
              message: 'Type, title, and description are required',
              code: 'MISSING_REQUIRED_FIELDS',
            }
          });
        }

        // Validate activity type
        const validTypes = [
          'task_created', 'task_updated', 'task_completed', 'task_assigned',
          'channel_created', 'user_joined', 'file_uploaded', 'message_sent',
          'announcement', 'notification'
        ];
        
        if (!validTypes.includes(type)) {
          return reply.code(400).send({
            error: {
              message: `Invalid activity type. Must be one of: ${validTypes.join(', ')}`,
              code: 'INVALID_ACTIVITY_TYPE',
            }
          });
        }

        const activityData = {
          user_id: userId,
          type,
          title,
          description,
          metadata,
          ...(related_id && { related_id }),
          ...(channel_id && { channel_id }),
        };

        const activity = await activityRepo.create(activityData);

        reply.code(201).send({
          success: true,
          data: activity,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: request.user?.userId }, 'Error creating activity');
        reply.code(500).send({
          error: {
            message: 'Failed to create activity',
            code: 'ACTIVITY_CREATE_ERROR',
          }
        });
      }
    });

    /**
     * GET /activities/stats - Get activity statistics
     */
    fastify.get('/stats', async (request: FastifyRequest<{
      Querystring: {
        period?: 'day' | 'week' | 'month';
        channel_id?: string;
      };
    }>, reply: FastifyReply) => {
      try {
        const { period = 'week', channel_id } = request.query;
        const userId = request.user!.userId;

        const statsQuery: any = {
          userId,
          period,
        };
        if (channel_id) {
          statsQuery.channelId = channel_id;
        }

        const stats = await activityRepo.getActivityStats(statsQuery);

        reply.send({
          success: true,
          data: stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: request.user?.userId }, 'Error fetching activity stats');
        reply.code(500).send({
          error: {
            message: 'Failed to fetch activity statistics',
            code: 'ACTIVITY_STATS_ERROR',
          }
        });
      }
    });

    /**
     * GET /activities/:id - Get single activity
     */
    fastify.get('/:id', async (request: FastifyRequest<{
      Params: { id: string };
    }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const activity = await activityRepo.findById(id);
        if (!activity) {
          return reply.code(404).send({
            error: {
              message: 'Activity not found',
              code: 'ACTIVITY_NOT_FOUND',
            }
          });
        }

        reply.send({
          success: true,
          data: activity,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: request.user?.userId }, 'Error fetching activity');
        reply.code(500).send({
          error: {
            message: 'Failed to fetch activity',
            code: 'ACTIVITY_FETCH_ERROR',
          }
        });
      }
    });
  }, { prefix: '/activities' });

  logger.debug('Activity routes registered');
}