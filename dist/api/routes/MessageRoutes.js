"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMessageRoutes = void 0;
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
 * Channel Message Management API Routes
 * Enterprise-grade messaging system with real-time updates
 */
// Request/Response Schemas
const SendMessageSchema = typebox_1.Type.Object({
    content: typebox_1.Type.String({ minLength: 1, maxLength: 4000 }),
    message_type: typebox_1.Type.Optional(typebox_1.Type.Union([
        typebox_1.Type.Literal('text'),
        typebox_1.Type.Literal('voice'),
        typebox_1.Type.Literal('file'),
        typebox_1.Type.Literal('system'),
    ])),
    reply_to: typebox_1.Type.Optional(validation_1.UUIDSchema),
    thread_root: typebox_1.Type.Optional(validation_1.UUIDSchema),
    mentions: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.UUIDSchema)),
    attachments: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
        file_id: validation_1.UUIDSchema,
        filename: typebox_1.Type.String(),
        file_type: typebox_1.Type.String(),
        file_size: typebox_1.Type.Integer(),
    }))),
    voice_data: typebox_1.Type.Optional(typebox_1.Type.Object({
        duration: typebox_1.Type.Number(),
        transcript: typebox_1.Type.Optional(typebox_1.Type.String()),
        voice_file_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    })),
    metadata: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
});
const UpdateMessageSchema = typebox_1.Type.Object({
    content: typebox_1.Type.String({ minLength: 1, maxLength: 4000 }),
});
const MessageResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    channel_id: validation_1.UUIDSchema,
    task_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    user_id: validation_1.UUIDSchema,
    user_name: typebox_1.Type.String(),
    user_avatar: typebox_1.Type.Optional(typebox_1.Type.String()),
    content: typebox_1.Type.String(),
    message_type: typebox_1.Type.String(),
    voice_data: typebox_1.Type.Optional(typebox_1.Type.Any()),
    transcription: typebox_1.Type.Optional(typebox_1.Type.String()),
    attachments: typebox_1.Type.Array(typebox_1.Type.Any()),
    reply_to: typebox_1.Type.Optional(validation_1.UUIDSchema),
    thread_root: typebox_1.Type.Optional(validation_1.UUIDSchema),
    is_edited: typebox_1.Type.Boolean(),
    is_pinned: typebox_1.Type.Boolean(),
    is_announcement: typebox_1.Type.Boolean(),
    reactions: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any()),
    mentions: typebox_1.Type.Array(validation_1.UUIDSchema),
    ai_generated: typebox_1.Type.Boolean(),
    ai_context: typebox_1.Type.Optional(typebox_1.Type.Any()),
    command_execution_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    metadata: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any()),
    reply_count: typebox_1.Type.Optional(typebox_1.Type.Integer()),
    last_reply_timestamp: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
    edited_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
});
/**
 * Message service with caching
 */
