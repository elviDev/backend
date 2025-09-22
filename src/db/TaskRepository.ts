import { DatabaseClient } from '@config/database';
import { logger } from '@utils/logger';
import { ValidationError, ConflictError, BusinessLogicError } from '@utils/errors';
import BaseRepository, { BaseEntity, FilterOptions } from './BaseRepository';

export interface Task extends BaseEntity {
  title: string;
  description?: string;
  channel_id?: string;
  parent_task_id?: string;
  created_by: string;
  assigned_to: string[];
  owned_by?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold';
  task_type: 'general' | 'project' | 'maintenance' | 'emergency' | 'research' | 'approval';
  complexity: number;
  estimated_hours?: number;
  actual_hours: number;
  story_points?: number;
  due_date?: Date;
  start_date?: Date;
  completed_at?: Date;
  progress_percentage: number;
  tags: string[];
  labels: Record<string, any>;
  custom_fields: Record<string, any>;
  voice_created: boolean;
  voice_command_id?: string;
  voice_instructions?: string;
  ai_generated: boolean;
  ai_suggestions: Record<string, any>;
  automation_rules: Record<string, any>;
  watchers: string[];
  comments_count: number;
  attachments_count: number;
  business_value: 'low' | 'medium' | 'high' | 'critical';
  cost_center?: string;
  budget_impact?: number;
  acceptance_criteria?: string;
  definition_of_done?: string;
  quality_score?: number;
  external_references: Record<string, any>;
  integrations: Record<string, any>;
  recurrence_pattern?: Record<string, any>;
  recurrence_parent_id?: string;
  is_recurring: boolean;
  last_activity_at: Date;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  channel_id?: string;
  parent_task_id?: string;
  created_by: string;
  assigned_to?: string[];
  owned_by?: string;
  priority?: Task['priority'];
  task_type?: Task['task_type'];
  complexity?: number;
  estimated_hours?: number;
  due_date?: Date;
  start_date?: Date;
  tags?: string[];
  labels?: Record<string, any>;
  voice_created?: boolean;
  voice_command_id?: string;
  voice_instructions?: string;
  business_value?: Task['business_value'];
  acceptance_criteria?: string;
}

export interface TaskWithDetails extends Task {
  channel_name?: string;
  owner_name?: string;
  assignee_details?: Array<{
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    role: string;
    phone?: string;
  }>;
  subtask_count?: number;
  dependency_count?: number;
}

export interface TaskFilter {
  status?: Task['status'][];
  priority?: Task['priority'][];
  assignedTo?: string[];
  channelId?: string;
  dueAfter?: Date;
  dueBefore?: Date;
  tags?: string[];
  voiceCreated?: boolean;
  overdue?: boolean;
}

