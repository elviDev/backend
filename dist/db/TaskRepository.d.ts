import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface Task extends BaseEntity {
    title: string;
    description?: string;
    channel_id?: string;
    parent_task_id?: string;
    created_by: string;
    assigned_to: string[];
    owned_by?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
    status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold';
    task_type: 'general' | 'project' | 'maintenance' | 'emergency' | 'research' | 'approval';
    complexity: number;
    estimated_hours?: number;
    actual_hours: number;
    story_points?: number;
    due_date?: Date;
    start_date?: Date;
    completed_at?: Date;
    progress_percentage: number;
    tags: string[];
    labels: Record<string, any>;
    custom_fields: Record<string, any>;
    voice_created: boolean;
    voice_command_id?: string;
    voice_instructions?: string;
    ai_generated: boolean;
    ai_suggestions: Record<string, any>;
    automation_rules: Record<string, any>;
    watchers: string[];
    comments_count: number;
    attachments_count: number;
    business_value: 'low' | 'medium' | 'high' | 'critical';
    cost_center?: string;
    budget_impact?: number;
    acceptance_criteria?: string;
    definition_of_done?: string;
    quality_score?: number;
    external_references: Record<string, any>;
    integrations: Record<string, any>;
    recurrence_pattern?: Record<string, any>;
    recurrence_parent_id?: string;
    is_recurring: boolean;
    last_activity_at: Date;
}
export interface CreateTaskData {
    title: string;
    description?: string;
    channel_id?: string;
    parent_task_id?: string;
    created_by: string;
    assigned_to?: string[];
    owned_by?: string;
    priority?: Task['priority'];
    task_type?: Task['task_type'];
    complexity?: number;
    estimated_hours?: number;
    due_date?: Date;
    start_date?: Date;
    tags?: string[];
    labels?: Record<string, any>;
    voice_created?: boolean;
    voice_command_id?: string;
    voice_instructions?: string;
    business_value?: Task['business_value'];
    acceptance_criteria?: string;
}
export interface TaskWithDetails extends Task {
    channel_name?: string;
    owner_name?: string;
    assignee_details?: Array<{
        id: string;
        name: string;
        email: string;
        avatar_url?: string;
    }>;
    subtask_count?: number;
    dependency_count?: number;
}
export interface TaskFilter {
    status?: Task['status'][];
    priority?: Task['priority'][];
    assignedTo?: string[];
    channelId?: string;
    dueAfter?: Date;
    dueBefore?: Date;
    tags?: string[];
    voiceCreated?: boolean;
    overdue?: boolean;
}
declare class TaskRepository extends BaseRepository<Task> {
    constructor();
    /**
     * Create new task with validation
     */
    createTask(taskData: CreateTaskData, client?: DatabaseClient): Promise<Task>;
    /**
     * Assign users to task
     */
    assignUsers(taskId: string, userIds: string[], assignedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Unassign users from task
     */
    unassignUsers(taskId: string, userIds: string[], unassignedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Find tasks assigned to user
     */
    findByAssignee(userId: string, status?: Task['status'][], includeWatching?: boolean, client?: DatabaseClient): Promise<Task[]>;
    /**
     * Find tasks in channel
     */
    findByChannel(channelId: string, includeCompleted?: boolean, client?: DatabaseClient): Promise<Task[]>;
    /**
     * Find overdue tasks
     */
    findOverdue(userId?: string, client?: DatabaseClient): Promise<Task[]>;
    /**
     * Find tasks with filters
     */
    findWithFilters(filters: TaskFilter, limit?: number, offset?: number, client?: DatabaseClient): Promise<Task[]>;
    /**
     * Update task progress
     */
    updateProgress(taskId: string, progressPercentage: number, updatedBy: string, client?: DatabaseClient): Promise<Task>;
    /**
     * Update task status
     */
    updateStatus(taskId: string, status: Task['status'], updatedBy: string, client?: DatabaseClient): Promise<Task>;
    /**
     * Get task with details (channel, assignees, subtasks)
     */
    findWithDetails(taskId: string, client?: DatabaseClient): Promise<TaskWithDetails | null>;
    /**
     * Get task hierarchy (parent and children)
     */
    getTaskHierarchy(taskId: string, client?: DatabaseClient): Promise<Array<{
        task_id: string;
        title: string;
        parent_id: string;
        level: number;
        path: string;
    }>>;
    /**
     * Search tasks by title or description
     */
    searchTasks(searchTerm: string, userId?: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<Task[]>;
    /**
     * Get task statistics
     */
    getTaskStats(userId?: string, client?: DatabaseClient): Promise<{
        totalTasks: number;
        tasksByStatus: Record<string, number>;
        tasksByPriority: Record<string, number>;
        overdueTasks: number;
        completedThisWeek: number;
        averageCompletionTime: number;
    }>;
    /**
     * Add watcher to task
     */
    addWatcher(taskId: string, userId: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Remove watcher from task
     */
    removeWatcher(taskId: string, userId: string, client?: DatabaseClient): Promise<boolean>;
}
export default TaskRepository;
//# sourceMappingURL=TaskRepository.d.ts.map