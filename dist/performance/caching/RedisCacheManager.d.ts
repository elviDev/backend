/**
 * Redis Cache Manager - Phase 2 Performance Optimization
 * Advanced caching layer for voice command processing and entity data
 *
 * Success Criteria:
 * - Sub-100ms cache response times
 * - Intelligent cache invalidation
 * - Memory usage optimization
 * - Cache hit rate >90% for frequently accessed data
 */
import { EventEmitter } from 'events';
export interface CacheConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    maxMemory?: string;
    maxMemoryPolicy?: string;
}
export interface CacheEntry {
    key: string;
    value: any;
    ttl: number;
    createdAt: number;
    accessCount: number;
    lastAccessed: number;
    tags?: string[];
}
export interface CacheMetrics {
    hits: number;
    misses: number;
    hitRate: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    memoryUsage: number;
    keyCount: number;
    totalOperations: number;
}
export interface CacheInvalidationPattern {
    pattern: string;
    description: string;
    relatedEntities: string[];
}
export declare class RedisCacheManager extends EventEmitter {
    private redis;
    private config;
    private metrics;
    private readonly maxMetricsHistory;
    private metricsTimer?;
    private readonly invalidationPatterns;
    constructor(config: CacheConfig);
    /**
     * Setup Redis event handlers
     */
    private setupEventHandlers;
    /**
     * Get value from cache with performance tracking
     */
    get<T = any>(key: string): Promise<T | null>;
    /**
     * Set value in cache with TTL and tags
     */
    set(key: string, value: any, ttl?: number, tags?: string[]): Promise<boolean>;
    /**
     * Delete key from cache
     */
    delete(key: string): Promise<boolean>;
    /**
     * Get multiple keys at once
     */
    mget<T = any>(keys: string[]): Promise<Map<string, T>>;
    /**
     * Set multiple keys at once
     */
    mset(entries: Map<string, {
        value: any;
        ttl?: number;
        tags?: string[];
    }>): Promise<number>;
    /**
     * Invalidate cache entries by pattern
     */
    invalidateByPattern(pattern: string): Promise<number>;
    /**
     * Invalidate cache entries by tags
     */
    invalidateByTags(tags: string[]): Promise<number>;
    /**
     * Intelligent cache warming for frequently accessed entities
     */
    warmCache(entityType: string, entityIds: string[], dataLoader: (id: string) => Promise<any>): Promise<void>;
    /**
     * Get TTL for specific entity types
     */
    private getTTLForEntityType;
    /**
     * Add key to tag indices
     */
    private addToTagIndices;
    /**
     * Update access metadata for analytics
     */
    private updateAccessMetadata;
    /**
     * Record response time for metrics
     */
    private recordResponseTime;
    /**
     * Calculate hit rate
     */
    private getHitRate;
    /**
     * Start metrics collection
     */
    private startMetricsCollection;
    /**
     * Collect memory usage metrics
     */
    private collectMemoryMetrics;
    /**
     * Get comprehensive cache metrics
     */
    getMetrics(): Promise<CacheMetrics>;
    /**
     * Get cache health status
     */
    getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: Record<string, boolean>;
        metrics: CacheMetrics;
    }>;
    /**
     * Cleanup and close connection
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=RedisCacheManager.d.ts.map