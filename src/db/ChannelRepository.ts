import { DatabaseClient } from '@config/database';
import { logger } from '@utils/logger';
import { ValidationError, ConflictError, NotFoundError } from '@utils/errors';
import BaseRepository, { BaseEntity, FilterOptions } from './BaseRepository';

export interface Channel extends BaseEntity {
  name: string;
  description?: string;
  category_id?: string;
  channel_type:
    | 'project'
    | 'department'
    | 'initiative'
    | 'temporary'
    | 'emergency'
    | 'announcement';
  privacy_level: 'public' | 'private' | 'restricted';
  status: 'active' | 'archived' | 'paused' | 'completed';
  created_by: string;
  owned_by: string;
  moderators: string[];
  members: string[];
  member_count: number;
  max_members: number;
  auto_join_roles: string[];
  settings: Record<string, any>;
  integrations: Record<string, any>;
  activity_stats: Record<string, any>;
  project_info: Record<string, any>;
  schedule: Record<string, any>;
  archived_at?: Date;
  archived_by?: string;
  archive_reason?: string;
  retention_until?: Date;
  last_activity_at: Date;
}

export interface CreateChannelData {
  name: string;
  description?: string;
  category_id?: string;
  channel_type?: Channel['channel_type'];
  privacy_level?: Channel['privacy_level'];
  created_by: string;
  owned_by?: string;
  members?: string[];
  moderators?: string[];
  max_members?: number;
  auto_join_roles?: string[];
  settings?: Record<string, any>;
  project_info?: Record<string, any>;
  integrations?: Record<string, any>;
}

export interface ChannelWithDetails extends Channel {
  category_name?: string;
  owner_name?: string;
  member_details?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatar_url?: string;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    assignee_details?: Array<{
      id: string;
      name: string;
      email: string;
      avatar_url?: string;
      role: string;
      phone?: string;
    }>;
  }>;
}

class ChannelRepository extends BaseRepository<Channel> {
  constructor() {
    super('channels');
  }

  /**
   * Create new channel with validation
   */
  async createChannel(channelData: CreateChannelData, client?: DatabaseClient): Promise<Channel> {
    // Check for duplicate name within category
    if (channelData.category_id) {
      const existingChannel = await this.findByCategoryAndName(
        channelData.category_id,
        channelData.name,
        client
      );
      if (existingChannel) {
        throw new ConflictError('Channel name already exists in this category', {
          name: channelData.name,
          categoryId: channelData.category_id,
        });
      }
    }

    // Set defaults
    const channelToCreate = {
      ...channelData,
      owned_by: channelData.owned_by || channelData.created_by,
      channel_type: channelData.channel_type || 'project',
      privacy_level: channelData.privacy_level || 'public',
      status: 'active' as const,
      members: channelData.members || [channelData.created_by],
      moderators: channelData.moderators || [channelData.created_by],
      member_count: channelData.members?.length || 1,
      max_members: channelData.max_members || 100,
      auto_join_roles: channelData.auto_join_roles || [],
      settings: {
        allow_voice_commands: true,
        voice_command_roles: ['ceo', 'manager'],
        allow_file_uploads: true,
        ...channelData.settings,
      },
      integrations: {
        ai_assistant_enabled: true,
        task_creation_enabled: true,
        ...channelData.integrations,
      },
      activity_stats: {
        total_messages: 0,
        total_files: 0,
        total_tasks: 0,
        last_activity: null,
      },
      project_info: channelData.project_info || {},
      schedule: {
        timezone: 'UTC',
        working_hours: {
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: null,
          sunday: null,
        },
      },
    };

    const channel = await this.create(channelToCreate, client);

    logger.info(
      {
        channelId: channel.id,
        name: channel.name,
        createdBy: channel.created_by,
        memberCount: channel.member_count,
      },
      'Channel created successfully'
    );

    return channel;
  }

  /**
   * Find channel by category and name
   */
  async findByCategoryAndName(
    categoryId: string,
    name: string,
    client?: DatabaseClient
  ): Promise<Channel | null> {
    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE category_id = $1 
      AND LOWER(name) = LOWER($2) 
      AND deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<Channel>(sql, [categoryId, name], client);
    return result.rows[0] || null;
  }

  /**
   * Find channels by category
   */
  async findByCategory(
    categoryId: string,
    includeDeleted: boolean = false,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    const options: FilterOptions = {
      filters: { category_id: categoryId },
      includeDeleted,
      orderBy: 'last_activity_at',
      orderDirection: 'DESC',
    };

    const result = await this.findMany(options, client);
    return result.data;
  }

