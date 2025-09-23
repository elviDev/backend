"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
class ReactionRepository extends BaseRepository_1.default {
    constructor() {
        super('message_reactions');
    }
    /**
     * Add or toggle a reaction on a message
     */
    async toggleReaction(messageId, userId, emoji, client) {
        // Check if reaction already exists
        const existingReactionSql = `
      SELECT * FROM message_reactions 
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3
    `;
        const existingResult = await this.executeRawQuery(existingReactionSql, [messageId, userId, emoji], client);
        if (existingResult.rows.length > 0) {
            // Remove existing reaction
            const deleteResult = await this.softDelete(existingResult.rows[0].id, userId, client);
            if (deleteResult) {
                logger_1.logger.info({
                    messageId,
                    userId,
                    emoji,
                    action: 'removed',
                }, 'Reaction removed successfully');
                return { action: 'removed' };
            }
        }
        else {
            // Add new reaction
            const insertSql = `
        INSERT INTO message_reactions (message_id, user_id, emoji, created_at, updated_at, version)
        VALUES ($1, $2, $3, NOW(), NOW(), 1)
        RETURNING *
      `;
            const insertResult = await this.executeRawQuery(insertSql, [messageId, userId, emoji], client);
            if (insertResult.rows.length > 0) {
                logger_1.logger.info({
                    messageId,
                    userId,
                    emoji,
                    action: 'added',
                }, 'Reaction added successfully');
                return {
                    action: 'added',
                    reaction: insertResult.rows[0]
                };
            }
        }
        throw new Error('Failed to toggle reaction');
    }
    /**
     * Get all reactions for a message grouped by emoji
     */
    async getMessageReactions(messageId, client) {
        const sql = `
      SELECT 
        mr.emoji,
        COUNT(*) as count,
        json_agg(
          json_build_object(
            'id', u.id,
            'name', u.name,
            'avatar_url', u.avatar_url
          )
          ORDER BY mr.created_at
        ) as users
      FROM message_reactions mr
      LEFT JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1 AND mr.deleted_at IS NULL
      GROUP BY mr.emoji
      ORDER BY COUNT(*) DESC, mr.emoji
    `;
        const result = await this.executeRawQuery(sql, [messageId], client);
        return result.rows.map(row => ({
            emoji: row.emoji,
            count: parseInt(row.count, 10),
            users: row.users || [],
        }));
    }
    /**
     * Get all reactions for a message with full user details
     */
    async getMessageReactionDetails(messageId, client) {
        const sql = `
      SELECT 
        mr.*,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role
        ) as user_details
      FROM message_reactions mr
      LEFT JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1 AND mr.deleted_at IS NULL
      ORDER BY mr.created_at ASC
    `;
        const result = await this.executeRawQuery(sql, [messageId], client);
        return result.rows;
    }
    /**
     * Get reactions by a specific user
     */
    async getUserReactions(userId, messageIds, client) {
        let sql = `
      SELECT 
        mr.*,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role
        ) as user_details
      FROM message_reactions mr
      LEFT JOIN users u ON mr.user_id = u.id
      WHERE mr.user_id = $1 AND mr.deleted_at IS NULL
    `;
        const params = [userId];
        if (messageIds && messageIds.length > 0) {
            sql += ` AND mr.message_id = ANY($2)`;
            params.push(messageIds);
        }
        sql += ` ORDER BY mr.created_at DESC`;
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Get most popular reactions across messages
     */
    async getPopularReactions(channelId, limit = 10, client) {
        let sql = `
      SELECT 
        mr.emoji,
        COUNT(*) as count,
        ROUND(
          (COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM message_reactions mr2 
            WHERE mr2.deleted_at IS NULL
            ${channelId ? 'AND EXISTS (SELECT 1 FROM messages m WHERE m.id = mr2.message_id AND m.channel_id = $1)' : ''}
          )), 2
        ) as usage_percentage
      FROM message_reactions mr
      ${channelId ? 'LEFT JOIN messages m ON mr.message_id = m.id' : ''}
      WHERE mr.deleted_at IS NULL
      ${channelId ? 'AND m.channel_id = $1' : ''}
      GROUP BY mr.emoji
      ORDER BY count DESC, mr.emoji
      LIMIT $${channelId ? '2' : '1'}
    `;
        const params = [];
        if (channelId) {
            params.push(channelId);
        }
        params.push(limit);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows.map(row => ({
            emoji: row.emoji,
            count: parseInt(row.count, 10),
            usage_percentage: parseFloat(row.usage_percentage),
        }));
    }
    /**
     * Remove all reactions from a message
     */
    async removeAllMessageReactions(messageId, deletedBy, client) {
        const sql = `
      UPDATE message_reactions 
      SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE message_id = $1 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [messageId, deletedBy], client);
        const deletedCount = result.rowCount || 0;
        if (deletedCount > 0) {
            logger_1.logger.info({
                messageId,
                deletedBy,
                count: deletedCount,
            }, 'All message reactions removed');
        }
        return deletedCount;
    }
    /**
     * Remove all reactions by a user
     */
    async removeAllUserReactions(userId, messageId, client) {
        let sql = `
      UPDATE message_reactions 
      SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW()
      WHERE user_id = $1 AND deleted_at IS NULL
    `;
        const params = [userId];
        if (messageId) {
            sql += ` AND message_id = $2`;
            params.push(messageId);
        }
        const result = await this.executeRawQuery(sql, params, client);
        const deletedCount = result.rowCount || 0;
        if (deletedCount > 0) {
            logger_1.logger.info({
                userId,
                messageId,
                count: deletedCount,
            }, 'User reactions removed');
        }
        return deletedCount;
    }
    /**
     * Get reaction statistics for a channel
     */
    async getChannelReactionStats(channelId, client) {
        const sql = `
      WITH channel_reactions AS (
        SELECT mr.*, u.name as user_name
        FROM message_reactions mr
        JOIN messages m ON mr.message_id = m.id
        LEFT JOIN users u ON mr.user_id = u.id
        WHERE m.channel_id = $1 AND mr.deleted_at IS NULL
      ),
      emoji_stats AS (
        SELECT emoji, COUNT(*) as count
        FROM channel_reactions
        GROUP BY emoji
        ORDER BY count DESC
        LIMIT 1
      ),
      user_stats AS (
        SELECT 
          user_id, 
          user_name, 
          COUNT(*) as reaction_count
        FROM channel_reactions
        WHERE user_id IS NOT NULL
        GROUP BY user_id, user_name
        ORDER BY reaction_count DESC
        LIMIT 5
      )
      SELECT 
        (SELECT COUNT(*) FROM channel_reactions) as total_reactions,
        (SELECT COUNT(DISTINCT emoji) FROM channel_reactions) as unique_emojis,
        (SELECT emoji FROM emoji_stats LIMIT 1) as most_used_emoji,
        (SELECT json_agg(
          json_build_object(
            'user_id', user_id,
            'user_name', user_name,
            'reaction_count', reaction_count
          )
        ) FROM user_stats) as top_reactors
    `;
        const result = await this.executeRawQuery(sql, [channelId], client);
        const row = result.rows[0] || {};
        return {
            total_reactions: parseInt(row.total_reactions || '0', 10),
            unique_emojis: parseInt(row.unique_emojis || '0', 10),
            most_used_emoji: row.most_used_emoji,
            top_reactors: row.top_reactors || [],
        };
    }
    /**
     * Check if user has reacted to a message with specific emoji
     */
    async hasUserReacted(messageId, userId, emoji, client) {
        let sql = `
      SELECT 1 FROM message_reactions 
      WHERE message_id = $1 AND user_id = $2 AND deleted_at IS NULL
    `;
        const params = [messageId, userId];
        if (emoji) {
            sql += ` AND emoji = $3`;
            params.push(emoji);
        }
        sql += ` LIMIT 1`;
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows.length > 0;
    }
    /**
     * Find a specific reaction by message, user, and emoji
     */
    async findReaction(messageId, userId, emoji, client) {
        const sql = `
      SELECT * FROM message_reactions 
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [messageId, userId, emoji], client);
        return result.rows[0] || null;
    }
    /**
     * Get recent reactions across all messages for activity feed
     */
    async getRecentReactions(channelId, limit = 20, client) {
        let sql = `
      SELECT 
        mr.*,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role
        ) as user_details,
        json_build_object(
          'id', m.id,
          'content', m.content,
          'channel_id', m.channel_id
        ) as message
      FROM message_reactions mr
      LEFT JOIN users u ON mr.user_id = u.id
      LEFT JOIN messages m ON mr.message_id = m.id
      WHERE mr.deleted_at IS NULL AND m.deleted_at IS NULL
    `;
        const params = [];
        if (channelId) {
            sql += ` AND m.channel_id = $1`;
            params.push(channelId);
        }
        sql += ` ORDER BY mr.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows.map(row => ({
            reaction: {
                id: row.id,
                message_id: row.message_id,
                user_id: row.user_id,
                emoji: row.emoji,
                created_at: row.created_at,
                updated_at: row.updated_at,
                version: row.version,
                deleted_at: row.deleted_at,
                deleted_by: row.deleted_by,
                user_details: row.user_details,
            },
            message: row.message,
        }));
    }
}
exports.default = ReactionRepository;
//# sourceMappingURL=ReactionRepository.js.map