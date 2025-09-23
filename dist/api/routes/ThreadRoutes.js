"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerThreadRoutes = void 0;
const typebox_1 = require("@sinclair/typebox");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const middleware_1 = require("@auth/middleware");
const CacheService_1 = require("../../services/CacheService");
const cache_decorators_1 = require("@utils/cache-decorators");
const utils_1 = require("@websocket/utils");
const validation_1 = require("@utils/validation");
/**
 * Thread Management API Routes
 * Enterprise-grade threaded messaging system
 */
// Request/Response Schemas
const CreateThreadSchema = typebox_1.Type.Object({
// Thread is created automatically when first reply is added
});
const ThreadReplySchema = typebox_1.Type.Object({
    content: typebox_1.Type.String({ minLength: 1, maxLength: 4000 }),
    message_type: typebox_1.Type.Optional(typebox_1.Type.Union([
        typebox_1.Type.Literal('text'),
        typebox_1.Type.Literal('voice'),
        typebox_1.Type.Literal('file'),
    ])),
    attachments: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
        file_id: validation_1.UUIDSchema,
        filename: typebox_1.Type.String(),
        file_type: typebox_1.Type.String(),
        file_size: typebox_1.Type.Integer(),
    }))),
    reply_to_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    metadata: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
});
const ThreadInfoResponseSchema = typebox_1.Type.Object({
    thread_root_id: validation_1.UUIDSchema,
    thread_root: typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        content: typebox_1.Type.String(),
        user_details: typebox_1.Type.Object({
            id: validation_1.UUIDSchema,
            name: typebox_1.Type.String(),
            email: typebox_1.Type.String(),
            avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
            role: typebox_1.Type.String(),
            phone: typebox_1.Type.Optional(typebox_1.Type.String()),
        }),
        created_at: typebox_1.Type.String({ format: 'date-time' }),
        reactions: typebox_1.Type.Array(typebox_1.Type.Object({
            emoji: typebox_1.Type.String(),
            count: typebox_1.Type.Integer(),
            users: typebox_1.Type.Array(typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
                name: typebox_1.Type.String(),
                avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
            })),
        })),
    }),
    reply_count: typebox_1.Type.Integer(),
    participant_count: typebox_1.Type.Integer(),
    last_reply_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    last_reply_by_details: typebox_1.Type.Optional(typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        name: typebox_1.Type.String(),
        avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
    })),
    participant_details: typebox_1.Type.Array(typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        name: typebox_1.Type.String(),
        email: typebox_1.Type.String(),
        avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
        role: typebox_1.Type.String(),
    })),
});
const ThreadReplyResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    content: typebox_1.Type.String(),
    user_id: validation_1.UUIDSchema,
    user_details: typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        name: typebox_1.Type.String(),
        email: typebox_1.Type.String(),
        avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
        role: typebox_1.Type.String(),
        phone: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
    thread_root_id: validation_1.UUIDSchema,
    reply_to_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    message_type: typebox_1.Type.String(),
    attachments: typebox_1.Type.Array(typebox_1.Type.Any()),
    reactions: typebox_1.Type.Array(typebox_1.Type.Object({
        emoji: typebox_1.Type.String(),
        count: typebox_1.Type.Integer(),
        users: typebox_1.Type.Array(typebox_1.Type.Object({
            id: validation_1.UUIDSchema,
            name: typebox_1.Type.String(),
            avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
        })),
    })),
    is_edited: typebox_1.Type.Boolean(),
    edited_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
});
/**
 * Register thread routes
 */
