import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
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
declare class SocketManager implements ISocketManager {
    private io;
    private httpServer;
    private connectedUsers;
    private userChannels;
    private channelMembers;
    private metrics;
    /**
     * Initialize WebSocket server
     */
    initialize(httpServer: HTTPServer): Promise<void>;
    /**
     * Setup authentication middleware
     */
    private setupAuthentication;
    /**
     * Setup connection handlers
     */
    private setupConnectionHandlers;
    /**
     * Handle new socket connection
     */
    private handleConnection;
    /**
     * Setup event handlers for individual socket
     */
    private setupSocketEventHandlers;
    /**
     * Handle socket disconnection
     */
    private handleDisconnection;
    /**
     * Handle joining a channel
     */
    private handleJoinChannel;
    /**
     * Handle leaving a channel
     */
    private handleLeaveChannel;
    /**
     * Handle chat messages
     */
    private handleChatMessage;
    /**
     * Handle task updates
     */
    private handleTaskUpdate;
    /**
     * Handle voice commands (for Phase 2)
     */
    private handleVoiceCommand;
    /**
     * Handle typing indicators
     */
    private handleTyping;
    /**
     * Handle presence updates
     */
    private handlePresenceUpdate;
    /**
     * Broadcast user status to relevant users
     */
    private broadcastUserStatus;
    /**
     * Setup error handling
     */
    private setupErrorHandling;
    /**
     * Start metrics collection
     */
    private startMetricsCollection;
    /**
     * Send message to specific user
     */
    sendToUser(userId: string, event: string, data: any): boolean;
    /**
     * Send message to channel
     */
    sendToChannel(channelId: string, event: string, data: any): void;
    /**
     * Broadcast to all connected users
     */
    broadcast(event: string, data: any): void;
    /**
     * Get connected users count
     */
    getConnectedUsersCount(): number;
    /**
     * Get channel member count
     */
    getChannelMemberCount(channelId: string): number;
    /**
     * Get all connected users in channel
     */
    getChannelMembers(channelId: string): string[];
    /**
     * Get server metrics
     */
    getMetrics(): typeof this.metrics;
    /**
     * Check if user is online
     */
    isUserOnline(userId: string): boolean;
    /**
     * Check if user is connected (alias for interface compatibility)
     */
    isUserConnected(userId: string): boolean;
    /**
     * Emit to user (async version for interface compatibility)
     */
    emitToUser(userId: string, event: string, data: any): Promise<void>;
    /**
     * Get Socket.IO server instance
     */
    getServer(): SocketIOServer | null;
    /**
     * Close WebSocket server
     */
    close(): Promise<void>;
}
export { SocketManager };
export declare const socketManager: SocketManager;
export default socketManager;
//# sourceMappingURL=SocketManager.d.ts.map