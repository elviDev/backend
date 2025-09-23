import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { threadRepository, messageRepository, reactionRepository } from '@db/index';
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
 * Thread Management API Routes
 * Enterprise-grade threaded messaging system
 */

// Request/Response Schemas
const CreateThreadSchema = Type.Object({
  // Thread is created automatically when first reply is added
});

const ThreadReplySchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 4000 }),
  message_type: Type.Optional(
    Type.Union([
      Type.Literal('text'),
      Type.Literal('voice'),
      Type.Literal('file'),
    ])
  ),
  attachments: Type.Optional(Type.Array(Type.Object({
    file_id: UUIDSchema,
    filename: Type.String(),
    file_type: Type.String(),
    file_size: Type.Integer(),
  }))),
  reply_to_id: Type.Optional(UUIDSchema),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const ThreadInfoResponseSchema = Type.Object({
  thread_root_id: UUIDSchema,
  thread_root: Type.Object({
    id: UUIDSchema,
    content: Type.String(),
    user_details: Type.Object({
      id: UUIDSchema,
      name: Type.String(),
      email: Type.String(),
      avatar_url: Type.Optional(Type.String()),
      role: Type.String(),
      phone: Type.Optional(Type.String()),
    }),
    created_at: Type.String({ format: 'date-time' }),
    reactions: Type.Array(Type.Object({
      emoji: Type.String(),
      count: Type.Integer(),
      users: Type.Array(Type.Object({
        id: UUIDSchema,
        name: Type.String(),
        avatar_url: Type.Optional(Type.String()),
      })),
    })),
  }),
  reply_count: Type.Integer(),
  participant_count: Type.Integer(),
  last_reply_at: Type.Optional(Type.String({ format: 'date-time' })),
  last_reply_by_details: Type.Optional(Type.Object({
    id: UUIDSchema,
    name: Type.String(),
    avatar_url: Type.Optional(Type.String()),
  })),
  participant_details: Type.Array(Type.Object({
    id: UUIDSchema,
    name: Type.String(),
    email: Type.String(),
    avatar_url: Type.Optional(Type.String()),
    role: Type.String(),
  })),
});

const ThreadReplyResponseSchema = Type.Object({
  id: UUIDSchema,
  content: Type.String(),
  user_id: UUIDSchema,
  user_details: Type.Object({
    id: UUIDSchema,
    name: Type.String(),
    email: Type.String(),
    avatar_url: Type.Optional(Type.String()),
    role: Type.String(),
    phone: Type.Optional(Type.String()),
  }),
  thread_root_id: UUIDSchema,
  reply_to_id: Type.Optional(UUIDSchema),
  message_type: Type.String(),
  attachments: Type.Array(Type.Any()),
  reactions: Type.Array(Type.Object({
    emoji: Type.String(),
    count: Type.Integer(),
    users: Type.Array(Type.Object({
      id: UUIDSchema,
      name: Type.String(),
      avatar_url: Type.Optional(Type.String()),
    })),
  })),
  is_edited: Type.Boolean(),
  edited_at: Type.Optional(Type.String({ format: 'date-time' })),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
});

/**
 * Register thread routes
 */
