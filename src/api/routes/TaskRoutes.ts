import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { taskRepository, channelRepository, activityRepository, commentRepository } from '@db/index';
import { logger, loggers } from '@utils/logger';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  formatErrorResponse,
  createErrorContext,
} from '@utils/errors';
import { authenticate, authorize, authorizeRoles, requireChannelAccess, apiRateLimit, requireManagerOrCEO } from '@auth/middleware';
import { cacheService } from '../../services/CacheService';
import { Cacheable, CacheEvict, CacheKeyUtils } from '@utils/cache-decorators';
import { WebSocketUtils } from '@websocket/utils';
import {
  UUIDSchema,
  PaginationSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
  BusinessValueSchema,
  SuccessResponseSchema,
} from '@utils/validation';

/**
 * Task Management API Routes
 * Enterprise-grade task CRUD operations with real-time updates
 */

// Request/Response Schemas
const CreateTaskSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  channel_id: Type.Optional(UUIDSchema),
  parent_task_id: Type.Optional(UUIDSchema),
  assigned_to: Type.Optional(Type.Array(UUIDSchema)),
  owned_by: Type.Optional(UUIDSchema),
  priority: Type.Optional(TaskPrioritySchema),
  task_type: Type.Optional(
    Type.Union([
      Type.Literal('general'),
      Type.Literal('project'),
      Type.Literal('maintenance'),
      Type.Literal('emergency'),
      Type.Literal('research'),
      Type.Literal('approval'),
    ])
  ),
  complexity: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  estimated_hours: Type.Optional(Type.Number({ minimum: 0 })),
  due_date: Type.Optional(Type.String({ format: 'date-time' })),
  start_date: Type.Optional(Type.String({ format: 'date-time' })),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
  labels: Type.Optional(Type.Record(Type.String(), Type.Any())),
  voice_created: Type.Optional(Type.Boolean()),
  voice_command_id: Type.Optional(Type.String()),
  voice_instructions: Type.Optional(Type.String()),
  business_value: Type.Optional(BusinessValueSchema),
  acceptance_criteria: Type.Optional(Type.String({ maxLength: 2000 })),
});

const UpdateTaskSchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  priority: Type.Optional(TaskPrioritySchema),
  status: Type.Optional(TaskStatusSchema),
  complexity: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  estimated_hours: Type.Optional(Type.Number({ minimum: 0 })),
  due_date: Type.Optional(Type.String({ format: 'date-time' })),
  start_date: Type.Optional(Type.String({ format: 'date-time' })),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
  labels: Type.Optional(Type.Record(Type.String(), Type.Any())),
  business_value: Type.Optional(BusinessValueSchema),
  acceptance_criteria: Type.Optional(Type.String({ maxLength: 2000 })),
});

const TaskResponseSchema = Type.Object({
  id: UUIDSchema,
  title: Type.String(),
  description: Type.Optional(Type.String()),
  channel_id: Type.Optional(UUIDSchema),
  parent_task_id: Type.Optional(UUIDSchema),
  created_by: UUIDSchema,
  assigned_to: Type.Array(UUIDSchema),
  owned_by: Type.Optional(UUIDSchema),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  task_type: Type.String(),
  complexity: Type.Integer(),
  estimated_hours: Type.Optional(Type.Number()),
  actual_hours: Type.Number(),
  story_points: Type.Optional(Type.Integer()),
  due_date: Type.Optional(Type.String({ format: 'date-time' })),
  start_date: Type.Optional(Type.String({ format: 'date-time' })),
  completed_at: Type.Optional(Type.String({ format: 'date-time' })),
  progress_percentage: Type.Integer(),
  tags: Type.Array(Type.String()),
  labels: Type.Record(Type.String(), Type.Any()),
  voice_created: Type.Boolean(),
  voice_command_id: Type.Optional(Type.String()),
  voice_instructions: Type.Optional(Type.String()),
  business_value: BusinessValueSchema,
  acceptance_criteria: Type.Optional(Type.String()),
  watchers: Type.Array(UUIDSchema),
  comments_count: Type.Integer(),
  attachments_count: Type.Integer(),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
  last_activity_at: Type.String({ format: 'date-time' }),
});

