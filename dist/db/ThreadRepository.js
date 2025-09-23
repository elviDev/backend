"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
class ThreadRepository extends BaseRepository_1.default {
    constructor() {
        super('thread_statistics');
    }
    /**
     * Create a new thread on a message
     */
    async createThread(messageId, createdBy, client) {
        // Mark the message as a thread root
        const updateMessageSql = `
      UPDATE messages 
      SET is_thread_root = TRUE, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
        const messageResult = await this.executeRawQuery(updateMessageSql, [messageId], client);
        if (messageResult.rows.length === 0) {
            throw new errors_1.NotFoundError('Message not found or already deleted');
        }
        // Create initial thread statistics
        const threadStatsSql = `
      INSERT INTO thread_statistics (
        thread_root_id, 
        reply_count, 
        participant_count, 
        participants,
        created_at,
        updated_at,
        version
      )
      VALUES ($1, 0, 0, '[]'::jsonb, NOW(), NOW(), 1)
      ON CONFLICT (thread_root_id) DO NOTHING
      RETURNING *
    `;
        const result = await this.executeRawQuery(threadStatsSql, [messageId], client);
        if (result.rows.length === 0) {
            // Thread already exists, return existing
            return this.getThreadStatistics(messageId, client);
        }
        logger_1.logger.info({
            threadRootId: messageId,
            createdBy,
        }, 'Thread created successfully');
        return result.rows[0];
    }
    /**
     * Get thread statistics by thread root ID
     */
    async getThreadStatistics(threadRootId, client) {
        const sql = `
      SELECT * FROM thread_statistics 
      WHERE thread_root_id = $1
    `;
        const result = await this.executeRawQuery(sql, [threadRootId], client);
        if (result.rows.length === 0) {
            throw new errors_1.NotFoundError('Thread not found');
        }
        return result.rows[0];
    }
    /**
     * Get thread with full details including root message and participants
     */
    async getThreadWithDetails(threadRootId, client) {
        const sql = `
      SELECT 
        ts.*,
        -- Root message details
        json_build_object(
          'id', root_msg.id,
          'content', root_msg.content,
          'created_at', root_msg.created_at,
          'user_details', json_build_object(
            'id', root_user.id,
            'name', root_user.name,
            'email', root_user.email,
            'avatar_url', root_user.avatar_url,
            'role', root_user.role,
            'phone', root_user.phone
          ),
          'reactions', COALESCE(root_reactions.reactions, '[]'::json)
        ) as thread_root,
        -- Participant details
        COALESCE(participant_details.participants, '[]'::json) as participant_details,
        -- Last reply by details
        CASE 
          WHEN ts.last_reply_by_id IS NOT NULL THEN
            json_build_object(
              'id', last_user.id,
              'name', last_user.name,
              'avatar_url', last_user.avatar_url
            )
          ELSE NULL
        END as last_reply_by_details
      FROM thread_statistics ts
      -- Join root message
      LEFT JOIN messages root_msg ON ts.thread_root_id = root_msg.id
      LEFT JOIN users root_user ON root_msg.user_id = root_user.id
      -- Join last reply user
      LEFT JOIN users last_user ON ts.last_reply_by_id = last_user.id
      -- Get root message reactions
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'emoji', emoji,
            'count', count,
            'users', users
          )
        ) as reactions
        FROM (
          SELECT 
            mr.emoji,
            COUNT(*) as count,
            json_agg(
              json_build_object(
                'id', u.id,
                'name', u.name,
                'avatar_url', u.avatar_url
              )
            ) as users
          FROM message_reactions mr
          JOIN users u ON mr.user_id = u.id
          WHERE mr.message_id = ts.thread_root_id
          GROUP BY mr.emoji
        ) grouped_reactions
      ) root_reactions ON true
      -- Get participant details
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'avatar_url', u.avatar_url,
            'role', u.role
          )
        ) as participants
        FROM users u
        WHERE u.id = ANY(
          SELECT jsonb_array_elements_text(ts.participants)::uuid
        )
      ) participant_details ON true
      WHERE ts.thread_root_id = $1
    `;
        const result = await this.executeRawQuery(sql, [threadRootId], client);
        if (result.rows.length === 0) {
            throw new errors_1.NotFoundError('Thread not found');
        }
        return result.rows[0];
    }
    /**
     * Get thread replies with pagination
     */
    async getThreadReplies(threadRootId, limit = 50, offset = 0, client) {
        // Get total count
        const countSql = `
      SELECT COUNT(*) as total
      FROM messages 
      WHERE thread_root_id = $1 AND deleted_at IS NULL
    `;
        const countResult = await this.executeRawQuery(countSql, [threadRootId], client);
        const total = parseInt(countResult.rows[0]?.total || '0', 10);
        // Get replies with details
        const repliesSql = `
      SELECT 
        m.id,
        m.content,
        m.user_id,
        m.thread_root_id,
        m.reply_to_id,
        m.message_type,
        m.attachments,
        m.is_edited,
        m.edited_at,
        m.created_at,
        m.updated_at,
        m.deleted_at,
        -- User details
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'phone', u.phone
        ) as user_details,
        -- Reactions
        COALESCE(reactions.reactions, '[]'::json) as reactions
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      -- Get message reactions
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'emoji', emoji,
            'count', count,
            'users', users
          )
        ) as reactions
        FROM (
          SELECT 
            mr.emoji,
            COUNT(*) as count,
            json_agg(
              json_build_object(
                'id', ru.id,
                'name', ru.name,
                'avatar_url', ru.avatar_url
              )
            ) as users
          FROM message_reactions mr
          JOIN users ru ON mr.user_id = ru.id
          WHERE mr.message_id = m.id
          GROUP BY mr.emoji
        ) grouped_reactions
      ) reactions ON true
      WHERE m.thread_root_id = $1 AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
      LIMIT $2 OFFSET $3
    `;
        const repliesResult = await this.executeRawQuery(repliesSql, [threadRootId, limit, offset], client);
        return {
            replies: repliesResult.rows,
            total,
        };
    }
    /**
     * Add a reply to a thread
     */
    async addThreadReply(threadRootId, replyData, client) {
        // Insert the reply message
        const insertSql = `
      INSERT INTO messages (
        channel_id,
        user_id,
        content,
        message_type,
        thread_root_id,
        reply_to_id,
        attachments,
        reactions,
        mentions,
        metadata,
        formatting,
        is_edited,
        is_pinned,
        is_announcement,
        ai_generated,
        created_at,
        updated_at,
        version
      )
      SELECT 
        rm.channel_id,
        $2,
        $3,
        $4,
        $1,
        $5,
        $6,
        '{}'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        false,
        false,
        false,
        false,
        NOW(),
        NOW(),
        1
      FROM messages rm
      WHERE rm.id = $1
      RETURNING id
    `;
        const messageResult = await this.executeRawQuery(insertSql, [
            threadRootId,
            replyData.user_id,
            replyData.content,
            replyData.message_type || 'text',
            replyData.reply_to_id || null,
            JSON.stringify(replyData.attachments || []),
        ], client);
        if (messageResult.rows.length === 0) {
            throw new Error('Failed to create thread reply');
        }
        const replyId = messageResult.rows[0].id;
        // Get the created reply with full details
        const getReplySQL = `
      SELECT 
        m.id,
        m.content,
        m.user_id,
        m.thread_root_id,
        m.reply_to_id,
        m.message_type,
        m.attachments,
        m.is_edited,
        m.edited_at,
        m.created_at,
        m.updated_at,
        m.deleted_at,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'phone', u.phone
        ) as user_details,
        '[]'::json as reactions
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = $1
    `;
        const replyResult = await this.executeRawQuery(getReplySQL, [replyId], client);
        logger_1.logger.info({
            threadRootId,
            replyId,
            userId: replyData.user_id,
        }, 'Thread reply added successfully');
        return replyResult.rows[0];
    }
    /**
     * Delete a thread (mark thread root and all replies as deleted)
     */
    async deleteThread(threadRootId, deletedBy, client) {
        // Soft delete all messages in the thread
        const deleteSql = `
      UPDATE messages 
      SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE (id = $1 OR thread_root_id = $1) AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(deleteSql, [threadRootId, deletedBy], client);
        const success = result.rowCount > 0;
        if (success) {
            logger_1.logger.info({
                threadRootId,
                deletedBy,
            }, 'Thread deleted successfully');
        }
        return success;
    }
    /**
     * Get threads in a channel with pagination
     */
    async getChannelThreads(channelId, limit = 20, offset = 0, client) {
        // Get total count
        const countSql = `
      SELECT COUNT(*) as total
      FROM messages m
      JOIN thread_statistics ts ON m.id = ts.thread_root_id
      WHERE m.channel_id = $1 AND m.deleted_at IS NULL AND m.is_thread_root = true
    `;
        const countResult = await this.executeRawQuery(countSql, [channelId], client);
        const total = parseInt(countResult.rows[0]?.total || '0', 10);
        // Get threads
        const threadsSql = `
      SELECT m.id
      FROM messages m
      JOIN thread_statistics ts ON m.id = ts.thread_root_id
      WHERE m.channel_id = $1 AND m.deleted_at IS NULL AND m.is_thread_root = true
      ORDER BY ts.last_reply_at DESC, m.created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const threadsResult = await this.executeRawQuery(threadsSql, [channelId, limit, offset], client);
        const threads = [];
        for (const row of threadsResult.rows) {
            const thread = await this.getThreadWithDetails(row.id, client);
            threads.push(thread);
        }
        return { threads, total };
    }
}
exports.default = ThreadRepository;
//# sourceMappingURL=ThreadRepository.js.map