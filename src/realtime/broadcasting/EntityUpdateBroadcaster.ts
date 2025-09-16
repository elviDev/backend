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
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
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

export class EntityUpdateBroadcaster extends EventEmitter {
  private socketManager: ISocketManager;
  private pendingUpdates: Map<string, EntityUpdate[]> = new Map();
  private updateBatches: Map<string, EntityUpdateBatch> = new Map();
  private broadcastMetrics: number[] = [];
  private readonly batchInterval = 100; // 100ms batching window
  private readonly maxBatchSize = 50;
  private batchTimer?: NodeJS.Timeout;
  
  constructor(socketManager: ISocketManager) {
    super();
    
    this.socketManager = socketManager;
    
    // Start batch processing
    this.startBatchProcessing();
    
    logger.info('Entity Update Broadcaster initialized', {
      batchInterval: `${this.batchInterval}ms`,
      maxBatchSize: this.maxBatchSize
    });
  }
  
  /**
   * Queue entity update for broadcasting
   */
  async queueEntityUpdate(
    entityType: EntityUpdate['entityType'],
    entityId: string,
    organizationId: string,
    changeType: EntityUpdate['changeType'],
    changes: Record<string, any>,
    updatedBy: string,
    affectedUsers: string[],
    previousValues?: Record<string, any>,
    contextData?: Record<string, any>
  ): Promise<string> {
    const updateId = `update_${entityType}_${entityId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const entityUpdate: EntityUpdate = {
      updateId,
      entityType,
      entityId,
      organizationId,
      changeType,
      changes,
      previousValues,
      updatedBy,
      timestamp: new Date().toISOString(),
      affectedUsers,
      contextData
    };
    
    // Group by organization for batching
    const orgUpdates = this.pendingUpdates.get(organizationId) || [];
    orgUpdates.push(entityUpdate);
    this.pendingUpdates.set(organizationId, orgUpdates);
    
    logger.debug('Entity update queued', {
      updateId,
      entityType,
      entityId,
      changeType,
      affectedUsers: affectedUsers.length,
      organizationId
    });
    
    // Trigger immediate batch processing if batch is full
    if (orgUpdates.length >= this.maxBatchSize) {
      await this.processBatch(organizationId);
    }
    
    return updateId;
  }
  
  /**
   * Broadcast immediate entity update (bypasses batching)
   */
  async broadcastImmediateUpdate(
    entityType: EntityUpdate['entityType'],
    entityId: string,
    organizationId: string,
    changeType: EntityUpdate['changeType'],
    changes: Record<string, any>,
    updatedBy: string,
    affectedUsers: string[],
    previousValues?: Record<string, any>,
    contextData?: Record<string, any>
  ): Promise<BroadcastResult> {
    const startTime = performance.now();
    
    const updateId = await this.queueEntityUpdate(
      entityType,
      entityId,
      organizationId,
      changeType,
      changes,
      updatedBy,
      affectedUsers,
      previousValues,
      contextData
    );
    
    // Process batch immediately
    await this.processBatch(organizationId);
    
    const processingTime = performance.now() - startTime;
    
    return {
      updateId,
      targetUsers: affectedUsers.length,
      successfulBroadcasts: affectedUsers.filter(userId => 
        this.socketManager.isUserConnected(userId)
      ).length,
      failedBroadcasts: affectedUsers.filter(userId => 
        !this.socketManager.isUserConnected(userId)
      ).length,
      processingTime
    };
  }
  
  /**
   * Broadcast file-specific updates with download URLs
   */
  async broadcastFileUpdate(
    fileId: string,
    organizationId: string,
    changeType: 'uploaded' | 'shared' | 'deleted' | 'download_ready',
    fileData: {
      fileName: string;
      fileSize: number;
      contentType: string;
      downloadUrl?: string;
      sharedWith?: string[];
      linkedEntities?: Array<{ type: string; id: string }>;
    },
    updatedBy: string,
    affectedUsers: string[]
  ): Promise<BroadcastResult> {
    const contextData = {
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      contentType: fileData.contentType,
      downloadUrl: fileData.downloadUrl,
      linkedEntities: fileData.linkedEntities || []
    };
    
    // Add shared users to affected users if it's a sharing update
    const allAffectedUsers = changeType === 'shared' && fileData.sharedWith 
      ? [...new Set([...affectedUsers, ...fileData.sharedWith])]
      : affectedUsers;
    
    return await this.broadcastImmediateUpdate(
      'file',
      fileId,
      organizationId,
      changeType as EntityUpdate['changeType'],
      {
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        contentType: fileData.contentType,
        downloadUrl: fileData.downloadUrl,
        sharedWith: fileData.sharedWith
      },
      updatedBy,
      allAffectedUsers,
      undefined,
      contextData
    );
  }
  
  /**
   * Start batch processing timer
   */
  private startBatchProcessing(): void {
    this.batchTimer = setInterval(async () => {
      await this.processAllBatches();
    }, this.batchInterval);
  }
  
  /**
   * Process all pending batches
   */
  private async processAllBatches(): Promise<void> {
    const organizationIds = Array.from(this.pendingUpdates.keys());
    
    for (const organizationId of organizationIds) {
      await this.processBatch(organizationId);
    }
  }
  
  /**
   * Process updates batch for an organization
   */
  private async processBatch(organizationId: string): Promise<void> {
    const updates = this.pendingUpdates.get(organizationId);
    if (!updates || updates.length === 0) {
      return;
    }
    
    const startTime = performance.now();
    
    // Create batch
    const batchId = `batch_${organizationId}_${Date.now()}`;
    const targetUsers = [...new Set(updates.flatMap(update => update.affectedUsers))];
    
    const batch: EntityUpdateBatch = {
      batchId,
      organizationId,
      updates,
      totalUpdates: updates.length,
      batchedAt: new Date().toISOString(),
      targetUsers
    };
    
    this.updateBatches.set(batchId, batch);
    
    // Clear pending updates for this organization
    this.pendingUpdates.delete(organizationId);
    
    try {
      // Broadcast batch to all target users
      await this.broadcastBatch(batch);
      
      const processingTime = performance.now() - startTime;
      this.recordBroadcastMetrics(processingTime);
      
      logger.debug('Entity update batch processed', {
        batchId,
        organizationId,
        totalUpdates: updates.length,
        targetUsers: targetUsers.length,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      this.emit('batch_processed', {
        batchId,
        organizationId,
        totalUpdates: updates.length,
        targetUsers: targetUsers.length,
        processingTime
      });
      
    } catch (error: any) {
      logger.error('Failed to process entity update batch', {
        batchId,
        organizationId,
        error: error.message
      });
      
      this.emit('batch_error', {
        batchId,
        organizationId,
        error: error.message
      });
    }
  }
  
  /**
   * Broadcast batch to target users
   */
  private async broadcastBatch(batch: EntityUpdateBatch): Promise<void> {
    const broadcastPromises = batch.targetUsers.map(async (userId) => {
      if (this.socketManager.isUserConnected(userId)) {
        try {
          await this.socketManager.emitToUser(userId, 'entity_updates', {
            batchId: batch.batchId,
            organizationId: batch.organizationId,
            updates: batch.updates.filter(update => 
              update.affectedUsers.includes(userId)
            ),
            totalUpdates: batch.totalUpdates,
            batchedAt: batch.batchedAt
          });
        } catch (error: any) {
          logger.warn('Failed to broadcast to user', {
            userId,
            batchId: batch.batchId,
            error: error.message
          });
        }
      }
    });
    
    await Promise.allSettled(broadcastPromises);
  }
  
  /**
   * Get update batch by ID
   */
  getBatch(batchId: string): EntityUpdateBatch | null {
    return this.updateBatches.get(batchId) || null;
  }
  
  /**
   * Get pending updates for organization
   */
  getPendingUpdates(organizationId: string): EntityUpdate[] {
    return this.pendingUpdates.get(organizationId) || [];
  }
  
  /**
   * Get recent batches for organization
   */
  getRecentBatches(organizationId: string, limit: number = 10): EntityUpdateBatch[] {
    return Array.from(this.updateBatches.values())
      .filter(batch => batch.organizationId === organizationId)
      .sort((a, b) => new Date(b.batchedAt).getTime() - new Date(a.batchedAt).getTime())
      .slice(0, limit);
  }
  
  /**
   * Record broadcast performance metrics
   */
  private recordBroadcastMetrics(time: number): void {
    this.broadcastMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.broadcastMetrics.length > 1000) {
      this.broadcastMetrics.shift();
    }
  }
  
  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    averageBroadcastTime: number;
    p95BroadcastTime: number;
    totalBroadcasts: number;
    pendingUpdates: number;
    recentBatches: number;
  } {
    if (this.broadcastMetrics.length === 0) {
      return {
        averageBroadcastTime: 0,
        p95BroadcastTime: 0,
        totalBroadcasts: 0,
        pendingUpdates: Array.from(this.pendingUpdates.values()).reduce((sum, updates) => sum + updates.length, 0),
        recentBatches: this.updateBatches.size
      };
    }
    
    const sorted = [...this.broadcastMetrics].sort((a, b) => a - b);
    const average = this.broadcastMetrics.reduce((sum, time) => sum + time, 0) / this.broadcastMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    
    return {
      averageBroadcastTime: Math.round(average * 100) / 100,
      p95BroadcastTime: Math.round(p95 * 100) / 100,
      totalBroadcasts: this.broadcastMetrics.length,
      pendingUpdates: Array.from(this.pendingUpdates.values()).reduce((sum, updates) => sum + updates.length, 0),
      recentBatches: this.updateBatches.size
    };
  }
  
  /**
   * Cleanup old batches and metrics
   */
  cleanup(): void {
    const cutoffTime = Date.now() - (3600000 * 2); // 2 hours ago
    let cleanedCount = 0;
    
    for (const [batchId, batch] of this.updateBatches.entries()) {
      const batchTime = new Date(batch.batchedAt).getTime();
      if (batchTime < cutoffTime) {
        this.updateBatches.delete(batchId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Cleaned up old entity update batches', { cleanedCount });
    }
  }
  
  /**
   * Stop batch processing and cleanup
   */
  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    this.cleanup();
    this.removeAllListeners();
    
    logger.info('Entity Update Broadcaster destroyed');
  }
}