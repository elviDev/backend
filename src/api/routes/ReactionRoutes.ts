import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { reactionRepository, messageRepository } from '@db/index';
import { logger, loggers } from '@utils/logger';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  formatErrorResponse,
  createErrorContext,
} from '@utils/errors';
import { authenticate, requireChannelAccess, apiRateLimit } from '@auth/middleware';
import { cacheService } from '../../services/CacheService';
import { CacheEvict, CacheKeyUtils } from '@utils/cache-decorators';
import { WebSocketUtils } from '@websocket/utils';
import {
  UUIDSchema,
  PaginationSchema,
  SuccessResponseSchema,
} from '@utils/validation';

/**
 * Message Reactions API Routes
 * Enterprise-grade emoji reaction system
 */

// Request/Response Schemas
const ReactionToggleSchema = Type.Object({
  emoji: Type.String({ minLength: 1, maxLength: 20 }),
});

const ReactionSummarySchema = Type.Object({
  emoji: Type.String(),
  count: Type.Integer(),
  users: Type.Array(Type.Object({
    id: UUIDSchema,
    name: Type.String(),
    avatar_url: Type.Optional(Type.String()),
  })),
});

const MessageReactionsResponseSchema = Type.Object({
  message_id: UUIDSchema,
  reactions: Type.Array(ReactionSummarySchema),
  total_reactions: Type.Integer(),
  user_reactions: Type.Array(Type.String()),
});

const PopularReactionsResponseSchema = Type.Object({
  emoji: Type.String(),
  count: Type.Integer(),
  usage_percentage: Type.Number(),
});

const ChannelReactionStatsResponseSchema = Type.Object({
  channel_id: UUIDSchema,
  total_reactions: Type.Integer(),
  unique_emojis: Type.Integer(),
  most_used_emoji: Type.Optional(Type.String()),
  top_reactors: Type.Array(Type.Object({
    user_id: UUIDSchema,
    user_name: Type.String(),
    reaction_count: Type.Integer(),
  })),
});

const ReactionActivityResponseSchema = Type.Object({
  reaction: Type.Object({
    id: UUIDSchema,
    message_id: UUIDSchema,
    user_id: UUIDSchema,
    emoji: Type.String(),
    created_at: Type.String({ format: 'date-time' }),
    user_details: Type.Object({
      id: UUIDSchema,
      name: Type.String(),
      email: Type.String(),
      avatar_url: Type.Optional(Type.String()),
      role: Type.String(),
    }),
  }),
  message: Type.Object({
    id: UUIDSchema,
    content: Type.String(),
    channel_id: UUIDSchema,
  }),
});

/**
 * Register reaction routes
 */
