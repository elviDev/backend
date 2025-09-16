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
exports.registerChannelRoutes = void 0;
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
 * Channel Management API Routes
 * Enterprise-grade channel CRUD operations with real-time updates
 */
// Request/Response Schemas
const CreateChannelSchema = typebox_1.Type.Object({
    name: typebox_1.Type.String({ minLength: 1, maxLength: 100 }),
    description: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 500 })),
    type: validation_1.ChannelTypeSchema,
    privacy: validation_1.ChannelPrivacySchema,
    parent_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String({ maxLength: 50 }))),
    color: typebox_1.Type.Optional(typebox_1.Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
});
const UpdateChannelSchema = typebox_1.Type.Object({
    name: typebox_1.Type.Optional(typebox_1.Type.String({ minLength: 1, maxLength: 100 })),
    description: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 500 })),
    type: typebox_1.Type.Optional(validation_1.ChannelTypeSchema),
    privacy: typebox_1.Type.Optional(validation_1.ChannelPrivacySchema),
    settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String({ maxLength: 50 }))),
    color: typebox_1.Type.Optional(typebox_1.Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
});
const ChannelMemberSchema = typebox_1.Type.Object({
    user_id: validation_1.UUIDSchema,
    role: typebox_1.Type.Union([
        typebox_1.Type.Literal('owner'),
        typebox_1.Type.Literal('admin'),
        typebox_1.Type.Literal('member'),
        typebox_1.Type.Literal('viewer'),
    ]),
    joined_at: typebox_1.Type.String({ format: 'date-time' }),
    user_name: typebox_1.Type.String(),
    user_avatar: typebox_1.Type.Optional(typebox_1.Type.String()),
});
const ChannelResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    name: typebox_1.Type.String(),
    description: typebox_1.Type.Optional(typebox_1.Type.String()),
    type: validation_1.ChannelTypeSchema,
    privacy: validation_1.ChannelPrivacySchema,
    parent_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    created_by: validation_1.UUIDSchema,
    settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    tags: typebox_1.Type.Array(typebox_1.Type.String()),
    color: typebox_1.Type.Optional(typebox_1.Type.String()),
    member_count: typebox_1.Type.Integer(),
    message_count: typebox_1.Type.Integer(),
    last_activity: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
});
/**
 * Channel service with caching
 */
