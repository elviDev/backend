import { DatabaseClient } from '../config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface Activity extends BaseEntity {
    channel_id?: string;
    task_id?: string;
    user_id: string;
    activity_type: 'message' | 'task_created' | 'task_updated' | 'task_completed' | 'task_assigned' | 'task_unassigned' | 'member_joined' | 'member_left' | 'member_added' | 'member_removed' | 'file_uploaded' | 'channel_updated' | 'channel_created' | 'channel_deleted' | 'reaction_added' | 'mention' | 'voice_command' | 'ai_response';
    title: string;
    description?: string;
    metadata: Record<string, any>;
    read_by: string[];
    priority: 'low' | 'medium' | 'high';
    category: 'task' | 'channel' | 'system' | 'social';
    referenced_entity_id?: string;
    referenced_entity_type?: 'task' | 'message' | 'channel' | 'user' | 'file';
}
export interface CreateActivityData {
    channelId?: string;
    taskId?: string;
    userId: string;
    activityType: Activity['activity_type'];
    title: string;
    description?: string;
    metadata?: Record<string, any>;
    priority?: Activity['priority'];
    category?: Activity['category'];
    referencedEntityId?: string;
    referencedEntityType?: Activity['referenced_entity_type'];
}
export interface ActivityWithUser extends Activity {
    user_name: string;
    user_email: string;
    user_avatar?: string;
    user_role: string;
    channel_name?: string;
    task_title?: string;
}
declare class ActivityRepository extends BaseRepository<Activity> {
    constructor();
    /**
     * Create new activity with validation
     */
    findManyActivities(filters: {
        type?: string[];
        channel_id?: string;
        user_id?: string;
        from_date?: string;
        to_date?: string;
        limit?: number;
        offset?: number;
        includeUser?: boolean;
    }): Promise<any[]>;
    count(filters: any): Promise<number>;
    getUserFeed(userId: string, limit: number, offset: number): Promise<any[]>;
    getUserFeedCount(userId: string): Promise<number>;
    getActivityStats(options: {
        userId?: string;
        period?: string;
        channelId?: string;
    }): Promise<any>;
    createActivity(activityData: CreateActivityData, client?: DatabaseClient): Promise<Activity>;
    /**
     * Find activities for a specific user
     */
    findUserActivities(userId: string, filters?: {
        activityType?: string;
        category?: string;
        unreadOnly?: boolean;
        channelId?: string;
        taskId?: string;
        after?: Date;
        before?: Date;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<ActivityWithUser[]>;
    /**
     * Find activities for a channel
     */
    findChannelActivities(channelId: string, filters?: {
        activityType?: string;
        userId?: string;
        after?: Date;
        before?: Date;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<ActivityWithUser[]>;
    /**
     * Get channel activity count
     */
    getChannelActivityCount(channelId: string, filters?: {
        activityType?: string;
        userId?: string;
        after?: Date;
        before?: Date;
    }, client?: DatabaseClient): Promise<number>;
    /**
     * Get user activity count
     */
    getUserActivityCount(userId: string, unreadOnly?: boolean, client?: DatabaseClient): Promise<number>;
    /**
     * Mark activity as read by user
     */
    markAsRead(activityId: string, userId: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Mark multiple activities as read
     */
    markMultipleAsRead(activityIds: string[], userId: string, client?: DatabaseClient): Promise<number>;
    /**
     * Mark all user activities as read
     */
    markAllAsRead(userId: string, client?: DatabaseClient): Promise<number>;
    /**
     * Get activity statistics for a user
     */
    getUserActivityStats(userId: string, daysSince?: number, client?: DatabaseClient): Promise<{
        totalActivities: number;
        unreadActivities: number;
        activitiesByType: Record<string, number>;
        activitiesByCategory: Record<string, number>;
        recentActivity: Array<{
            date: string;
            count: number;
        }>;
    }>;
    /**
     * Determine priority based on activity type
     */
    private determinePriority;
    /**
     * Determine category based on activity type
     */
    private determineCategory;
    /**
     * Clean up old activities
     */
    cleanupOldActivities(daysToKeep?: number, client?: DatabaseClient): Promise<number>;
}
export default ActivityRepository;
//# sourceMappingURL=ActivityRepository.d.ts.map