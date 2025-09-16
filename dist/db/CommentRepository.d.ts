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
     * Get comments for a specific task with author information
     */
    getTaskComments(taskId: string, options?: CommentFilterOptions, client?: DatabaseClient): Promise<PaginatedResult<TaskComment>>;
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
}
export declare const commentRepository: CommentRepository;
//# sourceMappingURL=CommentRepository.d.ts.map