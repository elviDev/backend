import { PoolClient } from 'pg';
import { query, transaction, DatabaseClient, getPool } from '@config/database';
import { logger } from '@utils/logger';
import { BaseRepository, BaseEntity, FilterOptions, PaginatedResult } from './BaseRepository';
import { DatabaseError, NotFoundError, ValidationError, AuthorizationError } from '@utils/errors';

/**
 * Task Comment Entity
 */
export interface TaskComment extends BaseEntity {
  task_id: string;
  author_id: string;
  content: string;
  is_edited: boolean;
  edited_at?: Date | null;
  edited_by?: string | null;
  parent_comment_id?: string | null;
  
  // Joined fields from view
  author_name?: string;
  author_email?: string;
  edited_by_name?: string;
  
  // Reaction counts
  up_count?: number;
  down_count?: number;
  total_reactions?: number;
  user_reaction?: 'up' | 'down' | 'thumbs_up' | 'thumbs_down' | null;
}

export interface CreateCommentData {
  task_id: string;
  author_id: string;
  content: string;
  parent_comment_id?: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface CommentFilterOptions extends FilterOptions {
  taskId?: string;
  authorId?: string;
  includeReplies?: boolean;
}

/**
 * Comment Mention Entity
 */
export interface CommentMention extends BaseEntity {
  comment_id: string;
  mentioned_user_id: string;
  mentioned_by_id: string;
  mention_text?: string;
  position_start?: number;
  position_end?: number;
  
  // Joined fields from view
  mentioned_user_name?: string;
  mentioned_user_email?: string;
  mentioned_by_name?: string;
  mentioned_by_email?: string;
  comment_content?: string;
  task_id?: string;
}

/**
 * Task Comment Repository
 * Handles all database operations for task comments with proper authorization
 */
export class CommentRepository extends BaseRepository<TaskComment> {
  constructor() {
    super('task_comments');
  }

  /**
   * Create a new comment on a task
   */
  async createComment(
    commentData: CreateCommentData,
    client?: DatabaseClient
  ): Promise<TaskComment> {
    const { task_id, author_id, content, parent_comment_id } = commentData;

    if (!task_id?.trim()) {
      throw new ValidationError('Task ID is required', [{ field: 'task_id', message: 'Task ID is required' }]);
    }
    
    if (!author_id?.trim()) {
      throw new ValidationError('Author ID is required', [{ field: 'author_id', message: 'Author ID is required' }]);
    }
    
    if (!content?.trim()) {
      throw new ValidationError('Comment content is required', [{ field: 'content', message: 'Comment content is required' }]);
    }

    // Verify task exists and is not deleted
    const taskExists = await this.verifyTaskExists(task_id, client);
    if (!taskExists) {
      throw new NotFoundError('Task not found');
    }

    try {
      const result = await query(
        `INSERT INTO task_comments (task_id, author_id, content, parent_comment_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, task_id, author_id, content, is_edited, edited_at, edited_by, 
                   parent_comment_id, created_at, updated_at, deleted_at, deleted_by`,
        [task_id, author_id, content.trim(), parent_comment_id || null],
        client
      );

      if (result.rows.length === 0) {
        throw new DatabaseError('Failed to create comment');
      }

      logger.info('Comment created successfully', { 
        commentId: result.rows[0].id, 
        taskId: task_id, 
        authorId: author_id 
      });

      return result.rows[0] as TaskComment;
    } catch (error) {
      logger.error('Error creating comment', error);
      throw new DatabaseError('Failed to create comment');
    }
  }

  /**
   * Get comments for a specific task with author information and reaction counts
   */
  async getTaskComments(
    taskId: string,
    options: CommentFilterOptions = {},
    userId?: string,
    client?: DatabaseClient
  ): Promise<PaginatedResult<TaskComment>> {
    if (!taskId?.trim()) {
      throw new ValidationError('Task ID is required', [{ field: 'taskId', message: 'Task ID is required' }]);
    }

    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'ASC',
      includeReplies = true
    } = options;

