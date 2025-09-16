/**
 * Notification Integration - Phase 2 Real-Time Notification System
 * Integrates real-time broadcasting with notification systems
 * 
 * Success Criteria:
 * - Push notification support for offline users
 * - Email notifications for important events
 * - In-app notification management
 * - Notification preference handling
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
import { SocketManager } from '../../websocket/SocketManager';

export interface NotificationPreferences {
  userId: string;
  organizationId: string;
  pushNotifications: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  commandCompletionNotifications: boolean;
  fileUploadNotifications: boolean;
  entityUpdateNotifications: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    timezone: string;
  };
  updatedAt: string;
}

export interface NotificationEvent {
  notificationId: string;
  userId: string;
  organizationId: string;
  type: 'command_complete' | 'file_uploaded' | 'entity_updated' | 'system_alert' | 'error';
  title: string;
  message: string;
  data: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  readAt?: string;
  deliveredAt?: string;
}

export interface DeliveryChannel {
  type: 'push' | 'email' | 'in_app' | 'websocket';
  enabled: boolean;
  metadata?: Record<string, any>;
}

export interface NotificationDelivery {
  notificationId: string;
  userId: string;
  channels: DeliveryChannel[];
  deliveredChannels: string[];
  failedChannels: string[];
  deliveryAttempts: number;
  lastAttemptAt: string;
  status: 'pending' | 'delivered' | 'failed' | 'expired';
}

export class NotificationIntegration extends EventEmitter {
  private socketManager: SocketManager;
  private notificationQueue: Map<string, NotificationEvent[]> = new Map();
  private userPreferences: Map<string, NotificationPreferences> = new Map();
  private pendingDeliveries: Map<string, NotificationDelivery> = new Map();
  private deliveryMetrics: number[] = [];
  private readonly maxRetries = 3;
  private readonly retryDelay = 60000; // 1 minute
  private processingTimer?: NodeJS.Timeout;
  
  constructor(socketManager: SocketManager) {
    super();
    
    this.socketManager = socketManager;
    
    // Start notification processing
    this.startNotificationProcessing();
    
    logger.info('Notification Integration initialized');
  }
  
  /**
   * Queue notification for delivery
   */
  async queueNotification(
    userId: string,
    organizationId: string,
    type: NotificationEvent['type'],
    title: string,
    message: string,
    data: Record<string, any> = {},
    priority: NotificationEvent['priority'] = 'medium'
  ): Promise<string> {
    const notificationId = `notif_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const notification: NotificationEvent = {
      notificationId,
      userId,
      organizationId,
      type,
      title,
      message,
      data,
      priority,
      createdAt: new Date().toISOString()
    };
    
    // Add to user's notification queue
    const userQueue = this.notificationQueue.get(userId) || [];
    userQueue.push(notification);
    this.notificationQueue.set(userId, userQueue);
    
    logger.debug('Notification queued', {
      notificationId,
      userId,
      type,
      priority,
      title
    });
    
    // Process immediately for high priority notifications
    if (priority === 'high' || priority === 'critical') {
      await this.processUserNotifications(userId);
    }
    
    return notificationId;
  }
  
  /**
   * Set user notification preferences
   */
  async setUserPreferences(preferences: NotificationPreferences): Promise<void> {
    this.userPreferences.set(preferences.userId, {
      ...preferences,
      updatedAt: new Date().toISOString()
    });
    
    logger.debug('User notification preferences updated', {
      userId: preferences.userId,
      organizationId: preferences.organizationId
    });
    
    this.emit('preferences_updated', preferences);
  }
  
  /**
   * Get user notification preferences
   */
  getUserPreferences(userId: string): NotificationPreferences | null {
    return this.userPreferences.get(userId) || this.getDefaultPreferences(userId);
  }
  
  /**
   * Get default notification preferences
   */
  private getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      organizationId: '',
      pushNotifications: true,
      emailNotifications: true,
      inAppNotifications: true,
      commandCompletionNotifications: true,
      fileUploadNotifications: true,
      entityUpdateNotifications: false,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC'
      },
      updatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Process notification for command completion
   */
  async notifyCommandComplete(
    commandId: string,
    userId: string,
    organizationId: string,
    result: any,
    affectedUsers: string[]
  ): Promise<void> {
    const preferences = this.getUserPreferences(userId);
    if (!preferences?.commandCompletionNotifications) {
      return;
    }
    
    // Notify command executor
    await this.queueNotification(
      userId,
      organizationId,
      'command_complete',
      'Voice Command Completed',
      `Your voice command has been executed successfully.`,
      {
        commandId,
        result,
        completedAt: new Date().toISOString()
      },
      'medium'
    );
    
    // Notify affected users if different from executor
    for (const affectedUserId of affectedUsers) {
      if (affectedUserId !== userId) {
        const affectedPreferences = this.getUserPreferences(affectedUserId);
        if (affectedPreferences?.entityUpdateNotifications) {
          await this.queueNotification(
            affectedUserId,
            organizationId,
            'entity_updated',
            'System Update',
            `A voice command has affected your workspace.`,
            {
              commandId,
              executedBy: userId,
              affectedEntities: result.affectedEntities || []
            },
            'low'
          );
        }
      }
    }
  }
  
  /**
   * Process notification for file upload
   */
  async notifyFileUploaded(
    fileId: string,
    fileName: string,
    userId: string,
    organizationId: string,
    fileSize: number,
    downloadUrl?: string,
    sharedWith: string[] = []
  ): Promise<void> {
    const preferences = this.getUserPreferences(userId);
    if (!preferences?.fileUploadNotifications) {
      return;
    }
    
    // Notify uploader
    await this.queueNotification(
      userId,
      organizationId,
      'file_uploaded',
      'File Upload Complete',
      `"${fileName}" has been uploaded successfully.`,
      {
        fileId,
        fileName,
        fileSize,
        downloadUrl,
        uploadedAt: new Date().toISOString()
      },
      'medium'
    );
    
    // Notify shared users
    for (const sharedUserId of sharedWith) {
      if (sharedUserId !== userId) {
        await this.queueNotification(
          sharedUserId,
          organizationId,
          'file_uploaded',
          'New File Shared',
          `"${fileName}" has been shared with you.`,
          {
            fileId,
            fileName,
            fileSize,
            downloadUrl,
            sharedBy: userId,
            sharedAt: new Date().toISOString()
          },
          'medium'
        );
      }
    }
  }
  
  /**
   * Process notification for system errors
   */
  async notifySystemError(
    userId: string,
    organizationId: string,
    errorType: string,
    errorMessage: string,
    contextData: Record<string, any> = {}
  ): Promise<void> {
    await this.queueNotification(
      userId,
      organizationId,
      'error',
      'System Error',
      errorMessage,
      {
        errorType,
        contextData,
        occurredAt: new Date().toISOString()
      },
      'high'
    );
  }
  
  /**
   * Start notification processing timer
   */
  private startNotificationProcessing(): void {
    this.processingTimer = setInterval(async () => {
      await this.processAllNotifications();
    }, 10000); // Process every 10 seconds
  }
  
  /**
   * Process all pending notifications
   */
  private async processAllNotifications(): Promise<void> {
    const userIds = Array.from(this.notificationQueue.keys());
    
    for (const userId of userIds) {
      await this.processUserNotifications(userId);
    }
  }
  
  /**
   * Process notifications for a specific user
   */
  private async processUserNotifications(userId: string): Promise<void> {
    const notifications = this.notificationQueue.get(userId);
    if (!notifications || notifications.length === 0) {
      return;
    }
    
    const preferences = this.getUserPreferences(userId);
    if (!preferences) {
      return;
    }
    
    const startTime = performance.now();
    
    try {
      // Check quiet hours
      if (this.isInQuietHours(preferences)) {
        logger.debug('Skipping notifications due to quiet hours', { userId });
        return;
      }
      
      // Process each notification
      for (const notification of notifications) {
        await this.deliverNotification(notification, preferences);
      }
      
      // Clear processed notifications
      this.notificationQueue.delete(userId);
      
      const processingTime = performance.now() - startTime;
      this.recordDeliveryMetrics(processingTime);
      
      logger.debug('User notifications processed', {
        userId,
        count: notifications.length,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
    } catch (error: any) {
      logger.error('Error processing user notifications', {
        userId,
        error: error.message
      });
    }
  }
  
  /**
   * Deliver notification through appropriate channels
   */
  private async deliverNotification(
    notification: NotificationEvent,
    preferences: NotificationPreferences
  ): Promise<void> {
    const deliveryChannels: DeliveryChannel[] = [];
    
    // Determine delivery channels based on preferences
    if (preferences.inAppNotifications) {
      deliveryChannels.push({ type: 'in_app', enabled: true });
    }
    
    // Check if user is online for WebSocket delivery
    if (this.socketManager.isUserConnected(notification.userId)) {
      deliveryChannels.push({ type: 'websocket', enabled: true });
    }
    
    // Add push notifications for offline users or high priority
    if (preferences.pushNotifications && 
        (!this.socketManager.isUserConnected(notification.userId) || 
         ['high', 'critical'].includes(notification.priority))) {
      deliveryChannels.push({ type: 'push', enabled: true });
    }
    
    // Add email for critical notifications
    if (preferences.emailNotifications && notification.priority === 'critical') {
      deliveryChannels.push({ type: 'email', enabled: true });
    }
    
    const delivery: NotificationDelivery = {
      notificationId: notification.notificationId,
      userId: notification.userId,
      channels: deliveryChannels,
      deliveredChannels: [],
      failedChannels: [],
      deliveryAttempts: 0,
      lastAttemptAt: new Date().toISOString(),
      status: 'pending'
    };
    
    this.pendingDeliveries.set(notification.notificationId, delivery);
    
    // Attempt delivery through each channel
    await this.attemptDelivery(notification, delivery);
  }
  
  /**
   * Attempt delivery through all channels
   */
  private async attemptDelivery(
    notification: NotificationEvent,
    delivery: NotificationDelivery
  ): Promise<void> {
    delivery.deliveryAttempts++;
    delivery.lastAttemptAt = new Date().toISOString();
    
    const deliveryPromises = delivery.channels.map(async (channel) => {
      if (!channel.enabled) return;
      
      try {
        await this.deliverThroughChannel(notification, channel);
        delivery.deliveredChannels.push(channel.type);
        
        logger.debug('Notification delivered through channel', {
          notificationId: notification.notificationId,
          channel: channel.type,
          userId: notification.userId
        });
        
      } catch (error: any) {
        delivery.failedChannels.push(channel.type);
        
        logger.warn('Failed to deliver notification through channel', {
          notificationId: notification.notificationId,
          channel: channel.type,
          userId: notification.userId,
          error: error.message
        });
      }
    });
    
    await Promise.allSettled(deliveryPromises);
    
    // Update delivery status
    if (delivery.deliveredChannels.length > 0) {
      delivery.status = 'delivered';
      notification.deliveredAt = new Date().toISOString();
      
      this.emit('notification_delivered', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        channels: delivery.deliveredChannels
      });
      
    } else if (delivery.deliveryAttempts >= this.maxRetries) {
      delivery.status = 'failed';
      
      this.emit('notification_failed', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        attempts: delivery.deliveryAttempts
      });
      
    } else {
      // Retry after delay
      setTimeout(() => {
        this.attemptDelivery(notification, delivery);
      }, this.retryDelay);
    }
  }
  
  /**
   * Deliver notification through specific channel
   */
  private async deliverThroughChannel(
    notification: NotificationEvent,
    channel: DeliveryChannel
  ): Promise<void> {
    switch (channel.type) {
      case 'websocket':
        await this.deliverWebSocket(notification);
        break;
        
      case 'in_app':
        await this.deliverInApp(notification);
        break;
        
      case 'push':
        await this.deliverPush(notification);
        break;
        
      case 'email':
        await this.deliverEmail(notification);
        break;
        
      default:
        throw new Error(`Unknown delivery channel: ${channel.type}`);
    }
  }
  
  /**
   * Deliver through WebSocket
   */
  private async deliverWebSocket(notification: NotificationEvent): Promise<void> {
    await this.socketManager.emitToUser(notification.userId, 'notification', {
      notificationId: notification.notificationId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      createdAt: notification.createdAt
    });
  }
  
  /**
   * Deliver as in-app notification
   */
  private async deliverInApp(notification: NotificationEvent): Promise<void> {
    // Store in-app notification (would typically be in database)
    // For now, we'll emit an event that the API can listen to
    this.emit('in_app_notification', notification);
  }
  
  /**
   * Deliver push notification
   */
  private async deliverPush(notification: NotificationEvent): Promise<void> {
    // Integration with push notification service (FCM, APNs, etc.)
    // For now, we'll emit an event that can be handled by push service
    this.emit('push_notification', notification);
  }
  
  /**
   * Deliver email notification
   */
  private async deliverEmail(notification: NotificationEvent): Promise<void> {
    // Integration with email service (SendGrid, SES, etc.)
    // For now, we'll emit an event that can be handled by email service
    this.emit('email_notification', notification);
  }
  
  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.enabled) {
      return false;
    }
    
    // Simple time check (would need proper timezone handling in production)
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= preferences.quietHours.startTime && 
           currentTime <= preferences.quietHours.endTime;
  }
  
  /**
   * Get user notifications (recent)
   */
  getUserNotifications(userId: string, limit: number = 20): NotificationEvent[] {
    // In production, this would query database
    // For now, return empty array as notifications are processed immediately
    return [];
  }
  
  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    // In production, update database
    this.emit('notification_read', {
      notificationId,
      userId,
      readAt: new Date().toISOString()
    });
  }
  
  /**
   * Record delivery performance metrics
   */
  private recordDeliveryMetrics(time: number): void {
    this.deliveryMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.deliveryMetrics.length > 1000) {
      this.deliveryMetrics.shift();
    }
  }
  
  /**
   * Get notification statistics
   */
  getNotificationStats(): {
    queuedNotifications: number;
    pendingDeliveries: number;
    averageDeliveryTime: number;
    deliverySuccessRate: number;
  } {
    const queuedNotifications = Array.from(this.notificationQueue.values())
      .reduce((sum, notifications) => sum + notifications.length, 0);
    
    const pendingDeliveries = this.pendingDeliveries.size;
    
    const averageDeliveryTime = this.deliveryMetrics.length > 0
      ? this.deliveryMetrics.reduce((sum, time) => sum + time, 0) / this.deliveryMetrics.length
      : 0;
    
    const totalDeliveries = Array.from(this.pendingDeliveries.values());
    const successfulDeliveries = totalDeliveries.filter(d => d.status === 'delivered').length;
    const deliverySuccessRate = totalDeliveries.length > 0 
      ? successfulDeliveries / totalDeliveries.length 
      : 1;
    
    return {
      queuedNotifications,
      pendingDeliveries,
      averageDeliveryTime: Math.round(averageDeliveryTime * 100) / 100,
      deliverySuccessRate: Math.round(deliverySuccessRate * 10000) / 10000
    };
  }
  
  /**
   * Cleanup old deliveries and metrics
   */
  cleanup(): void {
    const cutoffTime = Date.now() - (3600000 * 24); // 24 hours ago
    let cleanedCount = 0;
    
    for (const [notificationId, delivery] of this.pendingDeliveries.entries()) {
      const deliveryTime = new Date(delivery.lastAttemptAt).getTime();
      if (deliveryTime < cutoffTime && ['delivered', 'failed'].includes(delivery.status)) {
        this.pendingDeliveries.delete(notificationId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Cleaned up old notification deliveries', { cleanedCount });
    }
  }
  
  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }
    
    this.cleanup();
    this.removeAllListeners();
    
    logger.info('Notification Integration destroyed');
  }
}