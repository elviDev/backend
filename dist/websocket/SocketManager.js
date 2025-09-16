"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketManager = exports.SocketManager = void 0;
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("@config/redis");
const index_1 = require("@config/index");
const logger_1 = require("@utils/logger");
const jwt_1 = require("@auth/jwt");
const index_2 = require("@db/index");
const errors_1 = require("@utils/errors");
class SocketManager {
    io = null;
    httpServer = null;
    connectedUsers = new Map();
    userChannels = new Map();
    channelMembers = new Map();
    // Event metrics
    metrics = {
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
    async initialize(httpServer) {
        try {
            logger_1.logger.info('Initializing WebSocket server...');
            this.httpServer = httpServer;
            // Create Socket.IO server
            this.io = new socket_io_1.Server(httpServer, {
                path: '/socket.io',
                cors: {
                    origin: index_1.config.api.cors.origin,
                    credentials: index_1.config.api.cors.credentials,
                },
                pingTimeout: 60000,
                pingInterval: 25000,
                upgradeTimeout: 10000,
                maxHttpBufferSize: 1e6, // 1MB
                allowEIO3: true,
                transports: ['websocket', 'polling'],
            });
            // Setup Redis adapter for clustering
            if (redis_1.redisManager.isRedisConnected()) {
                const pubClient = redis_1.redisManager.getPublisher();
                const subClient = redis_1.redisManager.getSubscriber();
                this.io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
                logger_1.logger.info('Redis adapter configured for Socket.IO clustering');
            }
            // Setup authentication middleware
            this.setupAuthentication();
            // Setup connection handlers
            this.setupConnectionHandlers();
            // Setup error handling
            this.setupErrorHandling();
            // Start metrics collection
            this.startMetricsCollection();
            logger_1.logger.info('WebSocket server initialized');
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to initialize WebSocket server');
            throw new errors_1.WebSocketError('WebSocket initialization failed');
        }
    }
    /**
     * Setup authentication middleware
     */
    setupAuthentication() {
        if (!this.io)
            return;
        this.io.use(async (socket, next) => {
            try {
                // Extract token from auth header or query parameter
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (!token) {
                    logger_1.loggers.websocket.warn?.({
                        socketId: socket.id,
                        ip: socket.handshake.address,
                    }, 'WebSocket connection attempt without token');
                    return next(new errors_1.AuthenticationError('Authentication token required'));
                }
                // Verify JWT token
                const payload = await jwt_1.jwtService.verifyAccessToken(token);
                // Get user details
                const user = await index_2.userRepository.findById(payload.userId);
                if (!user || user.deleted_at) {
                    logger_1.loggers.websocket.warn?.({
                        socketId: socket.id,
                        userId: payload.userId,
                        ip: socket.handshake.address,
                    }, 'WebSocket authentication failed - user not found');
                    return next(new errors_1.AuthenticationError('User account not found'));
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
                logger_1.loggers.websocket.info?.({
                    socketId: socket.id,
                    userId: user.id,
                    userRole: user.role,
                    ip: socket.handshake.address,
                }, 'WebSocket authentication successful');
                next();
            }
            catch (error) {
                logger_1.loggers.websocket.error?.({
                    error,
                    socketId: socket.id,
                    ip: socket.handshake.address,
                }, 'WebSocket authentication error');
                if (error instanceof errors_1.AuthenticationError) {
                    next(error);
                }
                else {
                    next(new errors_1.AuthenticationError('Authentication failed'));
                }
            }
        });
    }
    /**
     * Setup connection handlers
     */
    setupConnectionHandlers() {
        if (!this.io)
            return;
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
    }
    /**
     * Handle new socket connection
     */
    async handleConnection(socket) {
        try {
            this.metrics.connections++;
            this.metrics.totalUsers = this.connectedUsers.size + 1;
            // Store connected user
            if (socket.userId) {
                this.connectedUsers.set(socket.userId, socket);
                // Update last active
                index_2.userRepository.updateLastActive(socket.userId).catch((error) => {
                    logger_1.loggers.websocket.warn?.({ error, userId: socket.userId }, 'Failed to update user last active');
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
                    this.channelMembers.get(channelId).add(socket.userId);
                }
            }
            logger_1.loggers.websocket.info?.({
                socketId: socket.id,
                userId: socket.userId,
                userRole: socket.userRole,
                channelCount: socket.channelIds?.length || 0,
                totalConnections: this.metrics.connections,
            }, 'WebSocket client connected');
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
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, socketId: socket.id }, 'Error handling socket connection');
            socket.disconnect(true);
        }
    }
    /**
     * Setup event handlers for individual socket
     */
    setupSocketEventHandlers(socket) {
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            this.handleDisconnection(socket, reason);
        });
        // Handle joining channels
        socket.on('join_channel', async (data) => {
            await this.handleJoinChannel(socket, data.channelId);
        });
        // Handle leaving channels
        socket.on('leave_channel', async (data) => {
            await this.handleLeaveChannel(socket, data.channelId);
        });
        // Handle chat messages
        socket.on('chat_message', async (data) => {
            await this.handleChatMessage(socket, data);
        });
        // Handle task updates
        socket.on('task_update', async (data) => {
            await this.handleTaskUpdate(socket, data);
        });
        // Handle voice command events (for Phase 2)
        socket.on('voice_command', async (data) => {
            await this.handleVoiceCommand(socket, data);
        });
        // Handle typing indicators
        socket.on('typing_start', (data) => {
            this.handleTyping(socket, data.channelId, true);
        });
        socket.on('typing_stop', (data) => {
            this.handleTyping(socket, data.channelId, false);
        });
        // Handle presence updates
        socket.on('presence_update', (data) => {
            this.handlePresenceUpdate(socket, data.status);
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
    handleDisconnection(socket, reason) {
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
        logger_1.loggers.websocket.info?.({
            socketId: socket.id,
            userId: socket.userId,
            reason,
            totalConnections: this.connectedUsers.size,
        }, 'WebSocket client disconnected');
    }
    /**
     * Handle joining a channel
     */
    async handleJoinChannel(socket, channelId) {
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
            this.channelMembers.get(channelId).add(socket.userId);
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
            logger_1.loggers.websocket.debug?.({
                socketId: socket.id,
                userId: socket.userId,
                channelId,
            }, 'User joined channel');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, socketId: socket.id, channelId }, 'Failed to join channel');
            socket.emit('error', { message: 'Failed to join channel' });
        }
    }
    /**
     * Handle leaving a channel
     */
    async handleLeaveChannel(socket, channelId) {
        try {
            await socket.leave(`channel:${channelId}`);
            // Update membership tracking
            const members = this.channelMembers.get(channelId);
            if (members) {
                members.delete(socket.userId);
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
            logger_1.loggers.websocket.debug?.({
                socketId: socket.id,
                userId: socket.userId,
                channelId,
            }, 'User left channel');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, socketId: socket.id, channelId }, 'Failed to leave channel');
        }
    }
    /**
     * Handle chat messages
     */
    async handleChatMessage(socket, data) {
        try {
            // TODO: Validate message content and user permissions
            const messageEvent = {
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
            logger_1.loggers.websocket.debug?.({
                userId: socket.userId,
                channelId: data.channelId,
                messageType: data.type,
            }, 'Chat message sent');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle chat message');
            socket.emit('error', { message: 'Failed to send message' });
        }
    }
    /**
     * Handle task updates
     */
    async handleTaskUpdate(socket, data) {
        try {
            // TODO: Validate user permissions for task updates
            const taskEvent = {
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
            logger_1.loggers.websocket.debug?.({
                userId: socket.userId,
                taskId: data.taskId,
                action: data.action,
            }, 'Task update broadcasted');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle task update');
            socket.emit('error', { message: 'Failed to update task' });
        }
    }
    /**
     * Handle voice commands (for Phase 2)
     */
    async handleVoiceCommand(socket, data) {
        try {
            // Only CEO can use voice commands
            if (socket.userRole !== 'ceo') {
                socket.emit('error', { message: 'Voice commands are only available to CEO' });
                return;
            }
            // TODO: Process voice command
            // This will be implemented in Phase 2 with OpenAI Whisper integration
            logger_1.loggers.websocket.info?.({
                userId: socket.userId,
                channelId: data.channelId,
                hasAudioData: !!data.audioData,
                hasTextCommand: !!data.command,
            }, 'Voice command received');
            socket.emit('voice_command_received', {
                status: 'processing',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, userId: socket.userId }, 'Failed to handle voice command');
            socket.emit('error', { message: 'Failed to process voice command' });
        }
    }
    /**
     * Handle typing indicators
     */
    handleTyping(socket, channelId, isTyping) {
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
    handlePresenceUpdate(socket, status) {
        this.broadcastUserStatus(socket.userId, status);
    }
    /**
     * Broadcast user status to relevant users
     */
    broadcastUserStatus(userId, status) {
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
    setupErrorHandling() {
        if (!this.io)
            return;
        this.io.on('error', (error) => {
            this.metrics.errors++;
            logger_1.loggers.websocket.error?.({ error }, 'Socket.IO server error');
        });
        this.io.engine.on('connection_error', (err) => {
            this.metrics.errors++;
            logger_1.loggers.websocket.error?.(err, 'Socket.IO connection error');
        });
    }
    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        // Log metrics every 5 minutes
        setInterval(() => {
            const roomCount = this.io?.sockets.adapter.rooms.size || 0;
            this.metrics.rooms = roomCount;
            logger_1.loggers.websocket.info?.({
                metrics: this.metrics,
                roomCount,
                connectedUsers: this.connectedUsers.size,
                channels: this.channelMembers.size,
            }, 'WebSocket server metrics');
        }, 5 * 60 * 1000);
    }
    // Public API methods
    /**
     * Send message to specific user
     */
    sendToUser(userId, event, data) {
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
    sendToChannel(channelId, event, data) {
        this.io?.to(`channel:${channelId}`).emit(event, data);
    }
    /**
     * Broadcast to all connected users
     */
    broadcast(event, data) {
        this.io?.emit(event, data);
    }
    /**
     * Get connected users count
     */
    getConnectedUsersCount() {
        return this.connectedUsers.size;
    }
    /**
     * Get channel member count
     */
    getChannelMemberCount(channelId) {
        return this.channelMembers.get(channelId)?.size || 0;
    }
    /**
     * Get all connected users in channel
     */
    getChannelMembers(channelId) {
        return Array.from(this.channelMembers.get(channelId) || []);
    }
    /**
     * Get server metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Check if user is online
     */
    isUserOnline(userId) {
        return this.connectedUsers.has(userId);
    }
    /**
     * Check if user is connected (alias for interface compatibility)
     */
    isUserConnected(userId) {
        return this.isUserOnline(userId);
    }
    /**
     * Emit to user (async version for interface compatibility)
     */
    async emitToUser(userId, event, data) {
        this.sendToUser(userId, event, data);
    }
    /**
     * Get Socket.IO server instance
     */
    getServer() {
        return this.io;
    }
    /**
     * Close WebSocket server
     */
    async close() {
        if (this.io) {
            logger_1.logger.info('Closing WebSocket server...');
            // Disconnect all clients
            this.io.disconnectSockets(true);
            // Close server
            this.io.close();
            this.io = null;
            this.httpServer = null;
            this.connectedUsers.clear();
            this.channelMembers.clear();
            this.userChannels.clear();
            logger_1.logger.info('WebSocket server closed');
        }
    }
}
exports.SocketManager = SocketManager;
// Export singleton instance
exports.socketManager = new SocketManager();
exports.default = exports.socketManager;
//# sourceMappingURL=SocketManager.js.map