const TaskStatsSchema = Type.Object({
  totalTasks: Type.Integer(),
  tasksByStatus: Type.Record(Type.String(), Type.Integer()),
  tasksByPriority: Type.Record(Type.String(), Type.Integer()),
  overdueTasks: Type.Integer(),
  completedThisWeek: Type.Integer(),
  averageCompletionTime: Type.Number(),
});

/**
 * Task service with caching
 */
class TaskService {
  @Cacheable({
    ttl: 900, // 15 minutes
    namespace: 'tasks',
    keyGenerator: (taskId: string) => CacheKeyUtils.taskKey(taskId),
  })
  async getTaskById(taskId: string) {
    return await taskRepository.findById(taskId);
  }

  @CacheEvict({
    keys: (taskId: string) => [CacheKeyUtils.taskKey(taskId)],
    namespace: 'tasks',
    tags: ['tasks'],
  })
  async updateTask(taskId: string, updateData: any) {
    return await taskRepository.update(taskId, updateData);
  }

  @CacheEvict({
    allEntries: true,
    namespace: 'tasks',
  })
  async createTask(taskData: any) {
    return await taskRepository.createTask(taskData);
  }
}

const taskService = new TaskService();

// Comment Schemas
const CreateCommentSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 2000 }),
  parent_comment_id: Type.Optional(UUIDSchema),
});

const UpdateCommentSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 2000 }),
});

const CommentResponseSchema = Type.Object({
  id: UUIDSchema,
  task_id: UUIDSchema,
  author_id: UUIDSchema,
  author_name: Type.Optional(Type.String()),
  author_email: Type.Optional(Type.String()),
  content: Type.String(),
  is_edited: Type.Boolean(),
  edited_at: Type.Optional(Type.String({ format: 'date-time' })),
  edited_by: Type.Optional(UUIDSchema),
  edited_by_name: Type.Optional(Type.String()),
  parent_comment_id: Type.Optional(UUIDSchema),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
});

const CommentsListResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Array(CommentResponseSchema),
  total: Type.Integer(),
  limit: Type.Integer(),
  offset: Type.Integer(),
  hasMore: Type.Boolean(),
  timestamp: Type.String({ format: 'date-time' }),
});

const CommentSuccessResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: CommentResponseSchema,
  timestamp: Type.String({ format: 'date-time' }),
});

/**
 * Register task routes
 */