class MessageService {
    async getMessageById(messageId) {
        return await index_1.messageRepository.findById(messageId);
    }
    async createMessage(messageData) {
        return await index_1.messageRepository.createMessage(messageData);
    }
    async updateMessage(messageId, updateData) {
        return await index_1.messageRepository.updateMessage(messageId, updateData);
    }
}
__decorate([
    (0, cache_decorators_1.Cacheable)({
        ttl: 300, // 5 minutes
        namespace: 'messages',
        keyGenerator: (messageId) => cache_decorators_1.CacheKeyUtils.messageKey(messageId),
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MessageService.prototype, "getMessageById", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        keys: (channelId) => [cache_decorators_1.CacheKeyUtils.channelMessagesKey(channelId)],
        namespace: 'messages',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessageService.prototype, "createMessage", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        keys: (messageId, channelId) => [
            cache_decorators_1.CacheKeyUtils.messageKey(messageId),
            cache_decorators_1.CacheKeyUtils.channelMessagesKey(channelId),
        ],
        namespace: 'messages',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MessageService.prototype, "updateMessage", null);
const messageService = new MessageService();
/**
 * Register message routes
 */
const registerMessageRoutes = async (fastify) => {
    /**
     * GET /channels/:channelId/messages - Get channel messages
     */
    fastify.get('/channels/:channelId/messages', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    thread_root: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    search: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 200 })),
                    message_type: typebox_1.Type.Optional(typebox_1.Type.String()),
                    before: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                    after: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(MessageResponseSchema),
                    pagination: typebox_1.Type.Object({
                        total: typebox_1.Type.Integer(),
                        limit: typebox_1.Type.Integer(),
                        offset: typebox_1.Type.Integer(),
                        hasMore: typebox_1.Type.Boolean(),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            const { limit = 50, offset = 0, thread_root, search, message_type, before, after, } = request.query;
            // Build filters
            const filters = {
                channelId,
                threadRoot: thread_root,
                messageType: message_type,
                before: before ? new Date(before) : undefined,
                after: after ? new Date(after) : undefined,
            };
            let messages = [];
            let total = 0;
            if (search) {
                // Search messages
                messages = await index_1.messageRepository.searchMessages(channelId, search, Math.min(limit, 100), offset);
                total = messages.length; // Approximation
            }
            else {
                // Get messages with filters
                messages = await index_1.messageRepository.findChannelMessages(channelId, filters, Math.min(limit, 100), offset);
                total = await index_1.messageRepository.getChannelMessageCount(channelId, filters);
            }
            // Update last read for user
            await index_1.messageRepository.updateLastRead(channelId, request.user.userId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageCount: messages.length,
                filters,
            }, 'Channel messages retrieved');
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
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel messages');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve messages',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * POST /channels/:channelId/messages - Send message
     */
    fastify.post('/channels/:channelId/messages', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            body: SendMessageSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: MessageResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            const messageData = {
                ...request.body,
                channel_id: channelId,
                user_id: request.user.userId,
                message_type: request.body.message_type || 'text',
                attachments: request.body.attachments || [],
                mentions: request.body.mentions || [],
                metadata: request.body.metadata || {},
                ai_generated: false,
            };
            const message = await messageService.createMessage(messageData);
            // Update channel activity
            await index_1.channelRepository.updateActivity(channelId);
            // Determine if this is a thread message
            const isThreadReply = message.reply_to && message.thread_root;
            // Broadcast message to channel members with thread context
            await utils_1.WebSocketUtils.sendToChannel(channelId, 'message_sent', {
                type: 'message_sent',
                channelId,
                messageId: message.id,
                isThreadReply,
                threadRoot: message.thread_root,
                replyTo: message.reply_to,
                message: {
                    id: message.id,
                    channel_id: message.channel_id,
                    user_id: message.user_id,
                    user_name: request.user.name,
                    user_email: request.user.email,
                    user_avatar: undefined, // Avatar not available in token payload
                    user_role: request.user.role,
                    content: message.content,
                    message_type: message.message_type,
                    voice_data: message.voice_data,
                    transcription: message.transcription,
                    attachments: message.attachments,
                    reply_to: message.reply_to,
                    thread_root: message.thread_root,
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
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            // If this is a thread reply, also send a separate thread-specific event
            if (isThreadReply) {
                await utils_1.WebSocketUtils.sendToChannel(channelId, 'thread_reply_sent', {
                    type: 'thread_reply_sent',
                    channelId,
                    threadRoot: message.thread_root,
                    parentMessageId: message.reply_to,
                    messageId: message.id,
                    message: {
                        id: message.id,
                        channel_id: message.channel_id,
                        user_id: message.user_id,
                        user_name: request.user.name,
                        user_email: request.user.email,
                        user_avatar: undefined, // Avatar not available in token payload
                        user_role: request.user.role,
                        content: message.content,
                        message_type: message.message_type,
                        voice_data: message.voice_data,
                        transcription: message.transcription,
                        attachments: message.attachments,
                        reply_to: message.reply_to,
                        thread_root: message.thread_root,
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
                    userId: request.user.userId,
                    userName: request.user.name,
                    userRole: request.user.role,
                    timestamp: new Date().toISOString(),
                });
            }
            // Send mention notifications
            if (message.mentions.length > 0) {
                for (const mentionedUserId of message.mentions) {
                    if (mentionedUserId !== request.user.userId) {
                        await utils_1.WebSocketUtils.createAndSendNotification(mentionedUserId, {
                            title: 'You were mentioned',
                            message: `${request.user.name} mentioned you in ${channelId}`,
                            category: 'mention',
                            priority: 'medium',
                            actionUrl: `/channels/${channelId}`,
                            actionText: 'View Message',
                            data: {
                                channelId,
                                messageId: message.id,
                                mentionedBy: request.user.userId,
                            },
                        });
                    }
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageId: message.id,
                messageType: message.message_type,
                mentionsCount: message.mentions.length,
                attachmentsCount: message.attachments.length,
            }, 'Message sent successfully');
            reply.code(201).send({
                success: true,
                data: message,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to send message');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to send message',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * PUT /channels/:channelId/messages/:messageId - Edit message
     */
    fastify.put('/channels/:channelId/messages/:messageId', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
                messageId: validation_1.UUIDSchema,
            }),
            body: UpdateMessageSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: MessageResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId, messageId } = request.params;
            const { content } = request.body;
            // Check if user can edit this message
            const existingMessage = await index_1.messageRepository.findById(messageId);
            if (!existingMessage) {
                throw new errors_1.NotFoundError('Message not found');
            }
            if (existingMessage.user_id !== request.user.userId && request.user.role !== 'ceo') {
                throw new errors_1.AuthorizationError('You can only edit your own messages');
            }
            // Check if message is too old to edit (24 hours)
            const messageAge = Date.now() - new Date(existingMessage.created_at).getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            if (messageAge > twentyFourHours && request.user.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Messages older than 24 hours cannot be edited');
            }
            const message = await messageService.updateMessage(messageId, {
                content,
                is_edited: true,
                edited_at: new Date(),
            });
            // Broadcast message edit
            await utils_1.WebSocketUtils.sendToChannel(channelId, 'message_updated', {
                type: 'message_updated',
                channelId,
                messageId,
                message: message,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageId,
            }, 'Message edited successfully');
            reply.send({
                success: true,
                data: message,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to edit message');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to edit message',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /channels/:channelId/messages/:messageId - Delete message
     */
    fastify.delete('/channels/:channelId/messages/:messageId', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
                messageId: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId, messageId } = request.params;
            // Check if user can delete this message
            const existingMessage = await index_1.messageRepository.findById(messageId);
            if (!existingMessage) {
                throw new errors_1.NotFoundError('Message not found');
            }
            const canDelete = existingMessage.user_id === request.user.userId ||
                request.user.role === 'ceo';
            if (!canDelete) {
                throw new errors_1.AuthorizationError('You can only delete your own messages');
            }
            const success = await index_1.messageRepository.softDelete(messageId, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Clear message cache
            await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.messageKey(messageId));
            // Broadcast message deletion
            await utils_1.WebSocketUtils.sendToChannel(channelId, 'message_deleted', {
                type: 'message_deleted',
                channelId,
                messageId,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageId,
            }, 'Message deleted successfully');
            reply.send({
                success: true,
                message: 'Message deleted successfully',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to delete message');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete message',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /channels/:channelId/messages/:messageId/reactions - Add reaction
     */
    fastify.post('/channels/:channelId/messages/:messageId/reactions', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
                messageId: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                emoji: typebox_1.Type.String({ minLength: 1, maxLength: 10 }),
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId, messageId } = request.params;
            const { emoji } = request.body;
            const success = await index_1.messageRepository.addReaction(messageId, request.user.userId, emoji);
            if (!success) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Broadcast reaction
            await utils_1.WebSocketUtils.sendToChannel(channelId, 'message_reaction_added', {
                type: 'message_reaction_added',
                channelId,
                messageId,
                emoji,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            reply.send({
                success: true,
                message: 'Reaction added successfully',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error }, 'Failed to add reaction');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to add reaction',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /channels/:channelId/messages/:messageId/thread - Get thread messages
     */
    fastify.get('/channels/:channelId/messages/:messageId/thread', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
                messageId: validation_1.UUIDSchema,
            }),
            querystring: validation_1.PaginationSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        parentMessage: MessageResponseSchema,
                        replies: typebox_1.Type.Array(MessageResponseSchema),
                        pagination: typebox_1.Type.Object({
                            total: typebox_1.Type.Integer(),
                            limit: typebox_1.Type.Integer(),
                            offset: typebox_1.Type.Integer(),
                            hasMore: typebox_1.Type.Boolean(),
                        }),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId, messageId } = request.params;
            const { limit = 50, offset = 0 } = request.query;
            // Get the parent message
            const parentMessage = await index_1.messageRepository.findById(messageId);
            if (!parentMessage) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Get thread root - if this message is itself a reply, get its root
            const threadRoot = parentMessage.thread_root || messageId;
            // Get all replies to this thread
            const replies = await index_1.messageRepository.findChannelMessages(channelId, { threadRoot }, Math.min(limit, 100), offset);
            // Filter out the parent message from replies if it's included
            const threadReplies = replies.filter(msg => msg.id !== threadRoot);
            const total = await index_1.messageRepository.getChannelMessageCount(channelId, { threadRoot });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageId,
                threadRoot,
                repliesCount: threadReplies.length,
            }, 'Thread messages retrieved');
            reply.send({
                success: true,
                data: {
                    parentMessage,
                    replies: threadReplies,
                    pagination: {
                        total: total - 1, // Exclude parent message from count
                        limit,
                        offset,
                        hasMore: offset + limit < total - 1,
                    },
                },
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve thread messages');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to retrieve thread messages',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /channels/:channelId/messages/:messageId/pin - Pin/Unpin message
     */
    fastify.post('/channels/:channelId/messages/:messageId/pin', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
                messageId: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                pinned: typebox_1.Type.Boolean(),
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId, messageId } = request.params;
            const { pinned } = request.body;
            // Only channel admins/owners and CEO can pin messages
            // This would need channel member role checking
            if (request.user.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Only channel administrators can pin messages');
            }
            const success = await index_1.messageRepository.updateMessage(messageId, {
                is_pinned: pinned,
            });
            if (!success) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Broadcast pin status change
            await utils_1.WebSocketUtils.sendToChannel(channelId, 'message_pinned', {
                type: pinned ? 'message_pinned' : 'message_unpinned',
                channelId,
                messageId,
                pinned,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                messageId,
                pinned,
            }, `Message ${pinned ? 'pinned' : 'unpinned'} successfully`);
            reply.send({
                success: true,
                message: `Message ${pinned ? 'pinned' : 'unpinned'} successfully`,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
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
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to update message pin status');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update pin status',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
};
exports.registerMessageRoutes = registerMessageRoutes;
//# sourceMappingURL=MessageRoutes.js.map