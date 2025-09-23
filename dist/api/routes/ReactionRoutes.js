"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReactionRoutes = void 0;
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
 * Message Reactions API Routes
 * Enterprise-grade emoji reaction system
 */
// Request/Response Schemas
const ReactionToggleSchema = typebox_1.Type.Object({
    emoji: typebox_1.Type.String({ minLength: 1, maxLength: 20 }),
});
const ReactionSummarySchema = typebox_1.Type.Object({
    emoji: typebox_1.Type.String(),
    count: typebox_1.Type.Integer(),
    users: typebox_1.Type.Array(typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        name: typebox_1.Type.String(),
        avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
    })),
});
const MessageReactionsResponseSchema = typebox_1.Type.Object({
    message_id: validation_1.UUIDSchema,
    reactions: typebox_1.Type.Array(ReactionSummarySchema),
    total_reactions: typebox_1.Type.Integer(),
    user_reactions: typebox_1.Type.Array(typebox_1.Type.String()),
});
const PopularReactionsResponseSchema = typebox_1.Type.Object({
    emoji: typebox_1.Type.String(),
    count: typebox_1.Type.Integer(),
    usage_percentage: typebox_1.Type.Number(),
});
const ChannelReactionStatsResponseSchema = typebox_1.Type.Object({
    channel_id: validation_1.UUIDSchema,
    total_reactions: typebox_1.Type.Integer(),
    unique_emojis: typebox_1.Type.Integer(),
    most_used_emoji: typebox_1.Type.Optional(typebox_1.Type.String()),
    top_reactors: typebox_1.Type.Array(typebox_1.Type.Object({
        user_id: validation_1.UUIDSchema,
        user_name: typebox_1.Type.String(),
        reaction_count: typebox_1.Type.Integer(),
    })),
});
const ReactionActivityResponseSchema = typebox_1.Type.Object({
    reaction: typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        message_id: validation_1.UUIDSchema,
        user_id: validation_1.UUIDSchema,
        emoji: typebox_1.Type.String(),
        created_at: typebox_1.Type.String({ format: 'date-time' }),
        user_details: typebox_1.Type.Object({
            id: validation_1.UUIDSchema,
            name: typebox_1.Type.String(),
            email: typebox_1.Type.String(),
            avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
            role: typebox_1.Type.String(),
        }),
    }),
    message: typebox_1.Type.Object({
        id: validation_1.UUIDSchema,
        content: typebox_1.Type.String(),
        channel_id: validation_1.UUIDSchema,
    }),
});
/**
 * Register reaction routes
 */
