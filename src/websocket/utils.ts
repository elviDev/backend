import { socketManager } from './SocketManager';
import { logger, loggers } from '@utils/logger';
import { cacheService } from '../services/CacheService';
import { 
  SocketEvent, 
  NotificationEvent, 
  TaskUpdateEvent, 
  ChatMessageEvent,
  UserStatusEvent 
} from './types';

/**
 * WebSocket utility functions for real-time communication
 * High-level helpers for common WebSocket operations
 */

export class WebSocketUtils {
  /**
   * Send notification to user
   */
  static async notifyUser(userId: string, notification: Omit<NotificationEvent, 'type' | 'timestamp' | 'userId' | 'userName' | 'userRole'>): Promise<boolean> {
    try {
      // TODO: Get user details for complete notification
      const notificationEvent: Partial<NotificationEvent> = {
        ...notification,
        type: 'notification',
        timestamp: new Date().toISOString(),
        userId, // This would need to be the sender's userId
      };

      const success = socketManager.sendToUser(userId, 'notification', notificationEvent);
      
      if (success) {
        loggers.websocket.debug?.({
          userId,
          notificationId: notification.notificationId,
          category: notification.category,
        }, 'Notification sent via WebSocket');
      }

      return success;
    } catch (error) {
      loggers.websocket.error?.({ error, userId }, 'Failed to send notification via WebSocket');
      return false;
    }
  }

  /**
   * Broadcast task update to relevant users
   */
  static async broadcastTaskUpdate(taskUpdate: Omit<TaskUpdateEvent, 'timestamp'>): Promise<void> {
    try {
      const event: TaskUpdateEvent = {
        ...taskUpdate,
        timestamp: new Date().toISOString(),
      };

      // TODO: Determine who should receive this update based on:
      // - Task assignees
      // - Task watchers
      // - Channel members if task is in a channel
      // - Managers/CEO for important tasks

      // For now, broadcast to all connected users
      socketManager.broadcast('task_update', event);

      // Also send to specific channel if task is in a channel
      if (taskUpdate.channelId) {
        socketManager.sendToChannel(taskUpdate.channelId, 'task_update', event);
      }

      // Cache the task update for offline users
      await this.cacheEventForOfflineUsers('task_update', event);

      loggers.websocket.debug?.({
        taskId: taskUpdate.taskId,
        action: taskUpdate.action,
        userId: taskUpdate.userId,
      }, 'Task update broadcasted');

    } catch (error) {
      loggers.websocket.error?.({ error, taskId: taskUpdate.taskId }, 'Failed to broadcast task update');
    }
  }

  /**
   * Broadcast message to channel
   */
  static async broadcastChannelMessage(message: Omit<ChatMessageEvent, 'timestamp'>): Promise<void> {
    try {
      const event: ChatMessageEvent = {
        ...message,
        timestamp: new Date().toISOString(),
      };

      // Send to channel members
      socketManager.sendToChannel(message.channelId, 'chat_message', event);

      // Cache for offline channel members
      await this.cacheEventForOfflineUsers('chat_message', event, message.channelId);

      loggers.websocket.debug?.({
        channelId: message.channelId,
        userId: message.userId,
        messageType: message.messageType,
      }, 'Channel message broadcasted');

    } catch (error) {
      loggers.websocket.error?.({ error, channelId: message.channelId }, 'Failed to broadcast channel message');
    }
  }

  /**
   * Update user online status
   */
  static async updateUserStatus(userId: string, status: 'online' | 'away' | 'busy' | 'offline'): Promise<void> {
    try {
      // TODO: Get user details
      const statusEvent: Partial<UserStatusEvent> = {
        type: 'user_status_update',
        userId,
        status,
        timestamp: new Date().toISOString(),
        lastSeen: new Date().toISOString(), // Always provide a value
      };

      // Broadcast to all users (or just contacts/team members)
      socketManager.broadcast('user_status_update', statusEvent);

      // Cache the status
      await cacheService.users.set(
        `status:${userId}`, 
        { status, lastSeen: statusEvent.lastSeen },
        { ttl: 3600 } // 1 hour
      );

      loggers.websocket.debug?.({ userId, status }, 'User status updated');

    } catch (error) {
      loggers.websocket.error?.({ error, userId, status }, 'Failed to update user status');
    }
  }

  /**
   * Send system announcement to all users
   */
  static async sendSystemAnnouncement(announcement: {
    title: string;
    message: string;
    level: 'info' | 'warning' | 'critical';
    scheduledAt?: Date;
    affectedServices?: string[];
  }): Promise<void> {
    try {
      const systemEvent = {
        type: 'system_announcement',
        ...announcement,
        timestamp: new Date().toISOString(),
        userId: 'system',
        userName: 'System',
        userRole: 'system' as any,
        scheduledAt: announcement.scheduledAt?.toISOString(),
      };

      socketManager.broadcast('system_announcement', systemEvent);

      // Cache for offline users
      await cacheService.set(
        `system:announcement:${Date.now()}`,
        systemEvent,
        { ttl: 86400, tags: ['system', 'announcements'] }
      );

      loggers.websocket.info?.({
        title: announcement.title,
        level: announcement.level,
        affectedServices: announcement.affectedServices,
      }, 'System announcement broadcasted');

    } catch (error) {
      loggers.websocket.error?.({ error, announcement }, 'Failed to send system announcement');
    }
  }

