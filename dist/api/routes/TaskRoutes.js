"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTaskRoutes = void 0;
const typebox_1 = require("@sinclair/typebox");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const EmailService_1 = require("@/services/EmailService");
const errors_1 = require("@utils/errors");
const middleware_1 = require("@auth/middleware");
const CacheService_1 = require("../../services/CacheService");
const cache_decorators_1 = require("@utils/cache-decorators");
const utils_1 = require("@websocket/utils");
const validation_1 = require("@utils/validation");
/**
 * Task Management API Routes
 * Enterprise-grade task CRUD operations with real-time updates
 */
// Request/Response Schemas
const CreateTaskSchema = typebox_1.Type.Object({
    title: typebox_1.Type.String({ minLength: 1, maxLength: 255 }),
    description: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 2000 })),
    channel_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    parent_task_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    assigned_to: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.UUIDSchema)),
    owned_by: typebox_1.Type.Optional(validation_1.UUIDSchema),
    priority: typebox_1.Type.Optional(validation_1.TaskPrioritySchema),
    task_type: typebox_1.Type.Optional(typebox_1.Type.Union([
        typebox_1.Type.Literal('general'),
        typebox_1.Type.Literal('project'),
        typebox_1.Type.Literal('maintenance'),
        typebox_1.Type.Literal('emergency'),
        typebox_1.Type.Literal('research'),
        typebox_1.Type.Literal('approval'),
    ])),
    complexity: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 1, maximum: 10 })),
    estimated_hours: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 0 })),
    due_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    start_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String({ maxLength: 50 }))),
    labels: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    voice_created: typebox_1.Type.Optional(typebox_1.Type.Boolean()),
    voice_command_id: typebox_1.Type.Optional(typebox_1.Type.String()),
    voice_instructions: typebox_1.Type.Optional(typebox_1.Type.String()),
    business_value: typebox_1.Type.Optional(validation_1.BusinessValueSchema),
    acceptance_criteria: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 2000 })),
});
const UpdateTaskSchema = typebox_1.Type.Object({
    title: typebox_1.Type.Optional(typebox_1.Type.String({ minLength: 1, maxLength: 255 })),
    description: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 2000 })),
    priority: typebox_1.Type.Optional(validation_1.TaskPrioritySchema),
    status: typebox_1.Type.Optional(validation_1.TaskStatusSchema),
    complexity: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 1, maximum: 10 })),
    estimated_hours: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 0 })),
    due_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    start_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String({ maxLength: 50 }))),
    labels: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    business_value: typebox_1.Type.Optional(validation_1.BusinessValueSchema),
    acceptance_criteria: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 2000 })),
});
const TaskResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    title: typebox_1.Type.String(),
    description: typebox_1.Type.Optional(typebox_1.Type.String()),
    channel_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    parent_task_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    created_by: validation_1.UUIDSchema,
    assigned_to: typebox_1.Type.Array(validation_1.UUIDSchema),
    owned_by: typebox_1.Type.Optional(validation_1.UUIDSchema),
    priority: validation_1.TaskPrioritySchema,
    status: validation_1.TaskStatusSchema,
    task_type: typebox_1.Type.String(),
    complexity: typebox_1.Type.Integer(),
    estimated_hours: typebox_1.Type.Optional(typebox_1.Type.Number()),
    actual_hours: typebox_1.Type.Number(),
    story_points: typebox_1.Type.Optional(typebox_1.Type.Integer()),
    due_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    start_date: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    completed_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    progress_percentage: typebox_1.Type.Integer(),
    tags: typebox_1.Type.Array(typebox_1.Type.String()),
    labels: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any()),
    voice_created: typebox_1.Type.Boolean(),
    voice_command_id: typebox_1.Type.Optional(typebox_1.Type.String()),
    voice_instructions: typebox_1.Type.Optional(typebox_1.Type.String()),
    business_value: validation_1.BusinessValueSchema,
    acceptance_criteria: typebox_1.Type.Optional(typebox_1.Type.String()),
    watchers: typebox_1.Type.Array(validation_1.UUIDSchema),
    comments_count: typebox_1.Type.Integer(),
    attachments_count: typebox_1.Type.Integer(),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
    last_activity_at: typebox_1.Type.String({ format: 'date-time' }),
});
const TaskStatsSchema = typebox_1.Type.Object({
    totalTasks: typebox_1.Type.Integer(),
    tasksByStatus: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Integer()),
    tasksByPriority: typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Integer()),
    overdueTasks: typebox_1.Type.Integer(),
    completedThisWeek: typebox_1.Type.Integer(),
    averageCompletionTime: typebox_1.Type.Number(),
});
/**
 * Task service with caching
 */
class TaskService {
    async getTaskById(taskId) {
        return await index_1.taskRepository.findWithDetails(taskId);
    }
    async updateTask(taskId, updateData) {
        return await index_1.taskRepository.update(taskId, updateData);
    }
    async createTask(taskData) {
        return await index_1.taskRepository.createTask(taskData);
    }
}
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        keys: (taskId) => [cache_decorators_1.CacheKeyUtils.taskKey(taskId)],
        namespace: 'tasks',
        tags: ['tasks'],
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TaskService.prototype, "updateTask", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        allEntries: true,
        namespace: 'tasks',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TaskService.prototype, "createTask", null);
