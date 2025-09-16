/**
 * Entity Update Broadcaster - Phase 2 Real-Time Entity Broadcasting
 * Broadcasts real-time updates for entities affected by voice commands
 *
 * Success Criteria:
 * - Real-time entity change notifications
 * - Targeted broadcasting to affected users
 * - Entity change aggregation and batching
 * - Update conflict resolution
 */
import { EventEmitter } from 'events';
import { ISocketManager } from '../../websocket/types';
export interface EntityUpdate {
    updateId: string;
    entityType: 'channel' | 'task' | 'user' | 'project' | 'file';
    entityId: string;
    organizationId: string;
    changeType: 'created' | 'updated' | 'deleted' | 'status_changed' | 'shared';
    changes: Record<string, any>;
    previousValues?: Record<string, any> | undefined;
    updatedBy: string;
    timestamp: string;
    affectedUsers: string[];
    contextData?: Record<string, any> | undefined;
}
export interface EntityUpdateBatch {
    batchId: string;
    organizationId: string;
    updates: EntityUpdate[];
    totalUpdates: number;
    batchedAt: string;
    targetUsers: string[];
}
export interface BroadcastResult {
    updateId: string;
    targetUsers: number;
    successfulBroadcasts: number;
    failedBroadcasts: number;
    processingTime: number;
}
export declare class EntityUpdateBroadcaster extends EventEmitter {
    private socketManager;
    private pendingUpdates;
    private updateBatches;
    private broadcastMetrics;
    private readonly batchInterval;
    private readonly maxBatchSize;
    private batchTimer?;
    constructor(socketManager: ISocketManager);
    /**
     * Queue entity update for broadcasting
     */
    queueEntityUpdate(entityType: EntityUpdate['entityType'], entityId: string, organizationId: string, changeType: EntityUpdate['changeType'], changes: Record<string, any>, updatedBy: string, affectedUsers: string[], previousValues?: Record<string, any>, contextData?: Record<string, any>): Promise<string>;
    /**
     * Broadcast immediate entity update (bypasses batching)
     */
    broadcastImmediateUpdate(entityType: EntityUpdate['entityType'], entityId: string, organizationId: string, changeType: EntityUpdate['changeType'], changes: Record<string, any>, updatedBy: string, affectedUsers: string[], previousValues?: Record<string, any>, contextData?: Record<string, any>): Promise<BroadcastResult>;
    /**
     * Broadcast file-specific updates with download URLs
     */
    broadcastFileUpdate(fileId: string, organizationId: string, changeType: 'uploaded' | 'shared' | 'deleted' | 'download_ready', fileData: {
        fileName: string;
        fileSize: number;
        contentType: string;
        downloadUrl?: string;
        sharedWith?: string[];
        linkedEntities?: Array<{
            type: string;
            id: string;
        }>;
    }, updatedBy: string, affectedUsers: string[]): Promise<BroadcastResult>;
    /**
     * Start batch processing timer
     */
    private startBatchProcessing;
    /**
     * Process all pending batches
     */
    private processAllBatches;
    /**
     * Process updates batch for an organization
     */
    private processBatch;
    /**
     * Broadcast batch to target users
     */
    private broadcastBatch;
    /**
     * Get update batch by ID
     */
    getBatch(batchId: string): EntityUpdateBatch | null;
    /**
     * Get pending updates for organization
     */
    getPendingUpdates(organizationId: string): EntityUpdate[];
    /**
     * Get recent batches for organization
     */
    getRecentBatches(organizationId: string, limit?: number): EntityUpdateBatch[];
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
        totalBroadcasts: number;
        pendingUpdates: number;
        recentBatches: number;
    };
    /**
     * Cleanup old batches and metrics
     */
    cleanup(): void;
    /**
     * Stop batch processing and cleanup
     */
    destroy(): void;
}
//# sourceMappingURL=EntityUpdateBroadcaster.d.ts.map