export const registerThreadRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /api/v1/messages/:messageId/thread - Create a new thread
   */
  fastify.post<{
    Params: { messageId: string };
  }>(
    '/messages/:messageId/thread',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: ThreadInfoResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;

        // Check if message exists and user has access
        const message = await messageRepository.findById(messageId);
        if (!message) {
          throw new NotFoundError('Message not found');
        }

        // Check channel access (assuming message has channel_id)
        // This would be handled by requireChannelAccess middleware in a real implementation

        // Create the thread
        const threadStats = await threadRepository.createThread(
          messageId,
          request.user!.userId
        );

        // Get full thread details
        const threadDetails = await threadRepository.getThreadWithDetails(messageId);

        // Clear cache
        await cacheService.messages.delete(CacheKeyUtils.channelMessagesKey(message.channel_id));

        // Broadcast thread creation
        await WebSocketUtils.sendToChannel(message.channel_id, 'thread_created', {
          type: 'thread_created',
          threadRootId: messageId,
          channelId: message.channel_id,
          createdBy: request.user!.userId,
          userName: request.user!.name,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            threadRootId: messageId,
          },
          'Thread created successfully'
        );

        reply.code(201).send({
          success: true,
          data: threadDetails,
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
        loggers.api.error({ error, context }, 'Failed to create thread');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to create thread',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /api/v1/messages/:messageId/thread - Get thread info and statistics
   */
  fastify.get<{
    Params: { messageId: string };
  }>(
    '/messages/:messageId/thread',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: ThreadInfoResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;

        // Get thread details
        const threadDetails = await threadRepository.getThreadWithDetails(messageId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            replyCount: threadDetails.reply_count,
          },
          'Thread details retrieved'
        );

        reply.send({
          success: true,
          data: threadDetails,
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
        loggers.api.error({ error, context }, 'Failed to get thread details');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to get thread details',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /api/v1/messages/:messageId/thread/replies - Get thread replies
   */
  fastify.get<{
    Params: { messageId: string };
    Querystring: typeof PaginationSchema.static;
  }>(
    '/messages/:messageId/thread/replies',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        querystring: PaginationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              thread_root_id: UUIDSchema,
              replies: Type.Array(ThreadReplyResponseSchema),
              pagination: Type.Object({
                total: Type.Integer(),
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
        const { messageId } = request.params;
        const { limit = 50, offset = 0 } = request.query;

        // Get thread replies
        const { replies, total } = await threadRepository.getThreadReplies(
          messageId,
          Math.min(limit, 100),
          offset
        );

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            repliesCount: replies.length,
            total,
          },
          'Thread replies retrieved'
        );

        reply.send({
          success: true,
          data: {
            thread_root_id: messageId,
            replies,
            pagination: {
              total,
              limit,
              offset,
              has_more: offset + limit < total,
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
        loggers.api.error({ error, context }, 'Failed to get thread replies');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to get thread replies',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /api/v1/messages/:messageId/thread/replies - Add reply to thread
   */
  fastify.post<{
    Params: { messageId: string };
    Body: typeof ThreadReplySchema.static;
  }>(
    '/messages/:messageId/thread/replies',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          messageId: UUIDSchema,
        }),
        body: ThreadReplySchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: ThreadReplyResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const replyData = request.body;

        // Check if thread exists
        const threadStats = await threadRepository.getThreadStatistics(messageId);

        // Add reply to thread
        const threadReply = await threadRepository.addThreadReply(messageId, {
          content: replyData.content,
          user_id: request.user!.userId,
          message_type: replyData.message_type || 'text',
          attachments: replyData.attachments || [],
          reply_to_id: replyData.reply_to_id,
        });

        // Get the root message for channel info
        const rootMessage = await messageRepository.findById(messageId);

        // Clear cache
        if (rootMessage) {
          await cacheService.messages.delete(CacheKeyUtils.channelMessagesKey(rootMessage.channel_id));
        }

        // Broadcast thread reply
        if (rootMessage) {
          await WebSocketUtils.sendToChannel(rootMessage.channel_id, 'thread_reply', {
            type: 'thread_reply',
            threadRootId: messageId,
            replyId: threadReply.id,
            channelId: rootMessage.channel_id,
            userId: request.user!.userId,
            userName: request.user!.name,
            content: replyData.content,
            timestamp: new Date().toISOString(),
          });
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
            replyId: threadReply.id,
          },
          'Thread reply added successfully'
        );

        reply.code(201).send({
          success: true,
          data: threadReply,
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
        loggers.api.error({ error, context }, 'Failed to add thread reply');

        if (error instanceof NotFoundError || error instanceof ValidationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to add thread reply',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /api/v1/messages/:messageId/thread - Delete entire thread
   */
  fastify.delete<{
    Params: { messageId: string };
  }>(
    '/messages/:messageId/thread',
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

        // Check if user can delete thread (thread owner or CEO)
        const rootMessage = await messageRepository.findById(messageId);
        if (!rootMessage) {
          throw new NotFoundError('Thread not found');
        }

        const canDelete = rootMessage.user_id === request.user!.userId || 
                         request.user!.role === 'ceo';

        if (!canDelete) {
          throw new AuthorizationError('You can only delete your own threads');
        }

        // Delete the thread
        const success = await threadRepository.deleteThread(
          messageId,
          request.user!.userId
        );

        if (!success) {
          throw new NotFoundError('Thread not found');
        }

        // Clear cache
        await cacheService.messages.delete(CacheKeyUtils.channelMessagesKey(rootMessage.channel_id));

        // Broadcast thread deletion
        await WebSocketUtils.sendToChannel(rootMessage.channel_id, 'thread_deleted', {
          type: 'thread_deleted',
          threadRootId: messageId,
          channelId: rootMessage.channel_id,
          deletedBy: request.user!.userId,
          userName: request.user!.name,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            messageId,
          },
          'Thread deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Thread deleted successfully',
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
        loggers.api.error({ error, context }, 'Failed to delete thread');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to delete thread',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );
};