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
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
import { ISocketManager } from './types';
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
export declare class EnhancedSocketManager extends EventEmitter implements ISocketManager {
    private io;
    private connections;
    private userConnections;
    private executionEventManager;
    private progressBroadcaster;
    private entityUpdateBroadcaster;
    private connectionMetrics;
    private eventMetrics;
    private errorCount;
    private readonly heartbeatInterval;
    private readonly connectionTimeout;
    private heartbeatTimer?;
    constructor(io: SocketIOServer);
    /**
     * Setup socket event handlers
     */
    private setupSocketHandlers;
    /**
     * Handle new socket connection
     */
    private handleConnection;
    /**
     * Setup event handlers for a socket
     */
    private setupSocketEventHandlers;
    /**
     * Handle voice command events
     */
    private handleVoiceCommandEvent;
    /**
     * Handle channel subscription
     */
    private handleSubscription;
    /**
     * Handle channel unsubscription
     */
    private handleUnsubscription;
    /**
     * Handle progress request
     */
    private handleProgressRequest;
    /**
     * Handle entity update request
     */
    private handleEntityUpdateRequest;
    /**
     * Handle socket disconnection
     */
    private handleDisconnection;
    /**
     * Handle socket errors
     */
    private handleSocketError;
    /**
     * Check if user is connected
     */
    isUserConnected(userId: string): boolean;
    /**
     * Emit event to specific user
     */
    emitToUser(userId: string, event: string, data: any): Promise<void>;
    /**
     * Emit event to organization
     */
    emitToOrganization(organizationId: string, event: string, data: any): Promise<void>;
    /**
     * Start heartbeat monitoring
     */
    private startHeartbeat;
    /**
     * Check and cleanup inactive connections
     */
    private checkConnections;
    /**
     * Start metrics collection
     */
    private startMetricsCollection;
    /**
     * Record connection duration metrics
     */
    private recordConnectionMetrics;
    /**
     * Record event processing metrics
     */
    private recordEventMetrics;
    /**
     * Get connection metrics
     */
    getConnectionMetrics(): ConnectionMetrics;
    /**
     * Get all active connections
     */
    getActiveConnections(): SocketConnection[];
    /**
     * Get connections for specific user
     */
    getUserConnections(userId: string): SocketConnection[];
    /**
     * Cleanup and destroy
     */
    destroy(): void;
}
//# sourceMappingURL=EnhancedSocketManager.d.ts.map