import { DatabaseClient } from '../config/database';
import ActivityRepository, { CreateActivityData } from '../db/ActivityRepository';
import { logger } from '../utils/logger';
import { socketManager } from '../websocket';

export interface NotificationContext {
  actorId: string;        // Who performed the action
  actorName: string;      // Name of the person who performed the action
  targetUserId?: string;  // Who is being notified (for specific notifications)
  channelId?: string;     // Channel context
  channelName?: string;   // Channel name for display
  taskId?: string;        // Task context
  taskTitle?: string;     // Task title for display
  entityId?: string;      // Generic entity ID
  entityType?: string;    // Generic entity type
  metadata?: Record<string, any>; // Additional context data
}

class NotificationService {
  private activityRepository: ActivityRepository;

  constructor() {
    this.activityRepository = new ActivityRepository();
  }

  /**
   * Create and broadcast a notification activity
   */
  private async createNotification(
    activityType: string,
    title: string,
    description: string,
    context: NotificationContext,
    priority: 'low' | 'medium' | 'high' = 'medium',
    targetUserIds: string[] = [],
    client?: DatabaseClient
  ): Promise<void> {
    try {
      // Create activity in database
      const activityData: CreateActivityData = {
        channelId: context.channelId,
        taskId: context.taskId,
        userId: context.actorId,
        activityType: activityType as any,
        title,
        description,
        priority,
        metadata: {
          actorName: context.actorName,
          channelName: context.channelName,
          taskTitle: context.taskTitle,
          entityId: context.entityId,
          entityType: context.entityType,
          targetUserIds,
          ...context.metadata,
        },
        referencedEntityId: context.entityId || context.channelId || context.taskId,
        referencedEntityType: context.entityType as any || (context.channelId ? 'channel' : context.taskId ? 'task' : undefined),
      };

      const activity = await this.activityRepository.createActivity(activityData, client);

      // Broadcast notification via WebSocket to target users
      if (targetUserIds.length > 0) {
        targetUserIds.forEach(userId => {
          if (userId !== context.actorId) { // Don't notify the actor
            socketManager.sendToUser(userId, 'notification', {
              type: 'activity_notification',
              activity: {
                id: activity.id,
                type: activityType,
                title,
                description,
                priority,
                metadata: activityData.metadata,
                created_at: activity.created_at,
                read: false,
              },
              timestamp: new Date().toISOString(),
            });
          }
        });
      }

      logger.info({
        activityId: activity.id,
        activityType,
        actorId: context.actorId,
        targetUserIds,
        channelId: context.channelId,
        taskId: context.taskId,
      }, 'Notification created and broadcast');

    } catch (error) {
      logger.error({
        error,
        activityType,
        context,
        targetUserIds,
      }, 'Failed to create notification');
    }
  }

  /**
   * Notify when a user is added to a channel
   */
  async notifyMemberAdded(
    addedUserId: string,
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Added to ${context.channelName}`;
    const description = `${context.actorName} added you to the channel "${context.channelName}"`;

    await this.createNotification(
      'member_added',
      title,
      description,
      context,
      'medium',
      [addedUserId],
      client
    );
  }

  /**
   * Notify when a user is removed from a channel
   */
  async notifyMemberRemoved(
    removedUserId: string,
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Removed from ${context.channelName}`;
    const description = `${context.actorName} removed you from the channel "${context.channelName}"`;

    await this.createNotification(
      'member_removed',
      title,
      description,
      context,
      'medium',
      [removedUserId],
      client
    );
  }

  /**
   * Notify when a channel is updated
   */
  async notifyChannelUpdated(
    channelMemberIds: string[],
    context: NotificationContext,
    changes: string[] = [],
    client?: DatabaseClient
  ): Promise<void> {
    const changesText = changes.length > 0 ? ` (${changes.join(', ')})` : '';
    const title = `Channel Updated`;
    const description = `${context.actorName} updated the channel "${context.channelName}"${changesText}`;

    await this.createNotification(
      'channel_updated',
      title,
      description,
      { ...context, metadata: { ...context.metadata, changes } },
      'low',
      channelMemberIds,
      client
    );
  }

  /**
   * Notify when a task is assigned to users
   */
  async notifyTaskAssigned(
    assignedUserIds: string[],
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Task Assigned`;
    const description = `${context.actorName} assigned the task "${context.taskTitle}" to you`;

    await this.createNotification(
      'task_assigned',
      title,
      description,
      context,
      'medium',
      assignedUserIds,
      client
    );
  }

  /**
   * Notify when a task is unassigned from users
   */
  async notifyTaskUnassigned(
    unassignedUserIds: string[],
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Task Unassigned`;
    const description = `${context.actorName} unassigned you from the task "${context.taskTitle}"`;

    await this.createNotification(
      'task_unassigned',
      title,
      description,
      context,
      'low',
      unassignedUserIds,
      client
    );
  }

  /**
   * Notify when a task is updated (for assigned users)
   */
  async notifyTaskUpdated(
    assignedUserIds: string[],
    context: NotificationContext,
    changes: string[] = [],
    client?: DatabaseClient
  ): Promise<void> {
    const changesText = changes.length > 0 ? ` (${changes.join(', ')})` : '';
    const title = `Task Updated`;
    const description = `${context.actorName} updated the task "${context.taskTitle}"${changesText}`;

    await this.createNotification(
      'task_updated',
      title,
      description,
      { ...context, metadata: { ...context.metadata, changes } },
      'low',
      assignedUserIds,
      client
    );
  }

  /**
   * Notify when a task is completed
   */
  async notifyTaskCompleted(
    interestedUserIds: string[],
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Task Completed`;
    const description = `${context.actorName} completed the task "${context.taskTitle}"`;

    await this.createNotification(
      'task_completed',
      title,
      description,
      context,
      'low',
      interestedUserIds,
      client
    );
  }

  /**
   * Notify when a new channel is created (for members)
   */
  async notifyChannelCreated(
    memberIds: string[],
    context: NotificationContext,
    client?: DatabaseClient
  ): Promise<void> {
    const title = `Added to New Channel`;
    const description = `${context.actorName} created the channel "${context.channelName}" and added you`;

    await this.createNotification(
      'channel_created',
      title,
      description,
      context,
      'low',
      memberIds,
      client
    );
  }

  /**
   * Generic notification method for custom notifications
   */
  async createCustomNotification(
    activityType: string,
    title: string,
    description: string,
    targetUserIds: string[],
    context: NotificationContext,
    priority: 'low' | 'medium' | 'high' = 'medium',
    client?: DatabaseClient
  ): Promise<void> {
    await this.createNotification(
      activityType,
      title,
      description,
      context,
      priority,
      targetUserIds,
      client
    );
  }
}

export const notificationService = new NotificationService();
export default NotificationService;