  /**
   * Send event to all users in a channel
   */
  static async sendToChannel(channelId: string, eventType: string, data: any): Promise<void> {
    try {
      const event = {
        type: eventType,
        channelId,
        data,
        timestamp: new Date().toISOString(),
      };

      // Use socket manager to broadcast to channel
      socketManager.sendToChannel(channelId, eventType, event);

      // Cache for offline users
      await this.cacheEventForOfflineUsers(eventType, event as any, channelId);

      loggers.websocket.info?.({
        eventType,
        channelId,
        dataKeys: Object.keys(data),
      }, 'Event sent to channel');

    } catch (error) {
      loggers.websocket.error?.({ 
        error, 
        eventType, 
        channelId 
      }, 'Failed to send event to channel');
    }
  }

  /**
   * Cache events for offline users
   */
  private static async cacheEventForOfflineUsers(
    eventType: string, 
    event: SocketEvent, 
    channelId?: string
  ): Promise<void> {
    try {
      // TODO: Get list of users who should receive this event but are offline
      // For now, just cache the event with a general key
      
      const cacheKey = `offline_events:${eventType}:${Date.now()}`;
      await cacheService.set(cacheKey, event, {
        ttl: 86400, // 24 hours
        tags: ['offline_events', eventType, channelId].filter(Boolean) as string[]
      });

    } catch (error) {
      loggers.websocket.warn?.({ error, eventType }, 'Failed to cache event for offline users');
    }
  }

  /**
   * Get offline events for user when they come online
   */
  static async getOfflineEventsForUser(userId: string): Promise<SocketEvent[]> {
    try {
      // TODO: Implement offline event retrieval based on user's channels, tasks, etc.
      // This would require a more sophisticated caching strategy

      return [];
    } catch (error) {
      loggers.websocket.error?.({ error, userId }, 'Failed to get offline events for user');
      return [];
    }
  }

  /**
   * Check if user is online
   */
  static isUserOnline(userId: string): boolean {
    return socketManager.isUserOnline(userId);
  }

  /**
   * Get online users count
   */
  static getOnlineUsersCount(): number {
    return socketManager.getConnectedUsersCount();
  }

  /**
   * Get channel member count
   */
  static getChannelMemberCount(channelId: string): number {
    return socketManager.getChannelMemberCount(channelId);
  }

  /**
   * Get active channel members
   */
  static getChannelMembers(channelId: string): string[] {
    return socketManager.getChannelMembers(channelId);
  }

  /**
   * Send typing indicator
   */
  static sendTypingIndicator(channelId: string, userId: string, isTyping: boolean): void {
    socketManager.sendToChannel(channelId, 'typing_indicator', {
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
  static getMetrics(): {
    connections: number;
    disconnections: number;
    events: number;
    errors: number;
    rooms: number;
    totalUsers: number;
  } {
    return socketManager.getMetrics();
  }

  /**
   * Send bulk notifications
   */
  static async sendBulkNotifications(
    userIds: string[], 
    notification: Omit<NotificationEvent, 'type' | 'timestamp' | 'userId' | 'userName' | 'userRole'>
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const success = await this.notifyUser(userId, notification);
          if (success) {
            sent++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          loggers.websocket.warn?.({ error, userId }, 'Failed to send bulk notification');
        }
      })
    );

    loggers.websocket.info?.({
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
  static async createAndSendNotification(
    userId: string,
    notification: {
      title: string;
      message: string;
      category: 'task' | 'channel' | 'mention' | 'system' | 'voice';
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      actionUrl?: string;
      actionText?: string;
      data?: Record<string, any>;
      expiresAt?: Date;
    }
  ): Promise<boolean> {
    const notificationEvent: Omit<NotificationEvent, 'type' | 'timestamp' | 'userId' | 'userName' | 'userRole'> = {
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
  static async sendVoiceCommandResult(
    userId: string,
    commandId: string,
    result: {
      success: boolean;
      message: string;
      actions?: Array<{
        type: string;
        target: string;
        data: any;
      }>;
    }
  ): Promise<boolean> {
    const voiceResult = {
      type: 'voice_command_result',
      commandId,
      result,
      timestamp: new Date().toISOString(),
      userId,
    };

    return socketManager.sendToUser(userId, 'voice_command_result', voiceResult);
  }

  /**
   * Analytics update helpers (for Phase 4)
   */
  static async broadcastAnalyticsUpdate(
    metric: string,
    value: number | string | Record<string, any>,
    filters?: Record<string, any>
  ): Promise<void> {
    const analyticsEvent = {
      type: 'analytics_update',
      metric,
      value,
      filters,
      timestamp: new Date().toISOString(),
    };

    // Only send to users who have subscribed to analytics updates
    // TODO: Implement analytics subscription management
    socketManager.broadcast('analytics_update', analyticsEvent);
  }
}

/**
 * WebSocket event builders for common scenarios
 */
export class EventBuilder {
  /**
   * Build task creation event
   */
  static taskCreated(task: any, createdBy: string): TaskUpdateEvent {
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
  static taskAssigned(taskId: string, assignedTo: string[], assignedBy: string): TaskUpdateEvent {
    return {
      type: 'task_updated',
      taskId,
      task: {} as any, // Minimal data for assignment event
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
  static channelMessage(
    channelId: string,
    message: string,
    userId: string,
    messageType: 'text' | 'file' | 'voice' = 'text'
  ): ChatMessageEvent {
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
  static userStatusUpdate(userId: string, status: 'online' | 'away' | 'busy' | 'offline'): UserStatusEvent {
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

export default { WebSocketUtils, EventBuilder };