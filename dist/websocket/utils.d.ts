import { SocketEvent, NotificationEvent, TaskUpdateEvent, ChatMessageEvent, UserStatusEvent } from './types';
/**
 * WebSocket utility functions for real-time communication
 * High-level helpers for common WebSocket operations
 */
export declare class WebSocketUtils {
    /**
     * Send notification to user
     */
    static notifyUser(userId: string, notification: Omit<NotificationEvent, 'type' | 'timestamp' | 'userId' | 'userName' | 'userRole'>): Promise<boolean>;
    /**
     * Broadcast task update to relevant users
     */
    static broadcastTaskUpdate(taskUpdate: Omit<TaskUpdateEvent, 'timestamp'>): Promise<void>;
    /**
     * Broadcast message to channel
     */
    static broadcastChannelMessage(message: Omit<ChatMessageEvent, 'timestamp'>): Promise<void>;
    /**
     * Update user online status
     */
    static updateUserStatus(userId: string, status: 'online' | 'away' | 'busy' | 'offline'): Promise<void>;
    /**
     * Send system announcement to all users
     */
    static sendSystemAnnouncement(announcement: {
        title: string;
        message: string;
        level: 'info' | 'warning' | 'critical';
        scheduledAt?: Date;
        affectedServices?: string[];
    }): Promise<void>;
    /**
     * Send event to all users in a channel
     */
    static sendToChannel(channelId: string, eventType: string, data: any): Promise<void>;
    /**
     * Cache events for offline users
     */
    private static cacheEventForOfflineUsers;
    /**
     * Get offline events for user when they come online
     */
    static getOfflineEventsForUser(userId: string): Promise<SocketEvent[]>;
    /**
     * Check if user is online
     */
    static isUserOnline(userId: string): boolean;
    /**
     * Get online users count
     */
    static getOnlineUsersCount(): number;
    /**
     * Get channel member count
     */
    static getChannelMemberCount(channelId: string): number;
    /**
     * Get active channel members
     */
    static getChannelMembers(channelId: string): string[];
    /**
     * Send typing indicator
     */
    static sendTypingIndicator(channelId: string, userId: string, isTyping: boolean): void;
    /**
     * Get WebSocket server metrics
     */
    static getMetrics(): {
        connections: number;
        disconnections: number;
        events: number;
        errors: number;
        rooms: number;
        totalUsers: number;
    };
    /**
     * Send bulk notifications
     */
    static sendBulkNotifications(userIds: string[], notification: Omit<NotificationEvent, 'type' | 'timestamp' | 'userId' | 'userName' | 'userRole'>): Promise<{
        sent: number;
        failed: number;
    }>;
    /**
     * Create and send notification
     */
    static createAndSendNotification(userId: string, notification: {
        title: string;
        message: string;
        category: 'task' | 'channel' | 'mention' | 'system' | 'voice';
        priority?: 'low' | 'medium' | 'high' | 'urgent';
        actionUrl?: string;
        actionText?: string;
        data?: Record<string, any>;
        expiresAt?: Date;
    }): Promise<boolean>;
    /**
     * Voice command helpers (for Phase 2)
     */
    static sendVoiceCommandResult(userId: string, commandId: string, result: {
        success: boolean;
        message: string;
        actions?: Array<{
            type: string;
            target: string;
            data: any;
        }>;
    }): Promise<boolean>;
    /**
     * Analytics update helpers (for Phase 4)
     */
    static broadcastAnalyticsUpdate(metric: string, value: number | string | Record<string, any>, filters?: Record<string, any>): Promise<void>;
}
/**
 * WebSocket event builders for common scenarios
 */
export declare class EventBuilder {
    /**
     * Build task creation event
     */
    static taskCreated(task: any, createdBy: string): TaskUpdateEvent;
    /**
     * Build task assignment event
     */
    static taskAssigned(taskId: string, assignedTo: string[], assignedBy: string): TaskUpdateEvent;
    /**
     * Build channel message event
     */
    static channelMessage(channelId: string, message: string, userId: string, messageType?: 'text' | 'file' | 'voice'): ChatMessageEvent;
    /**
     * Build user status event
     */
    static userStatusUpdate(userId: string, status: 'online' | 'away' | 'busy' | 'offline'): UserStatusEvent;
}
declare const _default: {
    WebSocketUtils: typeof WebSocketUtils;
    EventBuilder: typeof EventBuilder;
};
export default _default;
//# sourceMappingURL=utils.d.ts.map