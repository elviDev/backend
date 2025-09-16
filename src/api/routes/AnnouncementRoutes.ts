import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import AnnouncementRepository from '@db/AnnouncementRepository';
import { loggers } from '@utils/logger';
import {
  formatErrorResponse,
  createErrorContext,
  NotFoundError,
  ValidationError,
  AuthorizationError,
  BaseError,
} from '@utils/errors';
import { CreateAnnouncementData, UpdateAnnouncementData, AnnouncementFilter } from '@db/AnnouncementRepository';

// Schema definitions
const AnnouncementTypeSchema = Type.Union([
  Type.Literal('info'),
  Type.Literal('warning'),
  Type.Literal('success'),
  Type.Literal('error'),
  Type.Literal('feature'),
  Type.Literal('maintenance'),
]);

const AnnouncementPrioritySchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical'),
]);

const AnnouncementAudienceSchema = Type.Union([
  Type.Literal('all'),
  Type.Literal('admins'),
  Type.Literal('developers'),
  Type.Literal('designers'),
  Type.Literal('managers'),
]);

const CreateAnnouncementSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  content: Type.String({ minLength: 1, maxLength: 5000 }),
  type: AnnouncementTypeSchema,
  priority: AnnouncementPrioritySchema,
  target_audience: AnnouncementAudienceSchema,
  scheduled_for: Type.Optional(Type.String({ format: 'date-time' })),
  expires_at: Type.Optional(Type.String({ format: 'date-time' })),
  action_button_text: Type.Optional(Type.String({ maxLength: 50 })),
  action_button_url: Type.Optional(Type.String({ format: 'uri' })),
  image_url: Type.Optional(Type.String({ format: 'uri' })),
  published: Type.Optional(Type.Boolean()),
});

const UpdateAnnouncementSchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  content: Type.Optional(Type.String({ minLength: 1, maxLength: 5000 })),
  type: Type.Optional(AnnouncementTypeSchema),
  priority: Type.Optional(AnnouncementPrioritySchema),
  target_audience: Type.Optional(AnnouncementAudienceSchema),
  scheduled_for: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
  expires_at: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
  action_button_text: Type.Optional(Type.Union([Type.String({ maxLength: 50 }), Type.Null()])),
  action_button_url: Type.Optional(Type.Union([Type.String({ format: 'uri' }), Type.Null()])),
  image_url: Type.Optional(Type.Union([Type.String({ format: 'uri' }), Type.Null()])),
  published: Type.Optional(Type.Boolean()),
});

const AnnouncementSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  content: Type.String(),
  type: AnnouncementTypeSchema,
  priority: AnnouncementPrioritySchema,
  target_audience: AnnouncementAudienceSchema,
  scheduled_for: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  expires_at: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  action_button_text: Type.Union([Type.String(), Type.Null()]),
  action_button_url: Type.Union([Type.String(), Type.Null()]),
  image_url: Type.Union([Type.String(), Type.Null()]),
  created_by: Type.String(),
  published: Type.Boolean(),
  read_by: Type.Array(Type.String()),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
  version: Type.Number(),
});

type CreateAnnouncementRequest = Static<typeof CreateAnnouncementSchema>;
type UpdateAnnouncementRequest = Static<typeof UpdateAnnouncementSchema>;

