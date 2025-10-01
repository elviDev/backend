import { DatabaseClient } from '../config/database';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';
import BaseRepository, { BaseEntity, FilterOptions } from './BaseRepository';

export interface Activity extends BaseEntity {
  channel_id?: string;
  task_id?: string;
  user_id: string;
  activity_type: 
    | 'message'
    | 'task_created'
    | 'task_updated'
    | 'task_completed'
    | 'task_assigned'
    | 'task_unassigned'
    | 'member_joined'
    | 'member_left'
    | 'member_added'       // Someone added you to a channel
    | 'member_removed'     // Someone removed you from a channel
    | 'file_uploaded'
    | 'channel_updated'
    | 'channel_created'
    | 'channel_deleted'
    | 'reaction_added'
    | 'mention'
    | 'voice_command'
    | 'ai_response';
  title: string;
  description?: string;
  metadata: Record<string, any>;
  read_by: string[]; // User IDs who have read this activity
  priority: 'low' | 'medium' | 'high';
  category: 'task' | 'channel' | 'system' | 'social';
  referenced_entity_id?: string; // ID of the entity this activity references
  referenced_entity_type?: 'task' | 'message' | 'channel' | 'user' | 'file';
}

export interface CreateActivityData {
  channelId?: string;
  taskId?: string;
  userId: string;
  activityType: Activity['activity_type'];
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  priority?: Activity['priority'];
  category?: Activity['category'];
  referencedEntityId?: string;
  referencedEntityType?: Activity['referenced_entity_type'];
}

export interface ActivityWithUser extends Activity {
  user_name: string;
  user_email: string;
  user_avatar?: string;
  user_role: string;
  channel_name?: string;
  task_title?: string;
}

class ActivityRepository extends BaseRepository<Activity> {
  constructor() {
    super('activities');
  }

  /**
   * Create new activity with validation
   */
  // Add methods needed for the API routes
  async findManyActivities(filters: {
    type?: string[];
    channel_id?: string;
    user_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
    includeUser?: boolean;
  }): Promise<any[]> {
    let whereConditions = ['a.deleted_at IS NULL'];
    let params: any[] = [];
    let paramIndex = 1;

    if (filters.type) {
      whereConditions.push(`a.activity_type = ANY($${paramIndex})`);
      params.push(filters.type);
      paramIndex++;
    }

    if (filters.channel_id) {
      whereConditions.push(`a.channel_id = $${paramIndex}`);
      params.push(filters.channel_id);
      paramIndex++;
    }

    if (filters.user_id) {
      whereConditions.push(`a.user_id = $${paramIndex}`);
      params.push(filters.user_id);
      paramIndex++;
    }

    if (filters.from_date) {
      whereConditions.push(`a.created_at >= $${paramIndex}`);
      params.push(filters.from_date);
      paramIndex++;
    }

    if (filters.to_date) {
      whereConditions.push(`a.created_at <= $${paramIndex}`);
      params.push(filters.to_date);
      paramIndex++;
    }

    const userJoin = filters.includeUser ? `
      LEFT JOIN users u ON a.user_id = u.id AND u.deleted_at IS NULL
    ` : '';

    const userFields = filters.includeUser ? `
      u.name as user_name,
      u.email as user_email,
      u.avatar_url,
      u.role as user_role
    ` : '';

    const sql = `
      SELECT 
        a.*,
        ${userFields}
      FROM ${this.tableName} a
      ${userJoin}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY a.created_at DESC
      ${filters.limit ? `LIMIT $${paramIndex}` : ''}
      ${filters.offset && filters.limit ? `OFFSET $${paramIndex + 1}` : ''}
    `;

    if (filters.limit) {
      params.push(filters.limit);
      if (filters.offset) {
        params.push(filters.offset);
      }
    }

    const result = await this.executeRawQuery(sql, params);
    return result.rows.map(row => ({
      ...row,
      user: filters.includeUser && row.user_name ? {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        avatar_url: row.avatar_url,
      } : undefined
    }));
  }

