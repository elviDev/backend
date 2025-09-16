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
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
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

export enum ExecutionEventType {
  COMMAND_START = 'command_start',
  STEP_EXECUTION = 'step_execution',
  COMMAND_COMPLETE = 'command_complete',
  COMMAND_FAILED = 'command_failed',
  ENTITY_CREATED = 'entity_created',
  ENTITY_UPDATED = 'entity_updated',
  USER_ASSIGNED = 'user_assigned',
  FILE_UPLOADED = 'file_uploaded',
  NOTIFICATION_SENT = 'notification_sent',
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

export class ExecutionEventManager extends EventEmitter {
  private socketManager: ISocketManager;
  private offlineMessageQueue: Map<string, OfflineMessage[]> = new Map();
  private eventDeduplication: Map<string, Set<string>> = new Map();
  private broadcastMetrics: number[] = [];
  private readonly maxQueueSize = 100;
  private readonly deduplicationTTL = 30000; // 30 seconds

  constructor(socketManager: ISocketManager) {
    super();

    this.socketManager = socketManager;

    // Cleanup intervals
    setInterval(() => this.cleanupDeduplication(), 60000); // Every minute
    setInterval(() => this.cleanupOfflineQueue(), 300000); // Every 5 minutes

    // Listen for user connection events
    this.socketManager.on?.('user_connected', this.handleUserConnected.bind(this));
    this.socketManager.on?.('user_disconnected', this.handleUserDisconnected.bind(this));

    logger.info('Execution Event Manager initialized');
  }

