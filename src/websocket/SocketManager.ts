import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HTTPServer } from 'http';
import { redisManager } from '@config/redis';
import { config } from '@config/index';
import { logger, loggers, performanceLogger } from '@utils/logger';
import { jwtService } from '@auth/jwt';
import { userRepository } from '@db/index';
import { WebSocketError, AuthenticationError, AuthorizationError, TokenExpiredError } from '@utils/errors';
import { ISocketManager } from './types';

/**
 * WebSocket Manager for Real-Time Communication
 * Enterprise-grade WebSocket handling with Redis clustering support
 */

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: 'ceo' | 'manager' | 'staff';
  userEmail?: string;
  userName?: string;
  channelIds?: string[];
  lastActivity?: Date;
}

export interface SocketEventData {
  type: string;
  payload: any;
  timestamp: Date;
  userId?: string;
  channelId?: string;
  taskId?: string;
}

export interface RoomInfo {
  name: string;
  type: 'channel' | 'task' | 'user' | 'global';
  memberCount: number;
  members: string[];
}

class SocketManager implements ISocketManager {
  private io: SocketIOServer | null = null;
  private httpServer: HTTPServer | null = null;
  private connectedUsers = new Map<string, AuthenticatedSocket>();
  private userChannels = new Map<string, Set<string>>();
  private channelMembers = new Map<string, Set<string>>();

  // Event metrics
  private metrics = {
    connections: 0,
    disconnections: 0,
    events: 0,
    errors: 0,
    rooms: 0,
    totalUsers: 0,
  };

