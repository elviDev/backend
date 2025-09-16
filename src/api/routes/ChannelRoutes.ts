import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { channelRepository, messageRepository, activityRepository, fileRepository } from '@db/index';
import { Activity } from '../../db/ActivityRepository';
import { logger, loggers } from '@utils/logger';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  formatErrorResponse,
  createErrorContext,
} from '@utils/errors';
import {
  authenticate,
  authorize,
  authorizeRoles,
  requireChannelAccess,
  apiRateLimit,
  requireManagerOrCEO,
} from '@auth/middleware';
import { cacheService } from '../../services/CacheService';
import { Cacheable, CacheEvict, CacheKeyUtils } from '@utils/cache-decorators';
import { WebSocketUtils } from '@websocket/utils';
import {
  UUIDSchema,
  PaginationSchema,
  ChannelTypeSchema,
  ChannelPrivacySchema,
  SuccessResponseSchema,
} from '@utils/validation';

/**
 * Channel Management API Routes
 * Enterprise-grade channel CRUD operations with real-time updates
 */

// Request/Response Schemas
const CreateChannelSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  type: ChannelTypeSchema,
  privacy: ChannelPrivacySchema,
  parent_id: Type.Optional(UUIDSchema),
  settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
  color: Type.Optional(Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
});

const UpdateChannelSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  type: Type.Optional(ChannelTypeSchema),
  privacy: Type.Optional(ChannelPrivacySchema),
  settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
  color: Type.Optional(Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
});

const ChannelMemberSchema = Type.Object({
  user_id: UUIDSchema,
  role: Type.Union([
    Type.Literal('owner'),
    Type.Literal('admin'),
    Type.Literal('member'),
    Type.Literal('viewer'),
  ]),
  joined_at: Type.String({ format: 'date-time' }),
  user_name: Type.String(),
  user_avatar: Type.Optional(Type.String()),
});

const ChannelResponseSchema = Type.Object({
  id: UUIDSchema,
  name: Type.String(),
  description: Type.Optional(Type.String()),
  type: ChannelTypeSchema,
  privacy: ChannelPrivacySchema,
  parent_id: Type.Optional(UUIDSchema),
  created_by: UUIDSchema,
  settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  tags: Type.Array(Type.String()),
  color: Type.Optional(Type.String()),
  member_count: Type.Integer(),
  message_count: Type.Integer(),
  last_activity: Type.Optional(Type.String({ format: 'date-time' })),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
});

/**
 * Channel service with caching
 */
class ChannelService {
  @Cacheable({
    ttl: 1800, // 30 minutes
    namespace: 'channels',
    keyGenerator: (channelId: string) => CacheKeyUtils.channelKey(channelId),
  })
  async getChannelById(channelId: string) {
    return await channelRepository.findById(channelId);
  }

  @CacheEvict({
    keys: (channelId: string) => [CacheKeyUtils.channelKey(channelId)],
    namespace: 'channels',
  })
  async updateChannel(channelId: string, updateData: any) {
    // Map frontend fields to backend fields
    const mappedData: any = {};
    
    if (updateData.name !== undefined) mappedData.name = updateData.name;
    if (updateData.description !== undefined) mappedData.description = updateData.description;
    if (updateData.type !== undefined) mappedData.channel_type = updateData.type;
    if (updateData.privacy !== undefined) mappedData.privacy_level = updateData.privacy;
    if (updateData.settings !== undefined) mappedData.settings = updateData.settings;
    
    // Handle project_info updates
    if (updateData.tags !== undefined || updateData.color !== undefined) {
      const existingChannel = await channelRepository.findById(channelId);
      const currentProjectInfo = existingChannel?.project_info || {};
      
      mappedData.project_info = {
        ...currentProjectInfo,
        ...(updateData.tags !== undefined && { tags: updateData.tags }),
        ...(updateData.color !== undefined && { color: updateData.color }),
      };
    }
    
    return await channelRepository.update(channelId, mappedData);
  }

  @CacheEvict({
    allEntries: true,
    namespace: 'channels',
  })
  async createChannel(channelData: any) {
    return await channelRepository.createChannel(channelData);
  }
}

const channelService = new ChannelService();

/**
 * Register channel routes
 */