const taskService = new TaskService();
/**
 * Normalize status values from frontend format to database format
 */
const normalizeStatus = (status) => {
    if (!status)
        return status;
    // Convert frontend format (hyphen) to database format (underscore)
    const statusMap = {
        'in-progress': 'in_progress',
        'on-hold': 'on_hold'
    };
    return statusMap[status] || status;
};
// Comment Schemas
const CreateCommentSchema = typebox_1.Type.Object({
    content: typebox_1.Type.String({ minLength: 1, maxLength: 2000 }),
    parent_comment_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
});
const UpdateCommentSchema = typebox_1.Type.Object({
    content: typebox_1.Type.String({ minLength: 1, maxLength: 2000 }),
});
const CommentResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    task_id: validation_1.UUIDSchema,
    author_id: validation_1.UUIDSchema,
    author_name: typebox_1.Type.Optional(typebox_1.Type.String()),
    author_email: typebox_1.Type.Optional(typebox_1.Type.String()),
    content: typebox_1.Type.String(),
    is_edited: typebox_1.Type.Boolean(),
    edited_at: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    edited_by: typebox_1.Type.Optional(validation_1.UUIDSchema),
    edited_by_name: typebox_1.Type.Optional(typebox_1.Type.String()),
    parent_comment_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
});
const CommentsListResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Boolean(),
    data: typebox_1.Type.Array(CommentResponseSchema),
    total: typebox_1.Type.Integer(),
    limit: typebox_1.Type.Integer(),
    offset: typebox_1.Type.Integer(),
    hasMore: typebox_1.Type.Boolean(),
    timestamp: typebox_1.Type.String({ format: 'date-time' }),
});
const CommentSuccessResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Boolean(),
    data: CommentResponseSchema,
    timestamp: typebox_1.Type.String({ format: 'date-time' }),
});
/**
 * Register task routes
 */
