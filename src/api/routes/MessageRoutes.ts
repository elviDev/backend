import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { messageRepository, channelRepository, threadRepository, reactionRepository } from '@db/index';
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
import { Cacheable, CacheEvict, CacheKeyUtils } from '@utils/cache-decorators';
import { WebSocketUtils } from '@websocket/utils';
import {
  UUIDSchema,
  PaginationSchema,
  SuccessResponseSchema,
} from '@utils/validation';

/**
 * Channel Message Management API Routes
 * Enterprise-grade messaging system with real-time updates
 */

// Request/Response Schemas
const SendMessageSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 4000 }),
  message_type: Type.Optional(
    Type.Union([
      Type.Literal('text'),
      Type.Literal('voice'),
      Type.Literal('file'),
      Type.Literal('system'),
    ])
  ),
  reply_to_id: Type.Optional(UUIDSchema),
  thread_root_id: Type.Optional(UUIDSchema),
  mentions: Type.Optional(Type.Array(UUIDSchema)),
  attachments: Type.Optional(Type.Array(Type.Object({
    file_id: UUIDSchema,
    filename: Type.String(),
    file_type: Type.String(),
    file_size: Type.Integer(),
  }))),
  voice_data: Type.Optional(Type.Object({
    duration: Type.Number(),
    transcript: Type.Optional(Type.String()),
    voice_file_id: Type.Optional(UUIDSchema),
  })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const UpdateMessageSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 4000 }),
});

const MessageResponseSchema = Type.Object({
  id: UUIDSchema,
  channel_id: UUIDSchema,
  task_id: Type.Optional(UUIDSchema),
  user_id: UUIDSchema,
  user_details: Type.Object({
    id: UUIDSchema,
    name: Type.String(),
    email: Type.String(),
    avatar_url: Type.Optional(Type.String()),
    role: Type.String(),
    phone: Type.Optional(Type.String()),
  }),
  content: Type.String(),
  message_type: Type.String(),
  voice_data: Type.Optional(Type.Any()),
  transcription: Type.Optional(Type.String()),
  attachments: Type.Array(Type.Any()),
  reply_to_id: Type.Optional(UUIDSchema),
  thread_root_id: Type.Optional(UUIDSchema),
  is_edited: Type.Boolean(),
  is_pinned: Type.Boolean(),
  is_announcement: Type.Boolean(),
  reactions: Type.Array(Type.Object({
    emoji: Type.String(),
    count: Type.Integer(),
    users: Type.Array(Type.Object({
      id: UUIDSchema,
      name: Type.String(),
      avatar_url: Type.Optional(Type.String()),
    })),
  })),
  thread_info: Type.Optional(Type.Object({
    reply_count: Type.Integer(),
    participant_count: Type.Integer(),
    last_reply_at: Type.Optional(Type.String({ format: 'date-time' })),
    last_reply_by_details: Type.Optional(Type.Object({
      id: UUIDSchema,
      name: Type.String(),
      avatar_url: Type.Optional(Type.String()),
    })),
  })),
  mentions: Type.Array(UUIDSchema),
  ai_generated: Type.Boolean(),
  ai_context: Type.Optional(Type.Any()),
  command_execution_id: Type.Optional(UUIDSchema),
  metadata: Type.Record(Type.String(), Type.Any()),
  reply_count: Type.Optional(Type.Integer()),
  last_reply_timestamp: Type.Optional(Type.String({ format: 'date-time' })),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
  edited_at: Type.Optional(Type.String({ format: 'date-time' })),
});

/**
 * Message service with caching
 */
class MessageService {
  @Cacheable({
    ttl: 300, // 5 minutes
    namespace: 'messages',
    keyGenerator: (messageId: string) => CacheKeyUtils.messageKey(messageId),
  })
  async getMessageById(messageId: string) {
    return await messageRepository.findById(messageId);
  }

  @CacheEvict({
    keys: (channelId: string) => [CacheKeyUtils.channelMessagesKey(channelId)],
    namespace: 'messages',
  })
  async createMessage(messageData: any) {
    return await messageRepository.createMessage(messageData);
  }