const registerReactionRoutes = async (fastify) => {
    /**
     * POST /api/v1/messages/:messageId/reactions - Toggle reaction on a message
     */
    fastify.post('/messages/:messageId/reactions', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            body: ReactionToggleSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        action: typebox_1.Type.Union([typebox_1.Type.Literal('added'), typebox_1.Type.Literal('removed')]),
                        message_id: validation_1.UUIDSchema,
                        emoji: typebox_1.Type.String(),
                        current_reactions: typebox_1.Type.Array(ReactionSummarySchema),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            const { emoji } = request.body;
            // Check if message exists and user has access
            const message = await index_1.messageRepository.findById(messageId);
            if (!message) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Toggle the reaction
            const result = await index_1.reactionRepository.toggleReaction(messageId, request.user.userId, emoji);
            // Get updated reactions for the message
            const currentReactions = await index_1.reactionRepository.getMessageReactions(messageId);
            // Clear cache
            await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.channelMessagesKey(message.channel_id));
            // Broadcast reaction change
            await utils_1.WebSocketUtils.sendToChannel(message.channel_id, 'reaction_toggled', {
                type: 'reaction_toggled',
                messageId,
                channelId: message.channel_id,
                userId: request.user.userId,
                userName: request.user.name,
                emoji,
                action: result.action,
                currentReactions,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                emoji,
                action: result.action,
            }, 'Message reaction toggled successfully');
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
            logger_1.loggers.api.error({ error, context }, 'Failed to toggle message reaction');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to toggle reaction',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /api/v1/messages/:messageId/reactions - Get all reactions for a message
     */
    fastify.get('/messages/:messageId/reactions', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                messageId: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: MessageReactionsResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { messageId } = request.params;
            // Check if message exists
            const message = await index_1.messageRepository.findById(messageId);
            if (!message) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Get message reactions
            const reactions = await index_1.reactionRepository.getMessageReactions(messageId);
            // Get user's reactions for this message
            const userReactions = await index_1.reactionRepository.getUserReactions(request.user.userId, [messageId]);
            const totalReactions = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
            const userReactionEmojis = userReactions.map(r => r.emoji);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                reactionsCount: reactions.length,
                totalReactions,
            }, 'Message reactions retrieved');
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
            logger_1.loggers.api.error({ error, context }, 'Failed to get message reactions');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to get message reactions',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /api/v1/messages/:messageId/reactions - Remove all reactions from a message
     */
    fastify.delete('/messages/:messageId/reactions', {
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
            // Check if message exists and user can delete reactions
            const message = await index_1.messageRepository.findById(messageId);
            if (!message) {
                throw new errors_1.NotFoundError('Message not found');
            }
            // Only message owner or CEO can remove all reactions
            const canDelete = message.user_id === request.user.userId ||
                request.user.role === 'ceo';
            if (!canDelete) {
                throw new errors_1.AuthorizationError('You can only remove reactions from your own messages');
            }
            // Remove all reactions
            const deletedCount = await index_1.reactionRepository.removeAllMessageReactions(messageId, request.user.userId);
            // Clear cache
            await CacheService_1.cacheService.messages.delete(cache_decorators_1.CacheKeyUtils.channelMessagesKey(message.channel_id));
            // Broadcast reaction removal
            await utils_1.WebSocketUtils.sendToChannel(message.channel_id, 'reactions_cleared', {
                type: 'reactions_cleared',
                messageId,
                channelId: message.channel_id,
                clearedBy: request.user.userId,
                userName: request.user.name,
                deletedCount,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                messageId,
                deletedCount,
            }, 'All message reactions removed successfully');
            reply.send({
                success: true,
                message: `Removed ${deletedCount} reactions successfully`,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to remove message reactions');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to remove reactions',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /api/v1/channels/:channelId/reactions/popular - Get popular reactions in a channel
     */
    fastify.get('/channels/:channelId/reactions/popular', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Object({
                limit: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 1, maximum: 50 })),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        channel_id: validation_1.UUIDSchema,
                        popular_reactions: typebox_1.Type.Array(PopularReactionsResponseSchema),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            const { limit = 10 } = request.query;
            // Get popular reactions
            const popularReactions = await index_1.reactionRepository.getPopularReactions(channelId, limit);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                reactionsCount: popularReactions.length,
            }, 'Popular reactions retrieved');
            reply.send({
                success: true,
                data: {
                    channel_id: channelId,
                    popular_reactions: popularReactions,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to get popular reactions');
            reply.code(500).send({
                error: {
                    message: 'Failed to get popular reactions',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /api/v1/channels/:channelId/reactions/stats - Get reaction statistics for a channel
     */
    fastify.get('/channels/:channelId/reactions/stats', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ChannelReactionStatsResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            // Get channel reaction statistics
            const stats = await index_1.reactionRepository.getChannelReactionStats(channelId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                totalReactions: stats.total_reactions,
                uniqueEmojis: stats.unique_emojis,
            }, 'Channel reaction statistics retrieved');
            reply.send({
                success: true,
                data: {
                    channel_id: channelId,
                    ...stats,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to get channel reaction stats');
            reply.code(500).send({
                error: {
                    message: 'Failed to get reaction statistics',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /api/v1/channels/:channelId/reactions/activity - Get recent reaction activity
     */
    fastify.get('/channels/:channelId/reactions/activity', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            querystring: validation_1.PaginationSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        channel_id: validation_1.UUIDSchema,
                        activities: typebox_1.Type.Array(ReactionActivityResponseSchema),
                        pagination: typebox_1.Type.Object({
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
            const { channelId } = request.params;
            const { limit = 20, offset = 0 } = request.query;
            // Get recent reaction activity
            const activities = await index_1.reactionRepository.getRecentReactions(channelId, Math.min(limit, 50));
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                activitiesCount: activities.length,
            }, 'Reaction activity retrieved');
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
            logger_1.loggers.api.error({ error, context }, 'Failed to get reaction activity');
            reply.code(500).send({
                error: {
                    message: 'Failed to get reaction activity',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
};
exports.registerReactionRoutes = registerReactionRoutes;
//# sourceMappingURL=ReactionRoutes.js.map