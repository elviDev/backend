"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionEventManager = exports.ExecutionEventType = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
var ExecutionEventType;
(function (ExecutionEventType) {
    ExecutionEventType["COMMAND_START"] = "command_start";
    ExecutionEventType["STEP_EXECUTION"] = "step_execution";
    ExecutionEventType["COMMAND_COMPLETE"] = "command_complete";
    ExecutionEventType["COMMAND_FAILED"] = "command_failed";
    ExecutionEventType["ENTITY_CREATED"] = "entity_created";
    ExecutionEventType["ENTITY_UPDATED"] = "entity_updated";
    ExecutionEventType["USER_ASSIGNED"] = "user_assigned";
    ExecutionEventType["FILE_UPLOADED"] = "file_uploaded";
    ExecutionEventType["NOTIFICATION_SENT"] = "notification_sent";
})(ExecutionEventType || (exports.ExecutionEventType = ExecutionEventType = {}));
class ExecutionEventManager extends events_1.EventEmitter {
    socketManager;
    offlineMessageQueue = new Map();
    eventDeduplication = new Map();
    broadcastMetrics = [];
    maxQueueSize = 100;
    deduplicationTTL = 30000; // 30 seconds
    constructor(socketManager) {
        super();
        this.socketManager = socketManager;
        // Cleanup intervals
        setInterval(() => this.cleanupDeduplication(), 60000); // Every minute
        setInterval(() => this.cleanupOfflineQueue(), 300000); // Every 5 minutes
        // Listen for user connection events
        this.socketManager.on?.('user_connected', this.handleUserConnected.bind(this));
        this.socketManager.on?.('user_disconnected', this.handleUserDisconnected.bind(this));
        logger_1.logger.info('Execution Event Manager initialized');
    }
    /**
     * Broadcast command execution start event
     * Target: <100ms broadcasting latency
     */
    async broadcastCommandStart(commandId, userId, organizationId, affectedUsers, commandData) {
        const event = {
            id: `start_${commandId}_${Date.now()}`,
            type: ExecutionEventType.COMMAND_START,
            commandId,
            userId,
            organizationId,
            data: {
                transcript: commandData.transcript,
                intent: commandData.intent,
                actionCount: commandData.actionCount,
                estimatedDuration: commandData.estimatedDuration,
            },
            timestamp: new Date().toISOString(),
            priority: 'medium',
            targetUsers: affectedUsers,
            targetChannels: [],
            affectedEntities: [],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Broadcast step execution progress
     */
    async broadcastStepExecution(commandId, stepId, userId, organizationId, stepData, affectedUsers, affectedChannels = []) {
        const event = {
            id: `step_${commandId}_${stepId}_${Date.now()}`,
            type: ExecutionEventType.STEP_EXECUTION,
            commandId,
            userId,
            organizationId,
            data: {
                stepId,
                actionType: stepData.actionType,
                status: stepData.status,
                progress: stepData.progress,
                result: stepData.result,
            },
            timestamp: new Date().toISOString(),
            priority: 'medium',
            targetUsers: affectedUsers,
            targetChannels: affectedChannels,
            affectedEntities: stepData.affectedEntities || [],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Broadcast command completion
     */
    async broadcastCommandComplete(commandId, userId, organizationId, result, affectedUsers, affectedChannels = []) {
        const event = {
            id: `complete_${commandId}_${Date.now()}`,
            type: ExecutionEventType.COMMAND_COMPLETE,
            commandId,
            userId,
            organizationId,
            data: {
                success: result.success,
                executedActions: result.executedActions?.length || 0,
                failedActions: result.failedActions?.length || 0,
                totalExecutionTime: result.totalExecutionTime,
                summary: result.summary,
            },
            timestamp: new Date().toISOString(),
            priority: result.success ? 'medium' : 'high',
            targetUsers: affectedUsers,
            targetChannels: affectedChannels,
            affectedEntities: result.affectedEntities || [],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Broadcast command error/failure
     */
    async broadcastCommandError(commandId, userId, organizationId, error, affectedUsers, affectedChannels = []) {
        const event = {
            id: `error_${commandId}_${Date.now()}`,
            type: ExecutionEventType.COMMAND_FAILED,
            commandId,
            userId,
            organizationId,
            data: {
                error,
                timestamp: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
            priority: 'high',
            targetUsers: affectedUsers,
            targetChannels: affectedChannels,
            affectedEntities: [],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Broadcast entity creation (task, channel, etc.)
     */
    async broadcastEntityCreated(entityType, entityId, entityName, createdBy, organizationId, affectedUsers, affectedChannels = []) {
        const event = {
            id: `created_${entityType}_${entityId}_${Date.now()}`,
            type: ExecutionEventType.ENTITY_CREATED,
            commandId: `entity_creation_${Date.now()}`,
            userId: createdBy,
            organizationId,
            data: {
                entityType,
                entityId,
                entityName,
                createdBy,
            },
            timestamp: new Date().toISOString(),
            priority: 'medium',
            targetUsers: affectedUsers,
            targetChannels: affectedChannels,
            affectedEntities: [
                {
                    type: entityType,
                    id: entityId,
                    name: entityName,
                    action: 'created',
                },
            ],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Broadcast user assignment notifications
     */
    async broadcastUserAssigned(assignmentType, entityId, entityName, assignedUsers, assignedBy, organizationId) {
        const event = {
            id: `assigned_${assignmentType}_${entityId}_${Date.now()}`,
            type: ExecutionEventType.USER_ASSIGNED,
            commandId: `assignment_${Date.now()}`,
            userId: assignedBy,
            organizationId,
            data: {
                assignmentType,
                entityId,
                entityName,
                assignedUsers,
                assignedBy,
            },
            timestamp: new Date().toISOString(),
            priority: 'high',
            targetUsers: [...assignedUsers, assignedBy],
            targetChannels: [],
            affectedEntities: [
                {
                    type: assignmentType,
                    id: entityId,
                    name: entityName,
                    action: 'assigned',
                },
            ],
        };
        return await this.broadcastEvent(event);
    }
    /**
     * Core event broadcasting method
     * Target: <100ms average latency
     */
    async broadcastEvent(event) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Event deduplication
            if (this.isDuplicateEvent(event)) {
                logger_1.logger.debug('Duplicate event detected, skipping broadcast', {
                    eventId: event.id,
                    type: event.type,
                });
                return {
                    eventId: event.id,
                    targetCount: 0,
                    deliveredCount: 0,
                    queuedCount: 0,
                    failedCount: 0,
                    averageLatency: 0,
                    processingTime: perf_hooks_1.performance.now() - startTime,
                };
            }
            // Add to deduplication cache
            this.addToDeduplication(event);
            // Determine all target users (including channel members)
            const allTargetUsers = await this.resolveAllTargetUsers(event);
            let deliveredCount = 0;
            let queuedCount = 0;
            let failedCount = 0;
            const latencies = [];
            // Broadcast to online users
            for (const userId of allTargetUsers) {
                const userStartTime = perf_hooks_1.performance.now();
                if (this.socketManager.isUserConnected(userId)) {
                    try {
                        await this.socketManager.emitToUser(userId, 'execution_event', event);
                        const latency = perf_hooks_1.performance.now() - userStartTime;
                        latencies.push(latency);
                        deliveredCount++;
                    }
                    catch (error) {
                        logger_1.logger.warn('Failed to deliver event to online user', {
                            userId,
                            eventId: event.id,
                            error: error.message,
                        });
                        failedCount++;
                    }
                }
                else {
                    // Queue for offline users
                    this.queueOfflineMessage(userId, event);
                    queuedCount++;
                }
            }
            const processingTime = perf_hooks_1.performance.now() - startTime;
            const averageLatency = latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
            this.recordBroadcastMetrics(processingTime);
            // Log performance warning if target exceeded
            if (processingTime > 100) {
                logger_1.logger.warn('Event broadcasting exceeded 100ms target', {
                    eventId: event.id,
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    targetCount: allTargetUsers.length,
                    averageLatency: `${averageLatency.toFixed(2)}ms`,
                });
            }
            const result = {
                eventId: event.id,
                targetCount: allTargetUsers.length,
                deliveredCount,
                queuedCount,
                failedCount,
                averageLatency,
                processingTime,
            };
            logger_1.logger.debug('Event broadcast completed', {
                type: event.type,
                ...result,
            });
            // Emit broadcast metrics for monitoring
            this.emit('broadcast_complete', result);
            return result;
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('Event broadcasting failed', {
                eventId: event.id,
                type: event.type,
                error: error.message,
                processingTime: `${processingTime.toFixed(2)}ms`,
            });
            return {
                eventId: event.id,
                targetCount: 0,
                deliveredCount: 0,
                queuedCount: 0,
                failedCount: 1,
                averageLatency: 0,
                processingTime,
            };
        }
    }
    /**
     * Handle user connection - deliver queued messages
     */
    async handleUserConnected(userId) {
        const queuedMessages = this.offlineMessageQueue.get(userId);
        if (!queuedMessages || queuedMessages.length === 0) {
            return;
        }
        logger_1.logger.info('Delivering queued messages to connected user', {
            userId,
            messageCount: queuedMessages.length,
        });
        try {
            // Sort by priority and timestamp
            queuedMessages.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority; // Higher priority first
                }
                return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
            });
            // Deliver messages with a small delay between each
            for (let i = 0; i < queuedMessages.length; i++) {
                const message = queuedMessages[i];
                if (!message) {
                    continue;
                }
                try {
                    await this.socketManager.emitToUser(userId, 'execution_event', message.event);
                    // Small delay to prevent overwhelming the client
                    if (i < queuedMessages.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                    }
                }
                catch (error) {
                    logger_1.logger.warn('Failed to deliver queued message', {
                        userId,
                        eventId: message?.event?.id,
                        error: error.message,
                    });
                }
            }
            // Clear delivered messages
            this.offlineMessageQueue.delete(userId);
            logger_1.logger.debug('Queued messages delivered successfully', {
                userId,
                deliveredCount: queuedMessages.length,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to deliver queued messages', {
                userId,
                error: error.message,
            });
        }
    }
    /**
     * Handle user disconnection
     */
    handleUserDisconnected(userId) {
        logger_1.logger.debug('User disconnected from execution events', { userId });
    }
    /**
     * Resolve all target users including channel members
     */
    async resolveAllTargetUsers(event) {
        const targetUsers = new Set(event.targetUsers);
        // Add channel members for channel-targeted events
        for (const channelId of event.targetChannels) {
            try {
                const channelMembers = await this.getChannelMembers(channelId);
                channelMembers.forEach((memberId) => targetUsers.add(memberId));
            }
            catch (error) {
                logger_1.logger.warn('Failed to resolve channel members', {
                    channelId,
                    error: error.message,
                });
            }
        }
        return Array.from(targetUsers);
    }
    /**
     * Get channel members (simplified implementation)
     */
    async getChannelMembers(channelId) {
        // In a real implementation, this would query the database
        // For now, return empty array
        return [];
    }
    /**
     * Check for duplicate events
     */
    isDuplicateEvent(event) {
        const deduplicationKey = `${event.type}_${event.commandId}`;
        const existingEvents = this.eventDeduplication.get(deduplicationKey);
        return existingEvents?.has(event.id) || false;
    }
    /**
     * Add event to deduplication cache
     */
    addToDeduplication(event) {
        const deduplicationKey = `${event.type}_${event.commandId}`;
        if (!this.eventDeduplication.has(deduplicationKey)) {
            this.eventDeduplication.set(deduplicationKey, new Set());
        }
        this.eventDeduplication.get(deduplicationKey)?.add(event.id);
        // Set cleanup timeout
        setTimeout(() => {
            this.eventDeduplication.get(deduplicationKey)?.delete(event.id);
        }, this.deduplicationTTL);
    }
    /**
     * Queue message for offline user
     */
    queueOfflineMessage(userId, event) {
        if (!this.offlineMessageQueue.has(userId)) {
            this.offlineMessageQueue.set(userId, []);
        }
        const queue = this.offlineMessageQueue.get(userId);
        // Priority mapping
        const priorityMap = { low: 1, medium: 2, high: 3, critical: 4 };
        const message = {
            userId,
            event,
            queuedAt: new Date().toISOString(),
            priority: priorityMap[event.priority],
        };
        queue.push(message);
        // Maintain queue size limit
        if (queue.length > this.maxQueueSize) {
            // Remove oldest low-priority messages first
            queue.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority; // Lower priority first
                }
                return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
            });
            queue.splice(0, queue.length - this.maxQueueSize);
        }
    }
    /**
     * Cleanup deduplication cache
     */
    cleanupDeduplication() {
        let cleanedKeys = 0;
        for (const [key, eventIds] of this.eventDeduplication.entries()) {
            if (eventIds.size === 0) {
                this.eventDeduplication.delete(key);
                cleanedKeys++;
            }
        }
        if (cleanedKeys > 0) {
            logger_1.logger.debug('Cleaned up deduplication cache', { cleanedKeys });
        }
    }
    /**
     * Cleanup old offline messages
     */
    cleanupOfflineQueue() {
        let cleanedMessages = 0;
        const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
        for (const [userId, queue] of this.offlineMessageQueue.entries()) {
            const originalLength = queue.length;
            // Remove messages older than 24 hours
            const filteredQueue = queue.filter((msg) => new Date(msg.queuedAt).getTime() > cutoffTime);
            if (filteredQueue.length === 0) {
                this.offlineMessageQueue.delete(userId);
            }
            else {
                this.offlineMessageQueue.set(userId, filteredQueue);
            }
            cleanedMessages += originalLength - filteredQueue.length;
        }
        if (cleanedMessages > 0) {
            logger_1.logger.debug('Cleaned up offline message queue', { cleanedMessages });
        }
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
                p99BroadcastTime: 0,
                totalBroadcasts: 0,
                offlineQueueSize: Array.from(this.offlineMessageQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
                deduplicationCacheSize: this.eventDeduplication.size,
            };
        }
        const sorted = [...this.broadcastMetrics].sort((a, b) => a - b);
        const average = this.broadcastMetrics.reduce((sum, time) => sum + time, 0) / this.broadcastMetrics.length;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
        return {
            averageBroadcastTime: Math.round(average * 100) / 100,
            p95BroadcastTime: Math.round(p95 * 100) / 100,
            p99BroadcastTime: Math.round(p99 * 100) / 100,
            totalBroadcasts: this.broadcastMetrics.length,
            offlineQueueSize: Array.from(this.offlineMessageQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
            deduplicationCacheSize: this.eventDeduplication.size,
        };
    }
}
exports.ExecutionEventManager = ExecutionEventManager;
//# sourceMappingURL=ExecutionEventManager.js.map