const registerTaskRoutes = async (fastify) => {
    /**
     * GET /tasks - List tasks with filters
     */
    fastify.get('/tasks', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    status: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.TaskStatusSchema)),
                    priority: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.TaskPrioritySchema)),
                    assigned_to: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    channel_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    created_by: typebox_1.Type.Optional(validation_1.UUIDSchema),
                    due_after: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                    due_before: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
                    overdue: typebox_1.Type.Optional(typebox_1.Type.Boolean()),
                    voice_created: typebox_1.Type.Optional(typebox_1.Type.Boolean()),
                    search: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 200 })),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(TaskResponseSchema),
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
            const { limit = 20, offset = 0, status, priority, assigned_to, channel_id, created_by, due_after, due_before, tags, overdue, voice_created, search, } = request.query;
            // Debug logging for filter parameters
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                queryParams: {
                    limit,
                    offset,
                    status: Array.isArray(status) ? status : [status],
                    priority: Array.isArray(priority) ? priority : [priority],
                    assigned_to,
                    channel_id,
                    created_by,
                    due_after,
                    due_before,
                    tags,
                    overdue,
                    voice_created,
                    search,
                }
            }, 'Task filter request received');
            // Build task filters
            const filters = {};
            if (status) {
                filters.status = Array.isArray(status) ? status : [status];
            }
            if (priority) {
                filters.priority = Array.isArray(priority) ? priority : [priority];
            }
            if (assigned_to)
                filters.assignedTo = [assigned_to];
            if (channel_id)
                filters.channelId = channel_id;
            if (due_after)
                filters.dueAfter = new Date(due_after);
            if (due_before)
                filters.dueBefore = new Date(due_before);
            if (tags) {
                filters.tags = Array.isArray(tags) ? tags : [tags];
            }
            if (overdue !== undefined)
                filters.overdue = overdue;
            if (voice_created !== undefined)
                filters.voiceCreated = voice_created;
            // Filter based on user permissions (non-CEO users only see their tasks unless specified)
            if (request.user.role !== 'ceo' && !assigned_to && !created_by) {
                filters.assignedTo = [request.user.userId];
            }
            let tasks = [];
            let total = 0;
            if (search) {
                // Use search functionality with assignee details
                tasks = await index_1.taskRepository.searchTasksWithDetails(search, request.user.userId, Math.min(limit, 100), offset);
                total = tasks.length; // Approximation for search results
            }
            else {
                // Use filtered query with assignee details
                tasks = await index_1.taskRepository.findWithFiltersAndDetails(filters, Math.min(limit, 100), offset);
                // TODO: Get total count for pagination
                total = tasks.length;
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                filters,
                search,
                resultCount: tasks.length,
            }, 'Tasks list retrieved');
            reply.send({
                success: true,
                data: tasks,
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
            // Enhanced error logging
            logger_1.loggers.api.error({
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    name: error instanceof Error ? error.name : undefined,
                },
                context,
                queryParams: request.query,
            }, 'Failed to retrieve tasks - detailed error');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve tasks',
                    code: 'SERVER_ERROR',
                    details: error instanceof Error ? error.message : String(error),
                },
            });
        }
    });
    /**
     * GET /tasks/:id - Get task details
     */
    fastify.get('/tasks/:id', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const task = await taskService.getTaskById(id);
            if (!task) {
                throw new errors_1.NotFoundError('Task not found');
            }
            // Check if user has access to this task
            const hasAccess = request.user.role === 'ceo' ||
                task.assigned_to.includes(request.user.userId) ||
                task.created_by === request.user.userId ||
                task.watchers.includes(request.user.userId);
            if (!hasAccess) {
                throw new errors_1.AuthorizationError('You do not have access to this task');
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
            }, 'Task details retrieved');
            reply.send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve task');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to retrieve task',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /tasks - Create new task
     */
    fastify.post('/tasks', {
        preHandler: [middleware_1.authenticate, middleware_1.requireManagerOrCEO],
        schema: {
            body: CreateTaskSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // If channel_id is specified, verify user has access to the channel
            if (request.body.channel_id) {
                const hasChannelAccess = await index_1.channelRepository.canUserAccess(request.body.channel_id, request.user.userId, request.user.role);
                if (!hasChannelAccess) {
                    throw new errors_1.AuthorizationError('You do not have access to create tasks in this channel');
                }
            }
            // Check if manager is trying to assign other managers
            if (request.user.role === 'manager' && request.body.assigned_to) {
                const { userRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
                const usersToAssign = await Promise.all(request.body.assigned_to.map(userId => userRepository.findById(userId)));
                const otherManagersBeingAssigned = usersToAssign.filter(user => user && user.role === 'manager' && user.id !== request.user.userId);
                if (otherManagersBeingAssigned.length > 0) {
                    throw new errors_1.AuthorizationError('Managers cannot assign other managers to tasks');
                }
            }
            const taskData = {
                ...request.body,
                created_by: request.user.userId,
                assigned_to: request.body.assigned_to || [request.user.userId],
                owned_by: request.body.owned_by || request.user.userId,
                tags: request.body.tags || [],
                labels: request.body.labels || {},
                due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
                start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
            };
            const task = await taskService.createTask(taskData);
            // Create activity for task creation
            try {
                const activityData = {
                    taskId: task.id,
                    userId: request.user.userId,
                    activityType: 'task_created',
                    title: `Task Created: ${task.title}`,
                    description: `New task "${task.title}" was created${task.description ? ': ' + task.description : ''}`,
                    priority: task.priority,
                    category: 'task',
                    metadata: {
                        taskId: task.id,
                        taskTitle: task.title,
                        taskStatus: task.status,
                        taskPriority: task.priority,
                        assignedTo: task.assigned_to,
                        channelId: task.channel_id,
                        createdBy: request.user.userId,
                        createdByName: request.user.name
                    }
                };
                if (task.channel_id) {
                    activityData.channelId = task.channel_id;
                }
                await index_1.activityRepository.createActivity(activityData);
            }
            catch (error) {
                logger_1.loggers.api.warn?.({ error, taskId: task.id }, 'Failed to create task creation activity');
            }
            // Broadcast task creation
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: 'task_created',
                taskId: task.id,
                channelId: task.channel_id || '',
                task: {
                    id: task.id,
                    title: task.title,
                    ...(task.description ? { description: task.description } : {}),
                    status: task.status,
                    priority: task.priority,
                    assignedTo: task.assigned_to,
                    ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                    progress: task.progress_percentage,
                    tags: task.tags,
                },
                action: 'create',
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            // Send notifications and emails to assignees
            if (task.assigned_to.length > 0) {
                const [currentUser, assigneeUsers] = await Promise.all([
                    index_1.userRepository.findById(request.user.userId),
                    Promise.all(task.assigned_to.map(id => index_1.userRepository.findById(id)))
                ]);
                for (let i = 0; i < task.assigned_to.length; i++) {
                    const assigneeId = task.assigned_to[i];
                    const assigneeUser = assigneeUsers[i];
                    if (assigneeId && assigneeId !== request.user.userId && assigneeUser && currentUser) {
                        // Send WebSocket notification
                        await utils_1.WebSocketUtils.createAndSendNotification(assigneeId, {
                            title: 'New Task Assigned',
                            message: `You have been assigned to task: ${task.title}`,
                            category: 'task',
                            priority: task.priority === 'critical' || task.priority === 'urgent' ? 'high' : 'medium',
                            actionUrl: `/tasks/${task.id}`,
                            actionText: 'View Task',
                            data: { taskId: task.id, taskTitle: task.title },
                        });
                        // Send email notification
                        EmailService_1.emailService.sendTaskAssigned({
                            userEmail: assigneeUser.email,
                            userName: assigneeUser.name || 'User',
                            taskTitle: task.title,
                            taskDescription: task.description || undefined,
                            assignedByName: currentUser.name || 'Someone',
                            dueDate: task.due_date?.toLocaleDateString() || undefined,
                            priority: task.priority || undefined,
                        }).catch(error => {
                            logger_1.logger.warn({ error, userId: assigneeId, taskId: task.id }, 'Failed to send task assignment email');
                        });
                    }
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: task.id,
                taskTitle: task.title,
                assignedTo: task.assigned_to,
                priority: task.priority,
            }, 'Task created successfully');
            reply.code(201).send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to create task');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create task',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * PUT /tasks/:id - Update task
     */
    fastify.put('/tasks/:id', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: UpdateTaskSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updateData = {
                ...request.body,
                status: normalizeStatus(request.body.status),
                due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
                start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
            };
            // Check if user can update this task
            const existingTask = await index_1.taskRepository.findById(id);
            if (!existingTask) {
                throw new errors_1.NotFoundError('Task not found');
            }
            const canUpdate = request.user.role === 'ceo' ||
                existingTask.assigned_to.includes(request.user.userId) ||
                existingTask.created_by === request.user.userId ||
                existingTask.owned_by === request.user.userId;
            if (!canUpdate) {
                throw new errors_1.AuthorizationError('You do not have permission to update this task');
            }
            const task = await taskService.updateTask(id, updateData);
            // Broadcast task update
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: 'task_updated',
                taskId: id,
                channelId: task.channel_id || '',
                task: {
                    id: task.id,
                    title: task.title,
                    ...(task.description ? { description: task.description } : {}),
                    status: task.status,
                    priority: task.priority,
                    assignedTo: task.assigned_to,
                    ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                    progress: task.progress_percentage,
                    tags: task.tags,
                },
                action: 'update',
                changes: updateData,
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
                updatedFields: Object.keys(updateData),
            }, 'Task updated successfully');
            reply.send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to update task');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update task',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * PATCH /tasks/:id/status - Update task status
     */
    fastify.patch('/tasks/:id/status', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                status: validation_1.TaskStatusSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { status } = request.body;
            // Get current task to capture old status
            const oldTask = await index_1.taskRepository.findById(id);
            if (!oldTask) {
                throw new errors_1.NotFoundError('Task not found');
            }
            const oldStatus = oldTask.status;
            const task = await index_1.taskRepository.updateStatus(id, status, request.user.userId);
            // Create activity for task status update
            try {
                const activityType = status === 'completed' ? 'task_completed' : 'task_updated';
                const activityTitle = status === 'completed'
                    ? `Task Completed: ${task.title}`
                    : `Task Status Updated: ${task.title}`;
                const activityDescription = status === 'completed'
                    ? `Task "${task.title}" was marked as completed`
                    : `Task "${task.title}" status was updated to ${status}`;
                const activityData = {
                    taskId: task.id,
                    userId: request.user.userId,
                    activityType,
                    title: activityTitle,
                    description: activityDescription,
                    priority: task.priority,
                    category: 'task',
                    metadata: {
                        taskId: task.id,
                        taskTitle: task.title,
                        oldStatus: status, // Note: we don't have the old status here, but status is the new one
                        newStatus: status,
                        taskPriority: task.priority,
                        assignedTo: task.assigned_to,
                        channelId: task.channel_id,
                        updatedBy: request.user.userId,
                        updatedByName: request.user.name
                    }
                };
                if (task.channel_id) {
                    activityData.channelId = task.channel_id;
                }
                await index_1.activityRepository.createActivity(activityData);
            }
            catch (error) {
                logger_1.loggers.api.warn?.({ error, taskId: id }, 'Failed to create task status update activity');
            }
            // Broadcast status change
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: status === 'completed' ? 'task_completed' : 'task_updated',
                taskId: id,
                channelId: task.channel_id || '',
                task: {
                    id: task.id,
                    title: task.title,
                    ...(task.description ? { description: task.description } : {}),
                    status: task.status,
                    priority: task.priority,
                    assignedTo: task.assigned_to,
                    ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                    progress: task.progress_percentage,
                    tags: task.tags,
                },
                action: status === 'completed' ? 'complete' : 'update',
                changes: { status },
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            // Send status change notifications and emails
            if (oldStatus !== status) {
                const [currentUser, assigneeUsers] = await Promise.all([
                    index_1.userRepository.findById(request.user.userId),
                    Promise.all(task.assigned_to.map(id => index_1.userRepository.findById(id)))
                ]);
                for (let i = 0; i < task.assigned_to.length; i++) {
                    const assigneeId = task.assigned_to[i];
                    const assigneeUser = assigneeUsers[i];
                    if (assigneeId && assigneeId !== request.user.userId && assigneeUser && currentUser) {
                        // Send WebSocket notification
                        if (status === 'completed') {
                            await utils_1.WebSocketUtils.createAndSendNotification(assigneeId, {
                                title: 'Task Completed',
                                message: `Task "${task.title}" has been completed`,
                                category: 'task',
                                priority: 'medium',
                                actionUrl: `/tasks/${task.id}`,
                                actionText: 'View Task',
                                data: { taskId: task.id, taskTitle: task.title },
                            });
                        }
                        // Send email notification for status change
                        EmailService_1.emailService.sendTaskStatusChanged({
                            userEmail: assigneeUser.email,
                            userName: assigneeUser.name || 'User',
                            taskTitle: task.title,
                            oldStatus: oldStatus,
                            newStatus: status,
                            changedByName: currentUser.name || 'Someone',
                        }).catch(error => {
                            logger_1.logger.warn({ error, userId: assigneeId, taskId: task.id }, 'Failed to send task status change email');
                        });
                    }
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
                newStatus: status,
            }, 'Task status updated successfully');
            reply.send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to update task status');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update task status',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /tasks/:id/assign - Assign users to task
     */
    fastify.post('/tasks/:id/assign', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                user_ids: typebox_1.Type.Array(validation_1.UUIDSchema),
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { user_ids } = request.body;
            // Check if current user is a manager trying to assign other managers
            if (request.user.role === 'manager') {
                // Get user roles for the users being assigned
                const { userRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
                const usersToAssign = await Promise.all(user_ids.map(userId => userRepository.findById(userId)));
                const otherManagersBeingAssigned = usersToAssign.filter(user => user && user.role === 'manager' && user.id !== request.user.userId);
                if (otherManagersBeingAssigned.length > 0) {
                    throw new errors_1.AuthorizationError('Managers cannot assign other managers to tasks');
                }
            }
            const success = await index_1.taskRepository.assignUsers(id, user_ids, request.user.userId);
            if (!success) {
                throw new errors_1.ValidationError('Failed to assign users to task', []);
            }
            // Clear task cache
            await CacheService_1.cacheService.tasks.delete(cache_decorators_1.CacheKeyUtils.taskKey(id));
            // Get updated task for broadcast
            const task = await index_1.taskRepository.findById(id);
            if (task) {
                // Create activity for task assignment
                try {
                    const activityData = {
                        taskId: task.id,
                        userId: request.user.userId,
                        activityType: 'task_assigned',
                        title: `Task Assigned: ${task.title}`,
                        description: `Task "${task.title}" was assigned to ${user_ids.length} user(s)`,
                        priority: task.priority,
                        category: 'task',
                        metadata: {
                            taskId: task.id,
                            taskTitle: task.title,
                            assignedUserIds: user_ids,
                            taskPriority: task.priority,
                            channelId: task.channel_id,
                            assignedBy: request.user.userId,
                            assignedByName: request.user.name,
                            totalAssignedUsers: task.assigned_to.length
                        }
                    };
                    if (task.channel_id) {
                        activityData.channelId = task.channel_id;
                    }
                    await index_1.activityRepository.createActivity(activityData);
                }
                catch (error) {
                    logger_1.loggers.api.warn?.({ error, taskId: id }, 'Failed to create task assignment activity');
                }
                // Broadcast assignment
                await utils_1.WebSocketUtils.broadcastTaskUpdate({
                    type: 'task_updated',
                    taskId: id,
                    channelId: task.channel_id || '',
                    task: {
                        id: task.id,
                        title: task.title,
                        ...(task.description ? { description: task.description } : {}),
                        status: task.status,
                        priority: task.priority,
                        assignedTo: task.assigned_to,
                        ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                        progress: task.progress_percentage,
                        tags: task.tags,
                    },
                    action: 'assign',
                    changes: { assigned_to: user_ids },
                    userId: request.user.userId,
                    userName: request.user.name,
                    userRole: request.user.role,
                });
                // Send notifications and emails to newly assigned users
                const [currentUser, assigneeUsers] = await Promise.all([
                    index_1.userRepository.findById(request.user.userId),
                    Promise.all(user_ids.map(id => index_1.userRepository.findById(id)))
                ]);
                for (let i = 0; i < user_ids.length; i++) {
                    const userId = user_ids[i];
                    const assigneeUser = assigneeUsers[i];
                    if (userId && assigneeUser && currentUser) {
                        // Send WebSocket notification
                        await utils_1.WebSocketUtils.createAndSendNotification(userId, {
                            title: 'Task Assigned',
                            message: `You have been assigned to task: ${task.title}`,
                            category: 'task',
                            priority: task.priority === 'critical' || task.priority === 'urgent' ? 'high' : 'medium',
                            actionUrl: `/tasks/${task.id}`,
                            actionText: 'View Task',
                            data: { taskId: task.id, taskTitle: task.title },
                        });
                        // Send email notification
                        EmailService_1.emailService.sendTaskAssigned({
                            userEmail: assigneeUser.email,
                            userName: assigneeUser.name || 'User',
                            taskTitle: task.title,
                            taskDescription: task.description || undefined,
                            assignedByName: currentUser.name || 'Someone',
                            dueDate: task.due_date?.toLocaleDateString() || undefined,
                            priority: task.priority || undefined,
                        }).catch(error => {
                            logger_1.logger.warn({ error, userId, taskId: task.id }, 'Failed to send task assignment email');
                        });
                    }
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
                assignedUsers: user_ids,
            }, 'Users assigned to task successfully');
            reply.send({
                success: true,
                message: 'Users assigned successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to assign users to task');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to assign users',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /tasks/:id - Delete task
     */
    fastify.delete('/tasks/:id', {
        preHandler: [middleware_1.authenticate, middleware_1.requireManagerOrCEO],
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
            const success = await index_1.taskRepository.softDelete(id, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('Task not found');
            }
            // Clear task cache
            await CacheService_1.cacheService.tasks.delete(cache_decorators_1.CacheKeyUtils.taskKey(id));
            // Broadcast task deletion
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: 'task_deleted',
                taskId: id,
                task: {},
                action: 'delete',
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
            }, 'Task deleted successfully');
            reply.send({
                success: true,
                message: 'Task deleted successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to delete task');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete task',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /tasks/stats - Get task statistics
     */
    fastify.get('/tasks/stats', {
        preHandler: [middleware_1.authenticate],
        schema: {
            querystring: typebox_1.Type.Object({
                user_id: typebox_1.Type.Optional(validation_1.UUIDSchema),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskStatsSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { user_id } = request.query;
            // Only CEO can view stats for other users
            const targetUserId = user_id && request.user.role === 'ceo' ? user_id : request.user.userId;
            const stats = await index_1.taskRepository.getTaskStats(targetUserId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                targetUserId,
                stats,
            }, 'Task stats retrieved');
            reply.send({
                success: true,
                data: stats,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve task stats');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve task stats',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /channels/:channelId/tasks - Get channel tasks
     */
    fastify.get('/channels/:channelId/tasks', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    status: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.TaskStatusSchema)),
                    priority: typebox_1.Type.Optional(typebox_1.Type.Array(validation_1.TaskPrioritySchema)),
                    assigned_to: typebox_1.Type.Optional(validation_1.UUIDSchema),
                }),
            ]),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Array(TaskResponseSchema),
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
            const { limit = 20, offset = 0, status, priority, assigned_to } = request.query;
            // Build filters
            const filters = {
                channelId,
                status,
                priority,
                assignedTo: assigned_to ? [assigned_to] : undefined,
            };
            const tasks = await index_1.taskRepository.findWithFiltersAndDetails(filters, Math.min(limit, 100), offset);
            const total = tasks.length; // Simplified - in production, implement proper count query
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                taskCount: tasks.length,
                filters,
            }, 'Channel tasks retrieved');
            reply.send({
                success: true,
                data: tasks,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel tasks');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channel tasks',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * POST /channels/:channelId/tasks - Create task in channel
     */
    fastify.post('/channels/:channelId/tasks', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Omit(CreateTaskSchema, ['channel_id']),
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            // Check if manager is trying to assign other managers
            if (request.user.role === 'manager' && request.body.assigned_to) {
                const { userRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
                const usersToAssign = await Promise.all(request.body.assigned_to.map(userId => userRepository.findById(userId)));
                const otherManagersBeingAssigned = usersToAssign.filter(user => user && user.role === 'manager' && user.id !== request.user.userId);
                if (otherManagersBeingAssigned.length > 0) {
                    throw new errors_1.AuthorizationError('Managers cannot assign other managers to tasks');
                }
            }
            const taskData = {
                ...request.body,
                channel_id: channelId,
                created_by: request.user.userId,
                assigned_to: request.body.assigned_to || [request.user.userId],
                owned_by: request.body.owned_by || request.user.userId,
                tags: request.body.tags || [],
                labels: request.body.labels || {},
                due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
                start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
            };
            const task = await taskService.createTask(taskData);
            // Create activity for channel task creation
            try {
                await index_1.activityRepository.createActivity({
                    channelId,
                    taskId: task.id,
                    userId: request.user.userId,
                    activityType: 'task_created',
                    title: `Channel Task Created: ${task.title}`,
                    description: `New task "${task.title}" was created in channel${task.description ? ': ' + task.description : ''}`,
                    priority: task.priority,
                    category: 'task',
                    metadata: {
                        taskId: task.id,
                        taskTitle: task.title,
                        taskStatus: task.status,
                        taskPriority: task.priority,
                        assignedTo: task.assigned_to,
                        channelId,
                        createdBy: request.user.userId,
                        createdByName: request.user.name,
                        isChannelTask: true
                    }
                });
            }
            catch (error) {
                logger_1.loggers.api.warn?.({ error, taskId: task.id, channelId }, 'Failed to create channel task creation activity');
            }
            // Broadcast task creation to channel and task management system
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: 'task_created',
                taskId: task.id,
                channelId,
                task: {
                    id: task.id,
                    title: task.title,
                    ...(task.description ? { description: task.description } : {}),
                    status: task.status,
                    priority: task.priority,
                    assignedTo: task.assigned_to,
                    ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                    progress: task.progress_percentage,
                    tags: task.tags,
                },
                action: 'create',
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            // Send channel notification message
            if (channelId) {
                await utils_1.WebSocketUtils.broadcastChannelMessage({
                    type: 'chat_message',
                    channelId,
                    messageId: `task_created_${task.id}`,
                    message: `Task "${task.title}" was created`,
                    messageType: 'system',
                    userId: request.user.userId,
                    userName: request.user.name,
                    userRole: request.user.role,
                });
            }
            // Send notifications to assignees
            if (task.assigned_to.length > 0) {
                for (const assigneeId of task.assigned_to) {
                    if (assigneeId !== request.user.userId) {
                        await utils_1.WebSocketUtils.createAndSendNotification(assigneeId, {
                            title: 'New Channel Task Assigned',
                            message: `You have been assigned to task: ${task.title} in channel`,
                            category: 'task',
                            priority: task.priority === 'critical' || task.priority === 'urgent' ? 'high' : 'medium',
                            actionUrl: `/channels/${channelId}?task=${task.id}`,
                            actionText: 'View Task',
                            data: {
                                taskId: task.id,
                                taskTitle: task.title,
                                channelId,
                            },
                        });
                    }
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                taskId: task.id,
                taskTitle: task.title,
                assignedTo: task.assigned_to,
            }, 'Channel task created successfully');
            reply.code(201).send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to create channel task');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create channel task',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * PUT /tasks/:id/channel - Link task to channel
     */
    fastify.put('/tasks/:id/channel', {
        preHandler: [middleware_1.authenticate],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                channel_id: typebox_1.Type.Union([validation_1.UUIDSchema, typebox_1.Type.Null()]),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { channel_id } = request.body;
            // Check if user can update this task
            const existingTask = await index_1.taskRepository.findById(id);
            if (!existingTask) {
                throw new errors_1.NotFoundError('Task not found');
            }
            const canUpdate = request.user.role === 'ceo' ||
                existingTask.assigned_to.includes(request.user.userId) ||
                existingTask.created_by === request.user.userId ||
                existingTask.owned_by === request.user.userId;
            if (!canUpdate) {
                throw new errors_1.AuthorizationError('You do not have permission to update this task');
            }
            // If linking to a channel, verify user has access
            if (channel_id) {
                const hasChannelAccess = await index_1.channelRepository.canUserAccess(channel_id, request.user.userId, request.user.role);
                if (!hasChannelAccess) {
                    throw new errors_1.AuthorizationError('You do not have access to this channel');
                }
            }
            const task = await taskService.updateTask(id, { channel_id });
            // Broadcast to both old and new channels
            if (existingTask.channel_id) {
                await utils_1.WebSocketUtils.broadcastChannelMessage({
                    type: 'chat_message',
                    channelId: existingTask.channel_id,
                    messageId: `task_unlink_${task.id}`,
                    message: `Task "${task.title}" was unlinked from this channel`,
                    messageType: 'system',
                    userId: request.user.userId,
                    userName: request.user.name,
                    userRole: request.user.role,
                });
            }
            if (channel_id) {
                await utils_1.WebSocketUtils.broadcastChannelMessage({
                    type: 'chat_message',
                    channelId: channel_id,
                    messageId: `task_link_${task.id}`,
                    message: `Task "${task.title}" was linked to this channel`,
                    messageType: 'system',
                    userId: request.user.userId,
                    userName: request.user.name,
                    userRole: request.user.role,
                });
            }
            // Also broadcast to task system
            await utils_1.WebSocketUtils.broadcastTaskUpdate({
                type: 'task_updated',
                taskId: id,
                channelId: channel_id || '',
                task: {
                    id: task.id,
                    title: task.title,
                    ...(task.description ? { description: task.description } : {}),
                    status: task.status,
                    priority: task.priority,
                    assignedTo: task.assigned_to,
                    ...(task.due_date ? { dueDate: task.due_date.toISOString() } : {}),
                    progress: task.progress_percentage,
                    tags: task.tags,
                },
                action: 'update',
                changes: { channel_id },
                userId: request.user.userId,
                userName: request.user.name,
                userRole: request.user.role,
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId: id,
                oldChannelId: existingTask.channel_id,
                newChannelId: channel_id,
            }, 'Task channel link updated successfully');
            reply.send({
                success: true,
                data: task,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to update task channel link');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.AuthorizationError) {
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update task channel link',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /channels/:channelId/tasks/stats - Get channel task statistics
     */
    fastify.get('/channels/:channelId/tasks/stats', {
        preHandler: [middleware_1.authenticate, middleware_1.requireChannelAccess],
        schema: {
            params: typebox_1.Type.Object({
                channelId: validation_1.UUIDSchema,
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: TaskStatsSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { channelId } = request.params;
            // Get channel task statistics by using regular getTaskStats with channel filter
            // This is a simplified implementation - in production, implement proper channel stats
            const stats = await index_1.taskRepository.getTaskStats(request.user.userId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                stats,
            }, 'Channel task stats retrieved');
            reply.send({
                success: true,
                data: stats,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve channel task stats');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve channel task stats',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * GET /tasks/:taskId/comments - Get task comments
     */
    fastify.get('/tasks/:taskId/comments', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
            }),
            querystring: typebox_1.Type.Object({
                limit: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
                offset: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 0, default: 0 })),
                includeReplies: typebox_1.Type.Optional(typebox_1.Type.Boolean({ default: true })),
            }),
            response: {
                200: CommentsListResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId } = request.params;
            const { limit = 50, offset = 0, includeReplies = true } = request.query;
            const result = await index_1.commentRepository.getTaskComments(taskId, {
                limit,
                offset,
                includeReplies,
            }, request.user?.userId);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId,
                commentsCount: result.data.length,
                total: result.total,
            }, 'Task comments retrieved');
            reply.send({
                success: true,
                ...result,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve task comments');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to retrieve task comments',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /tasks/:taskId/comments - Add comment to task
     */
    fastify.post('/tasks/:taskId/comments', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
            }),
            body: CreateCommentSchema,
            response: {
                201: CommentSuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId } = request.params;
            const { content, parent_comment_id } = request.body;
            const commentData = {
                task_id: taskId,
                author_id: request.user.userId,
                content,
            };
            if (parent_comment_id) {
                commentData.parent_comment_id = parent_comment_id;
            }
            const comment = await index_1.commentRepository.createComment(commentData);
            // Get the comment with author information
            const commentWithDetails = await index_1.commentRepository.getCommentById(comment.id);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId,
                commentId: comment.id,
            }, 'Comment created successfully');
            reply.code(201).send({
                success: true,
                data: commentWithDetails,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to create comment');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create comment',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * PUT /tasks/:taskId/comments/:commentId - Update comment
     */
    fastify.put('/tasks/:taskId/comments/:commentId', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
                commentId: validation_1.UUIDSchema,
            }),
            body: UpdateCommentSchema,
            response: {
                200: CommentSuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId, commentId } = request.params;
            const { content } = request.body;
            const updatedComment = await index_1.commentRepository.updateComment(commentId, { content }, request.user.userId, request.user.role);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId,
                commentId,
            }, 'Comment updated successfully');
            reply.send({
                success: true,
                data: updatedComment,
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
            logger_1.loggers.api.error({ error, context }, 'Failed to update comment');
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
                reply.code(500).send({
                    error: {
                        message: 'Failed to update comment',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * DELETE /tasks/:taskId/comments/:commentId - Delete comment
     */
    fastify.delete('/tasks/:taskId/comments/:commentId', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
                commentId: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId, commentId } = request.params;
            const deleted = await index_1.commentRepository.deleteComment(commentId, request.user.userId, request.user.role);
            if (!deleted) {
                throw new errors_1.NotFoundError('Comment not found or already deleted');
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                taskId,
                commentId,
            }, 'Comment deleted successfully');
            reply.send({
                success: true,
                message: 'Comment deleted successfully',
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
            logger_1.loggers.api.error({ error, context }, 'Failed to delete comment');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.AuthorizationError) {
                reply.code(403).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete comment',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /tasks/:taskId/comments/:commentId/reactions - Add reaction to comment
     */
    fastify.post('/tasks/:taskId/comments/:commentId/reactions', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
                commentId: validation_1.UUIDSchema,
            }),
            body: typebox_1.Type.Object({
                reaction_type: typebox_1.Type.Union([
                    typebox_1.Type.Literal('up'),
                    typebox_1.Type.Literal('down'),
                    typebox_1.Type.Literal('thumbs_up'),
                    typebox_1.Type.Literal('thumbs_down')
                ]),
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
                400: typebox_1.Type.Object({ error: typebox_1.Type.Object({ message: typebox_1.Type.String(), code: typebox_1.Type.String() }) }),
                404: typebox_1.Type.Object({ error: typebox_1.Type.Object({ message: typebox_1.Type.String(), code: typebox_1.Type.String() }) }),
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId, commentId } = request.params;
            const { reaction_type } = request.body;
            const userId = request.user.userId;
            // Normalize reaction types from frontend format to backend format
            const normalizedReactionType = reaction_type === 'thumbs_up' ? 'up' :
                reaction_type === 'thumbs_down' ? 'down' :
                    reaction_type;
            // Verify comment exists and belongs to the task
            const comment = await index_1.commentRepository.findByIdAndTask(commentId, taskId);
            if (!comment) {
                return reply.code(404).send({
                    error: {
                        message: 'Comment not found',
                        code: 'COMMENT_NOT_FOUND',
                    },
                });
            }
            // Add or update reaction
            await index_1.commentRepository.addOrUpdateReaction(commentId, userId, normalizedReactionType);
            logger_1.logger.info({
                userId,
                taskId,
                commentId,
                reactionType: normalizedReactionType,
            }, 'Comment reaction added');
            reply.send({
                success: true,
                message: 'Reaction added successfully',
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                user: request.user ? {
                    id: request.user.userId,
                    email: request.user.email,
                    role: request.user.role
                } : undefined,
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to add comment reaction');
            reply.code(500).send({
                error: {
                    message: 'Failed to add reaction',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
    /**
     * DELETE /tasks/:taskId/comments/:commentId/reactions - Remove reaction from comment
     */
    fastify.delete('/tasks/:taskId/comments/:commentId/reactions', {
        preHandler: [middleware_1.authenticate, middleware_1.apiRateLimit],
        schema: {
            params: typebox_1.Type.Object({
                taskId: validation_1.UUIDSchema,
                commentId: validation_1.UUIDSchema,
            }),
            response: {
                200: validation_1.SuccessResponseSchema,
                404: typebox_1.Type.Object({ error: typebox_1.Type.Object({ message: typebox_1.Type.String(), code: typebox_1.Type.String() }) }),
            },
        },
    }, async (request, reply) => {
        try {
            const { taskId, commentId } = request.params;
            const userId = request.user.userId;
            // Verify comment exists and belongs to the task
            const comment = await index_1.commentRepository.findByIdAndTask(commentId, taskId);
            if (!comment) {
                return reply.code(404).send({
                    error: {
                        message: 'Comment not found',
                        code: 'COMMENT_NOT_FOUND',
                    },
                });
            }
            // Remove reaction
            await index_1.commentRepository.removeReaction(commentId, userId);
            logger_1.logger.info({
                userId,
                taskId,
                commentId,
            }, 'Comment reaction removed');
            reply.send({
                success: true,
                message: 'Reaction removed successfully',
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                user: request.user ? {
                    id: request.user.userId,
                    email: request.user.email,
                    role: request.user.role
                } : undefined,
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers,
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to remove comment reaction');
            reply.code(500).send({
                error: {
                    message: 'Failed to remove reaction',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
};
exports.registerTaskRoutes = registerTaskRoutes;
//# sourceMappingURL=TaskRoutes.js.map