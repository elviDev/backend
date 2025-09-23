import { DatabaseClient } from '@config/database';
import { logger } from '@utils/logger';
import { ValidationError, NotFoundError } from '@utils/errors';
import BaseRepository, { BaseEntity, FilterOptions } from './BaseRepository';

export interface Message extends BaseEntity {
  channel_id: string;
  task_id?: string;
  user_id: string;
  content: string;
  message_type: 'text' | 'voice' | 'file' | 'system' | 'command_result' | 'ai_response';
  voice_data?: Record<string, any>;
  transcription?: string;
  attachments: any[];
  reply_to_id?: string;
  thread_root_id?: string;
  is_thread_root: boolean;
  is_edited: boolean;
  is_pinned: boolean;
  is_announcement: boolean;
  reactions: Record<string, any>;
  mentions: string[];
  ai_generated: boolean;
  ai_context?: Record<string, any>;
  command_execution_id?: string;
  metadata: Record<string, any>;
  formatting: Record<string, any>;
  edited_at?: Date;
}

export interface CreateMessageData {
  channel_id: string;
  task_id?: string;
  user_id: string;
  content: string;
  message_type?: Message['message_type'];
  voice_data?: Record<string, any>;
  transcription?: string;
  attachments?: any[];
  reply_to_id?: string;
  thread_root_id?: string;
  mentions?: string[];
  ai_generated?: boolean;
  ai_context?: Record<string, any>;
  command_execution_id?: string;
  metadata?: Record<string, any>;
  formatting?: Record<string, any>;
}

export interface MessageWithUser extends Message {
  user_details: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    role: string;
    phone?: string;
  };
  reply_to?: {
    id: string;
    content: string;
    user: {
      id: string;
      name: string;
      avatar_url?: string;
    };
  };
  thread_info?: {
    reply_count: number;
    participant_count: number;
    last_reply_at?: Date;
    last_reply_by?: {
      id: string;
      name: string;
      avatar_url?: string;
    };
    participants: Array<{
      id: string;
      name: string;
      avatar_url?: string;
    }>;
  };
  reactions: Array<{
    emoji: string;
    count: number;
    users: Array<{
      id: string;
      name: string;
      avatar_url?: string;
    }>;
  }>;
  reply_count?: number;
  last_reply_timestamp?: Date;
  deleted_by_name?: string;
}

class MessageRepository extends BaseRepository<Message> {
  constructor() {
    super('messages');
  }

  /**
   * Create new message with validation
   */
  async createMessage(messageData: CreateMessageData, client?: DatabaseClient): Promise<Message> {
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
      is_thread_root: false,
      ai_generated: messageData.ai_generated || false,
    };

    const message = await this.create(messageToCreate, client);

    logger.info(
      {
        messageId: message.id,
        channelId: message.channel_id,
        userId: message.user_id,
        messageType: message.message_type,
        contentLength: message.content.length,
        threadRootId: message.thread_root_id,
        replyToId: message.reply_to_id,
      },
      'Message created successfully'
    );

