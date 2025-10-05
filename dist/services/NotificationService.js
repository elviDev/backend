"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const ActivityRepository_1 = __importDefault(require("../db/ActivityRepository"));
const logger_1 = require("../utils/logger");
const websocket_1 = require("../websocket");
class NotificationService {
    activityRepository;
    constructor() {
        this.activityRepository = new ActivityRepository_1.default();
    }
    /**
     * Create and broadcast a notification activity
     */
    async createNotification(activityType, title, description, context, priority = 'medium', targetUserIds = [], client) {
        try {
            // Create activity in database
            const activityData = {
                channelId: context.channelId,
                taskId: context.taskId,
                userId: context.actorId,
                activityType: activityType,
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
                referencedEntityType: context.entityType || (context.channelId ? 'channel' : context.taskId ? 'task' : undefined),
            };
            const activity = await this.activityRepository.createActivity(activityData, client);
            // Broadcast notification via WebSocket to target users
            if (targetUserIds.length > 0) {
                targetUserIds.forEach(userId => {
                    if (userId !== context.actorId) { // Don't notify the actor
                        websocket_1.socketManager.sendToUser(userId, 'notification', {
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
            logger_1.logger.info({
                activityId: activity.id,
                activityType,
                actorId: context.actorId,
                targetUserIds,
                channelId: context.channelId,
                taskId: context.taskId,
            }, 'Notification created and broadcast');
        }
        catch (error) {
            logger_1.logger.error({
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
    async notifyMemberAdded(addedUserId, context, client) {
        const title = `Added to ${context.channelName}`;
        const description = `${context.actorName} added you to the channel "${context.channelName}"`;
        await this.createNotification('member_added', title, description, context, 'medium', [addedUserId], client);
    }
    /**
     * Notify when a user is removed from a channel
     */
    async notifyMemberRemoved(removedUserId, context, client) {
        const title = `Removed from ${context.channelName}`;
        const description = `${context.actorName} removed you from the channel "${context.channelName}"`;
        await this.createNotification('member_removed', title, description, context, 'medium', [removedUserId], client);
    }
    /**
     * Notify when a channel is updated
     */
    async notifyChannelUpdated(channelMemberIds, context, changes = [], client) {
        const changesText = changes.length > 0 ? ` (${changes.join(', ')})` : '';
        const title = `Channel Updated`;
        const description = `${context.actorName} updated the channel "${context.channelName}"${changesText}`;
        await this.createNotification('channel_updated', title, description, { ...context, metadata: { ...context.metadata, changes } }, 'low', channelMemberIds, client);
    }
    /**
     * Notify when a task is assigned to users
     */
    async notifyTaskAssigned(assignedUserIds, context, client) {
        const title = `Task Assigned`;
        const description = `${context.actorName} assigned the task "${context.taskTitle}" to you`;
        await this.createNotification('task_assigned', title, description, context, 'medium', assignedUserIds, client);
    }
    /**
     * Notify when a task is unassigned from users
     */
    async notifyTaskUnassigned(unassignedUserIds, context, client) {
        const title = `Task Unassigned`;
        const description = `${context.actorName} unassigned you from the task "${context.taskTitle}"`;
        await this.createNotification('task_unassigned', title, description, context, 'low', unassignedUserIds, client);
    }
    /**
     * Notify when a task is updated (for assigned users)
     */
    async notifyTaskUpdated(assignedUserIds, context, changes = [], client) {
        const changesText = changes.length > 0 ? ` (${changes.join(', ')})` : '';
        const title = `Task Updated`;
        const description = `${context.actorName} updated the task "${context.taskTitle}"${changesText}`;
        await this.createNotification('task_updated', title, description, { ...context, metadata: { ...context.metadata, changes } }, 'low', assignedUserIds, client);
    }
    /**
     * Notify when a task is completed
     */
    async notifyTaskCompleted(interestedUserIds, context, client) {
        const title = `Task Completed`;
        const description = `${context.actorName} completed the task "${context.taskTitle}"`;
        await this.createNotification('task_completed', title, description, context, 'low', interestedUserIds, client);
    }
    /**
     * Notify when a new channel is created (for members)
     */
    async notifyChannelCreated(memberIds, context, client) {
        const title = `Added to New Channel`;
        const description = `${context.actorName} created the channel "${context.channelName}" and added you`;
        await this.createNotification('channel_created', title, description, context, 'low', memberIds, client);
    }
    /**
     * Generic notification method for custom notifications
     */
    async createCustomNotification(activityType, title, description, targetUserIds, context, priority = 'medium', client) {
        await this.createNotification(activityType, title, description, context, priority, targetUserIds, client);
    }
}
exports.notificationService = new NotificationService();
exports.default = NotificationService;
//# sourceMappingURL=NotificationService.js.map