export const registerTaskRoutes = async (fastify: FastifyInstance) => {
  /**
   * GET /tasks - List tasks with filters
   */
  fastify.get<{
    Querystring: typeof PaginationSchema.static & {
      status?: string[];
      priority?: string[];
      assigned_to?: string;
      channel_id?: string;
      created_by?: string;
      due_after?: string;
      due_before?: string;
      tags?: string[];
      overdue?: boolean;
      voice_created?: boolean;
      search?: string;
    };
  }>(
    '/tasks',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            status: Type.Optional(Type.Array(TaskStatusSchema)),
            priority: Type.Optional(Type.Array(TaskPrioritySchema)),
            assigned_to: Type.Optional(UUIDSchema),
            channel_id: Type.Optional(UUIDSchema),
            created_by: Type.Optional(UUIDSchema),
            due_after: Type.Optional(Type.String({ format: 'date-time' })),
            due_before: Type.Optional(Type.String({ format: 'date-time' })),
            tags: Type.Optional(Type.Array(Type.String())),
            overdue: Type.Optional(Type.Boolean()),
            voice_created: Type.Optional(Type.Boolean()),
            search: Type.Optional(Type.String({ maxLength: 200 })),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(TaskResponseSchema),
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
        const {
          limit = 20,
          offset = 0,
          status,
          priority,
          assigned_to,
          channel_id,
          created_by,
          due_after,
          due_before,
          tags,
          overdue,
          voice_created,
          search,
        } = request.query;

        // Debug logging for filter parameters
        loggers.api.info({
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
        const filters: any = {};
        if (status) {
          filters.status = Array.isArray(status) ? status : [status];
        }
        if (priority) {
          filters.priority = Array.isArray(priority) ? priority : [priority];
        }
        if (assigned_to) filters.assignedTo = [assigned_to];
        if (channel_id) filters.channelId = channel_id;
        if (due_after) filters.dueAfter = new Date(due_after);
        if (due_before) filters.dueBefore = new Date(due_before);
        if (tags) {
          filters.tags = Array.isArray(tags) ? tags : [tags];
        }
        if (overdue !== undefined) filters.overdue = overdue;
        if (voice_created !== undefined) filters.voiceCreated = voice_created;

        // Filter based on user permissions (non-CEO users only see their tasks unless specified)
        if (request.user!.role !== 'ceo' && !assigned_to && !created_by) {
          filters.assignedTo = [request.user!.userId];
        }

        let tasks: any[] = [];
        let total = 0;

        if (search) {
          // Use search functionality
          tasks = await taskRepository.searchTasks(
            search,
            request.user!.userId,
            Math.min(limit, 100),
            offset
          );
          total = tasks.length; // Approximation for search results
        } else {
          // Use filtered query
          tasks = await taskRepository.findWithFilters(filters, Math.min(limit, 100), offset);
          // TODO: Get total count for pagination
          total = tasks.length;
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            filters,
            search,
            resultCount: tasks.length,
          },
          'Tasks list retrieved'
        );

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
        
        // Enhanced error logging
        loggers.api.error({ 
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
    }
  );

  /**
   * GET /tasks/:id - Get task details
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/tasks/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const task = await taskService.getTaskById(id);
        if (!task) {
          throw new NotFoundError('Task not found');
        }

        // Check if user has access to this task
        const hasAccess =
          request.user!.role === 'ceo' ||
          task.assigned_to.includes(request.user!.userId) ||
          task.created_by === request.user!.userId ||
          task.watchers.includes(request.user!.userId);

        if (!hasAccess) {
          throw new AuthorizationError('You do not have access to this task');
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
          },
          'Task details retrieved'
        );

        reply.send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to retrieve task');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to retrieve task',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /tasks - Create new task
   */
  fastify.post<{
    Body: typeof CreateTaskSchema.static;
  }>(
    '/tasks',
    {
      preHandler: [authenticate, requireManagerOrCEO],
      schema: {
        body: CreateTaskSchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // If channel_id is specified, verify user has access to the channel
        if (request.body.channel_id) {
          const hasChannelAccess = await channelRepository.canUserAccess(
            request.body.channel_id,
            request.user!.userId,
            request.user!.role
          );

          if (!hasChannelAccess) {
            throw new AuthorizationError('You do not have access to create tasks in this channel');
          }
        }

        // Check if manager is trying to assign other managers
        if (request.user!.role === 'manager' && request.body.assigned_to) {
          const { userRepository } = await import('@db/index');
          const usersToAssign = await Promise.all(
            request.body.assigned_to.map(userId => userRepository.findById(userId))
          );
          
          const otherManagersBeingAssigned = usersToAssign.filter(user => 
            user && user.role === 'manager' && user.id !== request.user!.userId
          );
          
          if (otherManagersBeingAssigned.length > 0) {
            throw new AuthorizationError('Managers cannot assign other managers to tasks');
          }
        }

        const taskData = {
          ...request.body,
          created_by: request.user!.userId,
          assigned_to: request.body.assigned_to || [request.user!.userId],
          owned_by: request.body.owned_by || request.user!.userId,
          tags: request.body.tags || [],
          labels: request.body.labels || {},
          due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
          start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
        };

        const task = await taskService.createTask(taskData);

        // Create activity for task creation
        try {
          const activityData: any = {
            taskId: task.id,
            userId: request.user!.userId,
            activityType: 'task_created',
            title: `Task Created: ${task.title}`,
            description: `New task "${task.title}" was created${task.description ? ': ' + task.description : ''}`,
            priority: task.priority as any,
            category: 'task' as any,
            metadata: {
              taskId: task.id,
              taskTitle: task.title,
              taskStatus: task.status,
              taskPriority: task.priority,
              assignedTo: task.assigned_to,
              channelId: task.channel_id,
              createdBy: request.user!.userId,
              createdByName: request.user!.name
            }
          };
          
          if (task.channel_id) {
            activityData.channelId = task.channel_id;
          }

          await activityRepository.createActivity(activityData);
        } catch (error) {
          loggers.api.warn?.({ error, taskId: task.id }, 'Failed to create task creation activity');
        }

        // Broadcast task creation
        await WebSocketUtils.broadcastTaskUpdate({
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
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        // Send notifications to assignees
        if (task.assigned_to.length > 0) {
          for (const assigneeId of task.assigned_to) {
            if (assigneeId !== request.user!.userId) {
              await WebSocketUtils.createAndSendNotification(assigneeId, {
                title: 'New Task Assigned',
                message: `You have been assigned to task: ${task.title}`,
                category: 'task',
                priority:
                  task.priority === 'critical' || task.priority === 'urgent' ? 'high' : 'medium',
                actionUrl: `/tasks/${task.id}`,
                actionText: 'View Task',
                data: { taskId: task.id, taskTitle: task.title },
              });
            }
          }
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: task.id,
            taskTitle: task.title,
            assignedTo: task.assigned_to,
            priority: task.priority,
          },
          'Task created successfully'
        );

        reply.code(201).send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to create task');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to create task',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * PUT /tasks/:id - Update task
   */
  fastify.put<{
    Params: { id: string };
    Body: typeof UpdateTaskSchema.static;
  }>(
    '/tasks/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: UpdateTaskSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updateData = {
          ...request.body,
          due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
          start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
        };

        // Check if user can update this task
        const existingTask = await taskRepository.findById(id);
        if (!existingTask) {
          throw new NotFoundError('Task not found');
        }

        const canUpdate =
          request.user!.role === 'ceo' ||
          existingTask.assigned_to.includes(request.user!.userId) ||
          existingTask.created_by === request.user!.userId ||
          existingTask.owned_by === request.user!.userId;

        if (!canUpdate) {
          throw new AuthorizationError('You do not have permission to update this task');
        }

        const task = await taskService.updateTask(id, updateData);

        // Broadcast task update
        await WebSocketUtils.broadcastTaskUpdate({
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
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
            updatedFields: Object.keys(updateData),
          },
          'Task updated successfully'
        );

        reply.send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to update task');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update task',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * PATCH /tasks/:id/status - Update task status
   */
  fastify.patch<{
    Params: { id: string };
    Body: { status: string };
  }>(
    '/tasks/:id/status',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: Type.Object({
          status: TaskStatusSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status } = request.body;

        const task = await taskRepository.updateStatus(id, status as any, request.user!.userId);

        // Create activity for task status update
        try {
          const activityType = status === 'completed' ? 'task_completed' : 'task_updated';
          const activityTitle = status === 'completed' 
            ? `Task Completed: ${task.title}` 
            : `Task Status Updated: ${task.title}`;
          const activityDescription = status === 'completed'
            ? `Task "${task.title}" was marked as completed`
            : `Task "${task.title}" status was updated to ${status}`;
            
          const activityData: any = {
            taskId: task.id,
            userId: request.user!.userId,
            activityType,
            title: activityTitle,
            description: activityDescription,
            priority: task.priority as any,
            category: 'task' as any,
            metadata: {
              taskId: task.id,
              taskTitle: task.title,
              oldStatus: status, // Note: we don't have the old status here, but status is the new one
              newStatus: status,
              taskPriority: task.priority,
              assignedTo: task.assigned_to,
              channelId: task.channel_id,
              updatedBy: request.user!.userId,
              updatedByName: request.user!.name
            }
          };
          
          if (task.channel_id) {
            activityData.channelId = task.channel_id;
          }

          await activityRepository.createActivity(activityData);
        } catch (error) {
          loggers.api.warn?.({ error, taskId: id }, 'Failed to create task status update activity');
        }

        // Broadcast status change
        await WebSocketUtils.broadcastTaskUpdate({
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
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        // Send completion notification
        if (status === 'completed') {
          for (const assigneeId of task.assigned_to) {
            if (assigneeId !== request.user!.userId) {
              await WebSocketUtils.createAndSendNotification(assigneeId, {
                title: 'Task Completed',
                message: `Task "${task.title}" has been completed`,
                category: 'task',
                priority: 'medium',
                actionUrl: `/tasks/${task.id}`,
                actionText: 'View Task',
                data: { taskId: task.id, taskTitle: task.title },
              });
            }
          }
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
            newStatus: status,
          },
          'Task status updated successfully'
        );

        reply.send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to update task status');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update task status',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /tasks/:id/assign - Assign users to task
   */
  fastify.post<{
    Params: { id: string };
    Body: { user_ids: string[] };
  }>(
    '/tasks/:id/assign',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: Type.Object({
          user_ids: Type.Array(UUIDSchema),
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { user_ids } = request.body;

        // Check if current user is a manager trying to assign other managers
        if (request.user!.role === 'manager') {
          // Get user roles for the users being assigned
          const { userRepository } = await import('@db/index');
          const usersToAssign = await Promise.all(
            user_ids.map(userId => userRepository.findById(userId))
          );
          
          const otherManagersBeingAssigned = usersToAssign.filter(user => 
            user && user.role === 'manager' && user.id !== request.user!.userId
          );
          
          if (otherManagersBeingAssigned.length > 0) {
            throw new AuthorizationError('Managers cannot assign other managers to tasks');
          }
        }

        const success = await taskRepository.assignUsers(id, user_ids, request.user!.userId);
        if (!success) {
          throw new ValidationError('Failed to assign users to task', []);
        }

        // Clear task cache
        await cacheService.tasks.delete(CacheKeyUtils.taskKey(id));

        // Get updated task for broadcast
        const task = await taskRepository.findById(id);
        if (task) {
          // Create activity for task assignment
          try {
            const activityData: any = {
              taskId: task.id,
              userId: request.user!.userId,
              activityType: 'task_assigned',
              title: `Task Assigned: ${task.title}`,
              description: `Task "${task.title}" was assigned to ${user_ids.length} user(s)`,
              priority: task.priority as any,
              category: 'task' as any,
              metadata: {
                taskId: task.id,
                taskTitle: task.title,
                assignedUserIds: user_ids,
                taskPriority: task.priority,
                channelId: task.channel_id,
                assignedBy: request.user!.userId,
                assignedByName: request.user!.name,
                totalAssignedUsers: task.assigned_to.length
              }
            };
            
            if (task.channel_id) {
              activityData.channelId = task.channel_id;
            }

            await activityRepository.createActivity(activityData);
          } catch (error) {
            loggers.api.warn?.({ error, taskId: id }, 'Failed to create task assignment activity');
          }
          
          // Broadcast assignment
          await WebSocketUtils.broadcastTaskUpdate({
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
            userId: request.user!.userId,
            userName: request.user!.name,
            userRole: request.user!.role,
          });

          // Send notifications to newly assigned users
          for (const userId of user_ids) {
            await WebSocketUtils.createAndSendNotification(userId, {
              title: 'Task Assigned',
              message: `You have been assigned to task: ${task.title}`,
              category: 'task',
              priority:
                task.priority === 'critical' || task.priority === 'urgent' ? 'high' : 'medium',
              actionUrl: `/tasks/${task.id}`,
              actionText: 'View Task',
              data: { taskId: task.id, taskTitle: task.title },
            });
          }
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
            assignedUsers: user_ids,
          },
          'Users assigned to task successfully'
        );

        reply.send({
          success: true,
          message: 'Users assigned successfully',
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
        loggers.api.error({ error, context }, 'Failed to assign users to task');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to assign users',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /tasks/:id - Delete task
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/tasks/:id',
    {
      preHandler: [authenticate, requireManagerOrCEO],
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

        const success = await taskRepository.softDelete(id, request.user!.userId);
        if (!success) {
          throw new NotFoundError('Task not found');
        }

        // Clear task cache
        await cacheService.tasks.delete(CacheKeyUtils.taskKey(id));

        // Broadcast task deletion
        await WebSocketUtils.broadcastTaskUpdate({
          type: 'task_deleted',
          taskId: id,
          task: {} as any,
          action: 'delete',
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
          },
          'Task deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Task deleted successfully',
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
        loggers.api.error({ error, context }, 'Failed to delete task');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to delete task',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /tasks/stats - Get task statistics
   */
  fastify.get<{
    Querystring: { user_id?: string };
  }>(
    '/tasks/stats',
    {
      preHandler: [authenticate],
      schema: {
        querystring: Type.Object({
          user_id: Type.Optional(UUIDSchema),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskStatsSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { user_id } = request.query;

        // Only CEO can view stats for other users
        const targetUserId =
          user_id && request.user!.role === 'ceo' ? user_id : request.user!.userId;

        const stats = await taskRepository.getTaskStats(targetUserId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            targetUserId,
            stats,
          },
          'Task stats retrieved'
        );

        reply.send({
          success: true,
          data: stats,
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
        loggers.api.error({ error, context }, 'Failed to retrieve task stats');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve task stats',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /channels/:channelId/tasks - Get channel tasks
   */
  fastify.get<{
    Params: { channelId: string };
    Querystring: typeof PaginationSchema.static & {
      status?: string[];
      priority?: string[];
      assigned_to?: string;
    };
  }>(
    '/channels/:channelId/tasks',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        querystring: Type.Intersect([
          PaginationSchema,
          Type.Object({
            status: Type.Optional(Type.Array(TaskStatusSchema)),
            priority: Type.Optional(Type.Array(TaskPrioritySchema)),
            assigned_to: Type.Optional(UUIDSchema),
          }),
        ]),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Array(TaskResponseSchema),
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
        const { limit = 20, offset = 0, status, priority, assigned_to } = request.query;

        // Build filters
        const filters: any = {
          channelId,
          status,
          priority,
          assignedTo: assigned_to ? [assigned_to] : undefined,
        };

        const tasks = await taskRepository.findWithFilters(filters, Math.min(limit, 100), offset);
        const total = tasks.length; // Simplified - in production, implement proper count query

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            taskCount: tasks.length,
            filters,
          },
          'Channel tasks retrieved'
        );

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
        loggers.api.error({ error, context }, 'Failed to retrieve channel tasks');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channel tasks',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * POST /channels/:channelId/tasks - Create task in channel
   */
  fastify.post<{
    Params: { channelId: string };
    Body: Omit<typeof CreateTaskSchema.static, 'channel_id'>;
  }>(
    '/channels/:channelId/tasks',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        body: Type.Omit(CreateTaskSchema, ['channel_id']),
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;
        
        // Check if manager is trying to assign other managers
        if (request.user!.role === 'manager' && request.body.assigned_to) {
          const { userRepository } = await import('@db/index');
          const usersToAssign = await Promise.all(
            request.body.assigned_to.map(userId => userRepository.findById(userId))
          );
          
          const otherManagersBeingAssigned = usersToAssign.filter(user => 
            user && user.role === 'manager' && user.id !== request.user!.userId
          );
          
          if (otherManagersBeingAssigned.length > 0) {
            throw new AuthorizationError('Managers cannot assign other managers to tasks');
          }
        }
        
        const taskData = {
          ...request.body,
          channel_id: channelId,
          created_by: request.user!.userId,
          assigned_to: request.body.assigned_to || [request.user!.userId],
          owned_by: request.body.owned_by || request.user!.userId,
          tags: request.body.tags || [],
          labels: request.body.labels || {},
          due_date: request.body.due_date ? new Date(request.body.due_date) : undefined,
          start_date: request.body.start_date ? new Date(request.body.start_date) : undefined,
        };

        const task = await taskService.createTask(taskData);

        // Create activity for channel task creation
        try {
          await activityRepository.createActivity({
            channelId,
            taskId: task.id,
            userId: request.user!.userId,
            activityType: 'task_created',
            title: `Channel Task Created: ${task.title}`,
            description: `New task "${task.title}" was created in channel${task.description ? ': ' + task.description : ''}`,
            priority: task.priority as any,
            category: 'task' as any,
            metadata: {
              taskId: task.id,
              taskTitle: task.title,
              taskStatus: task.status,
              taskPriority: task.priority,
              assignedTo: task.assigned_to,
              channelId,
              createdBy: request.user!.userId,
              createdByName: request.user!.name,
              isChannelTask: true
            }
          });
        } catch (error) {
          loggers.api.warn?.({ error, taskId: task.id, channelId }, 'Failed to create channel task creation activity');
        }

        // Broadcast task creation to channel and task management system
        await WebSocketUtils.broadcastTaskUpdate({
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
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        // Send channel notification message
        if (channelId) {
          await WebSocketUtils.broadcastChannelMessage({
            type: 'chat_message',
            channelId,
            messageId: `task_created_${task.id}`,
            message: `Task "${task.title}" was created`,
            messageType: 'system',
            userId: request.user!.userId,
            userName: request.user!.name,
            userRole: request.user!.role,
          });
        }

        // Send notifications to assignees
        if (task.assigned_to.length > 0) {
          for (const assigneeId of task.assigned_to) {
            if (assigneeId !== request.user!.userId) {
              await WebSocketUtils.createAndSendNotification(assigneeId, {
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

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            taskId: task.id,
            taskTitle: task.title,
            assignedTo: task.assigned_to,
          },
          'Channel task created successfully'
        );

        reply.code(201).send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to create channel task');

        if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to create channel task',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * PUT /tasks/:id/channel - Link task to channel
   */
  fastify.put<{
    Params: { id: string };
    Body: { channel_id: string | null };
  }>(
    '/tasks/:id/channel',
    {
      preHandler: [authenticate],
      schema: {
        params: Type.Object({
          id: UUIDSchema,
        }),
        body: Type.Object({
          channel_id: Type.Union([UUIDSchema, Type.Null()]),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskResponseSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { channel_id } = request.body;

        // Check if user can update this task
        const existingTask = await taskRepository.findById(id);
        if (!existingTask) {
          throw new NotFoundError('Task not found');
        }

        const canUpdate =
          request.user!.role === 'ceo' ||
          existingTask.assigned_to.includes(request.user!.userId) ||
          existingTask.created_by === request.user!.userId ||
          existingTask.owned_by === request.user!.userId;

        if (!canUpdate) {
          throw new AuthorizationError('You do not have permission to update this task');
        }

        // If linking to a channel, verify user has access
        if (channel_id) {
          const hasChannelAccess = await channelRepository.canUserAccess(
            channel_id,
            request.user!.userId,
            request.user!.role
          );

          if (!hasChannelAccess) {
            throw new AuthorizationError('You do not have access to this channel');
          }
        }

        const task = await taskService.updateTask(id, { channel_id });

        // Broadcast to both old and new channels
        if (existingTask.channel_id) {
          await WebSocketUtils.broadcastChannelMessage({
            type: 'chat_message',
            channelId: existingTask.channel_id,
            messageId: `task_unlink_${task.id}`,
            message: `Task "${task.title}" was unlinked from this channel`,
            messageType: 'system',
            userId: request.user!.userId,
            userName: request.user!.name,
            userRole: request.user!.role,
          });
        }

        if (channel_id) {
          await WebSocketUtils.broadcastChannelMessage({
            type: 'chat_message',
            channelId: channel_id,
            messageId: `task_link_${task.id}`,
            message: `Task "${task.title}" was linked to this channel`,
            messageType: 'system',
            userId: request.user!.userId,
            userName: request.user!.name,
            userRole: request.user!.role,
          });
        }

        // Also broadcast to task system
        await WebSocketUtils.broadcastTaskUpdate({
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
          userId: request.user!.userId,
          userName: request.user!.name,
          userRole: request.user!.role,
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId: id,
            oldChannelId: existingTask.channel_id,
            newChannelId: channel_id,
          },
          'Task channel link updated successfully'
        );

        reply.send({
          success: true,
          data: task,
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
        loggers.api.error({ error, context }, 'Failed to update task channel link');

        if (error instanceof NotFoundError || error instanceof AuthorizationError) {
          reply.code(error.statusCode).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update task channel link',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /channels/:channelId/tasks/stats - Get channel task statistics
   */
  fastify.get<{
    Params: { channelId: string };
  }>(
    '/channels/:channelId/tasks/stats',
    {
      preHandler: [authenticate, requireChannelAccess],
      schema: {
        params: Type.Object({
          channelId: UUIDSchema,
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: TaskStatsSchema,
            timestamp: Type.String({ format: 'date-time' }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { channelId } = request.params;

        // Get channel task statistics by using regular getTaskStats with channel filter
        // This is a simplified implementation - in production, implement proper channel stats
        const stats = await taskRepository.getTaskStats(request.user!.userId);

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            stats,
          },
          'Channel task stats retrieved'
        );

        reply.send({
          success: true,
          data: stats,
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
        loggers.api.error({ error, context }, 'Failed to retrieve channel task stats');

        reply.code(500).send({
          error: {
            message: 'Failed to retrieve channel task stats',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );

  /**
   * GET /tasks/:taskId/comments - Get task comments
   */
  fastify.get<{
    Params: { taskId: string };
    Querystring: {
      limit?: number;
      offset?: number;
      includeReplies?: boolean;
    };
  }>(
    '/tasks/:taskId/comments',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          taskId: UUIDSchema,
        }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
          includeReplies: Type.Optional(Type.Boolean({ default: true })),
        }),
        response: {
          200: CommentsListResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { taskId } = request.params;
        const { limit = 50, offset = 0, includeReplies = true } = request.query;

        const result = await commentRepository.getTaskComments(taskId, {
          limit,
          offset,
          includeReplies,
        });

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId,
            commentsCount: result.data.length,
            total: result.total,
          },
          'Task comments retrieved'
        );

        reply.send({
          success: true,
          ...result,
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
        loggers.api.error({ error, context }, 'Failed to retrieve task comments');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to retrieve task comments',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /tasks/:taskId/comments - Add comment to task
   */
  fastify.post<{
    Params: { taskId: string };
    Body: { content: string; parent_comment_id?: string };
  }>(
    '/tasks/:taskId/comments',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          taskId: UUIDSchema,
        }),
        body: CreateCommentSchema,
        response: {
          201: CommentSuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { taskId } = request.params;
        const { content, parent_comment_id } = request.body;

        const commentData: any = {
          task_id: taskId,
          author_id: request.user!.userId,
          content,
        };
        
        if (parent_comment_id) {
          commentData.parent_comment_id = parent_comment_id;
        }

        const comment = await commentRepository.createComment(commentData);

        // Get the comment with author information
        const commentWithDetails = await commentRepository.getCommentById(comment.id);

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId,
            commentId: comment.id,
          },
          'Comment created successfully'
        );

        reply.code(201).send({
          success: true,
          data: commentWithDetails,
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
        loggers.api.error({ error, context }, 'Failed to create comment');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to create comment',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * PUT /tasks/:taskId/comments/:commentId - Update comment
   */
  fastify.put<{
    Params: { taskId: string; commentId: string };
    Body: { content: string };
  }>(
    '/tasks/:taskId/comments/:commentId',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          taskId: UUIDSchema,
          commentId: UUIDSchema,
        }),
        body: UpdateCommentSchema,
        response: {
          200: CommentSuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { taskId, commentId } = request.params;
        const { content } = request.body;

        const updatedComment = await commentRepository.updateComment(
          commentId,
          { content },
          request.user!.userId,
          request.user!.role
        );

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId,
            commentId,
          },
          'Comment updated successfully'
        );

        reply.send({
          success: true,
          data: updatedComment,
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
        loggers.api.error({ error, context }, 'Failed to update comment');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to update comment',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * DELETE /tasks/:taskId/comments/:commentId - Delete comment
   */
  fastify.delete<{
    Params: { taskId: string; commentId: string };
  }>(
    '/tasks/:taskId/comments/:commentId',
    {
      preHandler: [authenticate, apiRateLimit],
      schema: {
        params: Type.Object({
          taskId: UUIDSchema,
          commentId: UUIDSchema,
        }),
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { taskId, commentId } = request.params;

        const deleted = await commentRepository.deleteComment(
          commentId,
          request.user!.userId,
          request.user!.role
        );

        if (!deleted) {
          throw new NotFoundError('Comment not found or already deleted');
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            taskId,
            commentId,
          },
          'Comment deleted successfully'
        );

        reply.send({
          success: true,
          message: 'Comment deleted successfully',
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
        loggers.api.error({ error, context }, 'Failed to delete comment');

        if (error instanceof NotFoundError) {
          reply.code(404).send(formatErrorResponse(error));
        } else if (error instanceof AuthorizationError) {
          reply.code(403).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to delete comment',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );
};
