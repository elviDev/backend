"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityUpdateBroadcaster = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class EntityUpdateBroadcaster extends events_1.EventEmitter {
    socketManager;
    pendingUpdates = new Map();
    updateBatches = new Map();
    broadcastMetrics = [];
    batchInterval = 100; // 100ms batching window
    maxBatchSize = 50;
    batchTimer;
    constructor(socketManager) {
        super();
        this.socketManager = socketManager;
        // Start batch processing
        this.startBatchProcessing();
        logger_1.logger.info('Entity Update Broadcaster initialized', {
            batchInterval: `${this.batchInterval}ms`,
            maxBatchSize: this.maxBatchSize
        });
    }
    /**
     * Queue entity update for broadcasting
     */
    async queueEntityUpdate(entityType, entityId, organizationId, changeType, changes, updatedBy, affectedUsers, previousValues, contextData) {
        const updateId = `update_${entityType}_${entityId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const entityUpdate = {
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
        logger_1.logger.debug('Entity update queued', {
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
    async broadcastImmediateUpdate(entityType, entityId, organizationId, changeType, changes, updatedBy, affectedUsers, previousValues, contextData) {
        const startTime = perf_hooks_1.performance.now();
        const updateId = await this.queueEntityUpdate(entityType, entityId, organizationId, changeType, changes, updatedBy, affectedUsers, previousValues, contextData);
        // Process batch immediately
        await this.processBatch(organizationId);
        const processingTime = perf_hooks_1.performance.now() - startTime;
        return {
            updateId,
            targetUsers: affectedUsers.length,
            successfulBroadcasts: affectedUsers.filter(userId => this.socketManager.isUserConnected(userId)).length,
            failedBroadcasts: affectedUsers.filter(userId => !this.socketManager.isUserConnected(userId)).length,
            processingTime
        };
    }
    /**
     * Broadcast file-specific updates with download URLs
     */
    async broadcastFileUpdate(fileId, organizationId, changeType, fileData, updatedBy, affectedUsers) {
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
        return await this.broadcastImmediateUpdate('file', fileId, organizationId, changeType, {
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            contentType: fileData.contentType,
            downloadUrl: fileData.downloadUrl,
            sharedWith: fileData.sharedWith
        }, updatedBy, allAffectedUsers, undefined, contextData);
    }
    /**
     * Start batch processing timer
     */
    startBatchProcessing() {
        this.batchTimer = setInterval(async () => {
            await this.processAllBatches();
        }, this.batchInterval);
    }
    /**
     * Process all pending batches
     */
    async processAllBatches() {
        const organizationIds = Array.from(this.pendingUpdates.keys());
        for (const organizationId of organizationIds) {
            await this.processBatch(organizationId);
        }
    }
    /**
     * Process updates batch for an organization
     */
    async processBatch(organizationId) {
        const updates = this.pendingUpdates.get(organizationId);
        if (!updates || updates.length === 0) {
            return;
        }
        const startTime = perf_hooks_1.performance.now();
        // Create batch
        const batchId = `batch_${organizationId}_${Date.now()}`;
        const targetUsers = [...new Set(updates.flatMap(update => update.affectedUsers))];
        const batch = {
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
            const processingTime = perf_hooks_1.performance.now() - startTime;
            this.recordBroadcastMetrics(processingTime);
            logger_1.logger.debug('Entity update batch processed', {
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
        }
        catch (error) {
            logger_1.logger.error('Failed to process entity update batch', {
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
    async broadcastBatch(batch) {
        const broadcastPromises = batch.targetUsers.map(async (userId) => {
            if (this.socketManager.isUserConnected(userId)) {
                try {
                    await this.socketManager.emitToUser(userId, 'entity_updates', {
                        batchId: batch.batchId,
                        organizationId: batch.organizationId,
                        updates: batch.updates.filter(update => update.affectedUsers.includes(userId)),
                        totalUpdates: batch.totalUpdates,
                        batchedAt: batch.batchedAt
                    });
                }
                catch (error) {
                    logger_1.logger.warn('Failed to broadcast to user', {
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
    getBatch(batchId) {
        return this.updateBatches.get(batchId) || null;
    }
    /**
     * Get pending updates for organization
     */
    getPendingUpdates(organizationId) {
        return this.pendingUpdates.get(organizationId) || [];
    }
    /**
     * Get recent batches for organization
     */
    getRecentBatches(organizationId, limit = 10) {
        return Array.from(this.updateBatches.values())
            .filter(batch => batch.organizationId === organizationId)
            .sort((a, b) => new Date(b.batchedAt).getTime() - new Date(a.batchedAt).getTime())
            .slice(0, limit);
    }
    /**
     * Record broadcast performance metrics
     */
    recordBroadcastMetrics(time) {
        this.broadcastMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.broadcastMetrics.length > 1000) {
            this.broadcastMetrics.shift();
        }
    }
    /**
     * Get performance statistics
     */
    getPerformanceStats() {
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
    cleanup() {
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
            logger_1.logger.debug('Cleaned up old entity update batches', { cleanedCount });
        }
    }
    /**
     * Stop batch processing and cleanup
     */
    destroy() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }
        this.cleanup();
        this.removeAllListeners();
        logger_1.logger.info('Entity Update Broadcaster destroyed');
    }
}
exports.EntityUpdateBroadcaster = EntityUpdateBroadcaster;
//# sourceMappingURL=EntityUpdateBroadcaster.js.map