  /**
   * Broadcast command execution start event
   * Target: <100ms broadcasting latency
   */
  async broadcastCommandStart(
    commandId: string,
    userId: string,
    organizationId: string,
    affectedUsers: string[],
    commandData: any
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
  async broadcastStepExecution(
    commandId: string,
    stepId: string,
    userId: string,
    organizationId: string,
    stepData: any,
    affectedUsers: string[],
    affectedChannels: string[] = []
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
  async broadcastCommandComplete(
    commandId: string,
    userId: string,
    organizationId: string,
    result: any,
    affectedUsers: string[],
    affectedChannels: string[] = []
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
  async broadcastCommandError(
    commandId: string,
    userId: string,
    organizationId: string,
    error: string,
    affectedUsers: string[],
    affectedChannels: string[] = []
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
  async broadcastEntityCreated(
    entityType: string,
    entityId: string,
    entityName: string,
    createdBy: string,
    organizationId: string,
    affectedUsers: string[],
    affectedChannels: string[] = []
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
          type: entityType as any,
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
  async broadcastUserAssigned(
    assignmentType: string,
    entityId: string,
    entityName: string,
    assignedUsers: string[],
    assignedBy: string,
    organizationId: string
  ): Promise<BroadcastResult> {
    const event: ExecutionEvent = {
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
          type: assignmentType as any,
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
  private async broadcastEvent(event: ExecutionEvent): Promise<BroadcastResult> {
    const startTime = performance.now();

    try {
      // Event deduplication
      if (this.isDuplicateEvent(event)) {
        logger.debug('Duplicate event detected, skipping broadcast', {
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
          processingTime: performance.now() - startTime,
        };
      }

      // Add to deduplication cache
      this.addToDeduplication(event);

      // Determine all target users (including channel members)
      const allTargetUsers = await this.resolveAllTargetUsers(event);

      let deliveredCount = 0;
      let queuedCount = 0;
      let failedCount = 0;
      const latencies: number[] = [];

      // Broadcast to online users
      for (const userId of allTargetUsers) {
        const userStartTime = performance.now();

        if (this.socketManager.isUserConnected(userId)) {
          try {
            await this.socketManager.emitToUser(userId, 'execution_event', event);

            const latency = performance.now() - userStartTime;
            latencies.push(latency);
            deliveredCount++;
          } catch (error: any) {
            logger.warn('Failed to deliver event to online user', {
              userId,
              eventId: event.id,
              error: error.message,
            });
            failedCount++;
          }
        } else {
          // Queue for offline users
          this.queueOfflineMessage(userId, event);
          queuedCount++;
        }
      }

      const processingTime = performance.now() - startTime;
      const averageLatency =
        latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;

      this.recordBroadcastMetrics(processingTime);

      // Log performance warning if target exceeded
      if (processingTime > 100) {
        logger.warn('Event broadcasting exceeded 100ms target', {
          eventId: event.id,
          processingTime: `${processingTime.toFixed(2)}ms`,
          targetCount: allTargetUsers.length,
          averageLatency: `${averageLatency.toFixed(2)}ms`,
        });
      }

      const result: BroadcastResult = {
        eventId: event.id,
        targetCount: allTargetUsers.length,
        deliveredCount,
        queuedCount,
        failedCount,
        averageLatency,
        processingTime,
      };

      logger.debug('Event broadcast completed', {
        type: event.type,
        ...result,
      });

      // Emit broadcast metrics for monitoring
      this.emit('broadcast_complete', result);

      return result;
    } catch (error: any) {
      const processingTime = performance.now() - startTime;

      logger.error('Event broadcasting failed', {
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
  private async handleUserConnected(userId: string): Promise<void> {
    const queuedMessages = this.offlineMessageQueue.get(userId);

    if (!queuedMessages || queuedMessages.length === 0) {
      return;
    }

    logger.info('Delivering queued messages to connected user', {
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
        } catch (error: any) {
          logger.warn('Failed to deliver queued message', {
            userId,
            eventId: message?.event?.id,
            error: error.message,
          });
        }
      }

      // Clear delivered messages
      this.offlineMessageQueue.delete(userId);

      logger.debug('Queued messages delivered successfully', {
        userId,
        deliveredCount: queuedMessages.length,
      });
    } catch (error: any) {
      logger.error('Failed to deliver queued messages', {
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Handle user disconnection
   */
  private handleUserDisconnected(userId: string): void {
    logger.debug('User disconnected from execution events', { userId });
  }

  /**
   * Resolve all target users including channel members
   */
  private async resolveAllTargetUsers(event: ExecutionEvent): Promise<string[]> {
    const targetUsers = new Set<string>(event.targetUsers);

    // Add channel members for channel-targeted events
    for (const channelId of event.targetChannels) {
      try {
        const channelMembers = await this.getChannelMembers(channelId);
        channelMembers.forEach((memberId) => targetUsers.add(memberId));
      } catch (error: any) {
        logger.warn('Failed to resolve channel members', {
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
  private async getChannelMembers(channelId: string): Promise<string[]> {
    // In a real implementation, this would query the database
    // For now, return empty array
    return [];
  }

  /**
   * Check for duplicate events
   */
  private isDuplicateEvent(event: ExecutionEvent): boolean {
    const deduplicationKey = `${event.type}_${event.commandId}`;
    const existingEvents = this.eventDeduplication.get(deduplicationKey);

    return existingEvents?.has(event.id) || false;
  }

  /**
   * Add event to deduplication cache
   */
  private addToDeduplication(event: ExecutionEvent): void {
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
  private queueOfflineMessage(userId: string, event: ExecutionEvent): void {
    if (!this.offlineMessageQueue.has(userId)) {
      this.offlineMessageQueue.set(userId, []);
    }

    const queue = this.offlineMessageQueue.get(userId)!;

    // Priority mapping
    const priorityMap = { low: 1, medium: 2, high: 3, critical: 4 };

    const message: OfflineMessage = {
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
  private cleanupDeduplication(): void {
    let cleanedKeys = 0;

    for (const [key, eventIds] of this.eventDeduplication.entries()) {
      if (eventIds.size === 0) {
        this.eventDeduplication.delete(key);
        cleanedKeys++;
      }
    }

    if (cleanedKeys > 0) {
      logger.debug('Cleaned up deduplication cache', { cleanedKeys });
    }
  }

  /**
   * Cleanup old offline messages
   */
  private cleanupOfflineQueue(): void {
    let cleanedMessages = 0;
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    for (const [userId, queue] of this.offlineMessageQueue.entries()) {
      const originalLength = queue.length;

      // Remove messages older than 24 hours
      const filteredQueue = queue.filter((msg) => new Date(msg.queuedAt).getTime() > cutoffTime);

      if (filteredQueue.length === 0) {
        this.offlineMessageQueue.delete(userId);
      } else {
        this.offlineMessageQueue.set(userId, filteredQueue);
      }

      cleanedMessages += originalLength - filteredQueue.length;
    }

    if (cleanedMessages > 0) {
      logger.debug('Cleaned up offline message queue', { cleanedMessages });
    }
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
    p99BroadcastTime: number;
    totalBroadcasts: number;
    offlineQueueSize: number;
    deduplicationCacheSize: number;
  } {
    if (this.broadcastMetrics.length === 0) {
      return {
        averageBroadcastTime: 0,
        p95BroadcastTime: 0,
        p99BroadcastTime: 0,
        totalBroadcasts: 0,
        offlineQueueSize: Array.from(this.offlineMessageQueue.values()).reduce(
          (sum, queue) => sum + queue.length,
          0
        ),
        deduplicationCacheSize: this.eventDeduplication.size,
      };
    }

    const sorted = [...this.broadcastMetrics].sort((a, b) => a - b);
    const average =
      this.broadcastMetrics.reduce((sum, time) => sum + time, 0) / this.broadcastMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    return {
      averageBroadcastTime: Math.round(average * 100) / 100,
      p95BroadcastTime: Math.round(p95 * 100) / 100,
      p99BroadcastTime: Math.round(p99 * 100) / 100,
      totalBroadcasts: this.broadcastMetrics.length,
      offlineQueueSize: Array.from(this.offlineMessageQueue.values()).reduce(
        (sum, queue) => sum + queue.length,
        0
      ),
      deduplicationCacheSize: this.eventDeduplication.size,
    };
  }
}
