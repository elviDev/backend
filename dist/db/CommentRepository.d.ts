import { DatabaseClient } from '@config/database';
import { BaseRepository, BaseEntity, FilterOptions, PaginatedResult } from './BaseRepository';
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
    author_name?: string;
    author_email?: string;
    edited_by_name?: string;
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
export declare class CommentRepository extends BaseRepository<TaskComment> {
    constructor();
    /**
     * Create a new comment on a task
     */
    createComment(commentData: CreateCommentData, client?: DatabaseClient): Promise<TaskComment>;
    /**
     * Get comments for a specific task with author information and reaction counts
     */
    getTaskComments(taskId: string, options?: CommentFilterOptions, userId?: string, client?: DatabaseClient): Promise<PaginatedResult<TaskComment>>;
    /**
     * Get a specific comment by ID
     */
    getCommentById(commentId: string, client?: DatabaseClient): Promise<TaskComment | null>;
    /**
     * Update a comment (with authorization check)
     */
    updateComment(commentId: string, updateData: UpdateCommentData, currentUserId: string, currentUserRole?: string, client?: DatabaseClient): Promise<TaskComment>;
    /**
     * Soft delete a comment (with authorization check)
     */
    deleteComment(commentId: string, currentUserId: string, currentUserRole?: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Get comments by author
     */
    getCommentsByAuthor(authorId: string, options?: FilterOptions, client?: DatabaseClient): Promise<PaginatedResult<TaskComment>>;
    /**
     * Verify that a task exists and is not deleted
     */
    private verifyTaskExists;
    /**
     * Get mentions for a specific comment
     */
    getCommentMentions(commentId: string, client?: DatabaseClient): Promise<CommentMention[]>;
    /**
     * Get mentions for a specific user
     */
    getUserMentions(userId: string, options?: FilterOptions, client?: DatabaseClient): Promise<PaginatedResult<CommentMention>>;
    /**
     * Get task assignees to validate mentions
     */
    getTaskAssignees(taskId: string, client?: DatabaseClient): Promise<string[]>;
    /**
     * Validate that mentioned users are assigned to the task
     */
    validateMentions(taskId: string, mentionTexts: string[], client?: DatabaseClient): Promise<{
        valid: string[];
        invalid: string[];
    }>;
    /**
     * Find comment by ID and verify it belongs to the specified task
     */
    findByIdAndTask(commentId: string, taskId: string, client?: DatabaseClient): Promise<TaskComment | null>;
    /**
     * Add or update a reaction to a comment
     */
    addOrUpdateReaction(commentId: string, userId: string, reactionType: 'up' | 'down', client?: DatabaseClient): Promise<void>;
    /**
     * Remove a reaction from a comment
     */
    removeReaction(commentId: string, userId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Get reaction counts for a comment
     */
    getCommentReactionCounts(commentId: string, client?: DatabaseClient): Promise<{
        up_count: number;
        down_count: number;
        total_reactions: number;
    }>;
}
export declare const commentRepository: CommentRepository;
//# sourceMappingURL=CommentRepository.d.ts.map