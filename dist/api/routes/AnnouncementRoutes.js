"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.announcementRoutes = announcementRoutes;
const typebox_1 = require("@sinclair/typebox");
const AnnouncementRepository_1 = __importDefault(require("@db/AnnouncementRepository"));
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
// Schema definitions
const AnnouncementTypeSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('info'),
    typebox_1.Type.Literal('warning'),
    typebox_1.Type.Literal('success'),
    typebox_1.Type.Literal('error'),
    typebox_1.Type.Literal('feature'),
    typebox_1.Type.Literal('maintenance'),
]);
const AnnouncementPrioritySchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('low'),
    typebox_1.Type.Literal('medium'),
    typebox_1.Type.Literal('high'),
    typebox_1.Type.Literal('critical'),
]);
const AnnouncementAudienceSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('all'),
    typebox_1.Type.Literal('admins'),
    typebox_1.Type.Literal('developers'),
    typebox_1.Type.Literal('designers'),
    typebox_1.Type.Literal('managers'),
]);
const CreateAnnouncementSchema = typebox_1.Type.Object({
    title: typebox_1.Type.String({ minLength: 1, maxLength: 200 }),
    content: typebox_1.Type.String({ minLength: 1, maxLength: 5000 }),
    type: AnnouncementTypeSchema,
    priority: AnnouncementPrioritySchema,
    target_audience: AnnouncementAudienceSchema,
    scheduled_for: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    expires_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    action_button_text: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 50 })),
    action_button_url: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'uri' })),
    image_url: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'uri' })),
    published: typebox_1.Type.Optional(typebox_1.Type.Boolean()),
});
const UpdateAnnouncementSchema = typebox_1.Type.Object({
    title: typebox_1.Type.Optional(typebox_1.Type.String({ minLength: 1, maxLength: 200 })),
    content: typebox_1.Type.Optional(typebox_1.Type.String({ minLength: 1, maxLength: 5000 })),
    type: typebox_1.Type.Optional(AnnouncementTypeSchema),
    priority: typebox_1.Type.Optional(AnnouncementPrioritySchema),
    target_audience: typebox_1.Type.Optional(AnnouncementAudienceSchema),
    scheduled_for: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()])),
    expires_at: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()])),
    action_button_text: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.String({ maxLength: 50 }), typebox_1.Type.Null()])),
    action_button_url: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.String({ format: 'uri' }), typebox_1.Type.Null()])),
    image_url: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.String({ format: 'uri' }), typebox_1.Type.Null()])),
    published: typebox_1.Type.Optional(typebox_1.Type.Boolean()),
});
const AnnouncementSchema = typebox_1.Type.Object({
    id: typebox_1.Type.String(),
    title: typebox_1.Type.String(),
    content: typebox_1.Type.String(),
    type: AnnouncementTypeSchema,
    priority: AnnouncementPrioritySchema,
    target_audience: AnnouncementAudienceSchema,
    scheduled_for: typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()]),
    expires_at: typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()]),
    action_button_text: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
    action_button_url: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
    image_url: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
    created_by: typebox_1.Type.String(),
    published: typebox_1.Type.Boolean(),
    read_by: typebox_1.Type.Array(typebox_1.Type.String()),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
    version: typebox_1.Type.Number(),
});
async function announcementRoutes(fastify) {
    const announcementRepository = new AnnouncementRepository_1.default();
    /**
     * POST /announcements - Create new announcement (CEO only)
     */
    fastify.post('/announcements', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Create Announcement',
            description: 'Create a new announcement (CEO only)',
            body: CreateAnnouncementSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: AnnouncementSchema,
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                401: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                403: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
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
        try {
            // Only CEO can create announcements
            if (request.user?.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Only CEO users can create announcements');
            }
            const announcementData = {
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
            logger_1.loggers.api.info({
                userId: request.user.userId,
                title: announcementData.title,
                type: announcementData.type,
                priority: announcementData.priority,
                targetAudience: announcementData.target_audience,
                published: announcementData.published,
            }, 'Creating announcement');
            const announcement = await announcementRepository.create(announcementData);
            logger_1.loggers.api.info({
                userId: request.user.userId,
                announcementId: announcement.id,
            }, 'Announcement created successfully');
            reply.code(201).send({
                success: true,
                data: announcement,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, context }, 'Failed to create announcement');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
    /**
     * GET /announcements - Get announcements with filters
     */
    fastify.get('/announcements', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Get Announcements',
            description: 'Get announcements with optional filtering',
            querystring: typebox_1.Type.Object({
                type: typebox_1.Type.Optional(typebox_1.Type.String()),
                priority: typebox_1.Type.Optional(typebox_1.Type.String()),
                target_audience: typebox_1.Type.Optional(typebox_1.Type.String()),
                published: typebox_1.Type.Optional(typebox_1.Type.String()),
                created_by: typebox_1.Type.Optional(typebox_1.Type.String()),
                date_from: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                date_to: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                limit: typebox_1.Type.Optional(typebox_1.Type.String()),
                offset: typebox_1.Type.Optional(typebox_1.Type.String()),
                user_view: typebox_1.Type.Optional(typebox_1.Type.String()),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(AnnouncementSchema),
                    total: typebox_1.Type.Number(),
                    limit: typebox_1.Type.Number(),
                    offset: typebox_1.Type.Number(),
                }),
            },
        },
    }, async (request, reply) => {
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
        try {
            const { type, priority, target_audience, published, created_by, date_from, date_to, limit = '50', offset = '0', user_view = 'false', } = request.query;
            const limitNum = Math.min(parseInt(limit) || 50, 100);
            const offsetNum = parseInt(offset) || 0;
            let data, total;
            if (user_view === 'true') {
                // User-specific view - only show announcements relevant to the user
                data = await announcementRepository.findForUser(request.user.userId, request.user.role, true);
                total = data.length;
                // Apply pagination manually for user view
                data = data.slice(offsetNum, offsetNum + limitNum);
            }
            else {
                // Admin view - show all announcements with filters (CEO only)
                if (request.user?.role !== 'ceo') {
                    throw new errors_1.AuthorizationError('Only CEO users can view all announcements');
                }
                const filter = {};
                if (type)
                    filter.type = type.split(',');
                if (priority)
                    filter.priority = priority.split(',');
                if (target_audience)
                    filter.target_audience = target_audience.split(',');
                if (published)
                    filter.published = published === 'true';
                if (created_by)
                    filter.created_by = created_by.split(',');
                if (date_from)
                    filter.date_from = new Date(date_from);
                if (date_to)
                    filter.date_to = new Date(date_to);
                const result = await announcementRepository.findWithFilter(filter, limitNum, offsetNum);
                data = result.data;
                total = result.total;
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                userView: user_view === 'true',
                resultsCount: data.length,
                total,
            }, 'Retrieved announcements');
            reply.send({
                success: true,
                data,
                total,
                limit: limitNum,
                offset: offsetNum,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, context }, 'Failed to get announcements');
            if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
    /**
     * GET /announcements/:id - Get announcement by ID
     */
    fastify.get('/announcements/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Get Announcement by ID',
            description: 'Get a specific announcement by ID',
            params: typebox_1.Type.Object({
                id: typebox_1.Type.String(),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: AnnouncementSchema,
                }),
                404: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const announcement = await announcementRepository.findById(request.params.id);
            if (!announcement) {
                throw new errors_1.NotFoundError(`Announcement with ID ${request.params.id} not found`);
            }
            reply.send({
                success: true,
                data: announcement,
            });
        }
        catch (error) {
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
    /**
     * PUT /announcements/:id - Update announcement (CEO only)
     */
    fastify.put('/announcements/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Update Announcement',
            description: 'Update an existing announcement (CEO only)',
            params: typebox_1.Type.Object({
                id: typebox_1.Type.String(),
            }),
            body: UpdateAnnouncementSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: AnnouncementSchema,
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                403: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                404: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // Only CEO can update announcements
            if (request.user?.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Only CEO users can update announcements');
            }
            const updateData = {};
            if (request.body.title !== undefined)
                updateData.title = request.body.title;
            if (request.body.content !== undefined)
                updateData.content = request.body.content;
            if (request.body.type !== undefined)
                updateData.type = request.body.type;
            if (request.body.priority !== undefined)
                updateData.priority = request.body.priority;
            if (request.body.target_audience !== undefined)
                updateData.target_audience = request.body.target_audience;
            if (request.body.published !== undefined)
                updateData.published = request.body.published;
            if (request.body.action_button_text !== undefined)
                updateData.action_button_text = request.body.action_button_text;
            if (request.body.action_button_url !== undefined)
                updateData.action_button_url = request.body.action_button_url;
            if (request.body.image_url !== undefined)
                updateData.image_url = request.body.image_url;
            if (request.body.scheduled_for !== undefined) {
                updateData.scheduled_for = request.body.scheduled_for === null ? null : new Date(request.body.scheduled_for);
            }
            if (request.body.expires_at !== undefined) {
                updateData.expires_at = request.body.expires_at === null ? null : new Date(request.body.expires_at);
            }
            const announcement = await announcementRepository.update(request.params.id, updateData);
            logger_1.loggers.api.info({
                userId: request.user.userId,
                announcementId: announcement.id,
            }, 'Announcement updated successfully');
            reply.send({
                success: true,
                data: announcement,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, announcementId: request.params.id }, 'Failed to update announcement');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
    /**
     * DELETE /announcements/:id - Delete announcement (CEO only)
     */
    fastify.delete('/announcements/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Delete Announcement',
            description: 'Delete an announcement (CEO only)',
            params: typebox_1.Type.Object({
                id: typebox_1.Type.String(),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
                403: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                404: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // Only CEO can delete announcements
            if (request.user?.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Only CEO users can delete announcements');
            }
            await announcementRepository.softDelete(request.params.id, request.user.userId);
            logger_1.loggers.api.info({
                userId: request.user.userId,
                announcementId: request.params.id,
            }, 'Announcement deleted successfully');
            reply.send({
                success: true,
                message: 'Announcement deleted successfully',
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, announcementId: request.params.id }, 'Failed to delete announcement');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
    /**
     * POST /announcements/:id/read - Mark announcement as read
     */
    fastify.post('/announcements/:id/read', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Mark Announcement as Read',
            description: 'Mark an announcement as read by the current user',
            params: typebox_1.Type.Object({
                id: typebox_1.Type.String(),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
                404: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            await announcementRepository.markAsRead(request.params.id, request.user.userId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                announcementId: request.params.id,
            }, 'Announcement marked as read');
            reply.send({
                success: true,
                message: 'Announcement marked as read',
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, announcementId: request.params.id }, 'Failed to mark announcement as read');
            reply.code(500).send((0, errors_1.formatErrorResponse)(error));
        }
    });
    /**
     * GET /announcements/stats - Get announcement statistics (CEO only)
     */
    fastify.get('/announcements/stats', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Announcements'],
            summary: 'Get Announcement Statistics',
            description: 'Get announcement statistics (CEO only)',
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        total: typebox_1.Type.Number(),
                        published: typebox_1.Type.Number(),
                        scheduled: typebox_1.Type.Number(),
                        expired: typebox_1.Type.Number(),
                        byType: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Number()),
                        byPriority: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Number()),
                        byAudience: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Number()),
                    }),
                }),
                403: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // Only CEO can view stats
            if (request.user?.role !== 'ceo') {
                throw new errors_1.AuthorizationError('Only CEO users can view announcement statistics');
            }
            const stats = await announcementRepository.getStats();
            reply.send({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error }, 'Failed to get announcement stats');
            if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send((0, errors_1.formatErrorResponse)(error));
            }
        }
    });
}
//# sourceMappingURL=AnnouncementRoutes.js.map