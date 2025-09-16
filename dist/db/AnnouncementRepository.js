"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BaseRepository_1 = require("./BaseRepository");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
class AnnouncementRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super('announcements');
        this.selectFields = [
            'id', 'title', 'content', 'type', 'priority', 'target_audience',
            'scheduled_for', 'expires_at', 'action_button_text', 'action_button_url',
            'image_url', 'created_by', 'published', 'read_by', 'created_at',
            'updated_at', 'version', 'deleted_at', 'deleted_by'
        ];
    }
    async create(data, client) {
        const now = new Date();
        // Validation
        if (!data.title?.trim()) {
            throw new errors_1.ValidationError('Title is required', [{ field: 'title', message: 'Title is required' }]);
        }
        if (!data.content?.trim()) {
            throw new errors_1.ValidationError('Content is required', [{ field: 'content', message: 'Content is required' }]);
        }
        if (!data.created_by) {
            throw new errors_1.ValidationError('Created by user ID is required', [{ field: 'created_by', message: 'Created by user ID is required' }]);
        }
        const announcementData = {
            ...data,
            published: data.published ?? false,
            read_by: [],
            created_at: now,
            updated_at: now,
            version: 1
        };
        const query = `
      INSERT INTO ${this.tableName} (
        title, content, type, priority, target_audience, scheduled_for,
        expires_at, action_button_text, action_button_url, image_url,
        created_by, published, read_by, created_at, updated_at, version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *
    `;
        const values = [
            announcementData.title,
            announcementData.content,
            announcementData.type,
            announcementData.priority,
            announcementData.target_audience,
            announcementData.scheduled_for || null,
            announcementData.expires_at || null,
            announcementData.action_button_text || null,
            announcementData.action_button_url || null,
            announcementData.image_url || null,
            announcementData.created_by,
            announcementData.published,
            JSON.stringify(announcementData.read_by),
            announcementData.created_at,
            announcementData.updated_at,
            announcementData.version
        ];
        try {
            const result = await this.query(query, values, client);
            logger_1.logger.info(`Created announcement: ${result.rows[0].id}`);
            return this.transformRow(result.rows[0]);
        }
        catch (error) {
            logger_1.logger.error('Failed to create announcement:', error);
            throw error;
        }
    }
    async update(id, data, client) {
        const existing = await this.findById(id, client);
        if (!existing) {
            throw new errors_1.NotFoundError(`Announcement with ID ${id} not found`);
        }
        const now = new Date();
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        // Build dynamic update query
        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                updateFields.push(`${key} = $${paramIndex}`);
                updateValues.push(value);
                paramIndex++;
            }
        });
        if (updateFields.length === 0) {
            return existing;
        }
        // Add updated_at and version
        updateFields.push(`updated_at = $${paramIndex}`);
        updateValues.push(now);
        paramIndex++;
        updateFields.push(`version = $${paramIndex}`);
        updateValues.push(existing.version + 1);
        paramIndex++;
        // Add WHERE clause
        updateValues.push(id);
        updateValues.push(existing.version);
        const query = `
      UPDATE ${this.tableName} 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex - 1} AND version = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;
        try {
            const result = await this.query(query, updateValues, client);
            if (result.rows.length === 0) {
                throw new Error('Concurrent update detected - announcement was modified by another process');
            }
            logger_1.logger.info(`Updated announcement: ${id}`);
            return this.transformRow(result.rows[0]);
        }
        catch (error) {
            logger_1.logger.error(`Failed to update announcement ${id}:`, error);
            throw error;
        }
    }
    async findForUser(userId, userRole, includeRead = true, client) {
        let whereConditions = ['deleted_at IS NULL', 'published = true'];
        const queryParams = [];
        let paramIndex = 1;
        // Filter by expiration
        whereConditions.push('(expires_at IS NULL OR expires_at > NOW())');
        // Filter by schedule
        whereConditions.push('(scheduled_for IS NULL OR scheduled_for <= NOW())');
        // Filter by target audience
        if (userRole !== 'ceo') {
            whereConditions.push(`(target_audience = 'all' OR target_audience = $${paramIndex})`);
            queryParams.push(this.mapRoleToAudience(userRole));
            paramIndex++;
        }
        // Filter by read status if requested
        if (!includeRead) {
            whereConditions.push(`NOT (read_by ? $${paramIndex})`);
            queryParams.push(userId);
            paramIndex++;
        }
        const query = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        CASE priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        created_at DESC
    `;
        try {
            const result = await this.query(query, queryParams, client);
            return result.rows.map(row => this.transformRow(row));
        }
        catch (error) {
            logger_1.logger.error(`Failed to find announcements for user ${userId}:`, error);
            throw error;
        }
    }
    async markAsRead(announcementId, userId, client) {
        const query = `
      UPDATE ${this.tableName}
      SET read_by = read_by || $1::jsonb,
          updated_at = NOW(),
          version = version + 1
      WHERE id = $2 
        AND deleted_at IS NULL 
        AND NOT (read_by ? $3)
    `;
        const values = [JSON.stringify([userId]), announcementId, userId];
        try {
            await this.query(query, values, client);
            logger_1.logger.info(`Marked announcement ${announcementId} as read by user ${userId}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to mark announcement ${announcementId} as read:`, error);
            throw error;
        }
    }
    async findWithFilter(filter, limit = 50, offset = 0, client) {
        const whereConditions = ['deleted_at IS NULL'];
        const queryParams = [];
        let paramIndex = 1;
        // Apply filters
        if (filter.type && filter.type.length > 0) {
            whereConditions.push(`type = ANY($${paramIndex})`);
            queryParams.push(filter.type);
            paramIndex++;
        }
        if (filter.priority && filter.priority.length > 0) {
            whereConditions.push(`priority = ANY($${paramIndex})`);
            queryParams.push(filter.priority);
            paramIndex++;
        }
        if (filter.target_audience && filter.target_audience.length > 0) {
            whereConditions.push(`target_audience = ANY($${paramIndex})`);
            queryParams.push(filter.target_audience);
            paramIndex++;
        }
        if (filter.published !== undefined) {
            whereConditions.push(`published = $${paramIndex}`);
            queryParams.push(filter.published);
            paramIndex++;
        }
        if (filter.created_by && filter.created_by.length > 0) {
            whereConditions.push(`created_by = ANY($${paramIndex})`);
            queryParams.push(filter.created_by);
            paramIndex++;
        }
        if (filter.date_from) {
            whereConditions.push(`created_at >= $${paramIndex}`);
            queryParams.push(filter.date_from);
            paramIndex++;
        }
        if (filter.date_to) {
            whereConditions.push(`created_at <= $${paramIndex}`);
            queryParams.push(filter.date_to);
            paramIndex++;
        }
        const whereClause = whereConditions.join(' AND ');
        // Count query
        const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE ${whereClause}`;
        const countResult = await this.query(countQuery, queryParams, client);
        const total = parseInt(countResult.rows[0].count);
        // Data query
        queryParams.push(limit, offset);
        const dataQuery = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        const dataResult = await this.query(dataQuery, queryParams, client);
        const data = dataResult.rows.map(row => this.transformRow(row));
        return { data, total };
    }
    async getStats(client) {
        const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN published = true THEN 1 END) as published,
        COUNT(CASE WHEN scheduled_for > NOW() THEN 1 END) as scheduled,
        COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired,
        jsonb_object_agg(type, type_count) as by_type,
        jsonb_object_agg(priority, priority_count) as by_priority,
        jsonb_object_agg(target_audience, audience_count) as by_audience
      FROM ${this.tableName}
      CROSS JOIN LATERAL (
        SELECT type, COUNT(*) as type_count
        FROM ${this.tableName} t2
        WHERE t2.type = ${this.tableName}.type AND deleted_at IS NULL
        GROUP BY type
      ) type_stats
      CROSS JOIN LATERAL (
        SELECT priority, COUNT(*) as priority_count
        FROM ${this.tableName} t3
        WHERE t3.priority = ${this.tableName}.priority AND deleted_at IS NULL
        GROUP BY priority
      ) priority_stats
      CROSS JOIN LATERAL (
        SELECT target_audience, COUNT(*) as audience_count
        FROM ${this.tableName} t4
        WHERE t4.target_audience = ${this.tableName}.target_audience AND deleted_at IS NULL
        GROUP BY target_audience
      ) audience_stats
      WHERE deleted_at IS NULL
    `;
        try {
            const result = await this.query(query, [], client);
            const row = result.rows[0];
            return {
                total: parseInt(row.total) || 0,
                published: parseInt(row.published) || 0,
                scheduled: parseInt(row.scheduled) || 0,
                expired: parseInt(row.expired) || 0,
                byType: row.by_type || {},
                byPriority: row.by_priority || {},
                byAudience: row.by_audience || {},
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get announcement stats:', error);
            throw error;
        }
    }
    mapRoleToAudience(role) {
        const roleMapping = {
            'admin': 'admins',
            'developer': 'developers',
            'designer': 'designers',
            'manager': 'managers',
            'staff': 'all'
        };
        return roleMapping[role] || 'all';
    }
    transformRow(row) {
        return {
            ...row,
            read_by: Array.isArray(row.read_by) ? row.read_by : (row.read_by ? JSON.parse(row.read_by) : []),
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
            scheduled_for: row.scheduled_for ? new Date(row.scheduled_for) : null,
            expires_at: row.expires_at ? new Date(row.expires_at) : null,
            deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
        };
    }
}
exports.default = AnnouncementRepository;
//# sourceMappingURL=AnnouncementRepository.js.map