export const registerReactionRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /api/v1/messages/:messageId/reactions - Toggle reaction on a message
   */
  fastify.post<{
    Params: { messageId: string };
    Body: typeof ReactionToggleSchema.static;
  }>(
    '/messages/:messageId/reactions',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        body: ReactionToggleSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              action: Type.Union([Type.Literal('added'), Type.Literal('removed')]),
              message_id: UUIDSchema,
              emoji: Type.String(),
              current_reactions: Type.Array(ReactionSummarySchema),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const { emoji } = request.body;

        // Check if message exists and user has access
        const message = await messageRepository.findById(messageId);
        if (!message) {
          throw new NotFoundError('Message not found');
        }

        // Toggle the reaction
        const result = await reactionRepository.toggleReaction(
          messageId,
          request.user!.userId,
          emoji
        );

        // Get updated reactions for the message
        const currentReactions = await reactionRepository.getMessageReactions(messageId);

        // Clear cache
        await cacheService.messages.delete(CacheKeyUtils.channelMessagesKey(message.channel_id));

        // Broadcast reaction change
        await WebSocketUtils.sendToChannel(message.channel_id, 'reaction_toggled', {
          type: 'reaction_toggled',
          messageId,
          channelId: message.channel_id,
          userId: request.user!.userId,
          userName: request.user!.name,
          emoji,
          action: result.action,
          currentReactions,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            emoji,
            action: result.action,
          },
          'Message reaction toggled successfully'
        );

        reply.send({
          success: true,
          data: {
            action: result.action,
            message_id: messageId,
            emoji,
            current_reactions: currentReactions,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to toggle message reaction');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to toggle reaction',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /api/v1/messages/:messageId/reactions - Get all reactions for a message
   */
  fastify.get<{
    Params: { messageId: string };
  }>(
    '/messages/:messageId/reactions',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: MessageReactionsResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;

        // Check if message exists
        const message = await messageRepository.findById(messageId);
        if (!message) {
          throw new NotFoundError('Message not found');
        }

        // Get message reactions
        const reactions = await reactionRepository.getMessageReactions(messageId);

        // Get user's reactions for this message
        const userReactions = await reactionRepository.getUserReactions(
          request.user!.userId,
          [messageId]
        );

        const totalReactions = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
        const userReactionEmojis = userReactions.map(r => r.emoji);

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            reactionsCount: reactions.length,
            totalReactions,
          },
          'Message reactions retrieved'
        );

        reply.send({
          success: true,
          data: {
            message_id: messageId,
            reactions,
            total_reactions: totalReactions,
            user_reactions: userReactionEmojis,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to get message reactions');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to get message reactions',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /api/v1/messages/:messageId/reactions - Remove all reactions from a message
   */
  fastify.delete<{
    Params: { messageId: string };
  }>(
    '/messages/:messageId/reactions',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;

        // Check if message exists and user can delete reactions
        const message = await messageRepository.findById(messageId);
        if (!message) {
          throw new NotFoundError('Message not found');
        }

        // Only message owner or CEO can remove all reactions
        const canDelete = message.user_id === request.user!.userId || 
                         request.user!.role === 'ceo';

        if (!canDelete) {
          throw new AuthorizationError('You can only remove reactions from your own messages');
        }

        // Remove all reactions
        const deletedCount = await reactionRepository.removeAllMessageReactions(
          messageId,
          request.user!.userId
        );

        // Clear cache
        await cacheService.messages.delete(CacheKeyUtils.channelMessagesKey(message.channel_id));

        // Broadcast reaction removal
        await WebSocketUtils.sendToChannel(message.channel_id, 'reactions_cleared', {
          type: 'reactions_cleared',
          messageId,
          channelId: message.channel_id,
          clearedBy: request.user!.userId,
          userName: request.user!.name,
          deletedCount,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            deletedCount,
          },
          'All message reactions removed successfully'
        );

        reply.send({
          success: true,
          message: `Removed ${deletedCount} reactions successfully`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to remove message reactions');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to remove reactions',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /api/v1/channels/:channelId/reactions/popular - Get popular reactions in a channel
   */
  fastify.get<{
    Params: { channelId: string };
    Querystring: { limit?: number };
  }>(
    '/channels/:channelId/reactions/popular',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              channel_id: UUIDSchema,
              popular_reactions: Type.Array(PopularReactionsResponseSchema),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;
        const { limit = 10 } = request.query;

        // Get popular reactions
        const popularReactions = await reactionRepository.getPopularReactions(
          channelId,
          limit
        );

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            reactionsCount: popularReactions.length,
          },
          'Popular reactions retrieved'
        );

        reply.send({
          success: true,
          data: {
            channel_id: channelId,
            popular_reactions: popularReactions,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to get popular reactions');

        reply.code(500).send({
          error: {
            message: 'Failed to get popular reactions',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/channels/:channelId/reactions/stats - Get reaction statistics for a channel
   */
  fastify.get<{
    Params: { channelId: string };
  }>(
    '/channels/:channelId/reactions/stats',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: ChannelReactionStatsResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;

        // Get channel reaction statistics
        const stats = await reactionRepository.getChannelReactionStats(channelId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            totalReactions: stats.total_reactions,
            uniqueEmojis: stats.unique_emojis,
          },
          'Channel reaction statistics retrieved'
        );

        reply.send({
          success: true,
          data: {
            channel_id: channelId,
            ...stats,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to get channel reaction stats');

        reply.code(500).send({
          error: {
            message: 'Failed to get reaction statistics',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/channels/:channelId/reactions/activity - Get recent reaction activity
   */
  fastify.get<{
    Params: { channelId: string };
    Querystring: typeof PaginationSchema.static;
  }>(
    '/channels/:channelId/reactions/activity',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        querystring: PaginationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              channel_id: UUIDSchema,
              activities: Type.Array(ReactionActivityResponseSchema),
              pagination: Type.Object({
                limit: Type.Integer(),
                offset: Type.Integer(),
                has_more: Type.Boolean(),
              }),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;
        const { limit = 20, offset = 0 } = request.query;

        // Get recent reaction activity
        const activities = await reactionRepository.getRecentReactions(
          channelId,
          Math.min(limit, 50)
        );

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            activitiesCount: activities.length,
          },
          'Reaction activity retrieved'
        );

        reply.send({
          success: true,
          data: {
            channel_id: channelId,
            activities,
            pagination: {
              limit: Math.min(limit, 50),
              offset,
              has_more: activities.length === Math.min(limit, 50),
            },
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.userId,
              email: request.user.email ?? '',
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to get reaction activity');

        reply.code(500).send({
          error: {
            message: 'Failed to get reaction activity',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );
};