const registerThreadRoutes = async (fastify) => {
    /**
     * POST /api/v1/messages/:messageId/thread - Create a new thread
     */
    fastify.post('/messages/:messageId/thread', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ThreadInfoResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            // Check if message exists and user has access
            const message = await index_1.messageRepository.findById(messageId);
            if (!message) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Check channel access (assuming message has channel_id)
            // This would be handled by requireChannelAccess middleware in a real implementation
            // Create the thread
            const threadStats = await index_1.threadRepository.createThread(messageId, request.user.userId);
            // Get full thread details
            const threadDetails = await index_1.threadRepository.getThreadWithDetails(messageId);
            // Clear cache
            await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.channelMessagesKey(message.channel_id));
            // Broadcast thread creation
            await utils_1.WebSocketUtils.sendToChannel(message.channel_id, 'thread_created', {
                type: 'thread_created',
                threadRootId: messageId,
                channelId: message.channel_id,
                createdBy: request.user.userId,
                userName: request.user.name,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                threadRootId: messageId,
            }, 'Thread created successfully');
            reply.code(201).send({
                success: true,
                data: threadDetails,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to create thread');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create thread',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /api/v1/messages/:messageId/thread - Get thread info and statistics
     */
    fastify.get('/messages/:messageId/thread', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ThreadInfoResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            // Get thread details
            const threadDetails = await index_1.threadRepository.getThreadWithDetails(messageId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                replyCount: threadDetails.reply_count,
            }, 'Thread details retrieved');
            reply.send({
                success: true,
                data: threadDetails,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to get thread details');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to get thread details',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /api/v1/messages/:messageId/thread/replies - Get thread replies
     */
    fastify.get('/messages/:messageId/thread/replies', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            querystring: validation_1.PaginationSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        thread_root_id: validation_1.UUIDSchema,
                        replies: typebox_1.Type.Array(ThreadReplyResponseSchema),
                        pagination: typebox_1.Type.Object({
                            total: typebox_1.Type.Integer(),
                            limit: typebox_1.Type.Integer(),
                            offset: typebox_1.Type.Integer(),
                            has_more: typebox_1.Type.Boolean(),
                        }),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            const { limit = 50, offset = 0 } = request.query;
            // Get thread replies
            const { replies, total } = await index_1.threadRepository.getThreadReplies(messageId, Math.min(limit, 100), offset);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                repliesCount: replies.length,
                total,
            }, 'Thread replies retrieved');
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
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to get thread replies');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to get thread replies',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /api/v1/messages/:messageId/thread/replies - Add reply to thread
     */
    fastify.post('/messages/:messageId/thread/replies', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            body: ThreadReplySchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ThreadReplyResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            const replyData = request.body;
            // Check if thread exists
            const threadStats = await index_1.threadRepository.getThreadStatistics(messageId);
            // Add reply to thread
            const threadReply = await index_1.threadRepository.addThreadReply(messageId, {
                content: replyData.content,
                user_id: request.user.userId,
                message_type: replyData.message_type || 'text',
                attachments: replyData.attachments || [],
                reply_to_id: replyData.reply_to_id,
            });
            // Get the root message for channel info
            const rootMessage = await index_1.messageRepository.findById(messageId);
            // Clear cache
            if (rootMessage) {
                await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.channelMessagesKey(rootMessage.channel_id));
            }
            // Broadcast thread reply
            if (rootMessage) {
                await utils_1.WebSocketUtils.sendToChannel(rootMessage.channel_id, 'thread_reply', {
                    type: 'thread_reply',
                    threadRootId: messageId,
                    replyId: threadReply.id,
                    channelId: rootMessage.channel_id,
                    userId: request.user.userId,
                    userName: request.user.name,
                    content: replyData.content,
                    timestamp: new Date().toISOString(),
                });
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                replyId: threadReply.id,
            }, 'Thread reply added successfully');
            reply.code(201).send({
                success: true,
                data: threadReply,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to add thread reply');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.ValidationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to add thread reply',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /api/v1/messages/:messageId/thread - Delete entire thread
     */
    fastify.delete('/messages/:messageId/thread', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            // Check if user can delete thread (thread owner or CEO)
            const rootMessage = await index_1.messageRepository.findById(messageId);
            if (!rootMessage) {
                throw new errors_1.NotFoundError('Thread not found');
            }
            const canDelete = rootMessage.user_id === request.user.userId ||
                request.user.role === 'ceo';
            if (!canDelete) {
                throw new errors_1.AuthorizationError('You can only delete your own threads');
            }
            // Delete the thread
            const success = await index_1.threadRepository.deleteThread(messageId, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('Thread not found');
            }
            // Clear cache
            await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.channelMessagesKey(rootMessage.channel_id));
            // Broadcast thread deletion
            await utils_1.WebSocketUtils.sendToChannel(rootMessage.channel_id, 'thread_deleted', {
                type: 'thread_deleted',
                threadRootId: messageId,
                channelId: rootMessage.channel_id,
                deletedBy: request.user.userId,
                userName: request.user.name,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
            }, 'Thread deleted successfully');
            reply.send({
                success: true,
                message: 'Thread deleted successfully',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to delete thread');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete thread',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
};
exports.registerThreadRoutes = registerThreadRoutes;
//# sourceMappingURL=ThreadRoutes.js.map