  /**
   * Initialize WebSocket server
   */
  async initialize(httpServer: HTTPServer): Promise<void> {
    try {
      logger.info('Initializing WebSocket server...');

      this.httpServer = httpServer;

      // Create Socket.IO server
      this.io = new SocketIOServer(httpServer, {
        path: '/socket.io',
        cors: {
          origin: config.api.cors.origin,
          credentials: config.api.cors.credentials,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 10000,
        maxHttpBufferSize: 1e6, // 1MB
        allowEIO3: true,
        transports: ['websocket', 'polling'],
      });

      // Setup Redis adapter for clustering
      if (redisManager.isRedisConnected()) {
        const pubClient = redisManager.getPublisher();
        const subClient = redisManager.getSubscriber();

        this.io.adapter(createAdapter(pubClient, subClient));
        logger.info('Redis adapter configured for Socket.IO clustering');
      }

      // Setup authentication middleware
      this.setupAuthentication();

      // Setup connection handlers
      this.setupConnectionHandlers();

      // Setup error handling
      this.setupErrorHandling();

      // Start metrics collection
      this.startMetricsCollection();

      logger.info('WebSocket server initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize WebSocket server');
      throw new WebSocketError('WebSocket initialization failed');
    }
  }

  /**
   * Setup authentication middleware
   */
  private setupAuthentication(): void {
    if (!this.io) return;

    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Extract access token and refresh token from auth header or query parameters
        const accessToken = socket.handshake.auth?.token || socket.handshake.query?.token;
        const refreshToken = socket.handshake.auth?.refreshToken || socket.handshake.query?.refreshToken;

        if (!accessToken) {
          loggers.websocket.warn?.(
            {
              socketId: socket.id,
              ip: socket.handshake.address,
            },
            'WebSocket connection attempt without token'
          );
          return next(new AuthenticationError('Authentication token required'));
        }

        let payload;
        let finalAccessToken = accessToken as string;

        try {
          // Try to verify the access token
          payload = await jwtService.verifyAccessToken(accessToken as string);
        } catch (error) {
          // If access token is expired and we have a refresh token, try to refresh
          if (error instanceof TokenExpiredError && refreshToken) {
            try {
              loggers.websocket.info?.(
                {
                  socketId: socket.id,
                  ip: socket.handshake.address,
                },
                'Access token expired, attempting to refresh'
              );

              const newTokens = await jwtService.refreshTokens(refreshToken as string);
              finalAccessToken = newTokens.accessToken;
              payload = await jwtService.verifyAccessToken(finalAccessToken);

              // Emit new tokens to client so they can update their stored tokens
              socket.emit('token_refreshed', {
                accessToken: newTokens.accessToken,
                refreshToken: newTokens.refreshToken,
                expiresIn: newTokens.expiresIn,
                refreshExpiresIn: newTokens.refreshExpiresIn,
              });

              loggers.websocket.info?.(
                {
                  socketId: socket.id,
                  userId: payload.userId,
                  ip: socket.handshake.address,
                },
                'WebSocket token refreshed successfully'
              );
            } catch (refreshError) {
              loggers.websocket.warn?.(
                {
                  error: refreshError,
                  socketId: socket.id,
                  ip: socket.handshake.address,
                },
                'Token refresh failed during WebSocket authentication'
              );
              return next(new AuthenticationError('Token expired and refresh failed'));
            }
          } else {
            // Re-throw the original error if we can't handle it
            throw error;
          }
        }

        // Get user details
        const user = await userRepository.findById(payload.userId);
        if (!user || user.deleted_at) {
          loggers.websocket.warn?.(
            {
              socketId: socket.id,
              userId: payload.userId,
              ip: socket.handshake.address,
            },
            'WebSocket authentication failed - user not found'
          );
          return next(new AuthenticationError('User account not found'));
        }

        // Attach user information to socket
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.userEmail = user.email;
        socket.userName = user.name;
        socket.lastActivity = new Date();

        // Get user's channels for room management
        // Note: This would need to be implemented in a channel service
        socket.channelIds = []; // TODO: Get from channel service

        loggers.websocket.info?.(
          {
            socketId: socket.id,
            userId: user.id,
            userRole: user.role,
            ip: socket.handshake.address,
          },
          'WebSocket authentication successful'
        );

        next();
      } catch (error) {
        loggers.websocket.error?.(
          {
            error,
            socketId: socket.id,
            ip: socket.handshake.address,
          },
          'WebSocket authentication error'
        );

        if (error instanceof AuthenticationError || error instanceof TokenExpiredError) {
          next(error);
        } else {
          next(new AuthenticationError('Authentication failed'));
        }
      }
    });
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      this.metrics.connections++;
      this.metrics.totalUsers = this.connectedUsers.size + 1;

      // Store connected user
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket);

        // Update last active
        userRepository.updateLastActive(socket.userId).catch((error) => {
          loggers.websocket.warn?.(
            { error, userId: socket.userId },
            'Failed to update user last active'
          );
        });
      }

      // Join user to their personal room
      if (socket.userId) {
        await socket.join(`user:${socket.userId}`);
      }

      // Join user to their channels
      if (socket.channelIds) {
        for (const channelId of socket.channelIds) {
          await socket.join(`channel:${channelId}`);

          // Track channel membership
          if (!this.channelMembers.has(channelId)) {
            this.channelMembers.set(channelId, new Set());
          }
          this.channelMembers.get(channelId)!.add(socket.userId!);
        }
      }

      loggers.websocket.info?.(
        {
          socketId: socket.id,
          userId: socket.userId,
          userRole: socket.userRole,
          channelCount: socket.channelIds?.length || 0,
          totalConnections: this.metrics.connections,
        },
        'WebSocket client connected'
      );

      // Setup event handlers for this socket
      this.setupSocketEventHandlers(socket);

      // Emit connection success
      socket.emit('connected', {
        userId: socket.userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Notify others about user online status
      if (socket.userId) {
        this.broadcastUserStatus(socket.userId, 'online');
      }
    } catch (error) {
      loggers.websocket.error?.({ error, socketId: socket.id }, 'Error handling socket connection');
      socket.disconnect(true);
    }
  }

  /**
   * Setup event handlers for individual socket
   */
  private setupSocketEventHandlers(socket: AuthenticatedSocket): void {
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle joining channels
    socket.on('join_channel', async (data: { channelId: string }) => {
      await this.handleJoinChannel(socket, data.channelId);
    });

    // Handle leaving channels
    socket.on('leave_channel', async (data: { channelId: string }) => {
      await this.handleLeaveChannel(socket, data.channelId);
    });

    // Handle chat messages
    socket.on(
      'chat_message',
      async (data: { channelId: string; message: string; type?: 'text' | 'file' | 'voice' }) => {
        await this.handleChatMessage(socket, data);
      }
    );

    // Handle task updates
    socket.on(
      'task_update',
      async (data: {
        taskId: string;
        updates: any;
        action: 'create' | 'update' | 'delete' | 'assign' | 'complete';
      }) => {
        await this.handleTaskUpdate(socket, data);
      }
    );

    // Handle voice command events (for Phase 2)
    socket.on(
      'voice_command',
      async (data: { audioData?: Buffer; command?: string; channelId?: string }) => {
        await this.handleVoiceCommand(socket, data);
      }
    );

    // Handle typing indicators
    socket.on('typing_start', (data: { channelId: string }) => {
      this.handleTyping(socket, data.channelId, true);
    });

    socket.on('typing_stop', (data: { channelId: string }) => {
      this.handleTyping(socket, data.channelId, false);
    });

    // Handle presence updates
    socket.on('presence_update', (data: { status: 'online' | 'away' | 'busy' | 'offline' }) => {
      this.handlePresenceUpdate(socket, data.status);
    });

    // Handle token refresh requests
    socket.on('refresh_token', async (data: { refreshToken: string }) => {
      await this.handleTokenRefresh(socket, data.refreshToken);
    });

    // Generic event handler with rate limiting
    socket.use(([event, ...args], next) => {
      this.metrics.events++;

      // Update last activity
      socket.lastActivity = new Date();

      // TODO: Implement rate limiting per user/socket

      next();
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    this.metrics.disconnections++;

    // Remove from connected users
    if (socket.userId) {
      this.connectedUsers.delete(socket.userId);

      // Remove from channel membership tracking
      for (const [channelId, members] of this.channelMembers.entries()) {
        if (members.has(socket.userId)) {
          members.delete(socket.userId);
          if (members.size === 0) {
            this.channelMembers.delete(channelId);
          }
        }
      }

      // Broadcast user offline status
      this.broadcastUserStatus(socket.userId, 'offline');
    }

    this.metrics.totalUsers = this.connectedUsers.size;

    loggers.websocket.info?.(
      {
        socketId: socket.id,
        userId: socket.userId,
        reason,
        totalConnections: this.connectedUsers.size,
      },
      'WebSocket client disconnected'
    );
  }

  /**
   * Handle joining a channel
   */
  private async handleJoinChannel(socket: AuthenticatedSocket, channelId: string): Promise<void> {
    try {
      // TODO: Verify user has access to channel
      // const hasAccess = await channelService.canUserAccess(channelId, socket.userId);
      // if (!hasAccess) {
      //   socket.emit('error', { message: 'Access denied to channel' });
      //   return;
      // }

      await socket.join(`channel:${channelId}`);

      // Track membership
      if (!this.channelMembers.has(channelId)) {
        this.channelMembers.set(channelId, new Set());
      }
      this.channelMembers.get(channelId)!.add(socket.userId!);

      // Notify channel members
      socket.to(`channel:${channelId}`).emit('user_joined_channel', {
        channelId,
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date().toISOString(),
      });

      // Acknowledge join
      socket.emit('channel_joined', {
        channelId,
        memberCount: this.channelMembers.get(channelId)?.size || 0,
      });

      loggers.websocket.debug?.(
        {
          socketId: socket.id,
          userId: socket.userId,
          channelId,
        },
        'User joined channel'
      );
    } catch (error) {
      loggers.websocket.error?.(
        { error, socketId: socket.id, channelId },
        'Failed to join channel'
      );
      socket.emit('error', { message: 'Failed to join channel' });
    }
  }

  /**
   * Handle leaving a channel
   */
  private async handleLeaveChannel(socket: AuthenticatedSocket, channelId: string): Promise<void> {
    try {
      await socket.leave(`channel:${channelId}`);

      // Update membership tracking
      const members = this.channelMembers.get(channelId);
      if (members) {
        members.delete(socket.userId!);
        if (members.size === 0) {
          this.channelMembers.delete(channelId);
        }
      }

      // Notify channel members
      socket.to(`channel:${channelId}`).emit('user_left_channel', {
        channelId,
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date().toISOString(),
      });

      socket.emit('channel_left', { channelId });

      loggers.websocket.debug?.(
        {
          socketId: socket.id,
          userId: socket.userId,
          channelId,
        },
        'User left channel'
      );
    } catch (error) {
      loggers.websocket.error?.(
        { error, socketId: socket.id, channelId },
        'Failed to leave channel'
      );
    }
  }

  /**
   * Handle chat messages
   */
  private async handleChatMessage(
    socket: AuthenticatedSocket,
    data: {
      channelId: string;
      message: string;
      type?: 'text' | 'file' | 'voice';
    }
  ): Promise<void> {
    try {
      // TODO: Validate message content and user permissions

      const messageEvent: SocketEventData = {
        type: 'chat_message',
        payload: {
          channelId: data.channelId,
          message: data.message,
          messageType: data.type || 'text',
          userId: socket.userId || 'unknown',
          userName: socket.userName || 'Unknown User',
          userRole: socket.userRole || 'staff',
        },
        timestamp: new Date(),
        userId: socket.userId || 'unknown',
        channelId: data.channelId,
      };

      // Broadcast to channel members
      this.io?.to(`channel:${data.channelId}`).emit('chat_message', messageEvent.payload);

      // TODO: Store message in database
      // await messageService.createMessage(messageEvent.payload);

      loggers.websocket.debug?.(
        {
          userId: socket.userId,
          channelId: data.channelId,
          messageType: data.type,
        },
        'Chat message sent'
      );
    } catch (error) {
      loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle chat message');
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle task updates
   */
  private async handleTaskUpdate(
    socket: AuthenticatedSocket,
    data: {
      taskId: string;
      updates: any;
      action: 'create' | 'update' | 'delete' | 'assign' | 'complete';
    }
  ): Promise<void> {
    try {
      // TODO: Validate user permissions for task updates

      const taskEvent: SocketEventData = {
        type: 'task_update',
        payload: {
          taskId: data.taskId,
          action: data.action,
          updates: data.updates,
          userId: socket.userId ?? 'unknown',
          userName: socket.userName,
        },
        timestamp: new Date(),
        userId: socket.userId ?? 'unknown',
        taskId: data.taskId,
      };

      // Broadcast to task watchers and assignees
      // TODO: Get task details to determine who should receive updates
      this.io?.emit('task_update', taskEvent.payload);

      loggers.websocket.debug?.(
        {
          userId: socket.userId,
          taskId: data.taskId,
          action: data.action,
        },
        'Task update broadcasted'
      );
    } catch (error) {
      loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle task update');
      socket.emit('error', { message: 'Failed to update task' });
    }
  }

  /**
   * Handle voice commands (for Phase 2)
   */
  private async handleVoiceCommand(
    socket: AuthenticatedSocket,
    data: {
      audioData?: Buffer;
      command?: string;
      channelId?: string;
    }
  ): Promise<void> {
    try {
      // Only CEO can use voice commands
      if (socket.userRole !== 'ceo') {
        socket.emit('error', { message: 'Voice commands are only available to CEO' });
        return;
      }

      // TODO: Process voice command
      // This will be implemented in Phase 2 with OpenAI Whisper integration

      loggers.websocket.info?.(
        {
          userId: socket.userId,
          channelId: data.channelId,
          hasAudioData: !!data.audioData,
          hasTextCommand: !!data.command,
        },
        'Voice command received'
      );

      socket.emit('voice_command_received', {
        status: 'processing',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle voice command');
      socket.emit('error', { message: 'Failed to process voice command' });
    }
  }

  /**
   * Handle typing indicators
   */
  private handleTyping(socket: AuthenticatedSocket, channelId: string, isTyping: boolean): void {
    socket.to(`channel:${channelId}`).emit('typing_indicator', {
      channelId,
      userId: socket.userId,
      userName: socket.userName,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle presence updates
   */
  private handlePresenceUpdate(socket: AuthenticatedSocket, status: string): void {
    this.broadcastUserStatus(socket.userId!, status);
  }

  /**
   * Handle token refresh requests from connected clients
   */
  private async handleTokenRefresh(socket: AuthenticatedSocket, refreshToken: string): Promise<void> {
    try {
      if (!refreshToken) {
        socket.emit('token_refresh_error', { message: 'Refresh token is required' });
        return;
      }

      loggers.websocket.info?.(
        {
          socketId: socket.id,
          userId: socket.userId,
        },
        'Processing token refresh request'
      );

      const newTokens = await jwtService.refreshTokens(refreshToken);

      socket.emit('token_refreshed', {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresIn: newTokens.expiresIn,
        refreshExpiresIn: newTokens.refreshExpiresIn,
      });

      loggers.websocket.info?.(
        {
          socketId: socket.id,
          userId: socket.userId,
        },
        'Token refresh successful'
      );
    } catch (error) {
      loggers.websocket.error?.(
        {
          error,
          socketId: socket.id,
          userId: socket.userId,
        },
        'Token refresh failed'
      );

      socket.emit('token_refresh_error', {
        message: 'Token refresh failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // If refresh token is also expired, disconnect the client
      if (error instanceof TokenExpiredError) {
        loggers.websocket.warn?.(
          {
            socketId: socket.id,
            userId: socket.userId,
          },
          'Refresh token expired, disconnecting client'
        );
        socket.disconnect(true);
      }
    }
  }

  /**
   * Broadcast user status to relevant users
   */
  private broadcastUserStatus(userId: string, status: string): void {
    // TODO: Determine which users should receive this status update
    // For now, broadcast to all connected users
    this.io?.emit('user_status_update', {
      userId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    if (!this.io) return;

    this.io.on('error', (error: Error) => {
      this.metrics.errors++;
      loggers.websocket.error?.({ error }, 'Socket.IO server error');
    });

    this.io.engine.on('connection_error', (err: any) => {
      this.metrics.errors++;
      loggers.websocket.error?.(err, 'Socket.IO connection error');
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Log metrics every 5 minutes
    setInterval(
      () => {
        const roomCount = this.io?.sockets.adapter.rooms.size || 0;
        this.metrics.rooms = roomCount;

        loggers.websocket.info?.(
          {
            metrics: this.metrics,
            roomCount,
            connectedUsers: this.connectedUsers.size,
            channels: this.channelMembers.size,
          },
          'WebSocket server metrics'
        );
      },
      5 * 60 * 1000
    );
  }

  // Public API methods

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, event: string, data: any): boolean {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }

    // Try sending to user room if socket not directly available
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
      return true;
    }

    return false;
  }

  /**
   * Send message to channel
   */
  sendToChannel(channelId: string, event: string, data: any): void {
    this.io?.to(`channel:${channelId}`).emit(event, data);
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event: string, data: any): void {
    this.io?.emit(event, data);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get channel member count
   */
  getChannelMemberCount(channelId: string): number {
    return this.channelMembers.get(channelId)?.size || 0;
  }

  /**
   * Get all connected users in channel
   */
  getChannelMembers(channelId: string): string[] {
    return Array.from(this.channelMembers.get(channelId) || []);
  }

  /**
   * Get server metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Check if user is connected (alias for interface compatibility)
   */
  isUserConnected(userId: string): boolean {
    return this.isUserOnline(userId);
  }

  /**
   * Emit to user (async version for interface compatibility)
   */
  async emitToUser(userId: string, event: string, data: any): Promise<void> {
    this.sendToUser(userId, event, data);
  }

  /**
   * Get Socket.IO server instance
   */
  getServer(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Close WebSocket server
   */
  async close(): Promise<void> {
    if (this.io) {
      logger.info('Closing WebSocket server...');

      // Disconnect all clients
      this.io.disconnectSockets(true);

      // Close server
      this.io.close();

      this.io = null;
      this.httpServer = null;
      this.connectedUsers.clear();
      this.channelMembers.clear();
      this.userChannels.clear();

      logger.info('WebSocket server closed');
    }
  }
}

// Export class for type declarations
export { SocketManager };

// Export singleton instance
export const socketManager = new SocketManager();
export default socketManager;