class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super('tasks');
  }

  /**
   * Create new task with validation
   */
  async createTask(taskData: CreateTaskData, client?: DatabaseClient): Promise<Task> {
    // Validate parent task if specified
    if (taskData.parent_task_id) {
      const parentTask = await this.findById(taskData.parent_task_id, false, client);
      if (!parentTask) {
        throw new ValidationError('Parent task not found', [
          { field: 'parent_task_id', message: 'Parent task does not exist', value: taskData.parent_task_id }
        ]);
      }
    }

    // Set defaults
    const taskToCreate = {
      ...taskData,
      assigned_to: taskData.assigned_to || [taskData.created_by],
      owned_by: taskData.owned_by || taskData.assigned_to?.[0] || taskData.created_by,
      priority: taskData.priority || 'medium',
      status: 'pending' as const,
      task_type: taskData.task_type || 'general',
      complexity: taskData.complexity || 1,
      actual_hours: 0,
      progress_percentage: 0,
      tags: taskData.tags || [],
      labels: taskData.labels || {},
      custom_fields: {},
      voice_created: taskData.voice_created || false,
      ai_generated: false,
      ai_suggestions: {},
      automation_rules: {},
      watchers: [],
      comments_count: 0,
      attachments_count: 0,
      business_value: taskData.business_value || 'medium',
      external_references: {},
      integrations: {
        calendar_event: null,
        email_thread: null,
        document_links: [],
        meeting_recordings: []
      },
      is_recurring: false,
      last_activity_at: new Date()
    };

    const task = await this.create(taskToCreate, client);

    logger.info({
      taskId: task.id,
      title: task.title,
      createdBy: task.created_by,
      assignedTo: task.assigned_to,
      channelId: task.channel_id
    }, 'Task created successfully');

    return task;
  }

  /**
   * Assign users to task
   */
  async assignUsers(taskId: string, userIds: string[], assignedBy: string, client?: DatabaseClient): Promise<boolean> {
    const sql = `
      SELECT assign_task($1, $2, $3)
    `;

    try {
      const result = await this.executeRawQuery<{ assign_task: boolean }>(
        sql, 
        [taskId, userIds, assignedBy], 
        client
      );

      const success = result.rows[0]?.assign_task || false;
      
      if (success) {
        logger.info({
          taskId,
          userIds,
          assignedBy
        }, 'Users assigned to task');
      }

      return success;
    } catch (error) {
      logger.error({ error, taskId, userIds }, 'Failed to assign users to task');
      throw error;
    }
  }

  /**
   * Unassign users from task
   */
  async unassignUsers(taskId: string, userIds: string[], unassignedBy: string, client?: DatabaseClient): Promise<boolean> {
    const sql = `
      SELECT unassign_task($1, $2, $3)
    `;

    try {
      const result = await this.executeRawQuery<{ unassign_task: boolean }>(
        sql, 
        [taskId, userIds, unassignedBy], 
        client
      );

      const success = result.rows[0]?.unassign_task || false;
      
      if (success) {
        logger.info({
          taskId,
          userIds,
          unassignedBy
        }, 'Users unassigned from task');
      }

      return success;
    } catch (error) {
      logger.error({ error, taskId, userIds }, 'Failed to unassign users from task');
      throw error;
    }
  }

  /**
   * Find tasks assigned to user
   */
  async findByAssignee(userId: string, status?: Task['status'][], includeWatching: boolean = true, client?: DatabaseClient): Promise<Task[]> {
    const sql = `
      SELECT * FROM get_user_tasks($1, $2, $3)
    `;

    const result = await this.executeRawQuery<any>(sql, [userId, status, includeWatching], client);
    return result.rows;
  }

  /**
   * Find tasks in channel
   */
  async findByChannel(channelId: string, includeCompleted: boolean = true, client?: DatabaseClient): Promise<Task[]> {
    const statusFilter = includeCompleted ? {} : { status: ['pending', 'in_progress', 'review', 'on_hold'] };
    
    const options: FilterOptions = {
      filters: { channel_id: channelId, ...statusFilter },
      orderBy: 'created_at',
      orderDirection: 'DESC'
    };

    const result = await this.findMany(options, client);
    return result.data;
  }

  /**
   * Find overdue tasks
   */
  async findOverdue(userId?: string, client?: DatabaseClient): Promise<Task[]> {
    let sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE due_date < NOW()
      AND status NOT IN ('completed', 'cancelled')
      AND deleted_at IS NULL
    `;

    let params: any[] = [];
    
    if (userId) {
      sql += ` AND $1 = ANY(assigned_to)`;
      params = [userId];
    }

    sql += ` ORDER BY due_date ASC`;

    const result = await this.executeRawQuery<Task>(sql, params, client);
    return result.rows;
  }

  /**
   * Find tasks with filters
   */
  async findWithFilters(filters: TaskFilter, limit: number = 50, offset: number = 0, client?: DatabaseClient): Promise<Task[]> {
    const whereConditions = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramCounter = 1;

    // Status filter
    if (filters.status && filters.status.length > 0) {
      whereConditions.push(`status = ANY($${paramCounter})`);
      params.push(filters.status);
      paramCounter++;
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      whereConditions.push(`priority = ANY($${paramCounter})`);
      params.push(filters.priority);
      paramCounter++;
    }

    // Assignee filter
    if (filters.assignedTo && filters.assignedTo.length > 0) {
      whereConditions.push(`assigned_to && $${paramCounter}`);
      params.push(filters.assignedTo);
      paramCounter++;
    }

    // Channel filter
    if (filters.channelId) {
      whereConditions.push(`channel_id = $${paramCounter}`);
      params.push(filters.channelId);
      paramCounter++;
    }

    // Due date filters
    if (filters.dueAfter) {
      whereConditions.push(`due_date >= $${paramCounter}`);
      params.push(filters.dueAfter);
      paramCounter++;
    }

    if (filters.dueBefore) {
      whereConditions.push(`due_date <= $${paramCounter}`);
      params.push(filters.dueBefore);
      paramCounter++;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      whereConditions.push(`tags && $${paramCounter}`);
      params.push(filters.tags);
      paramCounter++;
    }

    // Voice created filter
    if (filters.voiceCreated !== undefined) {
      whereConditions.push(`voice_created = $${paramCounter}`);
      params.push(filters.voiceCreated);
      paramCounter++;
    }

    // Overdue filter
    if (filters.overdue) {
      whereConditions.push(`due_date < NOW() AND status NOT IN ('completed', 'cancelled')`);
    }

    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        CASE priority 
          WHEN 'critical' THEN 5 
          WHEN 'urgent' THEN 4 
          WHEN 'high' THEN 3 
          WHEN 'medium' THEN 2 
          ELSE 1 
        END DESC,
        due_date ASC NULLS LAST,
        created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    params.push(limit, offset);

    const result = await this.executeRawQuery<Task>(sql, params, client);
    return result.rows;
  }

  /**
   * Update task progress
   */
  async updateProgress(taskId: string, progressPercentage: number, updatedBy: string, client?: DatabaseClient): Promise<Task> {
    if (progressPercentage < 0 || progressPercentage > 100) {
      throw new ValidationError('Progress percentage must be between 0 and 100', [
        { field: 'progress_percentage', message: 'Invalid progress value', value: progressPercentage }
      ]);
    }

    const updateData = {
      progress_percentage: progressPercentage,
      last_activity_at: new Date()
    };

    const task = await this.update(taskId, updateData, undefined, client);

    logger.info({
      taskId,
      progressPercentage,
      updatedBy
    }, 'Task progress updated');

    return task;
  }

  /**
   * Update task status
   */
  async updateStatus(taskId: string, status: Task['status'], updatedBy: string, client?: DatabaseClient): Promise<Task> {
    const updateData: any = {
      status,
      last_activity_at: new Date()
    };

    // Set completion timestamp for completed tasks
    if (status === 'completed') {
      updateData.completed_at = new Date();
      updateData.progress_percentage = 100;
    }

    // Clear completion timestamp when moving away from completed
    const currentTask = await this.findById(taskId, false, client);
    if (currentTask?.status === 'completed' && status !== 'completed') {
      updateData.completed_at = null;
    }

    const task = await this.update(taskId, updateData, undefined, client);

    logger.info({
      taskId,
      status,
      updatedBy,
      previousStatus: currentTask?.status
    }, 'Task status updated');

    return task;
  }

  /**
   * Get task with details (channel, assignees, subtasks)
   */
  async findWithDetails(taskId: string, client?: DatabaseClient): Promise<TaskWithDetails | null> {
    const sql = `
      SELECT 
        t.*,
        c.name as channel_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'avatar_url', u.avatar_url,
            'role', u.role,
            'phone', u.phone
          )
          FROM users u 
          WHERE u.id = ANY(t.assigned_to) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as assignee_details,
        (
          SELECT COUNT(*)
          FROM tasks subtasks
          WHERE subtasks.parent_task_id = t.id 
          AND subtasks.deleted_at IS NULL
        ) as subtask_count,
        (
          SELECT COUNT(*)
          FROM task_dependencies td
          WHERE td.task_id = t.id 
          AND td.deleted_at IS NULL
          AND td.is_active = true
        ) as dependency_count
      FROM tasks t
      LEFT JOIN channels c ON t.channel_id = c.id
      LEFT JOIN users owner ON t.owned_by = owner.id
      WHERE t.id = $1 AND t.deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<TaskWithDetails>(sql, [taskId], client);
    return result.rows[0] || null;
  }

  /**
   * Get task hierarchy (parent and children)
   */
  async getTaskHierarchy(taskId: string, client?: DatabaseClient): Promise<Array<{
    task_id: string;
    title: string;
    parent_id: string;
    level: number;
    path: string;
  }>> {
    const sql = `
      SELECT * FROM get_task_hierarchy($1)
    `;

    const result = await this.executeRawQuery<any>(sql, [taskId], client);
    return result.rows;
  }

  /**
   * Search tasks by title or description
   */
  async searchTasks(
    searchTerm: string, 
    userId?: string, 
    limit: number = 20, 
    offset: number = 0, 
    client?: DatabaseClient
  ): Promise<Task[]> {
    let userCondition = '';
    let params = [`%${searchTerm}%`, limit, offset];

    if (userId) {
      userCondition = 'AND ($4 = ANY(assigned_to) OR $4 = ANY(watchers) OR created_by = $4)';
      params.push(userId);
    }

    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE (
        LOWER(title) LIKE LOWER($1) OR 
        LOWER(description) LIKE LOWER($1) OR
        LOWER(array_to_string(tags, ' ')) LIKE LOWER($1)
      )
      AND deleted_at IS NULL
      AND status != 'cancelled'
      ${userCondition}
      ORDER BY 
        CASE WHEN LOWER(title) LIKE LOWER($1) THEN 1 ELSE 2 END,
        CASE priority 
          WHEN 'critical' THEN 5 
          WHEN 'urgent' THEN 4 
          WHEN 'high' THEN 3 
          WHEN 'medium' THEN 2 
          ELSE 1 
        END DESC,
        created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeRawQuery<Task>(sql, params, client);
    return result.rows;
  }

  /**
   * Find tasks with filters and include assignee details
   */
  async findWithFiltersAndDetails(filters: TaskFilter, limit: number = 50, offset: number = 0, client?: DatabaseClient): Promise<TaskWithDetails[]> {
    const whereConditions = ['t.deleted_at IS NULL'];
    const params: any[] = [];
    let paramCounter = 1;

    // Status filter
    if (filters.status && filters.status.length > 0) {
      whereConditions.push(`t.status = ANY($${paramCounter})`);
      params.push(filters.status);
      paramCounter++;
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      whereConditions.push(`t.priority = ANY($${paramCounter})`);
      params.push(filters.priority);
      paramCounter++;
    }

    // Assignee filter
    if (filters.assignedTo && filters.assignedTo.length > 0) {
      whereConditions.push(`t.assigned_to && $${paramCounter}`);
      params.push(filters.assignedTo);
      paramCounter++;
    }

    // Channel filter
    if (filters.channelId) {
      whereConditions.push(`t.channel_id = $${paramCounter}`);
      params.push(filters.channelId);
      paramCounter++;
    }

    // Due date filters
    if (filters.dueAfter) {
      whereConditions.push(`t.due_date >= $${paramCounter}`);
      params.push(filters.dueAfter);
      paramCounter++;
    }

    if (filters.dueBefore) {
      whereConditions.push(`t.due_date <= $${paramCounter}`);
      params.push(filters.dueBefore);
      paramCounter++;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      whereConditions.push(`t.tags && $${paramCounter}`);
      params.push(filters.tags);
      paramCounter++;
    }

    // Voice created filter
    if (filters.voiceCreated !== undefined) {
      whereConditions.push(`t.voice_created = $${paramCounter}`);
      params.push(filters.voiceCreated);
      paramCounter++;
    }

    // Overdue filter
    if (filters.overdue) {
      whereConditions.push(`t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled')`);
    }

    const sql = `
      SELECT 
        t.*,
        c.name as channel_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'avatar_url', u.avatar_url,
            'role', u.role,
            'phone', u.phone
          )
          FROM users u 
          WHERE u.id = ANY(t.assigned_to) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as assignee_details,
        (
          SELECT COUNT(*)
          FROM tasks subtasks
          WHERE subtasks.parent_task_id = t.id 
          AND subtasks.deleted_at IS NULL
        ) as subtask_count,
        (
          SELECT COUNT(*)
          FROM task_dependencies td
          WHERE td.task_id = t.id 
          AND td.deleted_at IS NULL
          AND td.is_active = true
        ) as dependency_count
      FROM tasks t
      LEFT JOIN channels c ON t.channel_id = c.id
      LEFT JOIN users owner ON t.owned_by = owner.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        CASE t.priority 
          WHEN 'critical' THEN 5 
          WHEN 'urgent' THEN 4 
          WHEN 'high' THEN 3 
          WHEN 'medium' THEN 2 
          ELSE 1 
        END DESC,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    params.push(limit, offset);
    const result = await this.executeRawQuery<TaskWithDetails>(sql, params, client);
    return result.rows;
  }

  /**
   * Search tasks with assignee details
   */
  async searchTasksWithDetails(
    searchTerm: string, 
    userId?: string, 
    limit: number = 20, 
    offset: number = 0, 
    client?: DatabaseClient
  ): Promise<TaskWithDetails[]> {
    let userCondition = '';
    let params = [`%${searchTerm}%`, limit, offset];

    if (userId) {
      userCondition = 'AND ($4 = ANY(t.assigned_to) OR $4 = ANY(t.watchers) OR t.created_by = $4)';
      params.push(userId);
    }

    const sql = `
      SELECT 
        t.*,
        c.name as channel_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'avatar_url', u.avatar_url,
            'role', u.role,
            'phone', u.phone
          )
          FROM users u 
          WHERE u.id = ANY(t.assigned_to) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as assignee_details,
        (
          SELECT COUNT(*)
          FROM tasks subtasks
          WHERE subtasks.parent_task_id = t.id 
          AND subtasks.deleted_at IS NULL
        ) as subtask_count,
        (
          SELECT COUNT(*)
          FROM task_dependencies td
          WHERE td.task_id = t.id 
          AND td.deleted_at IS NULL
          AND td.is_active = true
        ) as dependency_count
      FROM tasks t
      LEFT JOIN channels c ON t.channel_id = c.id
      LEFT JOIN users owner ON t.owned_by = owner.id
      WHERE (
        LOWER(t.title) LIKE LOWER($1) OR 
        LOWER(t.description) LIKE LOWER($1) OR
        LOWER(array_to_string(t.tags, ' ')) LIKE LOWER($1)
      )
      AND t.deleted_at IS NULL
      AND t.status != 'cancelled'
      ${userCondition}
      ORDER BY 
        CASE WHEN LOWER(t.title) LIKE LOWER($1) THEN 1 ELSE 2 END,
        CASE t.priority 
          WHEN 'critical' THEN 5 
          WHEN 'urgent' THEN 4 
          WHEN 'high' THEN 3 
          WHEN 'medium' THEN 2 
          ELSE 1 
        END DESC,
        t.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeRawQuery<TaskWithDetails>(sql, params, client);
    return result.rows;
  }

  /**
   * Get task statistics
   */
  async getTaskStats(userId?: string, client?: DatabaseClient): Promise<{
    totalTasks: number;
    tasksByStatus: Record<string, number>;
    tasksByPriority: Record<string, number>;
    overdueTasks: number;
    completedThisWeek: number;
    averageCompletionTime: number;
  }> {
    let userCondition = '';
    let params: any[] = [];
    
    if (userId) {
      userCondition = 'WHERE ($1 = ANY(assigned_to) OR created_by = $1) AND deleted_at IS NULL';
      params = [userId];
    } else {
      userCondition = 'WHERE deleted_at IS NULL';
    }

    const sql = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'review') as review_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_tasks,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_tasks,
        COUNT(*) FILTER (WHERE priority = 'low') as low_priority,
        COUNT(*) FILTER (WHERE priority = 'medium') as medium_priority,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_priority,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical_priority,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled')) as overdue_tasks,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '7 days') as completed_this_week,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_hours
      FROM ${this.tableName}
      ${userCondition}
    `;

    const result = await this.executeRawQuery<any>(sql, params, client);
    const stats = result.rows[0];

    return {
      totalTasks: parseInt(stats.total_tasks, 10),
      tasksByStatus: {
        pending: parseInt(stats.pending_tasks, 10),
        in_progress: parseInt(stats.in_progress_tasks, 10),
        review: parseInt(stats.review_tasks, 10),
        completed: parseInt(stats.completed_tasks, 10),
        cancelled: parseInt(stats.cancelled_tasks, 10),
        on_hold: parseInt(stats.on_hold_tasks, 10)
      },
      tasksByPriority: {
        low: parseInt(stats.low_priority, 10),
        medium: parseInt(stats.medium_priority, 10),
        high: parseInt(stats.high_priority, 10),
        urgent: parseInt(stats.urgent_priority, 10),
        critical: parseInt(stats.critical_priority, 10)
      },
      overdueTasks: parseInt(stats.overdue_tasks, 10),
      completedThisWeek: parseInt(stats.completed_this_week, 10),
      averageCompletionTime: parseFloat(stats.avg_completion_hours || '0')
    };
  }

  /**
   * Add watcher to task
   */
  async addWatcher(taskId: string, userId: string, client?: DatabaseClient): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET watchers = array_append(watchers, $2)
      WHERE id = $1 
      AND deleted_at IS NULL
      AND NOT ($2 = ANY(watchers))
    `;

    const result = await this.executeRawQuery(sql, [taskId, userId], client);
    return result.rowCount > 0;
  }

  /**
   * Remove watcher from task
   */
  async removeWatcher(taskId: string, userId: string, client?: DatabaseClient): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET watchers = array_remove(watchers, $2)
      WHERE id = $1 
      AND deleted_at IS NULL
      AND $2 = ANY(watchers)
    `;

    const result = await this.executeRawQuery(sql, [taskId, userId], client);
    return result.rowCount > 0;
  }
}

export default TaskRepository;