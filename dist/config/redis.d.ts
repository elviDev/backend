import Redis from 'ioredis';
/**
 * Redis configuration and connection management
 * Enterprise-grade caching with performance monitoring
 */
export interface CacheMetrics {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    totalOperations: number;
    hitRate: number;
}
declare class RedisManager {
    private client;
    private subscriber;
    private publisher;
    private isConnected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private metrics;
    /**
     * Initialize Redis connections
     */
    initialize(): Promise<void>;
    /**
     * Setup Redis event handlers
     */
    private setupEventHandlers;
    /**
     * Get the main Redis client
     */
    getClient(): Redis;
    /**
     * Get the subscriber client
     */
    getSubscriber(): Redis;
    /**
     * Get the publisher client
     */
    getPublisher(): Redis;
    /**
     * Check if Redis is connected
     */
    isRedisConnected(): boolean;
    /**
     * Health check for Redis
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get cache metrics
     */
    getMetrics(): CacheMetrics;
    /**
     * Reset metrics
     */
    resetMetrics(): void;
    /**
     * Start metrics collection
     */
    private startMetricsCollection;
    /**
     * Increment hit counter
     */
    incrementHits(): void;
    /**
     * Increment miss counter
     */
    incrementMisses(): void;
    /**
     * Increment sets counter
     */
    incrementSets(): void;
    /**
     * Increment deletes counter
     */
    incrementDeletes(): void;
    /**
     * Close all Redis connections
     */
    close(): Promise<void>;
}
export declare const redisManager: RedisManager;
export default redisManager;
//# sourceMappingURL=redis.d.ts.map