"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBuilder = exports.WebSocketUtils = void 0;
const SocketManager_1 = require("./SocketManager");
const logger_1 = require("@utils/logger");
const CacheService_1 = require("../services/CacheService");
/**
 * WebSocket utility functions for real-time communication
 * High-level helpers for common WebSocket operations
 */
class WebSocketUtils {
    /**
     * Send notification to user
     */
    static async notifyUser(userId, notification) {
        try {
            // TODO: Get user details for complete notification
            const notificationEvent = {
                ...notification,
                type: 'notification',
                timestamp: new Date().toISOString(),
                userId, // This would need to be the sender's userId
            };
            const success = SocketManager_1.socketManager.sendToUser(userId, 'notification', notificationEvent);
            if (success) {
                logger_1.loggers.websocket.debug?.({
                    userId,
                    notificationId: notification.notificationId,
                    category: notification.category,
                }, 'Notification sent via WebSocket');
            }
            return success;
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId }, 'Failed to send notification via WebSocket');
            return false;
        }
    }
    /**
     * Broadcast task update to relevant users
     */
    static async broadcastTaskUpdate(taskUpdate) {
        try {
            const event = {
                ...taskUpdate,
                timestamp: new Date().toISOString(),
            };
            // TODO: Determine who should receive this update based on:
            // - Task assignees
            // - Task watchers
            // - Channel members if task is in a channel
            // - Managers/CEO for important tasks
            // For now, broadcast to all connected users
            SocketManager_1.socketManager.broadcast('task_update', event);
            // Also send to specific channel if task is in a channel
            if (taskUpdate.channelId) {
                SocketManager_1.socketManager.sendToChannel(taskUpdate.channelId, 'task_update', event);
            }
            // Cache the task update for offline users
            await this.cacheEventForOfflineUsers('task_update', event);
            logger_1.loggers.websocket.debug?.({
                taskId: taskUpdate.taskId,
                action: taskUpdate.action,
                userId: taskUpdate.userId,
            }, 'Task update broadcasted');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, taskId: taskUpdate.taskId }, 'Failed to broadcast task update');
        }
    }
    /**
     * Broadcast message to channel
     */
    static async broadcastChannelMessage(message) {
        try {
            const event = {
                ...message,
                timestamp: new Date().toISOString(),
            };
            // Send to channel members
            SocketManager_1.socketManager.sendToChannel(message.channelId, 'chat_message', event);
            // Cache for offline channel members
            await this.cacheEventForOfflineUsers('chat_message', event, message.channelId);
            logger_1.loggers.websocket.debug?.({
                channelId: message.channelId,
                userId: message.userId,
                messageType: message.messageType,
            }, 'Channel message broadcasted');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, channelId: message.channelId }, 'Failed to broadcast channel message');
        }
    }
    /**
     * Update user online status
     */
    static async updateUserStatus(userId, status) {
        try {
            // TODO: Get user details
            const statusEvent = {
                type: 'user_status_update',
                userId,
                status,
                timestamp: new Date().toISOString(),
                lastSeen: new Date().toISOString(), // Always provide a value
            };
            // Broadcast to all users (or just contacts/team members)
            SocketManager_1.socketManager.broadcast('user_status_update', statusEvent);
            // Cache the status
            await CacheService_1.cacheService.users.set(`status:${userId}`, { status, lastSeen: statusEvent.lastSeen }, { ttl: 3600 } // 1 hour
            );
            logger_1.loggers.websocket.debug?.({ userId, status }, 'User status updated');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId, status }, 'Failed to update user status');
        }
    }
    /**
     * Send system announcement to all users
     */
    static async sendSystemAnnouncement(announcement) {
        try {
            const systemEvent = {
                type: 'system_announcement',
                ...announcement,
                timestamp: new Date().toISOString(),
                userId: 'system',
                userName: 'System',
                userRole: 'system',
                scheduledAt: announcement.scheduledAt?.toISOString(),
            };
            SocketManager_1.socketManager.broadcast('system_announcement', systemEvent);
            // Cache for offline users
            await CacheService_1.cacheService.set(`system:announcement:${Date.now()}`, systemEvent, { ttl: 86400, tags: ['system', 'announcements'] });
            logger_1.loggers.websocket.info?.({
                title: announcement.title,
                level: announcement.level,
                affectedServices: announcement.affectedServices,
            }, 'System announcement broadcasted');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, announcement }, 'Failed to send system announcement');
        }
    }
    /**
     * Send event to all users in a channel
     */
    static async sendToChannel(channelId, eventType, data) {
        try {
            const event = {
                type: eventType,
                channelId,
                data,
                timestamp: new Date().toISOString(),
            };
            // Use socket manager to broadcast to channel
            SocketManager_1.socketManager.sendToChannel(channelId, eventType, event);
            // Cache for offline users
            await this.cacheEventForOfflineUsers(eventType, event, channelId);
            logger_1.loggers.websocket.info?.({
                eventType,
                channelId,
                dataKeys: Object.keys(data),
            }, 'Event sent to channel');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({
                error,
                eventType,
                channelId
            }, 'Failed to send event to channel');
        }
    }
    /**
     * Cache events for offline users
     */
    static async cacheEventForOfflineUsers(eventType, event, channelId) {
        try {
            // TODO: Get list of users who should receive this event but are offline
            // For now, just cache the event with a general key
            const cacheKey = `offline_events:${eventType}:${Date.now()}`;
            await CacheService_1.cacheService.set(cacheKey, event, {
                ttl: 86400, // 24 hours
                tags: ['offline_events', eventType, channelId].filter(Boolean)
            });
        }
        catch (error) {
            logger_1.loggers.websocket.warn?.({ error, eventType }, 'Failed to cache event for offline users');
        }
    }
    /**
     * Get offline events for user when they come online
     */
    static async getOfflineEventsForUser(userId) {
        try {
            // TODO: Implement offline event retrieval based on user's channels, tasks, etc.
            // This would require a more sophisticated caching strategy
            return [];
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId }, 'Failed to get offline events for user');
            return [];
        }
    }
    /**
     * Check if user is online
     */
    static isUserOnline(userId) {
        return SocketManager_1.socketManager.isUserOnline(userId);
    }
    /**
     * Get online users count
     */
    static getOnlineUsersCount() {
        return SocketManager_1.socketManager.getConnectedUsersCount();
    }
    /**
     * Get channel member count
     */
    static getChannelMemberCount(channelId) {
        return SocketManager_1.socketManager.getChannelMemberCount(channelId);
    }
    /**
     * Get active channel members
     */
    static getChannelMembers(channelId) {
        return SocketManager_1.socketManager.getChannelMembers(channelId);
    }
    /**
     * Send typing indicator
     */
    static sendTypingIndicator(channelId, userId, isTyping) {
        SocketManager_1.socketManager.sendToChannel(channelId, 'typing_indicator', {
            type: 'typing_indicator',
            channelId,
            userId,
            isTyping,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Get WebSocket server metrics
     */
    static getMetrics() {
        return SocketManager_1.socketManager.getMetrics();
    }
    /**
     * Send bulk notifications
     */
    static async sendBulkNotifications(userIds, notification) {
        let sent = 0;
        let failed = 0;
        await Promise.allSettled(userIds.map(async (userId) => {
            try {
                const success = await this.notifyUser(userId, notification);
                if (success) {
                    sent++;
                }
                else {
                    failed++;
                }
            }
            catch (error) {
                failed++;
                logger_1.loggers.websocket.warn?.({ error, userId }, 'Failed to send bulk notification');
            }
        }));
        logger_1.loggers.websocket.info?.({
            notificationId: notification.notificationId,
            totalUsers: userIds.length,
            sent,
            failed,
        }, 'Bulk notifications sent');
        return { sent, failed };
    }
    /**
     * Create and send notification
     */
    static async createAndSendNotification(userId, notification) {
        const notificationEvent = {
            notificationId: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            priority: notification.priority || 'medium',
            ...notification,
            expiresAt: notification.expiresAt?.toISOString() || new Date(Date.now() + 86400000).toISOString(), // Default to 24 hours
        };
        return await this.notifyUser(userId, notificationEvent);
    }
    /**
     * Voice command helpers (for Phase 2)
     */
    static async sendVoiceCommandResult(userId, commandId, result) {
        const voiceResult = {
            type: 'voice_command_result',
            commandId,
            result,
            timestamp: new Date().toISOString(),
            userId,
        };
        return SocketManager_1.socketManager.sendToUser(userId, 'voice_command_result', voiceResult);
    }
    /**
     * Analytics update helpers (for Phase 4)
     */
    static async broadcastAnalyticsUpdate(metric, value, filters) {
        const analyticsEvent = {
            type: 'analytics_update',
            metric,
            value,
            filters,
            timestamp: new Date().toISOString(),
        };
        // Only send to users who have subscribed to analytics updates
        // TODO: Implement analytics subscription management
        SocketManager_1.socketManager.broadcast('analytics_update', analyticsEvent);
    }
}
exports.WebSocketUtils = WebSocketUtils;
/**
 * WebSocket event builders for common scenarios
 */
class EventBuilder {
    /**
     * Build task creation event
     */
    static taskCreated(task, createdBy) {
        return {
            type: 'task_created',
            taskId: task.id,
            channelId: task.channel_id,
            task: {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                assignedTo: task.assigned_to,
                dueDate: task.due_date,
                progress: task.progress_percentage,
                tags: task.tags,
            },
            action: 'create',
            userId: createdBy,
            userName: '', // TODO: Get from user data
            userRole: 'staff', // TODO: Get from user data
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Build task assignment event
     */
    static taskAssigned(taskId, assignedTo, assignedBy) {
        return {
            type: 'task_updated',
            taskId,
            task: {}, // Minimal data for assignment event
            action: 'assign',
            changes: { assigned_to: assignedTo },
            userId: assignedBy,
            userName: '', // TODO: Get from user data
            userRole: 'manager', // TODO: Get from user data
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Build channel message event
     */
    static channelMessage(channelId, message, userId, messageType = 'text') {
        return {
            type: 'chat_message',
            channelId,
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message,
            messageType,
            userId,
            userName: '', // TODO: Get from user data
            userRole: 'staff', // TODO: Get from user data
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Build user status event
     */
    static userStatusUpdate(userId, status) {
        return {
            type: 'user_status_update',
            status,
            lastSeen: new Date().toISOString(), // Always provide a value to satisfy strict types
            userId,
            userName: '', // TODO: Get from user data
            userRole: 'staff', // TODO: Get from user data
            timestamp: new Date().toISOString(),
        };
    }
}
exports.EventBuilder = EventBuilder;
exports.default = { WebSocketUtils, EventBuilder };
//# sourceMappingURL=utils.js.map