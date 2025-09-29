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
                // Extract access token and refresh token from auth header or query parameters
                const accessToken = socket.handshake.auth?.token || socket.handshake.query?.token;
                const refreshToken = socket.handshake.auth?.refreshToken || socket.handshake.query?.refreshToken;
                if (!accessToken) {
                    logger_1.loggers.websocket.warn?.({
                        socketId: socket.id,
                        ip: socket.handshake.address,
                    }, 'WebSocket connection attempt without token');
                    return next(new errors_1.AuthenticationError('Authentication token required'));
                }
                let payload;
                let finalAccessToken = accessToken;
                try {
                    // Try to verify the access token
                    payload = await jwt_1.jwtService.verifyAccessToken(accessToken);
                }
                catch (error) {
                    // If access token is expired and we have a refresh token, try to refresh
                    if (error instanceof errors_1.TokenExpiredError && refreshToken) {
                        try {
                            logger_1.loggers.websocket.info?.({
                                socketId: socket.id,
                                ip: socket.handshake.address,
                            }, 'Access token expired, attempting to refresh');
                            const newTokens = await jwt_1.jwtService.refreshTokens(refreshToken);
                            finalAccessToken = newTokens.accessToken;
                            payload = await jwt_1.jwtService.verifyAccessToken(finalAccessToken);
                            // Emit new tokens to client so they can update their stored tokens
                            socket.emit('token_refreshed', {
                                accessToken: newTokens.accessToken,
                                refreshToken: newTokens.refreshToken,
                                expiresIn: newTokens.expiresIn,
                                refreshExpiresIn: newTokens.refreshExpiresIn,
                            });
                            logger_1.loggers.websocket.info?.({
                                socketId: socket.id,
                                userId: payload.userId,
                                ip: socket.handshake.address,
                            }, 'WebSocket token refreshed successfully');
                        }
                        catch (refreshError) {
                            logger_1.loggers.websocket.warn?.({
                                error: refreshError,
                                socketId: socket.id,
                                ip: socket.handshake.address,
                            }, 'Token refresh failed during WebSocket authentication');
                            return next(new errors_1.AuthenticationError('Token expired and refresh failed'));
                        }
                    }
                    else {
                        // Re-throw the original error if we can't handle it
                        throw error;
                    }
                }
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
                try {
                    const userChannels = await index_2.channelRepository.findUserChannels(user.id, user.role);
                    socket.channelIds = userChannels.map(channel => channel.id);
                    logger_1.loggers.websocket.debug?.({
                        userId: user.id,
                        channelCount: socket.channelIds.length,
                        channels: socket.channelIds,
                    }, 'User channels loaded for WebSocket connection');
                }
                catch (error) {
                    logger_1.loggers.websocket.warn?.({
                        error,
                        userId: user.id,
                    }, 'Failed to load user channels, setting empty array');
                    socket.channelIds = [];
                }
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
                if (error instanceof errors_1.AuthenticationError || error instanceof errors_1.TokenExpiredError) {
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
            if (socket.channelIds && socket.channelIds.length > 0) {
                for (const channelId of socket.channelIds) {
                    await socket.join(`channel:${channelId}`);
                    // Track channel membership
                    if (!this.channelMembers.has(channelId)) {
                        this.channelMembers.set(channelId, new Set());
                    }
                    this.channelMembers.get(channelId).add(socket.userId);
                    logger_1.loggers.websocket.debug?.({
                        socketId: socket.id,
                        userId: socket.userId,
                        channelId,
                    }, 'User joined channel room');
                }
                logger_1.loggers.websocket.info?.({
                    socketId: socket.id,
                    userId: socket.userId,
                    joinedChannels: socket.channelIds.length,
                }, 'User automatically joined to channel rooms');
            }
            else {
                logger_1.loggers.websocket.info?.({
                    socketId: socket.id,
                    userId: socket.userId,
                }, 'User has no channels to join');
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
        // Handle token refresh requests
        socket.on('refresh_token', async (data) => {
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
    handleDisconnection(socket, reason) {
        this.metrics.disconnections++;
        // Remove from connected users
        if (socket.userId) {
            this.connectedUsers.delete(socket.userId);
            // Remove from channel membership tracking and notify channel members
            for (const [channelId, members] of this.channelMembers.entries()) {
                if (members.has(socket.userId)) {
                    members.delete(socket.userId);
                    // Notify remaining channel members
                    socket.to(`channel:${channelId}`).emit('user_left_channel', {
                        type: 'user_disconnected_from_channel',
                        channelId,
                        userId: socket.userId,
                        userName: socket.userName,
                        userRole: socket.userRole,
                        reason: 'disconnected',
                        timestamp: new Date().toISOString(),
                    });
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
            userRole: socket.userRole,
            reason,
            totalConnections: this.connectedUsers.size,
            channelsLeft: socket.channelIds?.length || 0,
        }, 'WebSocket client disconnected');
    }
    /**
     * Handle joining a channel
     */
    async handleJoinChannel(socket, channelId) {
        try {
            // Verify user has access to channel
            const hasAccess = await this.canUserAccessChannel(channelId, socket.userId, socket.userRole);
            if (!hasAccess) {
                logger_1.loggers.websocket.warn?.({
                    socketId: socket.id,
                    userId: socket.userId,
                    channelId,
                    userRole: socket.userRole,
                }, 'User denied access to channel');
                socket.emit('error', {
                    type: 'channel_access_denied',
                    message: 'Access denied to channel',
                    channelId
                });
                return;
            }
            // Check if user is already in the channel room
            const socketRooms = Array.from(socket.rooms);
            const channelRoom = `channel:${channelId}`;
            if (socketRooms.includes(channelRoom)) {
                socket.emit('channel_joined', {
                    channelId,
                    memberCount: this.channelMembers.get(channelId)?.size || 0,
                    message: 'Already in channel',
                });
                return;
            }
            await socket.join(channelRoom);
            // Track membership
            if (!this.channelMembers.has(channelId)) {
                this.channelMembers.set(channelId, new Set());
            }
            this.channelMembers.get(channelId).add(socket.userId);
            // Update socket's channel list
            if (!socket.channelIds.includes(channelId)) {
                socket.channelIds.push(channelId);
            }
            // Notify channel members
            socket.to(channelRoom).emit('user_joined_channel', {
                type: 'user_joined_channel',
                channelId,
                userId: socket.userId,
                userName: socket.userName,
                userRole: socket.userRole,
                timestamp: new Date().toISOString(),
            });
            // Acknowledge join
            socket.emit('channel_joined', {
                channelId,
                memberCount: this.channelMembers.get(channelId)?.size || 0,
            });
            logger_1.loggers.websocket.info?.({
                socketId: socket.id,
                userId: socket.userId,
                channelId,
                memberCount: this.channelMembers.get(channelId)?.size || 0,
            }, 'User joined channel successfully');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, socketId: socket.id, channelId }, 'Failed to join channel');
            socket.emit('error', {
                type: 'join_channel_error',
                message: 'Failed to join channel',
                channelId
            });
        }
    }
    /**
     * Handle leaving a channel
     */
    async handleLeaveChannel(socket, channelId) {
        try {
            const channelRoom = `channel:${channelId}`;
            // Check if user is actually in the channel room
            const socketRooms = Array.from(socket.rooms);
            if (!socketRooms.includes(channelRoom)) {
                socket.emit('channel_left', {
                    channelId,
                    message: 'Not in channel',
                });
                return;
            }
            await socket.leave(channelRoom);
            // Update membership tracking
            const members = this.channelMembers.get(channelId);
            if (members) {
                members.delete(socket.userId);
                if (members.size === 0) {
                    this.channelMembers.delete(channelId);
                }
            }
            // Update socket's channel list
            if (socket.channelIds) {
                const index = socket.channelIds.indexOf(channelId);
                if (index > -1) {
                    socket.channelIds.splice(index, 1);
                }
            }
            // Notify remaining channel members
            socket.to(channelRoom).emit('user_left_channel', {
                type: 'user_left_channel',
                channelId,
                userId: socket.userId,
                userName: socket.userName,
                userRole: socket.userRole,
                timestamp: new Date().toISOString(),
            });
            socket.emit('channel_left', {
                channelId,
                memberCount: this.channelMembers.get(channelId)?.size || 0,
            });
            logger_1.loggers.websocket.info?.({
                socketId: socket.id,
                userId: socket.userId,
                channelId,
                remainingMembers: this.channelMembers.get(channelId)?.size || 0,
            }, 'User left channel successfully');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, socketId: socket.id, channelId }, 'Failed to leave channel');
            socket.emit('error', {
                type: 'leave_channel_error',
                message: 'Failed to leave channel',
                channelId
            });
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
     * Handle token refresh requests from connected clients
     */
    async handleTokenRefresh(socket, refreshToken) {
        try {
            if (!refreshToken) {
                socket.emit('token_refresh_error', { message: 'Refresh token is required' });
                return;
            }
            logger_1.loggers.websocket.info?.({
                socketId: socket.id,
                userId: socket.userId,
            }, 'Processing token refresh request');
            const newTokens = await jwt_1.jwtService.refreshTokens(refreshToken);
            socket.emit('token_refreshed', {
                accessToken: newTokens.accessToken,
                refreshToken: newTokens.refreshToken,
                expiresIn: newTokens.expiresIn,
                refreshExpiresIn: newTokens.refreshExpiresIn,
            });
            logger_1.loggers.websocket.info?.({
                socketId: socket.id,
                userId: socket.userId,
            }, 'Token refresh successful');
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({
                error,
                socketId: socket.id,
                userId: socket.userId,
            }, 'Token refresh failed');
            socket.emit('token_refresh_error', {
                message: 'Token refresh failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // If refresh token is also expired, disconnect the client
            if (error instanceof errors_1.TokenExpiredError) {
                logger_1.loggers.websocket.warn?.({
                    socketId: socket.id,
                    userId: socket.userId,
                }, 'Refresh token expired, disconnecting client');
                socket.disconnect(true);
            }
        }
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
     * Get detailed connection info for debugging
     */
    getConnectionDetails() {
        const connectedUsers = Array.from(this.connectedUsers.entries()).map(([userId, socket]) => ({
            userId,
            socketId: socket.id,
            channelCount: socket.channelIds?.length || 0,
            channels: socket.channelIds || [],
        }));
        const channelRooms = Array.from(this.channelMembers.entries()).map(([channelId, members]) => ({
            channelId,
            memberCount: members.size,
            members: Array.from(members),
        }));
        return {
            totalConnections: this.connectedUsers.size,
            connectedUsers,
            channelRooms,
        };
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
     * Check if user can access a channel
     */
    async canUserAccessChannel(channelId, userId, userRole) {
        try {
            // CEO can access all channels
            if (userRole === 'ceo') {
                return true;
            }
            // Check if channel exists and user has access
            const channel = await index_2.channelRepository.findById(channelId);
            if (!channel || channel.deleted_at) {
                return false;
            }
            // Check if user is in the channel members list
            if (channel.members.includes(userId)) {
                return true;
            }
            // Check if user is a moderator
            if (channel.moderators.includes(userId)) {
                return true;
            }
            // Check if user is the owner
            if (channel.owned_by === userId || channel.created_by === userId) {
                return true;
            }
            // For public channels, managers can join
            if (channel.privacy_level === 'public' && userRole === 'manager') {
                return true;
            }
            // Check auto-join roles
            if (channel.auto_join_roles.includes(userRole)) {
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.loggers.websocket.error?.({ error, channelId, userId }, 'Error checking channel access');
            return false;
        }
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