  /**
   * Find channels where user is a member
   */
  async findByMember(
    userId: string,
    includeDeleted: boolean = false,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    const deletedCondition = includeDeleted ? '' : 'AND deleted_at IS NULL';

    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE $1 = ANY(members) ${deletedCondition}
      ORDER BY last_activity_at DESC
    `;

    const result = await this.executeRawQuery<Channel>(sql, [userId], client);
    return result.rows;
  }

  /**
   * Find channels accessible by user (considering role and privacy)
   */
  async findAccessibleByUser(
    userId: string,
    userRole: string,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
      AND (
        -- Public channels
        privacy_level = 'public' 
        -- User is a member
        OR $1 = ANY(members)
        -- CEO can access all channels
        OR $2 = 'ceo'
        -- Restricted channels with role access
        OR (privacy_level = 'restricted' AND $2 = ANY(auto_join_roles))
      )
      ORDER BY 
        CASE WHEN $1 = ANY(members) THEN 1 ELSE 2 END,
        last_activity_at DESC
    `;

    const result = await this.executeRawQuery<Channel>(sql, [userId, userRole], client);
    return result.rows;
  }

  /**
   * Add member to channel
   */
  async addMember(
    channelId: string,
    userId: string,
    addedBy: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    const sql = `
      SELECT add_channel_member($1, $2, $3)
    `;

    try {
      const result = await this.executeRawQuery<{ add_channel_member: boolean }>(
        sql,
        [channelId, userId, addedBy],
        client
      );

      const success = result.rows[0]?.add_channel_member || false;

      if (success) {
        logger.info(
          {
            channelId,
            userId,
            addedBy,
          },
          'Member added to channel'
        );
      }

      return success;
    } catch (error) {
      logger.error({ error, channelId, userId }, 'Failed to add member to channel');
      throw error;
    }
  }

  /**
   * Remove member from channel
   */
  async removeMember(
    channelId: string,
    userId: string,
    removedBy: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    const sql = `
      SELECT remove_channel_member($1, $2, $3)
    `;

    try {
      const result = await this.executeRawQuery<{ remove_channel_member: boolean }>(
        sql,
        [channelId, userId, removedBy],
        client
      );

      const success = result.rows[0]?.remove_channel_member || false;

      if (success) {
        logger.info(
          {
            channelId,
            userId,
            removedBy,
          },
          'Member removed from channel'
        );
      }

      return success;
    } catch (error) {
      logger.error({ error, channelId, userId }, 'Failed to remove member from channel');
      throw error;
    }
  }

  /**
   * Add multiple members to channel
   */
  async addMembers(
    channelId: string,
    userIds: string[],
    addedBy: string,
    client?: DatabaseClient
  ): Promise<string[]> {
    const successfulAdds: string[] = [];

    for (const userId of userIds) {
      try {
        const success = await this.addMember(channelId, userId, addedBy, client);
        if (success) {
          successfulAdds.push(userId);
        }
      } catch (error) {
        logger.warn({ error, channelId, userId }, 'Failed to add individual member');
      }
    }

    return successfulAdds;
  }