  @CacheEvict({
    keys: (messageId: string, channelId: string) => [
      CacheKeyUtils.messageKey(messageId),
      CacheKeyUtils.channelMessagesKey(channelId),
    ],
    namespace: 'messages',
  })
  async updateMessage(messageId: string, updateData: any) {
    return await messageRepository.updateMessage(messageId, updateData);
  }
}

const messageService = new MessageService();

/**
 * Register message routes
 */
export const registerMessageRoutes = async (fastify: FastifyInstance) => {
  /**
   * GET /channels/:channelId/messages - Get channel messages
   */
  fastify.get<{
    Params: { channelId: string };
    Querystring: typeof PaginationSchema.static & {
      thread_root?: string;
      search?: string;
      message_type?: string;
      before?: string;
      after?: string;
    };
  }>(
    '/channels/:channelId/messages',
    {
      preHandler: [authenticate, requireChannelAccess, apiRateLimit],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            thread_root_id: Type.Optional(UUIDSchema),
            search: Type.Optional(Type.String({ maxLength: 200 })),
            message_type: Type.Optional(Type.String()),
            before: Type.Optional(Type.String({ format: 'date-time' })),
            after: Type.Optional(Type.String({ format: 'date-time' })),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(MessageResponseSchema),
            pagination: Type.Object({
              total: Type.Integer(),
              limit: Type.Integer(),
              offset: Type.Integer(),
              hasMore: Type.Boolean(),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;
        const {
          limit = 50,
          offset = 0,
          thread_root,
          search,
          message_type,
          before,
          after,
        } = request.query;

        // Build filters
        const filters: any = {
          channelId,
          threadRootId: thread_root,
          messageType: message_type,
          before: before ? new Date(before) : undefined,
          after: after ? new Date(after) : undefined,
        };

        let messages: any[] = [];
        let total = 0;

        if (search) {
          // Search messages
          messages = await messageRepository.searchMessages(
            channelId,
            search,
            Math.min(limit, 100),
            offset
          );
          total = messages.length; // Approximation
        } else {
          // Get messages with filters
          messages = await messageRepository.findChannelMessages(
            channelId,
            filters,
            Math.min(limit, 100),
            offset
          );
          total = await messageRepository.getChannelMessageCount(channelId, filters);
        }

        // Update last read for user
        await messageRepository.updateLastRead(channelId, request.user!.userId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageCount: messages.length,
            filters,
          },
          'Channel messages retrieved'
        );

        reply.send({
          success: true,
          data: messages,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to retrieve channel messages');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve messages',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * POST /channels/:channelId/messages - Send message
   */
  fastify.post<{
    Params: { channelId: string };
    Body: typeof SendMessageSchema.static;
  }>(
    '/channels/:channelId/messages',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        body: SendMessageSchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: MessageResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;
        const messageData = {
          ...request.body,
          channel_id: channelId,
          user_id: request.user!.userId,
          message_type: request.body.message_type || 'text',
          attachments: request.body.attachments || [],
          mentions: request.body.mentions || [],
          metadata: request.body.metadata || {},
          ai_generated: false,
        };

        const message = await messageService.createMessage(messageData);

        // Update channel activity
        await channelRepository.updateActivity(channelId);

        // Determine if this is a thread message
        const isThreadReply = message.reply_to_id && message.thread_root_id;
        
        // Broadcast message to channel members with thread context
        await WebSocketUtils.sendToChannel(channelId, 'message_sent', {
          type: 'message_sent',
          channelId,
          messageId: message.id,
          isThreadReply,
          threadRootId: message.thread_root_id,
          replyToId: message.reply_to_id,
          message: {
            id: message.id,
            channel_id: message.channel_id,
            user_id: message.user_id,
            user_name: request.user!.name,
            user_email: request.user!.email,
            user_avatar: undefined, // Avatar not available in token payload
            user_role: request.user!.role,
            content: message.content,
            message_type: message.message_type,
            voice_data: message.voice_data,
            transcription: message.transcription,
            attachments: message.attachments,
            reply_to_id: message.reply_to_id,
            thread_root_id: message.thread_root_id,
            is_edited: message.is_edited,
            is_pinned: message.is_pinned,
            is_announcement: message.is_announcement,
            reactions: message.reactions,
            mentions: message.mentions,
            ai_generated: message.ai_generated,
            ai_context: message.ai_context,
            command_execution_id: message.command_execution_id,
            metadata: message.metadata,
            formatting: message.formatting,
            created_at: message.created_at,
            updated_at: message.updated_at,
            edited_at: message.edited_at,
          },
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        // If this is a thread reply, also send a separate thread-specific event
        if (isThreadReply) {
          await WebSocketUtils.sendToChannel(channelId, 'thread_reply_sent', {
            type: 'thread_reply_sent',
            channelId,
            threadRootId: message.thread_root_id,
            parentMessageId: message.reply_to_id,
            messageId: message.id,
            message: {
              id: message.id,
              channel_id: message.channel_id,
              user_id: message.user_id,
              user_name: request.user!.name,
              user_email: request.user!.email,
              user_avatar: undefined, // Avatar not available in token payload
              user_role: request.user!.role,
              content: message.content,
              message_type: message.message_type,
              voice_data: message.voice_data,
              transcription: message.transcription,
              attachments: message.attachments,
              reply_to_id: message.reply_to_id,
              thread_root_id: message.thread_root_id,
              is_edited: message.is_edited,
              is_pinned: message.is_pinned,
              is_announcement: message.is_announcement,
              reactions: message.reactions,
              mentions: message.mentions,
              ai_generated: message.ai_generated,
              ai_context: message.ai_context,
              command_execution_id: message.command_execution_id,
              metadata: message.metadata,
              formatting: message.formatting,
              created_at: message.created_at,
              updated_at: message.updated_at,
              edited_at: message.edited_at,
            },
            userId: request.user!.userId,
            userName: request.user!.name,
            userRole: request.user!.role,
            timestamp: new Date().toISOString(),
          });
        }

        // Send mention notifications
        if (message.mentions.length > 0) {
          for (const mentionedUserId of message.mentions) {
            if (mentionedUserId !== request.user!.userId) {
              await WebSocketUtils.createAndSendNotification(mentionedUserId, {
                title: 'You were mentioned',
                message: `${request.user!.name} mentioned you in ${channelId}`,
                category: 'mention',
                priority: 'medium',
                actionUrl: `/channels/${channelId}`,
                actionText: 'View Message',
                data: {
                  channelId,
                  messageId: message.id,
                  mentionedBy: request.user!.userId,
                },
              });
            }
          }
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageId: message.id,
            messageType: message.message_type,
            mentionsCount: message.mentions.length,
            attachmentsCount: message.attachments.length,
          },
          'Message sent successfully'
        );

        reply.code(201).send({
          success: true,
          data: message,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to send message');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to send message',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * PUT /channels/:channelId/messages/:messageId - Edit message
   */
  fastify.put<{
    Params: { channelId: string; messageId: string };
    Body: typeof UpdateMessageSchema.static;
  }>(
    '/channels/:channelId/messages/:messageId',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
          messageId: UUIDSchema,
        }),
        body: UpdateMessageSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: MessageResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId, messageId } = request.params;
        const { content } = request.body;

        // Check if user can edit this message
        const existingMessage = await messageRepository.findById(messageId);
        if (!existingMessage) {
          throw new NotFoundError('Message not found');
        }

        if (existingMessage.user_id !== request.user!.userId && request.user!.role !== 'ceo') {
          throw new AuthorizationError('You can only edit your own messages');
        }

        // Check if message is too old to edit (24 hours)
        const messageAge = Date.now() - new Date(existingMessage.created_at).getTime();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (messageAge > twentyFourHours && request.user!.role !== 'ceo') {
          throw new AuthorizationError('Messages older than 24 hours cannot be edited');
        }

        const message = await messageService.updateMessage(messageId, {
          content,
          is_edited: true,
          edited_at: new Date(),
        });

        // Broadcast message edit
        await WebSocketUtils.sendToChannel(channelId, 'message_updated', {
          type: 'message_updated',
          channelId,
          messageId,
          message: message,
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageId,
          },
          'Message edited successfully'
        );

        reply.send({
          success: true,
          data: message,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to edit message');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to edit message',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /channels/:channelId/messages/:messageId - Delete message
   */
  fastify.delete<{
    Params: { channelId: string; messageId: string };
  }>(
    '/channels/:channelId/messages/:messageId',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
          messageId: UUIDSchema,
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId, messageId } = request.params;

        // Check if user can delete this message
        const existingMessage = await messageRepository.findById(messageId);
        if (!existingMessage) {
          throw new NotFoundError('Message not found');
        }

        const canDelete =
          existingMessage.user_id === request.user!.userId ||
          request.user!.role === 'ceo';

        if (!canDelete) {
          throw new AuthorizationError('You can only delete your own messages');
        }

        const success = await messageRepository.softDelete(messageId, request.user!.userId);
        if (!success) {
          throw new NotFoundError('Message not found');
        }

        // Clear message cache
        await cacheService.messages.delete(CacheKeyUtils.messageKey(messageId));

        // Broadcast message deletion
        await WebSocketUtils.sendToChannel(channelId, 'message_deleted', {
          type: 'message_deleted',
          channelId,
          messageId,
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageId,
          },
          'Message deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Message deleted successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to delete message');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to delete message',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );


  /**
   * GET /channels/:channelId/messages/:messageId/thread - Get thread messages
   */
  fastify.get<{
    Params: { channelId: string; messageId: string };
    Querystring: typeof PaginationSchema.static;
  }>(
    '/channels/:channelId/messages/:messageId/thread',
    {
      preHandler: [authenticate, requireChannelAccess, apiRateLimit],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
          messageId: UUIDSchema,
        }),
        querystring: PaginationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              parentMessage: MessageResponseSchema,
              replies: Type.Array(MessageResponseSchema),
              pagination: Type.Object({
                total: Type.Integer(),
                limit: Type.Integer(),
                offset: Type.Integer(),
                hasMore: Type.Boolean(),
              }),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId, messageId } = request.params;
        const { limit = 50, offset = 0 } = request.query;

        // Get the parent message with user details
        const parentMessage = await messageRepository.findByIdWithUser(messageId);
        if (!parentMessage) {
          throw new NotFoundError('Message not found');
        }

        // Get thread root - if this message is itself a reply, get its root
        const threadRootId = parentMessage.thread_root_id || messageId;

        // Use ThreadRepository for better thread management
        const { replies: threadReplies, total } = await threadRepository.getThreadReplies(
          threadRootId,
          Math.min(limit, 100),
          offset
        );

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageId,
            threadRootId,
            repliesCount: threadReplies.length,
          },
          'Thread messages retrieved'
        );

        reply.send({
          success: true,
          data: {
            parentMessage,
            replies: threadReplies,
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to retrieve thread messages');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to retrieve thread messages',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /channels/:channelId/messages/:messageId/pin - Pin/Unpin message
   */
  fastify.post<{
    Params: { channelId: string; messageId: string };
    Body: { pinned: boolean };
  }>(
    '/channels/:channelId/messages/:messageId/pin',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
          messageId: UUIDSchema,
        }),
        body: Type.Object({
          pinned: Type.Boolean(),
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId, messageId } = request.params;
        const { pinned } = request.body;

        // Only channel admins/owners and CEO can pin messages
        // This would need channel member role checking
        if (request.user!.role !== 'ceo') {
          throw new AuthorizationError('Only channel administrators can pin messages');
        }

        const success = await messageRepository.updateMessage(messageId, {
          is_pinned: pinned,
        });

        if (!success) {
          throw new NotFoundError('Message not found');
        }

        // Broadcast pin status change
        await WebSocketUtils.sendToChannel(channelId, 'message_pinned', {
          type: pinned ? 'message_pinned' : 'message_unpinned',
          channelId,
          messageId,
          pinned,
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            messageId,
            pinned,
          },
          `Message ${pinned ? 'pinned' : 'unpinned'} successfully`
        );

        reply.send({
          success: true,
          message: `Message ${pinned ? 'pinned' : 'unpinned'} successfully`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const context = createErrorContext({
          ...(request.user && {
            user: {
              id: request.user.id,
              email: request.user.email,
              role: request.user.role,
            },
          }),
          ip: request.ip,
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
        });
        loggers.api.error({ error, context }, 'Failed to update message pin status');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update pin status',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );
};