export async function announcementRoutes(fastify: FastifyInstance) {
  const announcementRepository = new AnnouncementRepository();

  /**
   * POST /announcements - Create new announcement (CEO only)
   */
  fastify.post<{ Body: CreateAnnouncementRequest }>(
    '/announcements',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Create Announcement',
        description: 'Create a new announcement (CEO only)',
        body: CreateAnnouncementSchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: AnnouncementSchema,
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          401: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          403: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateAnnouncementRequest }>, reply: FastifyReply) => {
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

      try {
        // Only CEO can create announcements
        if (request.user?.role !== 'ceo') {
          throw new AuthorizationError('Only CEO users can create announcements');
        }

        const announcementData: CreateAnnouncementData = {
          title: request.body.title,
          content: request.body.content,
          type: request.body.type,
          priority: request.body.priority,
          target_audience: request.body.target_audience,
          created_by: request.user.userId,
          published: request.body.published,
          ...(request.body.scheduled_for && { scheduled_for: new Date(request.body.scheduled_for) }),
          ...(request.body.expires_at && { expires_at: new Date(request.body.expires_at) }),
          ...(request.body.action_button_text && { action_button_text: request.body.action_button_text }),
          ...(request.body.action_button_url && { action_button_url: request.body.action_button_url }),
          ...(request.body.image_url && { image_url: request.body.image_url }),
        };

        loggers.api.info(
          {
            userId: request.user.userId,
            title: announcementData.title,
            type: announcementData.type,
            priority: announcementData.priority,
            targetAudience: announcementData.target_audience,
            published: announcementData.published,
          },
          'Creating announcement'
        );

        const announcement = await announcementRepository.create(announcementData);

        loggers.api.info(
          {
            userId: request.user.userId,
            announcementId: announcement.id,
          },
          'Announcement created successfully'
        );

        reply.code(201).send({
          success: true,
          data: announcement,
        });

      } catch (error) {
        loggers.api.error({ error, context }, 'Failed to create announcement');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );

  /**
   * GET /announcements - Get announcements with filters
   */
  fastify.get<{
    Querystring: {
      type?: string;
      priority?: string;
      target_audience?: string;
      published?: string;
      created_by?: string;
      date_from?: string;
      date_to?: string;
      limit?: string;
      offset?: string;
      user_view?: string; // 'true' for user-specific view
    };
  }>(
    '/announcements',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Get Announcements',
        description: 'Get announcements with optional filtering',
        querystring: Type.Object({
          type: Type.Optional(Type.String()),
          priority: Type.Optional(Type.String()),
          target_audience: Type.Optional(Type.String()),
          published: Type.Optional(Type.String()),
          created_by: Type.Optional(Type.String()),
          date_from: Type.Optional(Type.String({ format: 'date-time' })),
          date_to: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.String()),
          offset: Type.Optional(Type.String()),
          user_view: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(AnnouncementSchema),
            total: Type.Number(),
            limit: Type.Number(),
            offset: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
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

      try {
        const {
          type,
          priority,
          target_audience,
          published,
          created_by,
          date_from,
          date_to,
          limit = '50',
          offset = '0',
          user_view = 'false',
        } = request.query;

        const limitNum = Math.min(parseInt(limit) || 50, 100);
        const offsetNum = parseInt(offset) || 0;

        let data, total;

        if (user_view === 'true') {
          // User-specific view - only show announcements relevant to the user
          data = await announcementRepository.findForUser(
            request.user!.userId,
            request.user!.role,
            true
          );
          total = data.length;
          // Apply pagination manually for user view
          data = data.slice(offsetNum, offsetNum + limitNum);
        } else {
          // Admin view - show all announcements with filters (CEO only)
          if (request.user?.role !== 'ceo') {
            throw new AuthorizationError('Only CEO users can view all announcements');
          }

          const filter: AnnouncementFilter = {};
          
          if (type) filter.type = type.split(',') as any;
          if (priority) filter.priority = priority.split(',') as any;
          if (target_audience) filter.target_audience = target_audience.split(',') as any;
          if (published) filter.published = published === 'true';
          if (created_by) filter.created_by = created_by.split(',');
          if (date_from) filter.date_from = new Date(date_from);
          if (date_to) filter.date_to = new Date(date_to);

          const result = await announcementRepository.findWithFilter(filter, limitNum, offsetNum);
          data = result.data;
          total = result.total;
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            userView: user_view === 'true',
            resultsCount: data.length,
            total,
          },
          'Retrieved announcements'
        );

        reply.send({
          success: true,
          data,
          total,
          limit: limitNum,
          offset: offsetNum,
        });

      } catch (error) {
        loggers.api.error({ error, context }, 'Failed to get announcements');

        if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );

  /**
   * GET /announcements/:id - Get announcement by ID
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/announcements/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Get Announcement by ID',
        description: 'Get a specific announcement by ID',
        params: Type.Object({
          id: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: AnnouncementSchema,
          }),
          404: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const announcement = await announcementRepository.findById(request.params.id);
        
        if (!announcement) {
          throw new NotFoundError(`Announcement with ID ${request.params.id} not found`);
        }

        reply.send({
          success: true,
          data: announcement,
        });

      } catch (error) {
        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );

  /**
   * PUT /announcements/:id - Update announcement (CEO only)
   */
  fastify.put<{
    Params: { id: string };
    Body: UpdateAnnouncementRequest;
  }>(
    '/announcements/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Update Announcement',
        description: 'Update an existing announcement (CEO only)',
        params: Type.Object({
          id: Type.String(),
        }),
        body: UpdateAnnouncementSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: AnnouncementSchema,
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          403: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          404: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // Only CEO can update announcements
        if (request.user?.role !== 'ceo') {
          throw new AuthorizationError('Only CEO users can update announcements');
        }

        const updateData: UpdateAnnouncementData = {};
        
        if (request.body.title !== undefined) updateData.title = request.body.title;
        if (request.body.content !== undefined) updateData.content = request.body.content;
        if (request.body.type !== undefined) updateData.type = request.body.type;
        if (request.body.priority !== undefined) updateData.priority = request.body.priority;
        if (request.body.target_audience !== undefined) updateData.target_audience = request.body.target_audience;
        if (request.body.published !== undefined) updateData.published = request.body.published;
        if (request.body.action_button_text !== undefined) updateData.action_button_text = request.body.action_button_text;
        if (request.body.action_button_url !== undefined) updateData.action_button_url = request.body.action_button_url;
        if (request.body.image_url !== undefined) updateData.image_url = request.body.image_url;
        
        if (request.body.scheduled_for !== undefined) {
          updateData.scheduled_for = request.body.scheduled_for === null ? null : new Date(request.body.scheduled_for);
        }
        if (request.body.expires_at !== undefined) {
          updateData.expires_at = request.body.expires_at === null ? null : new Date(request.body.expires_at);
        }

        const announcement = await announcementRepository.update(request.params.id, updateData);

        loggers.api.info(
          {
            userId: request.user.userId,
            announcementId: announcement.id,
          },
          'Announcement updated successfully'
        );

        reply.send({
          success: true,
          data: announcement,
        });

      } catch (error) {
        loggers.api.error({ error, announcementId: request.params.id }, 'Failed to update announcement');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );

  /**
   * DELETE /announcements/:id - Delete announcement (CEO only)
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/announcements/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Delete Announcement',
        description: 'Delete an announcement (CEO only)',
        params: Type.Object({
          id: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
          403: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          404: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // Only CEO can delete announcements
        if (request.user?.role !== 'ceo') {
          throw new AuthorizationError('Only CEO users can delete announcements');
        }

        await announcementRepository.softDelete(request.params.id, request.user.userId);

        loggers.api.info(
          {
            userId: request.user.userId,
            announcementId: request.params.id,
          },
          'Announcement deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Announcement deleted successfully',
        });

      } catch (error) {
        loggers.api.error({ error, announcementId: request.params.id }, 'Failed to delete announcement');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );

  /**
   * POST /announcements/:id/read - Mark announcement as read
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/announcements/:id/read',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Mark Announcement as Read',
        description: 'Mark an announcement as read by the current user',
        params: Type.Object({
          id: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
          404: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        await announcementRepository.markAsRead(request.params.id, request.user!.userId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            announcementId: request.params.id,
          },
          'Announcement marked as read'
        );

        reply.send({
          success: true,
          message: 'Announcement marked as read',
        });

      } catch (error) {
        loggers.api.error({ error, announcementId: request.params.id }, 'Failed to mark announcement as read');
        reply.code(500).send(formatErrorResponse(error as BaseError));
      }
    }
  );

  /**
   * GET /announcements/stats - Get announcement statistics (CEO only)
   */
  fastify.get(
    '/announcements/stats',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Announcements'],
        summary: 'Get Announcement Statistics',
        description: 'Get announcement statistics (CEO only)',
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              total: Type.Number(),
              published: Type.Number(),
              scheduled: Type.Number(),
              expired: Type.Number(),
              byType: Type.Record(Type.String(), Type.Number()),
              byPriority: Type.Record(Type.String(), Type.Number()),
              byAudience: Type.Record(Type.String(), Type.Number()),
            }),
          }),
          403: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // Only CEO can view stats
        if (request.user?.role !== 'ceo') {
          throw new AuthorizationError('Only CEO users can view announcement statistics');
        }

        const stats = await announcementRepository.getStats();

        reply.send({
          success: true,
          data: stats,
        });

      } catch (error) {
        loggers.api.error({ error }, 'Failed to get announcement stats');

        if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send(formatErrorResponse(error as BaseError));
        }
      }
    }
  );
}