  async count(filters: any): Promise<number> {
    let whereConditions = ['deleted_at IS NULL'];
    let params: any[] = [];
    let paramIndex = 1;

    if (filters.type) {
      whereConditions.push(`activity_type = ANY($${paramIndex})`);
      params.push(filters.type);
      paramIndex++;
    }

    if (filters.channel_id) {
      whereConditions.push(`channel_id = $${paramIndex}`);
      params.push(filters.channel_id);
      paramIndex++;
    }

    if (filters.user_id) {
      whereConditions.push(`user_id = $${paramIndex}`);
      params.push(filters.user_id);
      paramIndex++;
    }

    const sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
    `;

    const result = await this.executeRawQuery<{ count: string }>(sql, params);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async getUserFeed(userId: string, limit: number, offset: number): Promise<any[]> {
    return this.findManyActivities({
      limit,
      offset,
      includeUser: true,
    });
  }

  async getUserFeedCount(userId: string): Promise<number> {
    return this.count({});
  }

  async getActivityStats(options: {
    userId?: string;
    period?: string;
    channelId?: string;
  }): Promise<any> {
    return {
      totalActivities: 0,
      activitiesByType: {},
      activitiesByPeriod: {},
    };
  }

  async createActivity(activityData: CreateActivityData, client?: DatabaseClient): Promise<Activity> {
    // Set defaults
    const activityToCreate = {
      channel_id: activityData.channelId,
      task_id: activityData.taskId,
      user_id: activityData.userId,
      activity_type: activityData.activityType,
      title: activityData.title,
      description: activityData.description || '',
      metadata: activityData.metadata || {},
      read_by: [],
      priority: activityData.priority || this.determinePriority(activityData.activityType),
      category: activityData.category || this.determineCategory(activityData.activityType),
      referenced_entity_id: activityData.referencedEntityId,
      referenced_entity_type: activityData.referencedEntityType,
    };

    const activity = await this.create(activityToCreate, client);

    logger.info(
      {
        activityId: activity.id,
        activityType: activity.activity_type,
        userId: activity.user_id,
        channelId: activity.channel_id,
        taskId: activity.task_id,
      },
      'Activity created successfully'
    );

    return activity;
  }

  /**
   * Find activities for a specific user
   */
  async findUserActivities(
    userId: string,
    filters?: {
      activityType?: string;
      category?: string;
      unreadOnly?: boolean;
      channelId?: string;
      taskId?: string;
      after?: Date;
      before?: Date;
    },
    limit: number = 50,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<ActivityWithUser[]> {
    let whereConditions = ['a.deleted_at IS NULL'];
    let params: any[] = [];
    let paramIndex = 1;

    // User should see activities where:
    // 1. They are the actor (created the activity)
    // 2. They are mentioned/assigned in tasks
    // 3. Activities in channels they are members of
    // 4. Activities on tasks they are assigned to
    whereConditions.push(`(
      a.user_id = $${paramIndex}
      OR a.metadata::text LIKE '%"' || $${paramIndex} || '"%'
      OR EXISTS (
        SELECT 1 FROM channels c 
        WHERE c.id = a.channel_id 
        AND $${paramIndex} = ANY(c.members)
        AND c.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = a.task_id
        AND $${paramIndex} = ANY(t.assigned_to)
        AND t.deleted_at IS NULL
      )
    )`);
    params.push(userId);
    paramIndex++;

    // Add filters
    if (filters?.activityType) {
      whereConditions.push(`a.activity_type = $${paramIndex}`);
      params.push(filters.activityType);
      paramIndex++;
    }

    if (filters?.category) {
      whereConditions.push(`a.category = $${paramIndex}`);
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.channelId) {
      whereConditions.push(`a.channel_id = $${paramIndex}`);
      params.push(filters.channelId);
      paramIndex++;
    }

    if (filters?.taskId) {
      whereConditions.push(`a.task_id = $${paramIndex}`);
      params.push(filters.taskId);
      paramIndex++;
    }

    if (filters?.unreadOnly) {
      whereConditions.push(`NOT ($${paramIndex - params.length + 1} = ANY(a.read_by))`);
    }

    if (filters?.after) {
      whereConditions.push(`a.created_at > $${paramIndex}`);
      params.push(filters.after);
      paramIndex++;
    }

    if (filters?.before) {
      whereConditions.push(`a.created_at < $${paramIndex}`);
      params.push(filters.before);
      paramIndex++;
    }

    const sql = `
      SELECT 
        a.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        c.name as channel_name,
        t.title as task_title
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN channels c ON a.channel_id = c.id
      LEFT JOIN tasks t ON a.task_id = t.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.executeRawQuery<ActivityWithUser>(sql, params, client);
    return result.rows;
  }

