import { DatabaseClient } from '../config/database';
export interface NotificationContext {
    actorId: string;
    actorName: string;
    targetUserId?: string;
    channelId?: string;
    channelName?: string;
    taskId?: string;
    taskTitle?: string;
    entityId?: string;
    entityType?: string;
    metadata?: Record<string, any>;
}
declare class NotificationService {
    private activityRepository;
    constructor();
    /**
     * Create and broadcast a notification activity
     */
    private createNotification;
    /**
     * Notify when a user is added to a channel
     */
    notifyMemberAdded(addedUserId: string, context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a user is removed from a channel
     */
    notifyMemberRemoved(removedUserId: string, context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a channel is updated
     */
    notifyChannelUpdated(channelMemberIds: string[], context: NotificationContext, changes?: string[], client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a task is assigned to users
     */
    notifyTaskAssigned(assignedUserIds: string[], context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a task is unassigned from users
     */
    notifyTaskUnassigned(unassignedUserIds: string[], context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a task is updated (for assigned users)
     */
    notifyTaskUpdated(assignedUserIds: string[], context: NotificationContext, changes?: string[], client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a task is completed
     */
    notifyTaskCompleted(interestedUserIds: string[], context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Notify when a new channel is created (for members)
     */
    notifyChannelCreated(memberIds: string[], context: NotificationContext, client?: DatabaseClient): Promise<void>;
    /**
     * Generic notification method for custom notifications
     */
    createCustomNotification(activityType: string, title: string, description: string, targetUserIds: string[], context: NotificationContext, priority?: 'low' | 'medium' | 'high', client?: DatabaseClient): Promise<void>;
}
export declare const notificationService: NotificationService;
export default NotificationService;
//# sourceMappingURL=NotificationService.d.ts.map