    return message;
  }

  /**
   * Find messages in a channel
   */
  async findChannelMessages(
    channelId: string,
    filters?: {
      threadRootId?: string;
      messageType?: string;
      before?: Date;
      after?: Date;
      includeThreadReplies?: boolean; // New flag to control thread reply inclusion
    },
    limit: number = 50,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<MessageWithUser[]> {
    let whereConditions = ['m.channel_id = $1', 'm.deleted_at IS NULL'];
    let params: any[] = [channelId];
    let paramIndex = 2;

    // Add filters
    if (filters?.threadRootId) {
      whereConditions.push(`m.thread_root_id = $${paramIndex}`);
      params.push(filters.threadRootId);
      paramIndex++;
    } else if (!filters?.includeThreadReplies) {
      // For main channel messages, exclude thread replies (messages with thread_root_id)
      // unless explicitly requested to include them
      whereConditions.push(`m.thread_root_id IS NULL`);
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
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'phone', u.phone
        ) as user_details,
        -- Reply to message info
        CASE 
          WHEN m.reply_to_id IS NOT NULL THEN
            json_build_object(
              'id', reply_msg.id,
              'content', reply_msg.content,
              'user', json_build_object(
                'id', reply_user.id,
                'name', reply_user.name,
                'avatar_url', reply_user.avatar_url
              )
            )
          ELSE NULL
        END as reply_to,
        -- Thread info for thread root messages
        CASE 
          WHEN m.is_thread_root = true THEN
            json_build_object(
              'reply_count', COALESCE(ts.reply_count, 0),
              'participant_count', COALESCE(ts.participant_count, 0),
              'last_reply_at', ts.last_reply_at,
              'last_reply_by', CASE 
                WHEN ts.last_reply_by_id IS NOT NULL THEN
                  json_build_object(
                    'id', last_reply_user.id,
                    'name', last_reply_user.name,
                    'avatar_url', last_reply_user.avatar_url
                  )
                ELSE NULL
              END,
              'participants', COALESCE(participant_details.participants, '[]'::json)
            )
          ELSE NULL
        END as thread_info,
        -- Message reactions
        COALESCE(reactions.reactions, '[]'::json) as reactions,
        COALESCE(thread_stats.reply_count, 0) as reply_count,
        thread_stats.last_reply_timestamp,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      -- Reply to message join
      LEFT JOIN messages reply_msg ON m.reply_to_id = reply_msg.id
      LEFT JOIN users reply_user ON reply_msg.user_id = reply_user.id
      -- Thread statistics join
      LEFT JOIN thread_statistics ts ON m.id = ts.thread_root_id
      LEFT JOIN users last_reply_user ON ts.last_reply_by_id = last_reply_user.id
      -- Thread participants
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', pu.id,
            'name', pu.name,
            'avatar_url', pu.avatar_url
          )
        ) as participants
        FROM users pu
        WHERE pu.id = ANY(
          SELECT jsonb_array_elements_text(ts.participants)::uuid
        )
      ) participant_details ON m.is_thread_root = true
      -- Message reactions
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
      -- Legacy thread stats for backward compatibility
      LEFT JOIN (
        SELECT 
          thread_root_id,
          reply_count,
          last_reply_at as last_reply_timestamp
        FROM thread_statistics
      ) thread_stats ON m.id = thread_stats.thread_root_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.executeRawQuery<MessageWithUser>(sql, params, client);
    return result.rows;
  }

  /**
   * Get channel message count
   */
  async getChannelMessageCount(
    channelId: string,
    filters?: {
      threadRootId?: string;
      messageType?: string;
      before?: Date;
      after?: Date;
      includeThreadReplies?: boolean;
    },
    client?: DatabaseClient
  ): Promise<number> {
    let whereConditions = ['channel_id = $1', 'deleted_at IS NULL'];
    let params: any[] = [channelId];
    let paramIndex = 2;

    // Add filters
    if (filters?.threadRootId) {
      whereConditions.push(`thread_root_id = $${paramIndex}`);
      params.push(filters.threadRootId);
      paramIndex++;
    } else if (!filters?.includeThreadReplies) {
      // For main channel messages, exclude thread replies (messages with thread_root_id)
      // unless explicitly requested to include them
      whereConditions.push(`thread_root_id IS NULL`);
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

    const result = await this.executeRawQuery<{ count: string }>(sql, params, client);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Find message by ID with user details
   */
  async findByIdWithUser(messageId: string, client?: DatabaseClient): Promise<MessageWithUser | null> {
    const sql = `
      SELECT 
        m.*,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'phone', u.phone
        ) as user_details,
        COALESCE(thread_stats.reply_count, 0) as reply_count,
        thread_stats.last_reply_timestamp,
        deleter.name as deleted_by_name
      FROM ${this.tableName} m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN users deleter ON m.deleted_by = deleter.id
      LEFT JOIN (
        SELECT 
          thread_root_id,
          COUNT(*) as reply_count,
          MAX(created_at) as last_reply_timestamp
        FROM ${this.tableName}
        WHERE thread_root_id IS NOT NULL 
          AND deleted_at IS NULL
        GROUP BY thread_root_id
      ) thread_stats ON m.id = thread_stats.thread_root_id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<MessageWithUser>(sql, [messageId], client);
    return result.rows[0] || null;
  }

  /**
   * Search messages in channel
   */
  async searchMessages(
    channelId: string,
    searchTerm: string,
    limit: number = 50,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<MessageWithUser[]> {
    const sql = `
      SELECT 
        m.*,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'phone', u.phone
        ) as user_details,
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

    const result = await this.executeRawQuery<MessageWithUser>(
      sql,
      [channelId, `%${searchTerm}%`, limit, offset],
      client
    );
    return result.rows;
  }

  /**
   * Update message content
   */
  async updateMessage(
    messageId: string,
    updateData: Partial<Message>,
    client?: DatabaseClient
  ): Promise<Message> {
    const message = await this.update(messageId, updateData, client);

    if (message) {
      logger.info(
        {
          messageId,
          updatedFields: Object.keys(updateData),
        },
        'Message updated successfully'
      );
    }

    return message;
  }

  /**
   * Add reaction to message
   */
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
    client?: DatabaseClient
  ): Promise<boolean> {
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
        logger.info(
          {
            messageId,
            userId,
            emoji,
          },
          'Reaction added to message'
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error, messageId, userId, emoji }, 'Failed to add reaction');
      return false;
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
    client?: DatabaseClient
  ): Promise<boolean> {
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
        logger.info(
          {
            messageId,
            userId,
            emoji,
          },
          'Reaction removed from message'
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error, messageId, userId, emoji }, 'Failed to remove reaction');
      return false;
    }
  }

  /**
   * Get message reactions
   */
  async getMessageReactions(
    messageId: string,
    client?: DatabaseClient
  ): Promise<Record<string, string[]>> {
    const sql = `
      SELECT reactions
      FROM ${this.tableName}
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.executeRawQuery<{ reactions: Record<string, string[]> }>(
      sql,
      [messageId],
      client
    );
    
    return result.rows[0]?.reactions || {};
  }

  /**
   * Update user's last read message in channel
   */
  async updateLastRead(
    channelId: string,
    userId: string,
    messageId?: string,
    client?: DatabaseClient
  ): Promise<void> {
    // If no messageId provided, use the latest message
    const latestMessageId = messageId || await this.getLatestMessageId(channelId, client);
    
    if (!latestMessageId) return;

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
      
      logger.debug(
        {
          channelId,
          userId,
          messageId: latestMessageId,
        },
        'Last read message updated'
      );
    } catch (error) {
      logger.error({ error, channelId, userId }, 'Failed to update last read');
    }
  }

  /**
   * Get latest message ID in channel
   */
  private async getLatestMessageId(
    channelId: string,
    client?: DatabaseClient
  ): Promise<string | null> {
    const sql = `
      SELECT id
      FROM ${this.tableName}
      WHERE channel_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.executeRawQuery<{ id: string }>(sql, [channelId], client);
    return result.rows[0]?.id || null;
  }

  /**
   * Get unread message count for user in channel
   */
  async getUnreadCount(
    channelId: string,
    userId: string,
    client?: DatabaseClient
  ): Promise<number> {
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

    const result = await this.executeRawQuery<{ count: string }>(sql, [channelId, userId], client);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get message thread
   */
  async getMessageThread(
    threadRootId: string,
    limit: number = 50,
    offset: number = 0,
    client?: DatabaseClient
  ): Promise<MessageWithUser[]> {
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
      WHERE (m.id = $1 OR m.thread_root_id = $1)
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeRawQuery<MessageWithUser>(
      sql,
      [threadRootId, limit, offset],
      client
    );
    return result.rows;
  }

  /**
   * Get pinned messages in channel
   */
  async getPinnedMessages(
    channelId: string,
    limit: number = 20,
    client?: DatabaseClient
  ): Promise<MessageWithUser[]> {
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

    const result = await this.executeRawQuery<MessageWithUser>(
      sql,
      [channelId, limit],
      client
    );
    return result.rows;
  }

  /**
   * Get channel message statistics
   */
  async getChannelMessageStats(
    channelId: string,
    client?: DatabaseClient
  ): Promise<{
    totalMessages: number;
    messagesByType: Record<string, number>;
    topUsers: Array<{ userId: string; userName: string; messageCount: number }>;
    dailyActivity: Array<{ date: string; messageCount: number }>;
  }> {
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
      this.executeRawQuery<any>(statsSql, [channelId], client),
      this.executeRawQuery<any>(topUsersSql, [channelId], client),
      this.executeRawQuery<any>(dailyActivitySql, [channelId], client),
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
      topUsers: topUsersResult.rows.map((row: any) => ({
        userId: row.user_id,
        userName: row.user_name,
        messageCount: parseInt(row.message_count, 10),
      })),
      dailyActivity: dailyActivityResult.rows.map((row: any) => ({
        date: row.date,
        messageCount: parseInt(row.message_count, 10),
      })),
    };
  }
}

export default MessageRepository;