  /**
   * Get channel with detailed member information
   */
  async findWithMembers(
    channelId: string,
    client?: DatabaseClient
  ): Promise<ChannelWithDetails | null> {
    const sql = `
      SELECT 
        c.*,
        cat.name as category_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role,
            'avatar_url', u.avatar_url
          )
          FROM users u 
          WHERE u.id = ANY(c.members) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as member_details
      FROM channels c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users owner ON c.owned_by = owner.id
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<ChannelWithDetails>(sql, [channelId], client);
    return result.rows[0] || null;
  }

  /**
   * Get channel with detailed member information and tasks with assignee details
   */
  async findWithFullDetails(
    channelId: string,
    client?: DatabaseClient
  ): Promise<ChannelWithDetails | null> {
    const sql = `
      SELECT 
        c.*,
        cat.name as category_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role,
            'avatar_url', u.avatar_url
          )
          FROM users u 
          WHERE u.id = ANY(c.members) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as member_details,
        ARRAY(
          SELECT json_build_object(
            'id', t.id,
            'title', t.title,
            'status', t.status,
            'priority', t.priority,
            'assignee_details', ARRAY(
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
            )
          )
          FROM tasks t 
          WHERE t.channel_id = c.id 
          AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 10
        ) as tasks
      FROM channels c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users owner ON c.owned_by = owner.id
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<ChannelWithDetails>(sql, [channelId], client);
    return result.rows[0] || null;
  }

  /**
   * Find channels accessible by user with full details (members and tasks)
   */
  async findAccessibleByUserWithDetails(
    userId: string,
    userRole: string,
    client?: DatabaseClient
  ): Promise<ChannelWithDetails[]> {
    const sql = `
      SELECT 
        c.*,
        cat.name as category_name,
        owner.name as owner_name,
        ARRAY(
          SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role,
            'avatar_url', u.avatar_url
          )
          FROM users u 
          WHERE u.id = ANY(c.members) 
          AND u.deleted_at IS NULL
          ORDER BY u.name
        ) as member_details,
        ARRAY(
          SELECT json_build_object(
            'id', t.id,
            'title', t.title,
            'status', t.status,
            'priority', t.priority,
            'assignee_details', ARRAY(
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
            )
          )
          FROM tasks t 
          WHERE t.channel_id = c.id 
          AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 5
        ) as tasks
      FROM channels c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users owner ON c.owned_by = owner.id
      WHERE c.deleted_at IS NULL
      AND (
        -- Public channels
        c.privacy_level = 'public' 
        -- User is a member
        OR $1 = ANY(c.members)
        -- CEO can access all channels
        OR $2 = 'ceo'
        -- Restricted channels with role access
        OR (c.privacy_level = 'restricted' AND $2 = ANY(c.auto_join_roles))
      )
      ORDER BY 
        CASE WHEN $1 = ANY(c.members) THEN 1 ELSE 2 END,
        c.last_activity_at DESC
    `;

    const result = await this.executeRawQuery<ChannelWithDetails>(sql, [userId, userRole], client);
    return result.rows;
  }

  /**
   * Search channels by name or description
   */
  async searchChannels(
    searchTerm: string,
    userId?: string,
    userRole?: string,
    limit: number = 20,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    let accessCondition = '';
    let params = [`%${searchTerm}%`, limit, offset];

    if (userId && userRole) {
      accessCondition = `
        AND (
          privacy_level = 'public' 
          OR $4 = ANY(members)
          OR $5 = 'ceo'
          OR (privacy_level = 'restricted' AND $5 = ANY(auto_join_roles))
        )
      `;
      params.push(userId, userRole);
    }

    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE (
        LOWER(name) LIKE LOWER($1) OR 
        LOWER(description) LIKE LOWER($1)
      )
      AND deleted_at IS NULL
      AND status = 'active'
      ${accessCondition}
      ORDER BY 
        CASE WHEN LOWER(name) LIKE LOWER($1) THEN 1 ELSE 2 END,
        last_activity_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeRawQuery<Channel>(sql, params, client);
    return result.rows;
  }

  /**
   * Get channels by status
   */
  async findByStatus(
    status: Channel['status'],
    limit?: number,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    const options: FilterOptions = {
      filters: { status },
      orderBy: 'last_activity_at',
      orderDirection: 'DESC',
      ...(limit !== undefined ? { limit } : {}),
    };

    const result = await this.findMany(options, client);
    return result.data;
  }

  /**
   * Archive channel
   */
  async archiveChannel(
    channelId: string,
    archivedBy: string,
    reason?: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET 
        status = 'archived',
        archived_at = NOW(),
        archived_by = $2,
        archive_reason = $3
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.executeRawQuery(
      sql,
      [channelId, archivedBy, reason || 'Manual archive'],
      client
    );

    if (result.rowCount > 0) {
      logger.info(
        {
          channelId,
          archivedBy,
          reason,
        },
        'Channel archived successfully'
      );
    }

    return result.rowCount > 0;
  }

  /**
   * Restore archived channel
   */
  async restoreChannel(channelId: string, client?: DatabaseClient): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET 
        status = 'active',
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL
      WHERE id = $1 AND deleted_at IS NULL AND status = 'archived'
    `;

    const result = await this.executeRawQuery(sql, [channelId], client);

    if (result.rowCount > 0) {
      logger.info({ channelId }, 'Channel restored successfully');
    }

    return result.rowCount > 0;
  }

  /**
   * Update channel activity timestamp
   */
  async updateActivity(channelId: string, client?: DatabaseClient): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET last_activity_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;

    await this.executeRawQuery(sql, [channelId], client);
  }

  /**
   * Get channels requiring attention (no recent activity)
   */
  async getInactiveChannels(
    daysSinceActivity: number = 30,
    client?: DatabaseClient
  ): Promise<Channel[]> {
    const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE last_activity_at < NOW() - INTERVAL '${daysSinceActivity} days'
      AND status = 'active'
      AND deleted_at IS NULL
      ORDER BY last_activity_at ASC
    `;

    const result = await this.executeRawQuery<Channel>(sql, [], client);
    return result.rows;
  }

  /**
   * Get channel statistics
   */
  async getChannelStats(client?: DatabaseClient): Promise<{
    totalChannels: number;
    activeChannels: number;
    channelsByType: Record<string, number>;
    channelsByPrivacy: Record<string, number>;
    averageMembers: number;
    mostActiveChannels: Array<{ id: string; name: string; activity_count: number }>;
  }> {
    const statsSql = `
      SELECT 
        COUNT(*) as total_channels,
        COUNT(*) FILTER (WHERE status = 'active') as active_channels,
        COUNT(*) FILTER (WHERE channel_type = 'project') as project_channels,
        COUNT(*) FILTER (WHERE channel_type = 'department') as department_channels,
        COUNT(*) FILTER (WHERE channel_type = 'initiative') as initiative_channels,
        COUNT(*) FILTER (WHERE channel_type = 'temporary') as temporary_channels,
        COUNT(*) FILTER (WHERE privacy_level = 'public') as public_channels,
        COUNT(*) FILTER (WHERE privacy_level = 'private') as private_channels,
        COUNT(*) FILTER (WHERE privacy_level = 'restricted') as restricted_channels,
        AVG(member_count) as average_members
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
    `;

    const mostActiveSql = `
      SELECT id, name, 
        COALESCE((activity_stats->>'total_messages')::int, 0) + 
        COALESCE((activity_stats->>'total_tasks')::int, 0) as activity_count
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
      AND status = 'active'
      ORDER BY activity_count DESC
      LIMIT 10
    `;

    const [statsResult, activeResult] = await Promise.all([
      this.executeRawQuery<any>(statsSql, [], client),
      this.executeRawQuery<any>(mostActiveSql, [], client),
    ]);

    const stats = statsResult.rows[0];

    return {
      totalChannels: parseInt(stats.total_channels, 10),
      activeChannels: parseInt(stats.active_channels, 10),
      channelsByType: {
        project: parseInt(stats.project_channels, 10),
        department: parseInt(stats.department_channels, 10),
        initiative: parseInt(stats.initiative_channels, 10),
        temporary: parseInt(stats.temporary_channels, 10),
      },
      channelsByPrivacy: {
        public: parseInt(stats.public_channels, 10),
        private: parseInt(stats.private_channels, 10),
        restricted: parseInt(stats.restricted_channels, 10),
      },
      averageMembers: parseFloat(stats.average_members || '0'),
      mostActiveChannels: activeResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        activity_count: parseInt(row.activity_count, 10),
      })),
    };
  }

  /**
   * Find channels for a specific user based on their role and permissions
   */
  async findUserChannels(userId: string, userRole?: string, client?: DatabaseClient): Promise<Channel[]> {
    let sql: string;
    let params: any[];

    if (userRole === 'ceo') {
      // CEO can see all active channels
      sql = `
        SELECT ${this.selectFields.join(', ')}
        FROM ${this.tableName}
        WHERE deleted_at IS NULL 
        AND status = 'active'
        ORDER BY last_activity_at DESC
      `;
      params = [];
    } else if (userRole === 'manager') {
      // Managers can see channels they created OR channels where they are moderators OR channels they are members of
      sql = `
        SELECT ${this.selectFields.join(', ')}
        FROM ${this.tableName}
        WHERE (
          created_by = $1 OR 
          owned_by = $1 OR 
          $1 = ANY(moderators) OR 
          $1 = ANY(members)
        )
        AND deleted_at IS NULL 
        AND status = 'active'
        ORDER BY last_activity_at DESC
      `;
      params = [userId];
    } else {
      // Staff can only see channels where they are members
      sql = `
        SELECT ${this.selectFields.join(', ')}
        FROM ${this.tableName}
        WHERE $1 = ANY(members) 
        AND deleted_at IS NULL 
        AND status = 'active'
        ORDER BY last_activity_at DESC
      `;
      params = [userId];
    }

    const result = await this.executeRawQuery(sql, params, client);
    return result.rows;
  }

  /**
   * Get channel members
   */
  async getMembers(channelId: string, client?: DatabaseClient): Promise<any[]> {
    const sql = `
      SELECT u.id, u.name, u.email, u.role, u.avatar_url
      FROM users u
      JOIN ${this.tableName} c ON u.id = ANY(c.members)
      WHERE c.id = $1 AND c.deleted_at IS NULL
      AND u.deleted_at IS NULL
    `;

    const result = await this.executeRawQuery(sql, [channelId], client);
    return result.rows;
  }

  /**
   * Check if user can access channel
   */
  async canUserAccess(
    channelId: string,
    userId: string,
    userRole: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    const sql = `
      SELECT id, privacy_level, members, created_by
      FROM ${this.tableName}
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.executeRawQuery(sql, [channelId], client);
    if (result.rows.length === 0) {
      return false;
    }

    const channel = result.rows[0];

    // CEO can access any channel
    if (userRole === 'ceo') {
      return true;
    }

    // Creator can always access
    if (channel.created_by === userId) {
      return true;
    }

    // Check if user is a member
    if (channel.members && channel.members.includes(userId)) {
      return true;
    }

    // Public channels are accessible to all
    if (channel.privacy_level === 'public') {
      return true;
    }

    return false;
  }
}

export default ChannelRepository;