class ChannelService {
    async getChannelById(channelId) {
        return await index_1.channelRepository.findById(channelId);
    }
    async updateChannel(channelId, updateData) {
        // Map frontend fields to backend fields
        const mappedData = {};
        if (updateData.name !== undefined)
            mappedData.name = updateData.name;
        if (updateData.description !== undefined)
            mappedData.description = updateData.description;
        if (updateData.type !== undefined)
            mappedData.channel_type = updateData.type;
        if (updateData.privacy !== undefined)
            mappedData.privacy_level = updateData.privacy;
        if (updateData.settings !== undefined)
            mappedData.settings = updateData.settings;
        // Handle project_info updates
        if (updateData.tags !== undefined || updateData.color !== undefined) {
            const existingChannel = await index_1.channelRepository.findById(channelId);
            const currentProjectInfo = existingChannel?.project_info || {};
            mappedData.project_info = {
                ...currentProjectInfo,
                ...(updateData.tags !== undefined && { tags: updateData.tags }),
                ...(updateData.color !== undefined && { color: updateData.color }),
            };
        }
        return await index_1.channelRepository.update(channelId, mappedData);
    }
    async createChannel(channelData) {
        return await index_1.channelRepository.createChannel(channelData);
    }
}
__decorate([
    (0, cache_decorators_1.Cacheable)({
        ttl: 1800, // 30 minutes
        namespace: 'channels',
        keyGenerator: (channelId) => cache_decorators_1.CacheKeyUtils.channelKey(channelId),
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChannelService.prototype, "getChannelById", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        keys: (channelId) => [cache_decorators_1.CacheKeyUtils.channelKey(channelId)],
        namespace: 'channels',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChannelService.prototype, "updateChannel", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        allEntries: true,
        namespace: 'channels',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChannelService.prototype, "createChannel", null);
const channelService = new ChannelService();
/**
 * Register channel routes
 */
const registerChannelRoutes = async (fastify) => {
    /**
     * GET /channels - List channels accessible to user
     */
    fastify.get('/channels', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    type: typebox_1.Type.Optional(validation_1.ChannelTypeSchema),
                    privacy: typebox_1.Type.Optional(validation_1.ChannelPrivacySchema),
                    parent_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    search: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(ChannelResponseSchema),
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
            const { limit = 20, offset = 0, type, privacy, parent_id, search } = request.query;
            // Build filters
            const filters = {};
            if (type)
                filters.type = type;
            if (privacy)
                filters.privacy = privacy;
            if (parent_id)
                filters.parent_id = parent_id;
            if (search)
                filters.search = search;
            // Get channels user has access to based on their role
            const result = await index_1.channelRepository.findUserChannels(request.user.userId, request.user.role);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                filters,
                resultCount: result.length,
            }, 'Channels list retrieved');
            reply.send({
                success: true,
                data: result,
                pagination: {
                    total: result.length,
                    limit,
                    offset,
                    hasMore: false,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channels');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channels',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /channels/categories - Get available channel categories
     */
    fastify.get('/channels/categories', {
        preHandler: [middleware_1.authenticate],
        schema: {
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(typebox_1.Type.Object({
                        id: typebox_1.Type.String(),
                        name: typebox_1.Type.String(),
                        description: typebox_1.Type.String(),
                        icon: typebox_1.Type.Optional(typebox_1.Type.String()),
                        color: typebox_1.Type.Optional(typebox_1.Type.String()),
                    })),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // Define available channel categories based on ChannelTypeSchema
            const categories = [
                {
                    id: 'general',
                    name: 'General',
                    description: 'General purpose discussions and communications',
                    icon: 'chatbubble-outline',
                    color: '#6B7280',
                },
                {
                    id: 'project',
                    name: 'Project',
                    description: 'Project-specific discussions and collaboration',
                    icon: 'folder-outline',
                    color: '#3B82F6',
                },
                {
                    id: 'department',
                    name: 'Department',
                    description: 'Department-wide communications and updates',
                    icon: 'business-outline',
                    color: '#10B981',
                },
                {
                    id: 'announcement',
                    name: 'Announcement',
                    description: 'Official announcements and important updates',
                    icon: 'megaphone-outline',
                    color: '#F59E0B',
                },
                {
                    id: 'private',
                    name: 'Private',
                    description: 'Private discussions and confidential matters',
                    icon: 'lock-closed-outline',
                    color: '#8B5CF6',
                },
            ];
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                categoriesCount: categories.length,
            }, 'Channel categories retrieved');
            reply.send({
                success: true,
                data: categories,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel categories');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channel categories',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /channels/:id - Get channel details
     */
    fastify.get('/channels/:id', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ChannelResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const channel = await channelService.getChannelById(id);
            if (!channel) {
                throw new errors_1.NotFoundError('Channel not found');
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
            }, 'Channel details retrieved');
            reply.send({
                success: true,
                data: channel,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to retrieve channel',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /channels - Create new channel
     */
    fastify.post('/channels', {
        preHandler: [middleware_1.authenticate, middleware_1.requireManagerOrCEO],
        schema: {
            body: CreateChannelSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ChannelResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const channelData = {
                name: request.body.name,
                description: request.body.description,
                channel_type: request.body.type,
                privacy_level: request.body.privacy,
                created_by: request.user.userId,
                settings: request.body.settings || {},
                project_info: {
                    tags: request.body.tags || [],
                    ...(request.body.color && { color: request.body.color }),
                },
                ...(request.body.parent_id && { parent_id: request.body.parent_id }),
            };
            const channel = await channelService.createChannel(channelData);
            // Creator is already added as member in createChannel method
            // await channelRepository.addMember(channel.id, request.user!.userId, request.user!.userId);
            // Create activity for channel creation
            try {
                await index_1.activityRepository.createActivity({
                    channelId: channel.id,
                    userId: request.user.userId,
                    activityType: 'channel_created',
                    title: `Channel Created: ${channel.name}`,
                    description: `New ${channel.channel_type} channel "${channel.name}" was created${channel.description ? ': ' + channel.description : ''}`,
                    category: 'channel',
                    metadata: {
                        channelId: channel.id,
                        channelName: channel.name,
                        channelType: channel.channel_type,
                        channelPrivacy: channel.privacy_level,
                        parentId: channel.parent_id,
                        createdBy: request.user.userId,
                        createdByName: request.user.name,
                        tags: request.body.tags || [],
                        settings: channel.settings
                    }
                });
            }
            catch (error) {
                logger_1.loggers.api.warn?.({ error, channelId: channel.id }, 'Failed to create channel creation activity');
            }
            // Broadcast channel creation
            await utils_1.WebSocketUtils.broadcastChannelMessage({
                type: 'chat_message',
                channelId: channel.id,
                messageId: `system_${Date.now()}`,
                message: `Channel "${channel.name}" created`,
                messageType: 'system',
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: channel.id,
                channelName: channel.name,
                channelType: channel.channel_type,
            }, 'Channel created successfully');
            reply.code(201).send({
                success: true,
                data: channel,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to create channel');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create channel',
                        code: 'SERVER_ERROR',
                        ...(process.env.NODE_ENV === 'development' && {
                            details: error instanceof Error ? error.message : String(error),
                            stack: error instanceof Error ? error.stack : undefined,
                        }),
                    },
                });
            }
        }
    });
    /**
     * PUT /channels/:id - Update channel
     */
    fastify.put('/channels/:id', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, (0, middleware_1.authorize)('channels:update')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: UpdateChannelSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: ChannelResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updateData = request.body;
            const channel = await channelService.updateChannel(id, updateData);
            // Broadcast channel update
            await utils_1.WebSocketUtils.sendToChannel(id, 'channel_updated', {
                type: 'channel_updated',
                channelId: id,
                updates: updateData,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                updatedFields: Object.keys(updateData),
            }, 'Channel updated successfully');
            reply.send({
                success: true,
                data: channel,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to update channel');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update channel',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /channels/:id - Delete channel
     */
    fastify.delete('/channels/:id', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, (0, middleware_1.authorize)('channels:delete')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const success = await index_1.channelRepository.softDelete(id, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('Channel not found');
            }
            // Clear channel cache
            await CacheService_1.cacheService.channels.delete(cache_decorators_1.CacheKeyUtils.channelKey(id));
            // Broadcast channel deletion
            await utils_1.WebSocketUtils.sendToChannel(id, 'channel_deleted', {
                type: 'channel_deleted',
                channelId: id,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
            }, 'Channel deleted successfully');
            reply.send({
                success: true,
                message: 'Channel deleted successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to delete channel');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete channel',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /channels/:id/members - Get channel members
     */
    fastify.get('/channels/:id/members', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            querystring: validation_1.PaginationSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(ChannelMemberSchema),
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
            const { id } = request.params;
            const { limit = 50, offset = 0 } = request.query;
            const members = await index_1.channelRepository.getMembers(id);
            // Map the members data to match the expected schema
            const mappedMembers = members.map((member) => ({
                user_id: member.id,
                role: member.role,
                joined_at: new Date().toISOString(), // TODO: Get actual joined_at from channel_member_history
                user_name: member.name,
                user_avatar: member.avatar_url,
            }));
            const result = {
                data: mappedMembers.slice(offset, offset + limit),
                total: mappedMembers.length,
            };
            reply.send({
                success: true,
                data: result.data,
                pagination: {
                    total: result.total,
                    limit,
                    offset,
                    hasMore: offset + limit < result.total,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel members');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channel members',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * POST /channels/:id/members - Add member to channel
     */
    fastify.post('/channels/:id/members', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, (0, middleware_1.authorize)('channels:manage_members')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                user_id: validation_1.UUIDSchema,
                role: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.Literal('admin'), typebox_1.Type.Literal('member'), typebox_1.Type.Literal('viewer')])),
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { user_id, role = 'member' } = request.body;
            const success = await index_1.channelRepository.addMember(id, user_id, role);
            if (!success) {
                throw new errors_1.ValidationError('Failed to add member to channel', []);
            }
            // Broadcast member addition
            await utils_1.WebSocketUtils.sendToChannel(id, 'user_joined_channel', {
                type: 'user_joined_channel',
                channelId: id,
                userId: user_id,
                userName: '', // TODO: Get user name
                userRole: request.user.role,
                memberCount: (await index_1.channelRepository.getMembers(id)).length,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                addedUserId: user_id,
                memberRole: role,
            }, 'Member added to channel');
            reply.send({
                success: true,
                message: 'Member added successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to add member to channel');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to add member',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /channels/:id/members/:user_id - Remove member from channel
     */
    fastify.delete('/channels/:id/members/:user_id', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess, (0, middleware_1.authorize)('channels:manage_members')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
                user_id: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { id, user_id } = request.params;
            const success = await index_1.channelRepository.removeMember(id, user_id, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('Member not found in channel');
            }
            // Broadcast member removal
            await utils_1.WebSocketUtils.sendToChannel(id, 'user_left_channel', {
                type: 'user_left_channel',
                channelId: id,
                userId: user_id,
                userName: '', // TODO: Get user name
                userRole: request.user.role,
                memberCount: (await index_1.channelRepository.getMembers(id)).length,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                removedUserId: user_id,
            }, 'Member removed from channel');
            reply.send({
                success: true,
                message: 'Member removed successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to remove member from channel');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to remove member',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /channels/:id/files - Get channel file attachments
     */
    fastify.get('/channels/:id/files', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    file_type: typebox_1.Type.Optional(typebox_1.Type.String()),
                    uploaded_by: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    search: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(typebox_1.Type.Object({
                        id: validation_1.UUIDSchema,
                        filename: typebox_1.Type.String(),
                        originalName: typebox_1.Type.String(),
                        mimeType: typebox_1.Type.String(),
                        size: typebox_1.Type.Integer(),
                        url: typebox_1.Type.String(),
                        downloadUrl: typebox_1.Type.Optional(typebox_1.Type.String()),
                        thumbnailUrl: typebox_1.Type.Optional(typebox_1.Type.String()),
                        uploadedBy: validation_1.UUIDSchema,
                        uploadedByName: typebox_1.Type.String(),
                        uploadedAt: typebox_1.Type.String({ format: 'date-time' }),
                        messageId: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    })),
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
            const { id } = request.params;
            const { limit = 50, offset = 0, file_type, uploaded_by, search } = request.query;
            // Build filters
            const filters = {
                channelId: id,
                fileType: file_type,
                uploadedBy: uploaded_by,
                search,
            };
            let files = [];
            let total = 0;
            try {
                // Try to fetch files, but handle database errors gracefully
                files = await index_1.fileRepository.findChannelFiles(id, filters, limit, offset);
                total = await index_1.fileRepository.getChannelFileCount(id, filters);
            }
            catch (dbError) {
                // Log database errors but return empty results instead of failing
                logger_1.loggers.api.warn({
                    userId: request.user?.userId,
                    channelId: id,
                    error: dbError.message,
                    filters,
                }, 'Channel files database query failed, returning empty results');
                // Return empty results if database query fails
                files = [];
                total = 0;
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                fileCount: files.length,
                filters,
            }, 'Channel files retrieved');
            reply.send({
                success: true,
                data: files,
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
            logger_1.loggers.api.warn({ error, context }, 'Failed to retrieve channel files, returning empty results');
            // Return empty results instead of error to prevent frontend issues
            reply.send({
                success: true,
                data: [],
                pagination: {
                    total: 0,
                    limit: request.query.limit || 50,
                    offset: request.query.offset || 0,
                    hasMore: false,
                },
                timestamp: new Date().toISOString(),
            });
        }
    });
    /**
     * GET /channels/:id/activity - Get channel activity log
     */
    fastify.get('/channels/:id/activity', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    activity_type: typebox_1.Type.Optional(typebox_1.Type.Union([
                        typebox_1.Type.Literal('message'),
                        typebox_1.Type.Literal('task_created'),
                        typebox_1.Type.Literal('task_updated'),
                        typebox_1.Type.Literal('task_completed'),
                        typebox_1.Type.Literal('member_joined'),
                        typebox_1.Type.Literal('member_left'),
                        typebox_1.Type.Literal('file_uploaded'),
                        typebox_1.Type.Literal('channel_updated'),
                    ])),
                    user_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    after: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(typebox_1.Type.Object({
                        id: validation_1.UUIDSchema,
                        channelId: validation_1.UUIDSchema,
                        activityType: typebox_1.Type.String(),
                        userId: validation_1.UUIDSchema,
                        userName: typebox_1.Type.String(),
                        userAvatar: typebox_1.Type.Optional(typebox_1.Type.String()),
                        title: typebox_1.Type.String(),
                        description: typebox_1.Type.Optional(typebox_1.Type.String()),
                        metadata: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any()),
                        createdAt: typebox_1.Type.String({ format: 'date-time' }),
                    })),
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
            const { id } = request.params;
            const { limit = 50, offset = 0, activity_type, user_id, after } = request.query;
            // Build filters
            const filters = {
                channelId: id,
                activityType: activity_type,
                userId: user_id,
                after: after ? new Date(after) : undefined,
            };
            // This would require implementing activity repository methods
            const activities = await index_1.activityRepository.findChannelActivities(id, filters, limit, offset);
            const total = await index_1.activityRepository.getChannelActivityCount(id, filters);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                activityCount: activities.length,
                filters,
            }, 'Channel activity retrieved');
            reply.send({
                success: true,
                data: activities,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel activity');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channel activity',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * POST /channels/:id/activity - Log channel activity
     */
    fastify.post('/channels/:id/activity', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                activity_type: typebox_1.Type.String({ minLength: 1, maxLength: 50 }),
                title: typebox_1.Type.String({ minLength: 1, maxLength: 200 }),
                description: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 1000 })),
                metadata: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
            }),
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        id: validation_1.UUIDSchema,
                        activityType: typebox_1.Type.String(),
                        title: typebox_1.Type.String(),
                        description: typebox_1.Type.Optional(typebox_1.Type.String()),
                        metadata: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any()),
                        createdAt: typebox_1.Type.String({ format: 'date-time' }),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { activity_type, title, description, metadata } = request.body;
            const activityData = {
                channelId: id,
                activityType: activity_type,
                userId: request.user.userId,
                title,
                description: description || '',
                metadata: metadata || {},
            };
            const activity = await index_1.activityRepository.createActivity(activityData);
            // Broadcast activity to channel members
            await utils_1.WebSocketUtils.sendToChannel(id, 'channel_activity', {
                type: 'channel_activity',
                channelId: id,
                activity: {
                    id: activity.id,
                    activityType: activity.activity_type,
                    title: activity.title,
                    description: activity.description,
                    metadata: activity.metadata,
                    userId: request.user.userId,
                    userName: request.user.name,
                    userAvatar: null, // Avatar not available in TokenPayload
                    createdAt: activity.created_at,
                },
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
                timestamp: new Date().toISOString(),
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId: id,
                activityId: activity.id,
                activityType: activity_type,
            }, 'Channel activity logged successfully');
            reply.code(201).send({
                success: true,
                data: {
                    id: activity.id,
                    activityType: activity.activity_type,
                    title: activity.title,
                    description: activity.description,
                    metadata: activity.metadata,
                    createdAt: activity.created_at,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to log channel activity');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to log channel activity',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
};
exports.registerChannelRoutes = registerChannelRoutes;
//# sourceMappingURL=ChannelRoutes.js.map