  /**
   * Find activities for a channel
   */
  async findChannelActivities(
    channelId: string,
    filters?: {
      activityType?: string;
      userId?: string;
      after?: Date;
      before?: Date;
    },
    limit: number = 50,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<ActivityWithUser[]> {
    let whereConditions = ['a.channel_id = $1', 'a.deleted_at IS NULL'];
    let params: any[] = [channelId];
    let paramIndex = 2;

    // Add filters
    if (filters?.activityType) {
      whereConditions.push(`a.activity_type = $${paramIndex}`);
      params.push(filters.activityType);
      paramIndex++;
    }

    if (filters?.userId) {
      whereConditions.push(`a.user_id = $${paramIndex}`);
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.after) {
      whereConditions.push(`a.created_at > $${paramIndex}`);
      params.push(filters.after);
      paramIndex++;
    }

    if (filters?.before) {
      whereConditions.push(`a.created_at < $${paramIndex}`);
      params.push(filters.before);
      paramIndex++;
    }

    const sql = `
      SELECT 
        a.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        c.name as channel_name,
        t.title as task_title
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN channels c ON a.channel_id = c.id
      LEFT JOIN tasks t ON a.task_id = t.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.executeRawQuery<ActivityWithUser>(sql, params, client);
    return result.rows;
  }

  /**
   * Get channel activity count
   */
  async getChannelActivityCount(
    channelId: string,
    filters?: {
      activityType?: string;
      userId?: string;
      after?: Date;
      before?: Date;
    },
    client?: DatabaseClient
  ): Promise<number> {
    let whereConditions = ['channel_id = $1', 'deleted_at IS NULL'];
    let params: any[] = [channelId];
    let paramIndex = 2;

    // Add filters
    if (filters?.activityType) {
      whereConditions.push(`activity_type = $${paramIndex}`);
      params.push(filters.activityType);
      paramIndex++;
    }

    if (filters?.userId) {
      whereConditions.push(`user_id = $${paramIndex}`);
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.after) {
      whereConditions.push(`created_at > $${paramIndex}`);
      params.push(filters.after);
      paramIndex++;
    }

    if (filters?.before) {
      whereConditions.push(`created_at < $${paramIndex}`);
      params.push(filters.before);
      paramIndex++;
    }

    const sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
    `;

    const result = await this.executeRawQuery<{ count: string }>(sql, params, client);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get user activity count
   */
  async getUserActivityCount(
    userId: string,
    unreadOnly: boolean = false,
    client?: DatabaseClient
  ): Promise<number> {
    let whereConditions = ['deleted_at IS NULL'];
    let params: any[] = [];
    let paramIndex = 1;

    // User should see activities where they are involved
    whereConditions.push(`(
      user_id = $${paramIndex}
      OR metadata::text LIKE '%"' || $${paramIndex} || '"%'
      OR EXISTS (
        SELECT 1 FROM channels c 
        WHERE c.id = channel_id 
        AND $${paramIndex} = ANY(c.members)
        AND c.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_id
        AND $${paramIndex} = ANY(t.assigned_to)
        AND t.deleted_at IS NULL
      )
    )`);
    params.push(userId);
    paramIndex++;

    if (unreadOnly) {
      whereConditions.push(`NOT ($${paramIndex - 1} = ANY(read_by))`);
    }

    const sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
    `;

    const result = await this.executeRawQuery<{ count: string }>(sql, params, client);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Mark activity as read by user
   */
  async markAsRead(
    activityId: string,
    userId: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET read_by = CASE 
        WHEN $2 = ANY(read_by) THEN read_by
        ELSE array_append(read_by, $2)
      END
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    try {
      const result = await this.executeRawQuery(sql, [activityId, userId], client);
      
      if (result.rowCount > 0) {
        logger.debug(
          {
            activityId,
            userId,
          },
          'Activity marked as read'
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error, activityId, userId }, 'Failed to mark activity as read');
      return false;
    }
  }

  /**
   * Mark multiple activities as read
   */
  async markMultipleAsRead(
    activityIds: string[],
    userId: string,
    client?: DatabaseClient
  ): Promise<number> {
    if (activityIds.length === 0) return 0;

    const placeholders = activityIds.map((_, index) => `$${index + 2}`).join(',');
    const sql = `
      UPDATE ${this.tableName}
      SET read_by = CASE 
        WHEN $1 = ANY(read_by) THEN read_by
        ELSE array_append(read_by, $1)
      END
      WHERE id = ANY(ARRAY[${placeholders}]) AND deleted_at IS NULL
    `;

    try {
      const result = await this.executeRawQuery(sql, [userId, ...activityIds], client);
      
      logger.info(
        {
          userId,
          markedCount: result.rowCount,
          totalIds: activityIds.length,
        },
        'Multiple activities marked as read'
      );
      
      return result.rowCount;
    } catch (error) {
      logger.error({ error, userId, activityIds }, 'Failed to mark multiple activities as read');
      return 0;
    }
  }

  /**
   * Mark all user activities as read
   */
  async markAllAsRead(userId: string, client?: DatabaseClient): Promise<number> {
    const sql = `
      UPDATE ${this.tableName}
      SET read_by = CASE 
        WHEN $1 = ANY(read_by) THEN read_by
        ELSE array_append(read_by, $1)
      END
      WHERE deleted_at IS NULL
        AND NOT ($1 = ANY(read_by))
        AND (
          user_id = $1
          OR metadata::text LIKE '%"' || $1 || '"%'
          OR EXISTS (
            SELECT 1 FROM channels c 
            WHERE c.id = channel_id 
            AND $1 = ANY(c.members)
            AND c.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = task_id
            AND $1 = ANY(t.assigned_to)
            AND t.deleted_at IS NULL
          )
        )
    `;

    try {
      const result = await this.executeRawQuery(sql, [userId], client);
      
      logger.info(
        {
          userId,
          markedCount: result.rowCount,
        },
        'All user activities marked as read'
      );
      
      return result.rowCount;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to mark all activities as read');
      return 0;
    }
  }

  /**
   * Get activity statistics for a user
   */
  async getUserActivityStats(
    userId: string,
    daysSince: number = 30,
    client?: DatabaseClient
  ): Promise<{
    totalActivities: number;
    unreadActivities: number;
    activitiesByType: Record<string, number>;
    activitiesByCategory: Record<string, number>;
    recentActivity: Array<{ date: string; count: number }>;
  }> {
    const statsSql = `
      WITH user_activities AS (
        SELECT *
        FROM ${this.tableName}
        WHERE deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '${daysSince} days'
          AND (
            user_id = $1
            OR metadata::text LIKE '%"' || $1 || '"%'
            OR EXISTS (
              SELECT 1 FROM channels c 
              WHERE c.id = channel_id 
              AND $1 = ANY(c.members)
              AND c.deleted_at IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM tasks t
              WHERE t.id = task_id
              AND $1 = ANY(t.assigned_to)
              AND t.deleted_at IS NULL
            )
          )
      )
      SELECT 
        COUNT(*) as total_activities,
        COUNT(*) FILTER (WHERE NOT ($1 = ANY(read_by))) as unread_activities,
        COUNT(*) FILTER (WHERE activity_type = 'message') as message_activities,
        COUNT(*) FILTER (WHERE activity_type = 'task_created') as task_created_activities,
        COUNT(*) FILTER (WHERE activity_type = 'task_updated') as task_updated_activities,
        COUNT(*) FILTER (WHERE activity_type = 'task_completed') as task_completed_activities,
        COUNT(*) FILTER (WHERE category = 'task') as task_category,
        COUNT(*) FILTER (WHERE category = 'channel') as channel_category,
        COUNT(*) FILTER (WHERE category = 'system') as system_category,
        COUNT(*) FILTER (WHERE category = 'social') as social_category
      FROM user_activities
    `;

    const recentActivitySql = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '${daysSince} days'
        AND (
          user_id = $1
          OR metadata::text LIKE '%"' || $1 || '"%'
          OR EXISTS (
            SELECT 1 FROM channels c 
            WHERE c.id = channel_id 
            AND $1 = ANY(c.members)
            AND c.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = task_id
            AND $1 = ANY(t.assigned_to)
            AND t.deleted_at IS NULL
          )
        )
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const [statsResult, recentActivityResult] = await Promise.all([
      this.executeRawQuery<any>(statsSql, [userId], client),
      this.executeRawQuery<any>(recentActivitySql, [userId], client),
    ]);

    const stats = statsResult.rows[0];

    return {
      totalActivities: parseInt(stats.total_activities, 10),
      unreadActivities: parseInt(stats.unread_activities, 10),
      activitiesByType: {
        message: parseInt(stats.message_activities, 10),
        task_created: parseInt(stats.task_created_activities, 10),
        task_updated: parseInt(stats.task_updated_activities, 10),
        task_completed: parseInt(stats.task_completed_activities, 10),
      },
      activitiesByCategory: {
        task: parseInt(stats.task_category, 10),
        channel: parseInt(stats.channel_category, 10),
        system: parseInt(stats.system_category, 10),
        social: parseInt(stats.social_category, 10),
      },
      recentActivity: recentActivityResult.rows.map((row: any) => ({
        date: row.date,
        count: parseInt(row.count, 10),
      })),
    };
  }

  /**
   * Determine priority based on activity type
   */
  private determinePriority(activityType: Activity['activity_type']): Activity['priority'] {
    switch (activityType) {
      case 'task_created':
      case 'task_assigned':
      case 'member_added':
      case 'member_removed':
        return 'medium';
      case 'task_unassigned':
      case 'channel_updated':
        return 'low';
      case 'task_completed':
        return 'low';
      case 'mention':
      case 'voice_command':
        return 'high';
      default:
        return 'low';
    }
  }

  /**
   * Determine category based on activity type
   */
  private determineCategory(activityType: Activity['activity_type']): Activity['category'] {
    switch (activityType) {
      case 'task_created':
      case 'task_updated':
      case 'task_completed':
      case 'task_assigned':
      case 'task_unassigned':
        return 'task';
      case 'message':
      case 'member_joined':
      case 'member_left':
      case 'member_added':
      case 'member_removed':
      case 'channel_updated':
      case 'channel_created':
      case 'channel_deleted':
        return 'channel';
      case 'mention':
      case 'reaction_added':
        return 'social';
      case 'file_uploaded':
      case 'voice_command':
      case 'ai_response':
        return 'system';
      default:
        return 'system';
    }
  }

  /**
   * Clean up old activities
   */
  async cleanupOldActivities(
    daysToKeep: number = 90,
    client?: DatabaseClient
  ): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
        AND category != 'task'  -- Keep task-related activities longer
    `;

    try {
      const result = await this.executeRawQuery(sql, [], client);
      
      logger.info(
        {
          deletedCount: result.rowCount,
          daysToKeep,
        },
        'Old activities cleaned up'
      );
      
      return result.rowCount;
    } catch (error) {
      logger.error({ error, daysToKeep }, 'Failed to clean up old activities');
      return 0;
    }
  }
}

export default ActivityRepository;