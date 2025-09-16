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
        startTime: string;
        endTime: string;
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
export declare class NotificationIntegration extends EventEmitter {
    private socketManager;
    private notificationQueue;
    private userPreferences;
    private pendingDeliveries;
    private deliveryMetrics;
    private readonly maxRetries;
    private readonly retryDelay;
    private processingTimer?;
    constructor(socketManager: SocketManager);
    /**
     * Queue notification for delivery
     */
    queueNotification(userId: string, organizationId: string, type: NotificationEvent['type'], title: string, message: string, data?: Record<string, any>, priority?: NotificationEvent['priority']): Promise<string>;
    /**
     * Set user notification preferences
     */
    setUserPreferences(preferences: NotificationPreferences): Promise<void>;
    /**
     * Get user notification preferences
     */
    getUserPreferences(userId: string): NotificationPreferences | null;
    /**
     * Get default notification preferences
     */
    private getDefaultPreferences;
    /**
     * Process notification for command completion
     */
    notifyCommandComplete(commandId: string, userId: string, organizationId: string, result: any, affectedUsers: string[]): Promise<void>;
    /**
     * Process notification for file upload
     */
    notifyFileUploaded(fileId: string, fileName: string, userId: string, organizationId: string, fileSize: number, downloadUrl?: string, sharedWith?: string[]): Promise<void>;
    /**
     * Process notification for system errors
     */
    notifySystemError(userId: string, organizationId: string, errorType: string, errorMessage: string, contextData?: Record<string, any>): Promise<void>;
    /**
     * Start notification processing timer
     */
    private startNotificationProcessing;
    /**
     * Process all pending notifications
     */
    private processAllNotifications;
    /**
     * Process notifications for a specific user
     */
    private processUserNotifications;
    /**
     * Deliver notification through appropriate channels
     */
    private deliverNotification;
    /**
     * Attempt delivery through all channels
     */
    private attemptDelivery;
    /**
     * Deliver notification through specific channel
     */
    private deliverThroughChannel;
    /**
     * Deliver through WebSocket
     */
    private deliverWebSocket;
    /**
     * Deliver as in-app notification
     */
    private deliverInApp;
    /**
     * Deliver push notification
     */
    private deliverPush;
    /**
     * Deliver email notification
     */
    private deliverEmail;
    /**
     * Check if current time is in quiet hours
     */
    private isInQuietHours;
    /**
     * Get user notifications (recent)
     */
    getUserNotifications(userId: string, limit?: number): NotificationEvent[];
    /**
     * Mark notification as read
     */
    markNotificationRead(notificationId: string, userId: string): Promise<void>;
    /**
     * Record delivery performance metrics
     */
    private recordDeliveryMetrics;
    /**
     * Get notification statistics
     */
    getNotificationStats(): {
        queuedNotifications: number;
        pendingDeliveries: number;
        averageDeliveryTime: number;
        deliverySuccessRate: number;
    };
    /**
     * Cleanup old deliveries and metrics
     */
    cleanup(): void;
    /**
     * Destroy and cleanup
     */
    destroy(): void;
}
//# sourceMappingURL=NotificationIntegration.d.ts.map