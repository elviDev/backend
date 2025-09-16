"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentRepository = exports.CommentRepository = void 0;
const database_1 = require("@config/database");
const logger_1 = require("@utils/logger");
const BaseRepository_1 = require("./BaseRepository");
const errors_1 = require("@utils/errors");
/**
 * Task Comment Repository
 * Handles all database operations for task comments with proper authorization
 */
class CommentRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super('task_comments');
    }
    /**
     * Create a new comment on a task
     */
    async createComment(commentData, client) {
        const { task_id, author_id, content, parent_comment_id } = commentData;
        if (!task_id?.trim()) {
            throw new errors_1.ValidationError('Task ID is required', [{ field: 'task_id', message: 'Task ID is required' }]);
        }
        if (!author_id?.trim()) {
            throw new errors_1.ValidationError('Author ID is required', [{ field: 'author_id', message: 'Author ID is required' }]);
        }
        if (!content?.trim()) {
            throw new errors_1.ValidationError('Comment content is required', [{ field: 'content', message: 'Comment content is required' }]);
        }
        // Verify task exists and is not deleted
        const taskExists = await this.verifyTaskExists(task_id, client);
        if (!taskExists) {
            throw new errors_1.NotFoundError('Task not found');
        }
        try {
            const result = await (0, database_1.query)(`INSERT INTO task_comments (task_id, author_id, content, parent_comment_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, task_id, author_id, content, is_edited, edited_at, edited_by, 
                   parent_comment_id, created_at, updated_at, version, deleted_at, deleted_by`, [task_id, author_id, content.trim(), parent_comment_id || null], client);
            if (result.rows.length === 0) {
                throw new errors_1.DatabaseError('Failed to create comment');
            }
            logger_1.logger.info('Comment created successfully', {
                commentId: result.rows[0].id,
                taskId: task_id,
                authorId: author_id
            });
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Error creating comment', error);
            throw new errors_1.DatabaseError('Failed to create comment');
        }
    }
    /**
     * Get comments for a specific task with author information
     */
    async getTaskComments(taskId, options = {}, client) {
        if (!taskId?.trim()) {
            throw new errors_1.ValidationError('Task ID is required');
        }
        const { limit = 50, offset = 0, orderBy = 'created_at', orderDirection = 'ASC', includeReplies = true } = options;
        // Validate task exists
        const taskExists = await this.verifyTaskExists(taskId, client);
        if (!taskExists) {
            throw new errors_1.NotFoundError('Task not found');
        }
        try {
            // Build the query conditionally
            const whereClause = includeReplies
                ? 'tc.task_id = $1 AND tc.deleted_at IS NULL'
                : 'tc.task_id = $1 AND tc.parent_comment_id IS NULL AND tc.deleted_at IS NULL';
            const countResult = await (client || database_1.query) `
        SELECT COUNT(*) as total
        FROM task_comments tc
        WHERE ${includeReplies
                ? (0, database_1.query) `tc.task_id = ${taskId} AND tc.deleted_at IS NULL`
                : (0, database_1.query) `tc.task_id = ${taskId} AND tc.parent_comment_id IS NULL AND tc.deleted_at IS NULL`}
      `;
            const total = parseInt(countResult[0]?.total || '0');
            const commentsQuery = (0, database_1.query) `
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
          tc.version,
          tc.deleted_at,
          tc.deleted_by
        FROM task_comments tc
        JOIN users u ON tc.author_id = u.id
        LEFT JOIN users editor ON tc.edited_by = editor.id
        WHERE ${includeReplies
                ? (0, database_1.query) `tc.task_id = ${taskId} AND tc.deleted_at IS NULL`
                : (0, database_1.query) `tc.task_id = ${taskId} AND tc.parent_comment_id IS NULL AND tc.deleted_at IS NULL`}
        ORDER BY tc.${database_1.query.unsafe(orderBy)} ${database_1.query.unsafe(orderDirection)}
        LIMIT ${limit} OFFSET ${offset}
      `;
            const comments = await (client || commentsQuery);
            return {
                data: comments,
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            };
        }
        catch (error) {
            logger_1.logger.error('Error fetching task comments', error);
            throw new errors_1.DatabaseError('Failed to fetch comments');
        }
    }
    /**
     * Get a specific comment by ID
     */
    async getCommentById(commentId, client) {
        if (!commentId?.trim()) {
            throw new errors_1.ValidationError('Comment ID is required');
        }
        try {
            const result = await (client || database_1.query) `
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
          tc.version,
          tc.deleted_at,
          tc.deleted_by
        FROM task_comments tc
        JOIN users u ON tc.author_id = u.id
        LEFT JOIN users editor ON tc.edited_by = editor.id
        WHERE tc.id = ${commentId} AND tc.deleted_at IS NULL
      `;
            return result.length > 0 ? result[0] : null;
        }
        catch (error) {
            logger_1.logger.error('Error fetching comment by ID', error);
            throw new errors_1.DatabaseError('Failed to fetch comment');
        }
    }
    /**
     * Update a comment (with authorization check)
     */
    async updateComment(commentId, updateData, currentUserId, currentUserRole, client) {
        if (!commentId?.trim()) {
            throw new errors_1.ValidationError('Comment ID is required');
        }
        if (!currentUserId?.trim()) {
            throw new errors_1.ValidationError('Current user ID is required');
        }
        if (!updateData.content?.trim()) {
            throw new errors_1.ValidationError('Comment content is required', [{ field: 'content', message: 'Comment content is required' }]);
        }
        // Get the current comment to check authorization
        const existingComment = await this.getCommentById(commentId, client);
        if (!existingComment) {
            throw new errors_1.NotFoundError('Comment not found');
        }
        // Check authorization: user can edit their own comments OR user is CEO
        const canEdit = existingComment.author_id === currentUserId ||
            currentUserRole?.toLowerCase() === 'ceo';
        if (!canEdit) {
            throw new errors_1.AuthorizationError('You can only edit your own comments');
        }
        try {
            // Set the current user context for triggers
            await (client || database_1.query) `SELECT set_config('app.current_user_id', ${currentUserId}, true)`;
            const result = await (client || database_1.query) `
        UPDATE task_comments 
        SET 
          content = ${updateData.content.trim()},
          updated_at = NOW()
        WHERE id = ${commentId} AND deleted_at IS NULL
        RETURNING id, task_id, author_id, content, is_edited, edited_at, edited_by,
                  parent_comment_id, created_at, updated_at, version, deleted_at, deleted_by
      `;
            if (result.length === 0) {
                throw new errors_1.NotFoundError('Comment not found or already deleted');
            }
            logger_1.logger.info('Comment updated successfully', {
                commentId,
                updatedBy: currentUserId
            });
            // Fetch the updated comment with author info
            const updatedComment = await this.getCommentById(commentId, client);
            if (!updatedComment) {
                throw new errors_1.DatabaseError('Failed to fetch updated comment');
            }
            return updatedComment;
        }
        catch (error) {
            if (error instanceof errors_1.AuthorizationError || error instanceof errors_1.NotFoundError) {
                throw error;
            }
            logger_1.logger.error('Error updating comment', error);
            throw new errors_1.DatabaseError('Failed to update comment');
        }
    }
    /**
     * Soft delete a comment (with authorization check)
     */
    async deleteComment(commentId, currentUserId, currentUserRole, client) {
        if (!commentId?.trim()) {
            throw new errors_1.ValidationError('Comment ID is required');
        }
        if (!currentUserId?.trim()) {
            throw new errors_1.ValidationError('Current user ID is required');
        }
        // Get the current comment to check authorization
        const existingComment = await this.getCommentById(commentId, client);
        if (!existingComment) {
            throw new errors_1.NotFoundError('Comment not found');
        }
        // Check authorization: user can delete their own comments OR user is CEO
        const canDelete = existingComment.author_id === currentUserId ||
            currentUserRole?.toLowerCase() === 'ceo';
        if (!canDelete) {
            throw new errors_1.AuthorizationError('You can only delete your own comments');
        }
        try {
            // Set the current user context for triggers
            await (client || database_1.query) `SELECT set_config('app.current_user_id', ${currentUserId}, true)`;
            const result = await (client || database_1.query) `
        UPDATE task_comments 
        SET 
          deleted_at = NOW(),
          deleted_by = ${currentUserId}
        WHERE id = ${commentId} AND deleted_at IS NULL
      `;
            const deleted = result.count > 0;
            if (deleted) {
                logger_1.logger.info('Comment deleted successfully', {
                    commentId,
                    deletedBy: currentUserId
                });
            }
            return deleted;
        }
        catch (error) {
            if (error instanceof errors_1.AuthorizationError || error instanceof errors_1.NotFoundError) {
                throw error;
            }
            logger_1.logger.error('Error deleting comment', error);
            throw new errors_1.DatabaseError('Failed to delete comment');
        }
    }
    /**
     * Get comments by author
     */
    async getCommentsByAuthor(authorId, options = {}, client) {
        if (!authorId?.trim()) {
            throw new errors_1.ValidationError('Author ID is required', [{ field: 'author_id', message: 'Author ID is required' }]);
        }
        const { limit = 50, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options;
        try {
            const countResult = await (client || database_1.query) `
        SELECT COUNT(*) as total
        FROM task_comments
        WHERE author_id = ${authorId} AND deleted_at IS NULL
      `;
            const total = parseInt(countResult[0]?.total || '0');
            const result = await (client || database_1.query) `
        SELECT *
        FROM active_task_comments
        WHERE author_id = ${authorId}
        ORDER BY ${database_1.query.unsafe(orderBy)} ${database_1.query.unsafe(orderDirection)}
        LIMIT ${limit} OFFSET ${offset}
      `;
            return {
                data: result,
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            };
        }
        catch (error) {
            logger_1.logger.error('Error fetching comments by author', error);
            throw new errors_1.DatabaseError('Failed to fetch comments');
        }
    }
    /**
     * Verify that a task exists and is not deleted
     */
    async verifyTaskExists(taskId, client) {
        try {
            const result = await (client || database_1.query) `
        SELECT 1 FROM tasks 
        WHERE id = ${taskId} AND deleted_at IS NULL
        LIMIT 1
      `;
            return result.length > 0;
        }
        catch (error) {
            logger_1.logger.error('Error verifying task exists', error);
            return false;
        }
    }
}
exports.CommentRepository = CommentRepository;
exports.commentRepository = new CommentRepository();
//# sourceMappingURL=CommentRepository.js.map