    // Validate task exists
    const taskExists = await this.verifyTaskExists(taskId, client);
    if (!taskExists) {
      throw new NotFoundError('Task not found');
    }

    try {
      // Build the count query
      const countSql = includeReplies 
        ? `SELECT COUNT(*) as total FROM task_comments tc WHERE tc.task_id = $1 AND tc.deleted_at IS NULL`
        : `SELECT COUNT(*) as total FROM task_comments tc WHERE tc.task_id = $1 AND tc.parent_comment_id IS NULL AND tc.deleted_at IS NULL`;
      
      const countResult = await query(countSql, [taskId], client);
      const total = parseInt(countResult.rows[0]?.total || '0');

      // Build the comments query with reaction counts
      const commentsSql = includeReplies 
        ? `SELECT 
            tc.id,
            tc.task_id,
            tc.author_id,
            u.name as author_name,
            u.email as author_email,
            tc.content,
            tc.is_edited,
            tc.edited_at,
            tc.edited_by,
            editor.name as edited_by_name,
            tc.parent_comment_id,
            tc.created_at,
            tc.updated_at,
            tc.deleted_at,
            tc.deleted_by,
            COALESCE(crc.up_count, 0) as up_count,
            COALESCE(crc.down_count, 0) as down_count,
            COALESCE(crc.total_reactions, 0) as total_reactions,
            ur.reaction_type as user_reaction
          FROM task_comments tc
          JOIN users u ON tc.author_id = u.id
          LEFT JOIN users editor ON tc.edited_by = editor.id
          LEFT JOIN comment_reaction_counts crc ON tc.id = crc.comment_id
          LEFT JOIN comment_reactions ur ON tc.id = ur.comment_id AND ur.user_id = $4
          WHERE tc.task_id = $1 AND tc.deleted_at IS NULL
          ORDER BY tc.created_at ASC
          LIMIT $2 OFFSET $3`
        : `SELECT 
            tc.id,
            tc.task_id,
            tc.author_id,
            u.name as author_name,
            u.email as author_email,
            tc.content,
            tc.is_edited,
            tc.edited_at,
            tc.edited_by,
            editor.name as edited_by_name,
            tc.parent_comment_id,
            tc.created_at,
            tc.updated_at,
            tc.deleted_at,
            tc.deleted_by,
            COALESCE(crc.up_count, 0) as up_count,
            COALESCE(crc.down_count, 0) as down_count,
            COALESCE(crc.total_reactions, 0) as total_reactions,
            ur.reaction_type as user_reaction
          FROM task_comments tc
          JOIN users u ON tc.author_id = u.id
          LEFT JOIN users editor ON tc.edited_by = editor.id
          LEFT JOIN comment_reaction_counts crc ON tc.id = crc.comment_id
          LEFT JOIN comment_reactions ur ON tc.id = ur.comment_id AND ur.user_id = $4
          WHERE tc.task_id = $1 AND tc.parent_comment_id IS NULL AND tc.deleted_at IS NULL
          ORDER BY tc.created_at ASC
          LIMIT $2 OFFSET $3`;

      const commentsResult = await query(commentsSql, [taskId, limit, offset, userId], client);
      const comments = commentsResult.rows;

      // Map backend reaction format to frontend format
      const mappedComments = comments.map(comment => ({
        ...comment,
        user_reaction: comment.user_reaction === 'up' ? 'thumbs_up' :
                      comment.user_reaction === 'down' ? 'thumbs_down' :
                      comment.user_reaction
      }));

      return {
        data: mappedComments as TaskComment[],
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error('Error fetching task comments', error);
      throw new DatabaseError('Failed to fetch comments');
    }
  }

  /**
   * Get a specific comment by ID
   */
  async getCommentById(
    commentId: string,
    client?: DatabaseClient
  ): Promise<TaskComment | null> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }

