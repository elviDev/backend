/**
 * Execution Event Manager - Phase 2 Real-Time Broadcasting
 * Manages real-time broadcasting of command execution events
 *
 * Success Criteria:
 * - Real-time execution broadcasting <100ms
 * - Targeted broadcasting to affected users only
 * - Event deduplication for multiple subscriptions
 * - Offline user message queuing
 */
import { EventEmitter } from 'events';
import { ISocketManager } from '../../websocket/types';
export interface ExecutionEvent {
    id: string;
    type: ExecutionEventType;
    commandId: string;
    userId: string;
    organizationId: string;
    data: any;
    timestamp: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    targetUsers: string[];
    targetChannels: string[];
    affectedEntities: AffectedEntity[];
}
export declare enum ExecutionEventType {
    COMMAND_START = "command_start",
    STEP_EXECUTION = "step_execution",
    COMMAND_COMPLETE = "command_complete",
    COMMAND_FAILED = "command_failed",
    ENTITY_CREATED = "entity_created",
    ENTITY_UPDATED = "entity_updated",
    USER_ASSIGNED = "user_assigned",
    FILE_UPLOADED = "file_uploaded",
    NOTIFICATION_SENT = "notification_sent"
}
export interface AffectedEntity {
    type: 'user' | 'channel' | 'task' | 'project' | 'file';
    id: string;
    name: string;
    action: 'created' | 'updated' | 'deleted' | 'assigned' | 'shared';
}
export interface BroadcastResult {
    eventId: string;
    targetCount: number;
    deliveredCount: number;
    queuedCount: number;
    failedCount: number;
    averageLatency: number;
    processingTime: number;
}
export interface OfflineMessage {
    userId: string;
    event: ExecutionEvent;
    queuedAt: string;
    priority: number;
}
export declare class ExecutionEventManager extends EventEmitter {
    private socketManager;
    private offlineMessageQueue;
    private eventDeduplication;
    private broadcastMetrics;
    private readonly maxQueueSize;
    private readonly deduplicationTTL;
    constructor(socketManager: ISocketManager);
    /**
     * Broadcast command execution start event
     * Target: <100ms broadcasting latency
     */
    broadcastCommandStart(commandId: string, userId: string, organizationId: string, affectedUsers: string[], commandData: any): Promise<BroadcastResult>;
    /**
     * Broadcast step execution progress
     */
    broadcastStepExecution(commandId: string, stepId: string, userId: string, organizationId: string, stepData: any, affectedUsers: string[], affectedChannels?: string[]): Promise<BroadcastResult>;
    /**
     * Broadcast command completion
     */
    broadcastCommandComplete(commandId: string, userId: string, organizationId: string, result: any, affectedUsers: string[], affectedChannels?: string[]): Promise<BroadcastResult>;
    /**
     * Broadcast command error/failure
     */
    broadcastCommandError(commandId: string, userId: string, organizationId: string, error: string, affectedUsers: string[], affectedChannels?: string[]): Promise<BroadcastResult>;
    /**
     * Broadcast entity creation (task, channel, etc.)
     */
    broadcastEntityCreated(entityType: string, entityId: string, entityName: string, createdBy: string, organizationId: string, affectedUsers: string[], affectedChannels?: string[]): Promise<BroadcastResult>;
    /**
     * Broadcast user assignment notifications
     */
    broadcastUserAssigned(assignmentType: string, entityId: string, entityName: string, assignedUsers: string[], assignedBy: string, organizationId: string): Promise<BroadcastResult>;
    /**
     * Core event broadcasting method
     * Target: <100ms average latency
     */
    private broadcastEvent;
    /**
     * Handle user connection - deliver queued messages
     */
    private handleUserConnected;
    /**
     * Handle user disconnection
     */
    private handleUserDisconnected;
    /**
     * Resolve all target users including channel members
     */
    private resolveAllTargetUsers;
    /**
     * Get channel members (simplified implementation)
     */
    private getChannelMembers;
    /**
     * Check for duplicate events
     */
    private isDuplicateEvent;
    /**
     * Add event to deduplication cache
     */
    private addToDeduplication;
    /**
     * Queue message for offline user
     */
    private queueOfflineMessage;
    /**
     * Cleanup deduplication cache
     */
    private cleanupDeduplication;
    /**
     * Cleanup old offline messages
     */
    private cleanupOfflineQueue;
    /**
     * Record broadcast performance metrics
     */
    private recordBroadcastMetrics;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        averageBroadcastTime: number;
        p95BroadcastTime: number;
        p99BroadcastTime: number;
        totalBroadcasts: number;
        offlineQueueSize: number;
        deduplicationCacheSize: number;
    };
}
//# sourceMappingURL=ExecutionEventManager.d.ts.map