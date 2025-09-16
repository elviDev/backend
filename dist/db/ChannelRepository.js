"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
class ChannelRepository extends BaseRepository_1.default {
    constructor() {
        super('channels');
    }
    /**
     * Create new channel with validation
     */
    async createChannel(channelData, client) {
        // Check for duplicate name within category
        if (channelData.category_id) {
            const existingChannel = await this.findByCategoryAndName(channelData.category_id, channelData.name, client);
            if (existingChannel) {
                throw new errors_1.ConflictError('Channel name already exists in this category', {
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
            status: 'active',
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
        logger_1.logger.info({
            channelId: channel.id,
            name: channel.name,
            createdBy: channel.created_by,
            memberCount: channel.member_count,
        }, 'Channel created successfully');
        return channel;
    }
    /**
     * Find channel by category and name
     */
    async findByCategoryAndName(categoryId, name, client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE category_id = $1 
      AND LOWER(name) = LOWER($2) 
      AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [categoryId, name], client);
        return result.rows[0] || null;
    }
    /**
     * Find channels by category
     */
    async findByCategory(categoryId, includeDeleted = false, client) {
        const options = {
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
    async findByMember(userId, includeDeleted = false, client) {
        const deletedCondition = includeDeleted ? '' : 'AND deleted_at IS NULL';
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE $1 = ANY(members) ${deletedCondition}
      ORDER BY last_activity_at DESC
    `;
        const result = await this.executeRawQuery(sql, [userId], client);
        return result.rows;
    }
    /**
     * Find channels accessible by user (considering role and privacy)
     */
    async findAccessibleByUser(userId, userRole, client) {
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
        const result = await this.executeRawQuery(sql, [userId, userRole], client);
        return result.rows;
    }
    /**
     * Add member to channel
     */
    async addMember(channelId, userId, addedBy, client) {
        const sql = `
      SELECT add_channel_member($1, $2, $3)
    `;
        try {
            const result = await this.executeRawQuery(sql, [channelId, userId, addedBy], client);
            const success = result.rows[0]?.add_channel_member || false;
            if (success) {
                logger_1.logger.info({
                    channelId,
                    userId,
                    addedBy,
                }, 'Member added to channel');
            }
            return success;
        }
        catch (error) {
            logger_1.logger.error({ error, channelId, userId }, 'Failed to add member to channel');
            throw error;
        }
    }
    /**
     * Remove member from channel
     */
    async removeMember(channelId, userId, removedBy, client) {
        const sql = `
      SELECT remove_channel_member($1, $2, $3)
    `;
        try {
            const result = await this.executeRawQuery(sql, [channelId, userId, removedBy], client);
            const success = result.rows[0]?.remove_channel_member || false;
            if (success) {
                logger_1.logger.info({
                    channelId,
                    userId,
                    removedBy,
                }, 'Member removed from channel');
            }
            return success;
        }
        catch (error) {
            logger_1.logger.error({ error, channelId, userId }, 'Failed to remove member from channel');
            throw error;
        }
    }
    /**
     * Add multiple members to channel
     */
    async addMembers(channelId, userIds, addedBy, client) {
        const successfulAdds = [];
        for (const userId of userIds) {
            try {
                const success = await this.addMember(channelId, userId, addedBy, client);
                if (success) {
                    successfulAdds.push(userId);
                }
            }
            catch (error) {
                logger_1.logger.warn({ error, channelId, userId }, 'Failed to add individual member');
            }
        }
        return successfulAdds;
    }
    /**
     * Get channel with detailed member information
     */
    async findWithMembers(channelId, client) {
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
        const result = await this.executeRawQuery(sql, [channelId], client);
        return result.rows[0] || null;
    }
    /**
     * Search channels by name or description
     */
    async searchChannels(searchTerm, userId, userRole, limit = 20, offset = 0, client) {
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
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Get channels by status
     */
    async findByStatus(status, limit, client) {
        const options = {
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
    async archiveChannel(channelId, archivedBy, reason, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        status = 'archived',
        archived_at = NOW(),
        archived_by = $2,
        archive_reason = $3
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [channelId, archivedBy, reason || 'Manual archive'], client);
        if (result.rowCount > 0) {
            logger_1.logger.info({
                channelId,
                archivedBy,
                reason,
            }, 'Channel archived successfully');
        }
        return result.rowCount > 0;
    }
    /**
     * Restore archived channel
     */
    async restoreChannel(channelId, client) {
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
            logger_1.logger.info({ channelId }, 'Channel restored successfully');
        }
        return result.rowCount > 0;
    }
    /**
     * Update channel activity timestamp
     */
    async updateActivity(channelId, client) {
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
    async getInactiveChannels(daysSinceActivity = 30, client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE last_activity_at < NOW() - INTERVAL '${daysSinceActivity} days'
      AND status = 'active'
      AND deleted_at IS NULL
      ORDER BY last_activity_at ASC
    `;
        const result = await this.executeRawQuery(sql, [], client);
        return result.rows;
    }
    /**
     * Get channel statistics
     */
    async getChannelStats(client) {
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
            this.executeRawQuery(statsSql, [], client),
            this.executeRawQuery(mostActiveSql, [], client),
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
            mostActiveChannels: activeResult.rows.map((row) => ({
                id: row.id,
                name: row.name,
                activity_count: parseInt(row.activity_count, 10),
            })),
        };
    }
    /**
     * Find channels for a specific user based on their role and permissions
     */
    async findUserChannels(userId, userRole, client) {
        let sql;
        let params;
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
        }
        else if (userRole === 'manager') {
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
        }
        else {
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
    async getMembers(channelId, client) {
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
    async canUserAccess(channelId, userId, userRole, client) {
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
exports.default = ChannelRepository;
//# sourceMappingURL=ChannelRepository.js.map