    try {
      const sql = `
        SELECT 
          tc.id,
          tc.task_id,
          tc.author_id,
          u.name as author_name,
          u.email as author_email,
          tc.content,
          tc.is_edited,
          tc.edited_at,
          tc.edited_by,
          editor.name as edited_by_name,
          tc.parent_comment_id,
          tc.created_at,
          tc.updated_at,
          tc.deleted_at,
          tc.deleted_by
        FROM task_comments tc
        JOIN users u ON tc.author_id = u.id
        LEFT JOIN users editor ON tc.edited_by = editor.id
        WHERE tc.id = $1 AND tc.deleted_at IS NULL
      `;
      const result = await query(sql, [commentId], client);

      return result.rows.length > 0 ? result.rows[0] as TaskComment : null;
    } catch (error) {
      logger.error('Error fetching comment by ID', error);
      throw new DatabaseError('Failed to fetch comment');
    }
  }

  /**
   * Update a comment (with authorization check)
   */
  async updateComment(
    commentId: string,
    updateData: UpdateCommentData,
    currentUserId: string,
    currentUserRole?: string,
    client?: DatabaseClient
  ): Promise<TaskComment> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }
    
    if (!currentUserId?.trim()) {
      throw new ValidationError('Current user ID is required', [{ field: 'currentUserId', message: 'Current user ID is required' }]);
    }

    if (!updateData.content?.trim()) {
      throw new ValidationError('Comment content is required', [{ field: 'content', message: 'Comment content is required' }]);
    }

    // Get the current comment to check authorization
    const existingComment = await this.getCommentById(commentId, client);
    if (!existingComment) {
      throw new NotFoundError('Comment not found');
    }

    // Check authorization: user can edit their own comments OR user is CEO/Manager
    const canEdit = existingComment.author_id === currentUserId || 
                   ['ceo', 'manager'].includes(currentUserRole?.toLowerCase() || '');
    
    if (!canEdit) {
      throw new AuthorizationError('You can only edit your own comments');
    }

    try {
      // If no client provided, we need to ensure both queries use the same connection
      if (!client) {
        const pool = getPool();
        const dedicatedClient = await pool.connect();
        
        try {
          // Set the current user context for triggers
          await query('SELECT set_config($1, $2, true)', ['app.current_user_id', currentUserId], dedicatedClient);

          const updateSql = `
            UPDATE task_comments 
            SET 
              content = $1,
              updated_at = NOW()
            WHERE id = $2 AND deleted_at IS NULL
            RETURNING id, task_id, author_id, content, is_edited, edited_at, edited_by,
                      parent_comment_id, created_at, updated_at, deleted_at, deleted_by
          `;
          const result = await query(updateSql, [updateData.content.trim(), commentId], dedicatedClient);
          
          if (result.rows.length === 0) {
            throw new NotFoundError('Comment not found or already deleted');
          }

          logger.info('Comment updated successfully', { 
            commentId, 
            updatedBy: currentUserId 
          });

          // Fetch the updated comment with author info
          const updatedComment = await this.getCommentById(commentId, dedicatedClient);
          if (!updatedComment) {
            throw new DatabaseError('Failed to fetch updated comment');
          }

          return updatedComment;
        } finally {
          dedicatedClient.release();
        }
      } else {
        // Use the provided client for both queries
        await query('SELECT set_config($1, $2, true)', ['app.current_user_id', currentUserId], client);

        const updateSql = `
          UPDATE task_comments 
          SET 
            content = $1,
            updated_at = NOW()
          WHERE id = $2 AND deleted_at IS NULL
          RETURNING id, task_id, author_id, content, is_edited, edited_at, edited_by,
                    parent_comment_id, created_at, updated_at, deleted_at, deleted_by
        `;
        const result = await query(updateSql, [updateData.content.trim(), commentId], client);

        if (result.rows.length === 0) {
          throw new NotFoundError('Comment not found or already deleted');
        }

        logger.info('Comment updated successfully', { 
          commentId, 
          updatedBy: currentUserId 
        });

        // Fetch the updated comment with author info
        const updatedComment = await this.getCommentById(commentId, client);
        if (!updatedComment) {
          throw new DatabaseError('Failed to fetch updated comment');
        }

        return updatedComment;
      }
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Error updating comment', error);
      throw new DatabaseError('Failed to update comment');
    }
  }

  /**
   * Soft delete a comment (with authorization check)
   */
  async deleteComment(
    commentId: string,
    currentUserId: string,
    currentUserRole?: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }
    
    if (!currentUserId?.trim()) {
      throw new ValidationError('Current user ID is required', [{ field: 'currentUserId', message: 'Current user ID is required' }]);
    }

    // Get the current comment to check authorization
    const existingComment = await this.getCommentById(commentId, client);
    if (!existingComment) {
      throw new NotFoundError('Comment not found');
    }

    // Check authorization: user can delete their own comments OR user is CEO/Manager
    const canDelete = existingComment.author_id === currentUserId || 
                     ['ceo', 'manager'].includes(currentUserRole?.toLowerCase() || '');
    
    if (!canDelete) {
      throw new AuthorizationError('You can only delete your own comments');
    }

    try {
      // Set the current user context for triggers
      await query('SELECT set_config($1, $2, true)', ['app.current_user_id', currentUserId], client);

      // First, soft delete any related comment mentions (if table exists)
      try {
        await query(
          `UPDATE comment_mentions 
           SET deleted_at = NOW() 
           WHERE comment_id = $1 AND deleted_at IS NULL`,
          [commentId],
          client
        );
      } catch (mentionError: any) {
        // If comment_mentions table doesn't exist yet, continue with comment deletion
        if (!mentionError.message?.includes('relation "comment_mentions" does not exist')) {
          throw mentionError;
        }
      }

      const deleteSql = `
        UPDATE task_comments 
        SET 
          deleted_at = NOW(),
          deleted_by = $1
        WHERE id = $2 AND deleted_at IS NULL
      `;
      const result = await query(deleteSql, [currentUserId, commentId], client);

      const deleted = result.rowCount > 0;
      
      if (deleted) {
        logger.info('Comment deleted successfully', { 
          commentId, 
          deletedBy: currentUserId 
        });
      }

      return deleted;
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Error deleting comment', error);
      throw new DatabaseError('Failed to delete comment');
    }
  }

  /**
   * Get comments by author
   */
  async getCommentsByAuthor(
    authorId: string,
    options: FilterOptions = {},
    client?: DatabaseClient
  ): Promise<PaginatedResult<TaskComment>> {
    if (!authorId?.trim()) {
      throw new ValidationError('Author ID is required', [{ field: 'author_id', message: 'Author ID is required' }]);
    }

    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    try {
      const countSql = `
        SELECT COUNT(*) as total
        FROM task_comments
        WHERE author_id = $1 AND deleted_at IS NULL
      `;
      const countResult = await query(countSql, [authorId], client);
      const total = parseInt(countResult.rows[0]?.total || '0');

      const commentsSql = `
        SELECT *
        FROM active_task_comments
        WHERE author_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await query(commentsSql, [authorId, limit, offset], client);

      return {
        data: result.rows as TaskComment[],
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error('Error fetching comments by author', error);
      throw new DatabaseError('Failed to fetch comments');
    }
  }

  /**
   * Verify that a task exists and is not deleted
   */
  private async verifyTaskExists(
    taskId: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    try {
      const sql = `
        SELECT 1 FROM tasks 
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `;
      const result = await query(sql, [taskId], client);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error verifying task exists', error);
      return false;
    }
  }

  /**
   * Get mentions for a specific comment
   */
  async getCommentMentions(
    commentId: string,
    client?: DatabaseClient
  ): Promise<CommentMention[]> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }

    try {
      const sql = `
        SELECT 
          id,
          comment_id,
          mentioned_user_id,
          mentioned_user_name,
          mentioned_user_email,
          mentioned_by_id,
          mentioned_by_name,
          mentioned_by_email,
          mention_text,
          position_start,
          position_end,
          created_at,
          comment_content,
          task_id
        FROM comment_mentions_view
        WHERE comment_id = $1
        ORDER BY position_start ASC
      `;
      const result = await query(sql, [commentId], client);
      return result.rows as CommentMention[];
    } catch (error) {
      logger.error('Error fetching comment mentions', error);
      throw new DatabaseError('Failed to fetch comment mentions');
    }
  }

  /**
   * Get mentions for a specific user
   */
  async getUserMentions(
    userId: string,
    options: FilterOptions = {},
    client?: DatabaseClient
  ): Promise<PaginatedResult<CommentMention>> {
    if (!userId?.trim()) {
      throw new ValidationError('User ID is required', [{ field: 'userId', message: 'User ID is required' }]);
    }

    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    try {
      const countSql = `
        SELECT COUNT(*) as total
        FROM comment_mentions
        WHERE mentioned_user_id = $1 AND deleted_at IS NULL
      `;
      const countResult = await query(countSql, [userId], client);
      const total = parseInt(countResult.rows[0]?.total || '0');

      const mentionsSql = `
        SELECT 
          id,
          comment_id,
          mentioned_user_id,
          mentioned_user_name,
          mentioned_user_email,
          mentioned_by_id,
          mentioned_by_name,
          mentioned_by_email,
          mention_text,
          position_start,
          position_end,
          created_at,
          comment_content,
          task_id
        FROM comment_mentions_view
        WHERE mentioned_user_id = $1
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $2 OFFSET $3
      `;
      const result = await query(mentionsSql, [userId, limit, offset], client);

      return {
        data: result.rows as CommentMention[],
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error('Error fetching user mentions', error);
      throw new DatabaseError('Failed to fetch user mentions');
    }
  }

  /**
   * Get task assignees to validate mentions
   */
  async getTaskAssignees(
    taskId: string,
    client?: DatabaseClient
  ): Promise<string[]> {
    if (!taskId?.trim()) {
      throw new ValidationError('Task ID is required', [{ field: 'taskId', message: 'Task ID is required' }]);
    }

    try {
      const sql = `
        SELECT assigned_to
        FROM tasks
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const result = await query(sql, [taskId], client);
      return result.rows[0]?.assigned_to || [];
    } catch (error) {
      logger.error('Error fetching task assignees', error);
      throw new DatabaseError('Failed to fetch task assignees');
    }
  }

  /**
   * Validate that mentioned users are assigned to the task
   */
  async validateMentions(
    taskId: string,
    mentionTexts: string[],
    client?: DatabaseClient
  ): Promise<{ valid: string[]; invalid: string[] }> {
    const assignees = await this.getTaskAssignees(taskId, client);
    const valid: string[] = [];
    const invalid: string[] = [];

    try {
      for (const mentionText of mentionTexts) {
        const cleanMention = mentionText.replace('@', '').trim();
        
        // Find user by email or name
        const userSql = `
          SELECT id
          FROM users
          WHERE (email ILIKE $1 OR name ILIKE $2) AND deleted_at IS NULL
        `;
        const userResult = await query(userSql, [cleanMention, `%${cleanMention}%`], client);
        
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          if (assignees.includes(userId)) {
            valid.push(mentionText);
          } else {
            invalid.push(mentionText);
          }
        } else {
          invalid.push(mentionText);
        }
      }
      
      return { valid, invalid };
    } catch (error) {
      logger.error('Error validating mentions', error);
      throw new DatabaseError('Failed to validate mentions');
    }
  }

  /**
   * Find comment by ID and verify it belongs to the specified task
   */
  async findByIdAndTask(
    commentId: string,
    taskId: string,
    client?: DatabaseClient
  ): Promise<TaskComment | null> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }
    if (!taskId?.trim()) {
      throw new ValidationError('Task ID is required', [{ field: 'taskId', message: 'Task ID is required' }]);
    }

    try {
      const sql = `
        SELECT 
          tc.id,
          tc.task_id,
          tc.author_id,
          u.name as author_name,
          u.email as author_email,
          tc.content,
          tc.is_edited,
          tc.edited_at,
          tc.edited_by,
          editor.name as edited_by_name,
          tc.parent_comment_id,
          tc.created_at,
          tc.updated_at,
          tc.deleted_at,
          tc.deleted_by
        FROM task_comments tc
        JOIN users u ON tc.author_id = u.id
        LEFT JOIN users editor ON tc.edited_by = editor.id
        WHERE tc.id = $1 AND tc.task_id = $2 AND tc.deleted_at IS NULL
      `;
      const result = await query(sql, [commentId, taskId], client);
      return result.rows.length > 0 ? result.rows[0] as TaskComment : null;
    } catch (error) {
      logger.error('Error finding comment by ID and task', error);
      throw new DatabaseError('Failed to find comment');
    }
  }

  /**
   * Add or update a reaction to a comment
   */
  async addOrUpdateReaction(
    commentId: string,
    userId: string,
    reactionType: 'up' | 'down',
    client?: DatabaseClient
  ): Promise<void> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }
    if (!userId?.trim()) {
      throw new ValidationError('User ID is required', [{ field: 'userId', message: 'User ID is required' }]);
    }
    if (!['up', 'down'].includes(reactionType)) {
      throw new ValidationError('Invalid reaction type', [{ field: 'reactionType', message: 'Reaction type must be "up" or "down"' }]);
    }

    try {
      const sql = `
        INSERT INTO comment_reactions (comment_id, user_id, reaction_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (comment_id, user_id)
        DO UPDATE SET 
          reaction_type = EXCLUDED.reaction_type,
          updated_at = NOW()
      `;
      await query(sql, [commentId, userId, reactionType], client);
      
      logger.info('Comment reaction added/updated', { 
        commentId, 
        userId, 
        reactionType 
      });
    } catch (error) {
      logger.error('Error adding/updating comment reaction', error);
      throw new DatabaseError('Failed to add reaction');
    }
  }

  /**
   * Remove a reaction from a comment
   */
  async removeReaction(
    commentId: string,
    userId: string,
    client?: DatabaseClient
  ): Promise<void> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }
    if (!userId?.trim()) {
      throw new ValidationError('User ID is required', [{ field: 'userId', message: 'User ID is required' }]);
    }

    try {
      const sql = `
        DELETE FROM comment_reactions
        WHERE comment_id = $1 AND user_id = $2
      `;
      await query(sql, [commentId, userId], client);
      
      logger.info('Comment reaction removed', { 
        commentId, 
        userId 
      });
    } catch (error) {
      logger.error('Error removing comment reaction', error);
      throw new DatabaseError('Failed to remove reaction');
    }
  }

  /**
   * Get reaction counts for a comment
   */
  async getCommentReactionCounts(
    commentId: string,
    client?: DatabaseClient
  ): Promise<{ up_count: number; down_count: number; total_reactions: number }> {
    if (!commentId?.trim()) {
      throw new ValidationError('Comment ID is required', [{ field: 'commentId', message: 'Comment ID is required' }]);
    }

    try {
      const sql = `
        SELECT up_count, down_count, total_reactions
        FROM comment_reaction_counts
        WHERE comment_id = $1
      `;
      const result = await query(sql, [commentId], client);
      
      if (result.rows.length === 0) {
        return { up_count: 0, down_count: 0, total_reactions: 0 };
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting comment reaction counts', error);
      throw new DatabaseError('Failed to get reaction counts');
    }
  }
}

export const commentRepository = new CommentRepository();