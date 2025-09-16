"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
class MessageRepository extends BaseRepository_1.default {
    constructor() {
        super('messages');
    }
    /**
     * Create new message with validation
     */
    async createMessage(messageData, client) {
        // Set defaults
        const messageToCreate = {
            ...messageData,
            message_type: messageData.message_type || 'text',
            attachments: messageData.attachments || [],
            mentions: messageData.mentions || [],
            metadata: messageData.metadata || {},
            formatting: messageData.formatting || {},
            reactions: {},
            is_edited: false,
            is_pinned: false,
            is_announcement: false,
            ai_generated: messageData.ai_generated || false,
        };
        const message = await this.create(messageToCreate, client);
        logger_1.logger.info({
            messageId: message.id,
            channelId: message.channel_id,
            userId: message.user_id,
            messageType: message.message_type,
            contentLength: message.content.length,
        }, 'Message created successfully');
        return message;
    }
    /**
     * Find messages in a channel
     */
    async findChannelMessages(channelId, filters, limit = 50, offset = 0, client) {
        let whereConditions = ['m.channel_id = $1', 'm.deleted_at IS NULL'];
        let params = [channelId];
        let paramIndex = 2;
        // Add filters
        if (filters?.threadRoot) {
            whereConditions.push(`m.thread_root = $${paramIndex}`);
            params.push(filters.threadRoot);
            paramIndex++;
        }
        else if (!filters?.includeThreadReplies) {
            // For main channel messages, exclude thread replies (messages with thread_root)
            // unless explicitly requested to include them
            whereConditions.push(`m.thread_root IS NULL`);
        }
        if (filters?.messageType) {
            whereConditions.push(`m.message_type = $${paramIndex}`);
            params.push(filters.messageType);
            paramIndex++;
        }
        if (filters?.before) {
            whereConditions.push(`m.created_at < $${paramIndex}`);
            params.push(filters.before);
            paramIndex++;
        }
        if (filters?.after) {
            whereConditions.push(`m.created_at > $${paramIndex}`);
            params.push(filters.after);
            paramIndex++;
        }
        const sql = `
      SELECT 
        m.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        COALESCE(thread_stats.reply_count, 0) as reply_count,
        thread_stats.last_reply_timestamp,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      LEFT JOIN (
        SELECT 
          thread_root,
          COUNT(*) as reply_count,
          MAX(created_at) as last_reply_timestamp
        FROM ${this.tableName}
        WHERE thread_root IS NOT NULL 
          AND deleted_at IS NULL
        GROUP BY thread_root
      ) thread_stats ON m.id = thread_stats.thread_root
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Get channel message count
     */
    async getChannelMessageCount(channelId, filters, client) {
        let whereConditions = ['channel_id = $1', 'deleted_at IS NULL'];
        let params = [channelId];
        let paramIndex = 2;
        // Add filters
        if (filters?.threadRoot) {
            whereConditions.push(`thread_root = $${paramIndex}`);
            params.push(filters.threadRoot);
            paramIndex++;
        }
        else if (!filters?.includeThreadReplies) {
            // For main channel messages, exclude thread replies (messages with thread_root)
            // unless explicitly requested to include them
            whereConditions.push(`thread_root IS NULL`);
        }
        if (filters?.messageType) {
            whereConditions.push(`message_type = $${paramIndex}`);
            params.push(filters.messageType);
            paramIndex++;
        }
        if (filters?.before) {
            whereConditions.push(`created_at < $${paramIndex}`);
            params.push(filters.before);
            paramIndex++;
        }
        if (filters?.after) {
            whereConditions.push(`created_at > $${paramIndex}`);
            params.push(filters.after);
            paramIndex++;
        }
        const sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${whereConditions.join(' AND ')}
    `;
        const result = await this.executeRawQuery(sql, params, client);
        return parseInt(result.rows[0]?.count || '0', 10);
    }
    /**
     * Search messages in channel
     */
    async searchMessages(channelId, searchTerm, limit = 50, offset = 0, client) {
        const sql = `
      SELECT 
        m.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      WHERE m.channel_id = $1 
        AND m.deleted_at IS NULL
        AND (
          LOWER(m.content) LIKE LOWER($2) 
          OR LOWER(m.transcription) LIKE LOWER($2)
        )
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `;
        const result = await this.executeRawQuery(sql, [channelId, `%${searchTerm}%`, limit, offset], client);
        return result.rows;
    }
    /**
     * Update message content
     */
    async updateMessage(messageId, updateData, client) {
        const message = await this.update(messageId, updateData, client);
        if (message) {
            logger_1.logger.info({
                messageId,
                updatedFields: Object.keys(updateData),
            }, 'Message updated successfully');
        }
        return message;
    }
    /**
     * Add reaction to message
     */
    async addReaction(messageId, userId, emoji, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET reactions = COALESCE(reactions, '{}'::jsonb) || 
          jsonb_build_object($2, 
            COALESCE((reactions->$2)::jsonb, '[]'::jsonb) || 
            CASE 
              WHEN (reactions->$2)::text LIKE '%"' || $3 || '"%' 
              THEN '[]'::jsonb
              ELSE jsonb_build_array($3)
            END
          )
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
        try {
            const result = await this.executeRawQuery(sql, [messageId, emoji, userId], client);
            if (result.rowCount > 0) {
                logger_1.logger.info({
                    messageId,
                    userId,
                    emoji,
                }, 'Reaction added to message');
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error({ error, messageId, userId, emoji }, 'Failed to add reaction');
            return false;
        }
    }
    /**
     * Remove reaction from message
     */
    async removeReaction(messageId, userId, emoji, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET reactions = COALESCE(reactions, '{}'::jsonb) || 
          jsonb_build_object($2, 
            COALESCE(
              (SELECT jsonb_agg(elem) 
               FROM jsonb_array_elements_text((reactions->$2)::jsonb) AS elem 
               WHERE elem != $3),
              '[]'::jsonb
            )
          )
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
        try {
            const result = await this.executeRawQuery(sql, [messageId, emoji, userId], client);
            if (result.rowCount > 0) {
                logger_1.logger.info({
                    messageId,
                    userId,
                    emoji,
                }, 'Reaction removed from message');
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error({ error, messageId, userId, emoji }, 'Failed to remove reaction');
            return false;
        }
    }
    /**
     * Get message reactions
     */
    async getMessageReactions(messageId, client) {
        const sql = `
      SELECT reactions
      FROM ${this.tableName}
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [messageId], client);
        return result.rows[0]?.reactions || {};
    }
    /**
     * Update user's last read message in channel
     */
    async updateLastRead(channelId, userId, messageId, client) {
        // If no messageId provided, use the latest message
        const latestMessageId = messageId || await this.getLatestMessageId(channelId, client);
        if (!latestMessageId)
            return;
        const sql = `
      INSERT INTO channel_read_status (channel_id, user_id, last_read_message_id, last_read_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (channel_id, user_id) 
      DO UPDATE SET 
        last_read_message_id = EXCLUDED.last_read_message_id,
        last_read_at = EXCLUDED.last_read_at
    `;
        try {
            await this.executeRawQuery(sql, [channelId, userId, latestMessageId], client);
            logger_1.logger.debug({
                channelId,
                userId,
                messageId: latestMessageId,
            }, 'Last read message updated');
        }
        catch (error) {
            logger_1.logger.error({ error, channelId, userId }, 'Failed to update last read');
        }
    }
    /**
     * Get latest message ID in channel
     */
    async getLatestMessageId(channelId, client) {
        const sql = `
      SELECT id
      FROM ${this.tableName}
      WHERE channel_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await this.executeRawQuery(sql, [channelId], client);
        return result.rows[0]?.id || null;
    }
    /**
     * Get unread message count for user in channel
     */
    async getUnreadCount(channelId, userId, client) {
        const sql = `
      WITH last_read AS (
        SELECT last_read_message_id, last_read_at
        FROM channel_read_status
        WHERE channel_id = $1 AND user_id = $2
      )
      SELECT COUNT(*) as count
      FROM ${this.tableName} m
      LEFT JOIN last_read lr ON true
      WHERE m.channel_id = $1 
        AND m.deleted_at IS NULL
        AND m.user_id != $2
        AND (
          lr.last_read_message_id IS NULL 
          OR m.created_at > lr.last_read_at
        )
    `;
        const result = await this.executeRawQuery(sql, [channelId, userId], client);
        return parseInt(result.rows[0]?.count || '0', 10);
    }
    /**
     * Get message thread
     */
    async getMessageThread(threadRootId, limit = 50, offset = 0, client) {
        const sql = `
      SELECT 
        m.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      WHERE (m.id = $1 OR m.thread_root = $1)
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
      LIMIT $2 OFFSET $3
    `;
        const result = await this.executeRawQuery(sql, [threadRootId, limit, offset], client);
        return result.rows;
    }
    /**
     * Get pinned messages in channel
     */
    async getPinnedMessages(channelId, limit = 20, client) {
        const sql = `
      SELECT 
        m.*,
        u.name as user_name,
        u.email as user_email,
        u.avatar_url as user_avatar,
        u.role as user_role,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      WHERE m.channel_id = $1 
        AND m.is_pinned = true
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT $2
    `;
        const result = await this.executeRawQuery(sql, [channelId, limit], client);
        return result.rows;
    }
    /**
     * Get channel message statistics
     */
    async getChannelMessageStats(channelId, client) {
        const statsSql = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE message_type = 'text') as text_messages,
        COUNT(*) FILTER (WHERE message_type = 'voice') as voice_messages,
        COUNT(*) FILTER (WHERE message_type = 'file') as file_messages,
        COUNT(*) FILTER (WHERE message_type = 'system') as system_messages
      FROM ${this.tableName}
      WHERE channel_id = $1 AND deleted_at IS NULL
    `;
        const topUsersSql = `
      SELECT 
        m.user_id,
        u.name as user_name,
        COUNT(*) as message_count
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = $1 AND m.deleted_at IS NULL
      GROUP BY m.user_id, u.name
      ORDER BY message_count DESC
      LIMIT 10
    `;
        const dailyActivitySql = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as message_count
      FROM ${this.tableName}
      WHERE channel_id = $1 
        AND deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
        const [statsResult, topUsersResult, dailyActivityResult] = await Promise.all([
            this.executeRawQuery(statsSql, [channelId], client),
            this.executeRawQuery(topUsersSql, [channelId], client),
            this.executeRawQuery(dailyActivitySql, [channelId], client),
        ]);
        const stats = statsResult.rows[0];
        return {
            totalMessages: parseInt(stats.total_messages, 10),
            messagesByType: {
                text: parseInt(stats.text_messages, 10),
                voice: parseInt(stats.voice_messages, 10),
                file: parseInt(stats.file_messages, 10),
                system: parseInt(stats.system_messages, 10),
            },
            topUsers: topUsersResult.rows.map((row) => ({
                userId: row.user_id,
                userName: row.user_name,
                messageCount: parseInt(row.message_count, 10),
            })),
            dailyActivity: dailyActivityResult.rows.map((row) => ({
                date: row.date,
                messageCount: parseInt(row.message_count, 10),
            })),
        };
    }
}
exports.default = MessageRepository;
//# sourceMappingURL=MessageRepository.js.map