export const registerChannelRoutes = async (fastify: FastifyInstance) => {
  /**
   * GET /channels - List channels accessible to user
   */
  fastify.get<{
    Querystring: typeof PaginationSchema.static & {
      type?: string;
      privacy?: string;
      parent_id?: string;
      search?: string;
    };
  }>(
    '/channels',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            type: Type.Optional(ChannelTypeSchema),
            privacy: Type.Optional(ChannelPrivacySchema),
            parent_id: Type.Optional(UUIDSchema),
            search: Type.Optional(Type.String({ maxLength: 100 })),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(ChannelResponseSchema),
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
        const { limit = 20, offset = 0, type, privacy, parent_id, search } = request.query;

        // Build filters
        const filters: any = {};
        if (type) filters.type = type;
        if (privacy) filters.privacy = privacy;
        if (parent_id) filters.parent_id = parent_id;
        if (search) filters.search = search;

        // Get channels user has access to based on their role
        const result = await channelRepository.findUserChannels(request.user!.userId, request.user!.role);

        loggers.api.info(
          {
            userId: request.user?.userId,
            filters,
            resultCount: result.length,
          },
          'Channels list retrieved'
        );

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
        loggers.api.error({ error, context }, 'Failed to retrieve channels');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channels',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /channels/categories - Get available channel categories
   */
  fastify.get(
    '/channels/categories',
    {
      preHandler: [authenticate],
      schema: {
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(Type.Object({
              id: Type.String(),
              name: Type.String(),
              description: Type.String(),
              icon: Type.Optional(Type.String()),
              color: Type.Optional(Type.String()),
            })),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
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

        loggers.api.info(
          {
            userId: request.user?.userId,
            categoriesCount: categories.length,
          },
          'Channel categories retrieved'
        );

        reply.send({
          success: true,
          data: categories,
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
        loggers.api.error({ error, context }, 'Failed to retrieve channel categories');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channel categories',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /channels/:id - Get channel details
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/channels/:id',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: ChannelResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const channel = await channelService.getChannelById(id);
        if (!channel) {
          throw new NotFoundError('Channel not found');
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
          },
          'Channel details retrieved'
        );

        reply.send({
          success: true,
          data: channel,
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
        loggers.api.error({ error, context }, 'Failed to retrieve channel');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to retrieve channel',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /channels - Create new channel
   */
  fastify.post<{
    Body: typeof CreateChannelSchema.static;
  }>(
    '/channels',
    {
      preHandler: [authenticate, requireManagerOrCEO],
      schema: {
        body: CreateChannelSchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: ChannelResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const channelData = {
          name: request.body.name,
          description: request.body.description,
          channel_type: request.body.type,
          privacy_level: request.body.privacy,
          created_by: request.user!.userId,
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
          await activityRepository.createActivity({
            channelId: channel.id,
            userId: request.user!.userId,
            activityType: 'channel_created',
            title: `Channel Created: ${channel.name}`,
            description: `New ${channel.channel_type} channel "${channel.name}" was created${channel.description ? ': ' + channel.description : ''}`,
            category: 'channel' as any,
            metadata: {
              channelId: channel.id,
              channelName: channel.name,
              channelType: channel.channel_type,
              channelPrivacy: channel.privacy_level,
              parentId: (channel as any).parent_id,
              createdBy: request.user!.userId,
              createdByName: request.user!.name,
              tags: request.body.tags || [],
              settings: channel.settings
            }
          });
        } catch (error) {
          loggers.api.warn?.({ error, channelId: channel.id }, 'Failed to create channel creation activity');
        }

        // Broadcast channel creation
        await WebSocketUtils.broadcastChannelMessage({
          type: 'chat_message',
          channelId: channel.id,
          messageId: `system_${Date.now()}`,
          message: `Channel "${channel.name}" created`,
          messageType: 'system',
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channel_type,
          },
          'Channel created successfully'
        );

        reply.code(201).send({
          success: true,
          data: channel,
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
        loggers.api.error({ error, context }, 'Failed to create channel');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
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
    }
  );

  /**
   * PUT /channels/:id - Update channel
   */
  fastify.put<{
    Params: { id: string };
    Body: typeof UpdateChannelSchema.static;
  }>(
    '/channels/:id',
    {
      preHandler: [authenticate, requireChannelAccess, authorize('channels:update')],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: UpdateChannelSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: ChannelResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updateData = request.body;

        const channel = await channelService.updateChannel(id, updateData);

        // Broadcast channel update
        await WebSocketUtils.sendToChannel(id, 'channel_updated', {
          type: 'channel_updated',
          channelId: id,
          updates: updateData,
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            updatedFields: Object.keys(updateData),
          },
          'Channel updated successfully'
        );

        reply.send({
          success: true,
          data: channel,
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
        loggers.api.error({ error, context }, 'Failed to update channel');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update channel',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /channels/:id - Delete channel
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/channels/:id',
    {
      preHandler: [authenticate, requireChannelAccess, authorize('channels:delete')],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const success = await channelRepository.softDelete(id, request.user!.userId);
        if (!success) {
          throw new NotFoundError('Channel not found');
        }

        // Clear channel cache
        await cacheService.channels.delete(CacheKeyUtils.channelKey(id));

        // Broadcast channel deletion
        await WebSocketUtils.sendToChannel(id, 'channel_deleted', {
          type: 'channel_deleted',
          channelId: id,
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
          },
          'Channel deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Channel deleted successfully',
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
        loggers.api.error({ error, context }, 'Failed to delete channel');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to delete channel',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /channels/:id/members - Get channel members
   */
  fastify.get<{
    Params: { id: string };
    Querystring: typeof PaginationSchema.static;
  }>(
    '/channels/:id/members',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        querystring: PaginationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(ChannelMemberSchema),
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
        const { id } = request.params;
        const { limit = 50, offset = 0 } = request.query;

        const members = await channelRepository.getMembers(id);
        
        // Map the members data to match the expected schema
        const mappedMembers = members.map((member: any) => ({
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
        loggers.api.error({ error, context }, 'Failed to retrieve channel members');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channel members',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * POST /channels/:id/members - Add member to channel
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      user_id: string;
      role?: 'admin' | 'member' | 'viewer';
    };
  }>(
    '/channels/:id/members',
    {
      preHandler: [authenticate, requireChannelAccess, authorize('channels:manage_members')],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: Type.Object({
          user_id: UUIDSchema,
          role: Type.Optional(
            Type.Union([Type.Literal('admin'), Type.Literal('member'), Type.Literal('viewer')])
          ),
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { user_id, role = 'member' } = request.body;

        const success = await channelRepository.addMember(id, user_id, role);
        if (!success) {
          throw new ValidationError('Failed to add member to channel', []);
        }

        // Broadcast member addition
        await WebSocketUtils.sendToChannel(id, 'user_joined_channel', {
          type: 'user_joined_channel',
          channelId: id,
          userId: user_id,
          userName: '', // TODO: Get user name
          userRole: request.user!.role,
          memberCount: (await channelRepository.getMembers(id)).length,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            addedUserId: user_id,
            memberRole: role,
          },
          'Member added to channel'
        );

        reply.send({
          success: true,
          message: 'Member added successfully',
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
        loggers.api.error({ error, context }, 'Failed to add member to channel');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to add member',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /channels/:id/members/:user_id - Remove member from channel
   */
  fastify.delete<{
    Params: { id: string; user_id: string };
  }>(
    '/channels/:id/members/:user_id',
    {
      preHandler: [authenticate, requireChannelAccess, authorize('channels:manage_members')],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
          user_id: UUIDSchema,
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { id, user_id } = request.params;

        const success = await channelRepository.removeMember(id, user_id, request.user!.userId);
        if (!success) {
          throw new NotFoundError('Member not found in channel');
        }

        // Broadcast member removal
        await WebSocketUtils.sendToChannel(id, 'user_left_channel', {
          type: 'user_left_channel',
          channelId: id,
          userId: user_id,
          userName: '', // TODO: Get user name
          userRole: request.user!.role,
          memberCount: (await channelRepository.getMembers(id)).length,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            removedUserId: user_id,
          },
          'Member removed from channel'
        );

        reply.send({
          success: true,
          message: 'Member removed successfully',
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
        loggers.api.error({ error, context }, 'Failed to remove member from channel');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to remove member',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /channels/:id/files - Get channel file attachments
   */
  fastify.get<{
    Params: { id: string };
    Querystring: typeof PaginationSchema.static & {
      file_type?: string;
      uploaded_by?: string;
      search?: string;
    };
  }>(
    '/channels/:id/files',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            file_type: Type.Optional(Type.String()),
            uploaded_by: Type.Optional(UUIDSchema),
            search: Type.Optional(Type.String({ maxLength: 100 })),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(Type.Object({
              id: UUIDSchema,
              filename: Type.String(),
              originalName: Type.String(),
              mimeType: Type.String(),
              size: Type.Integer(),
              url: Type.String(),
              downloadUrl: Type.Optional(Type.String()),
              thumbnailUrl: Type.Optional(Type.String()),
              uploadedBy: UUIDSchema,
              uploadedByName: Type.String(),
              uploadedAt: Type.String({ format: 'date-time' }),
              messageId: Type.Optional(UUIDSchema),
            })),
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
        const { id } = request.params;
        const { limit = 50, offset = 0, file_type, uploaded_by, search } = request.query;

        // Build filters
        const filters: any = {
          channelId: id,
          fileType: file_type,
          uploadedBy: uploaded_by,
          search,
        };

        let files: any[] = [];
        let total = 0;

        try {
          // Try to fetch files, but handle database errors gracefully
          files = await fileRepository.findChannelFiles(id, filters, limit, offset);
          total = await fileRepository.getChannelFileCount(id, filters);
        } catch (dbError: any) {
          // Log database errors but return empty results instead of failing
          loggers.api.warn(
            {
              userId: request.user?.userId,
              channelId: id,
              error: dbError.message,
              filters,
            },
            'Channel files database query failed, returning empty results'
          );
          
          // Return empty results if database query fails
          files = [];
          total = 0;
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            fileCount: files.length,
            filters,
          },
          'Channel files retrieved'
        );

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
        loggers.api.warn({ error, context }, 'Failed to retrieve channel files, returning empty results');

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
    }
  );

  /**
   * GET /channels/:id/activity - Get channel activity log
   */
  fastify.get<{
    Params: { id: string };
    Querystring: typeof PaginationSchema.static & {
      activity_type?: string;
      user_id?: string;
      after?: string;
    };
  }>(
    '/channels/:id/activity',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            activity_type: Type.Optional(
              Type.Union([
                Type.Literal('message'),
                Type.Literal('task_created'),
                Type.Literal('task_updated'),
                Type.Literal('task_completed'),
                Type.Literal('member_joined'),
                Type.Literal('member_left'),
                Type.Literal('file_uploaded'),
                Type.Literal('channel_updated'),
              ])
            ),
            user_id: Type.Optional(UUIDSchema),
            after: Type.Optional(Type.String({ format: 'date-time' })),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(Type.Object({
              id: UUIDSchema,
              channelId: UUIDSchema,
              activityType: Type.String(),
              userId: UUIDSchema,
              userName: Type.String(),
              userAvatar: Type.Optional(Type.String()),
              title: Type.String(),
              description: Type.Optional(Type.String()),
              metadata: Type.Record(Type.String(), Type.Any()),
              createdAt: Type.String({ format: 'date-time' }),
            })),
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
        const { id } = request.params;
        const { limit = 50, offset = 0, activity_type, user_id, after } = request.query;

        // Build filters
        const filters: any = {
          channelId: id,
          activityType: activity_type,
          userId: user_id,
          after: after ? new Date(after) : undefined,
        };

        // This would require implementing activity repository methods
        const activities = await activityRepository.findChannelActivities(id, filters, limit, offset);
        const total = await activityRepository.getChannelActivityCount(id, filters);

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            activityCount: activities.length,
            filters,
          },
          'Channel activity retrieved'
        );

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
        loggers.api.error({ error, context }, 'Failed to retrieve channel activity');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channel activity',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * POST /channels/:id/activity - Log channel activity
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      activity_type: string;
      title: string;
      description?: string;
      metadata?: Record<string, any>;
    };
  }>(
    '/channels/:id/activity',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: Type.Object({
          activity_type: Type.String({ minLength: 1, maxLength: 50 }),
          title: Type.String({ minLength: 1, maxLength: 200 }),
          description: Type.Optional(Type.String({ maxLength: 1000 })),
          metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
        }),
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              id: UUIDSchema,
              activityType: Type.String(),
              title: Type.String(),
              description: Type.Optional(Type.String()),
              metadata: Type.Record(Type.String(), Type.Any()),
              createdAt: Type.String({ format: 'date-time' }),
            }),
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { activity_type, title, description, metadata } = request.body;

        const activityData = {
          channelId: id,
          activityType: activity_type as Activity['activity_type'],
          userId: request.user!.userId,
          title,
          description: description || '',
          metadata: metadata || {},
        };

        const activity = await activityRepository.createActivity(activityData);

        // Broadcast activity to channel members
        await WebSocketUtils.sendToChannel(id, 'channel_activity', {
          type: 'channel_activity',
          channelId: id,
          activity: {
            id: activity.id,
            activityType: activity.activity_type,
            title: activity.title,
            description: activity.description,
            metadata: activity.metadata,
            userId: request.user!.userId,
            userName: request.user!.name,
            userAvatar: null, // Avatar not available in TokenPayload
            createdAt: activity.created_at,
          },
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
          timestamp: new Date().toISOString(),
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId: id,
            activityId: activity.id,
            activityType: activity_type,
          },
          'Channel activity logged successfully'
        );

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
        loggers.api.error({ error, context }, 'Failed to log channel activity');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to log channel activity',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );
};
