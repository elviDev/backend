/**
 * Whisper Connection Pool - Phase 2 Voice Processing
 * Pre-warmed connection pool for OpenAI Whisper API
 *
 * Success Criteria:
 * - 5 pre-warmed connections maintained
 * - Connection health monitoring
 * - Automatic connection recovery
 * - <50ms connection acquisition time
 */
import { AxiosInstance } from 'axios';
export interface PoolStats {
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    healthyConnections: number;
    totalRequests: number;
    failedRequests: number;
    averageAcquisitionTime: number;
}
export declare class WhisperConnectionPool {
    private poolSize;
    private connections;
    private availableConnections;
    private activeConnections;
    private connectionHealth;
    private healthCheckInterval;
    private warmupInterval;
    private totalRequests;
    private failedRequests;
    private acquisitionTimes;
    constructor(poolSize?: number);
    /**
     * Get a connection from the pool
     * Target: <50ms acquisition time
     */
    getConnection(): Promise<AxiosInstance>;
    /**
     * Release a connection back to the pool
     */
    releaseConnection(connection: AxiosInstance): void;
    /**
     * Get pool statistics
     */
    getStats(): PoolStats;
    /**
     * Force health check on all connections
     */
    checkAllConnectionsHealth(): Promise<void>;
    /**
     * Shut down the connection pool
     */
    shutdown(): Promise<void>;
    private initializePool;
    private createConnection;
    private acquireHealthyConnection;
    private waitForConnection;
    private replaceConnection;
    private startHealthMonitoring;
    private startConnectionWarming;
    private performHealthCheck;
    private checkConnectionHealth;
    private warmupConnections;
    private getHealthyConnectionCount;
    private recordAcquisitionTime;
}
//# sourceMappingURL=WhisperConnectionPool.d.ts.map