/**
 * Enhanced Socket Manager - Phase 2 Real-Time WebSocket Management
 * Advanced WebSocket management with voice command event handling
 *
 * Success Criteria:
 * - Connection management with automatic reconnection
 * - Event routing and middleware support
 * - Voice command event handling
 * - Connection persistence and recovery
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { ISocketManager } from './types';
import { ExecutionEventManager } from '../realtime/broadcasting/ExecutionEventManager';
import { ProgressBroadcaster } from '../realtime/broadcasting/ProgressBroadcaster';
import { EntityUpdateBroadcaster } from '../realtime/broadcasting/EntityUpdateBroadcaster';

export interface SocketConnection {
  socketId: string;
  userId: string;
  organizationId: string;
  connectionTime: number;
  lastActivity: number;
  subscriptions: Set<string>;
  metadata: Record<string, any>;
  isActive: boolean;
  reconnectCount: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  averageConnectionDuration: number;
  reconnectionRate: number;
  eventThroughput: number;
  errorRate: number;
}

export interface VoiceCommandEvent {
  eventType: 'command_start' | 'command_progress' | 'command_complete' | 'command_error';
  commandId: string;
  userId: string;
  organizationId: string;
  data: any;
  timestamp: string;
}

export class EnhancedSocketManager extends EventEmitter implements ISocketManager {
  private io: SocketIOServer;
  private connections: Map<string, SocketConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private executionEventManager: ExecutionEventManager;
  private progressBroadcaster: ProgressBroadcaster;
  private entityUpdateBroadcaster: EntityUpdateBroadcaster;
  private connectionMetrics: number[] = [];
  private eventMetrics: number[] = [];
  private errorCount = 0;
  private readonly heartbeatInterval = 30000; // 30 seconds
  private readonly connectionTimeout = 300000; // 5 minutes
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(io: SocketIOServer) {
    super();

    this.io = io;

    // Initialize broadcasting components
    this.executionEventManager = new ExecutionEventManager(this);
    this.progressBroadcaster = new ProgressBroadcaster(this);
    this.entityUpdateBroadcaster = new EntityUpdateBroadcaster(this);

    this.setupSocketHandlers();
    this.startHeartbeat();
    this.startMetricsCollection();

    logger.info('Enhanced Socket Manager initialized');
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private async handleConnection(socket: Socket): Promise<void> {
    const startTime = performance.now();

    try {
      // Extract user info from socket (assuming it's added by auth middleware)
      const userId = socket.data.userId;
      const organizationId = socket.data.organizationId;

      if (!userId || !organizationId) {
        logger.warn('Socket connection without proper authentication', {
          socketId: socket.id,
        });
        socket.disconnect();
        return;
      }

      // Create connection record
      const connection: SocketConnection = {
        socketId: socket.id,
        userId,
        organizationId,
        connectionTime: startTime,
        lastActivity: startTime,
        subscriptions: new Set(),
        metadata: socket.data.metadata || {},
        isActive: true,
        reconnectCount: socket.data.reconnectCount || 0,
      };

      this.connections.set(socket.id, connection);

      // Track user connections
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(socket.id);

      // Setup socket event handlers
      this.setupSocketEventHandlers(socket);

      // Join organization room
      socket.join(`org:${organizationId}`);
      socket.join(`user:${userId}`);

      logger.info('Socket connected', {
        socketId: socket.id,
        userId,
        organizationId,
        reconnectCount: connection.reconnectCount,
      });

      this.emit('connection_established', {
        socketId: socket.id,
        userId,
        organizationId,
        connectionTime: startTime,
      });

      // Send connection acknowledgment
      socket.emit('connection_ack', {
        socketId: socket.id,
        serverTime: new Date().toISOString(),
        features: ['voice_commands', 'real_time_updates', 'progress_tracking'],
      });
    } catch (error: any) {
      this.errorCount++;
      logger.error('Error handling socket connection', {
        socketId: socket.id,
        error: error.message,
      });
      socket.disconnect();
    }
  }

  /**
   * Setup event handlers for a socket
   */
  private setupSocketEventHandlers(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Voice command events
    socket.on('voice_command_start', (data) => {
      this.handleVoiceCommandEvent(socket, 'command_start', data);
    });

    socket.on('voice_command_progress', (data) => {
      this.handleVoiceCommandEvent(socket, 'command_progress', data);
    });

    socket.on('voice_command_complete', (data) => {
      this.handleVoiceCommandEvent(socket, 'command_complete', data);
    });

    socket.on('voice_command_error', (data) => {
      this.handleVoiceCommandEvent(socket, 'command_error', data);
    });

    // Subscription management
    socket.on('subscribe', (channels: string[]) => {
      this.handleSubscription(socket, channels);
    });

    socket.on('unsubscribe', (channels: string[]) => {
      this.handleUnsubscription(socket, channels);
    });

    // Progress tracking
    socket.on('request_progress', (commandId: string) => {
      this.handleProgressRequest(socket, commandId);
    });

    // Entity updates
    socket.on('request_entity_updates', (entityIds: string[]) => {
      this.handleEntityUpdateRequest(socket, entityIds);
    });

    // Heartbeat
    socket.on('ping', () => {
      connection.lastActivity = performance.now();
      socket.emit('pong', { serverTime: Date.now() });
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Error handling
    socket.on('error', (error) => {
      this.handleSocketError(socket, error);
    });
  }

  /**
   * Handle voice command events
   */
  private async handleVoiceCommandEvent(
    socket: Socket,
    eventType: VoiceCommandEvent['eventType'],
    data: any
  ): Promise<void> {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    const startTime = performance.now();

    try {
      const voiceCommandEvent: VoiceCommandEvent = {
        eventType,
        commandId: data.commandId,
        userId: connection.userId,
        organizationId: connection.organizationId,
        data,
        timestamp: new Date().toISOString(),
      };

      // Update last activity
      connection.lastActivity = performance.now();

      // Route to appropriate handler based on event type
      switch (eventType) {
        case 'command_start':
          await this.executionEventManager.broadcastCommandStart(
            data.commandId,
            connection.userId,
            connection.organizationId,
            data.affectedUsers || [],
            data // Pass the commandData as the fifth argument
          );
          break;

        case 'command_progress':
          if (data.sessionId && data.stepId) {
            await this.progressBroadcaster.updateStepProgress(
              data.sessionId,
              data.stepId,
              data.progress,
              data.status,
              data.result,
              data.error
            );
          }
          break;

        case 'command_complete':
          await this.executionEventManager.broadcastCommandComplete(
            data.commandId,
            connection.userId,
            connection.organizationId,
            data.result,
            data.affectedUsers || []
          );
          break;

        case 'command_error':
          await this.executionEventManager.broadcastCommandError(
            data.commandId,
            connection.userId,
            connection.organizationId,
            data.error,
            data.affectedUsers || []
          );
          break;
      }

      const processingTime = performance.now() - startTime;
      this.recordEventMetrics(processingTime);

      logger.debug('Voice command event processed', {
        eventType,
        commandId: data.commandId,
        userId: connection.userId,
        processingTime: `${processingTime.toFixed(2)}ms`,
      });

      this.emit('voice_command_event', voiceCommandEvent);
    } catch (error: any) {
      this.errorCount++;
      logger.error('Error handling voice command event', {
        socketId: socket.id,
        eventType,
        error: error.message,
      });

      socket.emit('event_error', {
        eventType,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle channel subscription
   */
  private handleSubscription(socket: Socket, channels: string[]): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    for (const channel of channels) {
      connection.subscriptions.add(channel);
      socket.join(channel);
    }

    logger.debug('Socket subscribed to channels', {
      socketId: socket.id,
      channels,
      totalSubscriptions: connection.subscriptions.size,
    });
  }

  /**
   * Handle channel unsubscription
   */
  private handleUnsubscription(socket: Socket, channels: string[]): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    for (const channel of channels) {
      connection.subscriptions.delete(channel);
      socket.leave(channel);
    }

    logger.debug('Socket unsubscribed from channels', {
      socketId: socket.id,
      channels,
      totalSubscriptions: connection.subscriptions.size,
    });
  }

  /**
   * Handle progress request
   */
  private handleProgressRequest(socket: Socket, commandId: string): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    const sessions = this.progressBroadcaster.getUserSessions(connection.userId);
    const commandSession = sessions.find((s) => s.commandId === commandId);

    if (commandSession) {
      socket.emit('progress_update', {
        sessionId: commandSession.sessionId,
        commandId: commandSession.commandId,
        // ... include full progress data
      });
    } else {
      socket.emit('progress_not_found', { commandId });
    }
  }

  /**
   * Handle entity update request
   */
  private handleEntityUpdateRequest(socket: Socket, entityIds: string[]): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Get recent batches for organization
    const recentBatches = this.entityUpdateBroadcaster.getRecentBatches(
      connection.organizationId,
      5
    );

    // Filter updates for requested entities
    const relevantUpdates = recentBatches.flatMap((batch) =>
      batch.updates.filter(
        (update) =>
          entityIds.includes(update.entityId) && update.affectedUsers.includes(connection.userId)
      )
    );

    socket.emit('entity_updates_history', {
      entityIds,
      updates: relevantUpdates,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    const connectionDuration = performance.now() - connection.connectionTime;
    this.recordConnectionMetrics(connectionDuration);

    // Remove from user connections
    const userSockets = this.userConnections.get(connection.userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Remove connection
    this.connections.delete(socket.id);

    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: connection.userId,
      reason,
      connectionDuration: `${connectionDuration.toFixed(2)}ms`,
      reconnectCount: connection.reconnectCount,
    });

    this.emit('connection_closed', {
      socketId: socket.id,
      userId: connection.userId,
      reason,
      connectionDuration,
    });
  }

  /**
   * Handle socket errors
   */
  private handleSocketError(socket: Socket, error: any): void {
    this.errorCount++;

    logger.error('Socket error', {
      socketId: socket.id,
      error: error.message || error,
    });

    this.emit('socket_error', {
      socketId: socket.id,
      error: error.message || error,
    });
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    const userSockets = this.userConnections.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  /**
   * Emit event to specific user
   */
  async emitToUser(userId: string, event: string, data: any): Promise<void> {
    const userSockets = this.userConnections.get(userId);
    if (!userSockets) return;

    const emitPromises = Array.from(userSockets).map(async (socketId) => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    });

    await Promise.allSettled(emitPromises);
  }

  /**
   * Emit event to organization
   */
  async emitToOrganization(organizationId: string, event: string, data: any): Promise<void> {
    this.io.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkConnections();
    }, this.heartbeatInterval);
  }

  /**
   * Check and cleanup inactive connections
   */
  private checkConnections(): void {
    const now = performance.now();
    let inactiveCount = 0;

    for (const [socketId, connection] of this.connections.entries()) {
      const inactiveDuration = now - connection.lastActivity;

      if (inactiveDuration > this.connectionTimeout) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
          inactiveCount++;
        }
      }
    }

    if (inactiveCount > 0) {
      logger.debug('Cleaned up inactive connections', { count: inactiveCount });
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.emit('metrics_update', this.getConnectionMetrics());
    }, 60000); // Every minute
  }

  /**
   * Record connection duration metrics
   */
  private recordConnectionMetrics(duration: number): void {
    this.connectionMetrics.push(duration);

    // Keep only last 1000 measurements
    if (this.connectionMetrics.length > 1000) {
      this.connectionMetrics.shift();
    }
  }

  /**
   * Record event processing metrics
   */
  private recordEventMetrics(time: number): void {
    this.eventMetrics.push(time);

    // Keep only last 1000 measurements
    if (this.eventMetrics.length > 1000) {
      this.eventMetrics.shift();
    }
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    const totalConnections = this.connectionMetrics.length;
    const activeConnections = this.connections.size;

    const averageConnectionDuration =
      totalConnections > 0
        ? this.connectionMetrics.reduce((sum, duration) => sum + duration, 0) / totalConnections
        : 0;

    const reconnectCount = Array.from(this.connections.values()).reduce(
      (sum, conn) => sum + conn.reconnectCount,
      0
    );

    const reconnectionRate = activeConnections > 0 ? reconnectCount / activeConnections : 0;

    const eventThroughput = this.eventMetrics.length;
    const errorRate = totalConnections > 0 ? this.errorCount / totalConnections : 0;

    return {
      totalConnections: totalConnections + activeConnections,
      activeConnections,
      averageConnectionDuration: Math.round(averageConnectionDuration * 100) / 100,
      reconnectionRate: Math.round(reconnectionRate * 10000) / 10000,
      eventThroughput,
      errorRate: Math.round(errorRate * 10000) / 10000,
    };
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): SocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connections for specific user
   */
  getUserConnections(userId: string): SocketConnection[] {
    return Array.from(this.connections.values()).filter((conn) => conn.userId === userId);
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Cleanup broadcasting components
    this.progressBroadcaster.destroy();
    this.entityUpdateBroadcaster.destroy();

    // Disconnect all sockets
    this.io.disconnectSockets(true);

    this.removeAllListeners();

    logger.info('Enhanced Socket Manager destroyed');
  }
}
