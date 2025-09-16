"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class RedisCacheManager extends events_1.EventEmitter {
    redis;
    config;
    metrics = {
        hits: 0,
        misses: 0,
        operations: 0,
        responseTimes: [],
        memoryUsage: 0,
    };
    maxMetricsHistory = 10000;
    metricsTimer;
    // Cache invalidation patterns for different entity types
    invalidationPatterns = [
        {
            pattern: 'user:*',
            description: 'User-related cache entries',
            relatedEntities: ['user', 'session', 'preferences'],
        },
        {
            pattern: 'channel:*',
            description: 'Channel-related cache entries',
            relatedEntities: ['channel', 'message', 'member'],
        },
        {
            pattern: 'task:*',
            description: 'Task-related cache entries',
            relatedEntities: ['task', 'assignment', 'status'],
        },
        {
            pattern: 'file:*',
            description: 'File-related cache entries',
            relatedEntities: ['file', 'metadata', 'permission'],
        },
        {
            pattern: 'command:*',
            description: 'Voice command cache entries',
            relatedEntities: ['command', 'execution', 'result'],
        },
    ];
    constructor(config) {
        super();
        this.config = config;
        this.redis = new ioredis_1.default({
            host: config.host,
            port: config.port,
            ...(config.password && { password: config.password }),
            db: config.db,
            keyPrefix: config.keyPrefix,
            enableReadyCheck: true,
            maxRetriesPerRequest: 3,
        });
        this.setupEventHandlers();
        this.startMetricsCollection();
        logger_1.logger.info('Redis Cache Manager initialized', {
            host: config.host,
            port: config.port,
            db: config.db,
            keyPrefix: config.keyPrefix,
        });
    }
    /**
     * Setup Redis event handlers
     */
    setupEventHandlers() {
        this.redis.on('ready', () => {
            logger_1.logger.info('Redis connection established');
            this.emit('ready');
        });
        this.redis.on('error', (error) => {
            logger_1.logger.error('Redis connection error', { error: error.message });
            this.emit('error', error);
        });
        this.redis.on('close', () => {
            logger_1.logger.warn('Redis connection closed');
            this.emit('close');
        });
    }
    /**
     * Get value from cache with performance tracking
     */
    async get(key) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const value = await this.redis.get(key);
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            if (value === null) {
                this.metrics.misses++;
                logger_1.logger.debug('Cache miss', { key, responseTime: `${responseTime.toFixed(2)}ms` });
                return null;
            }
            this.metrics.hits++;
            // Update access metadata
            await this.updateAccessMetadata(key);
            logger_1.logger.debug('Cache hit', {
                key,
                responseTime: `${responseTime.toFixed(2)}ms`,
                hitRate: this.getHitRate().toFixed(2) + '%',
            });
            // Parse JSON if it's a JSON string
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache get error', {
                key,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return null;
        }
    }
    /**
     * Set value in cache with TTL and tags
     */
    async set(key, value, ttl = 3600, tags = []) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Serialize value
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            // Set value with TTL
            const result = await this.redis.setex(key, ttl, serializedValue);
            // Store metadata for analytics
            const metadata = {
                key,
                ttl,
                createdAt: Date.now(),
                accessCount: 0,
                lastAccessed: Date.now(),
                tags,
            };
            await this.redis.setex(`${key}:meta`, ttl, JSON.stringify(metadata));
            // Add to tag indices if tags provided
            if (tags.length > 0) {
                await this.addToTagIndices(key, tags, ttl);
            }
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.debug('Cache set', {
                key,
                ttl: `${ttl}s`,
                tags: tags.length,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_set', {
                key,
                ttl,
                tags,
                responseTime,
            });
            return result === 'OK';
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache set error', {
                key,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return false;
        }
    }
    /**
     * Delete key from cache
     */
    async delete(key) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const pipeline = this.redis.pipeline();
            pipeline.del(key);
            pipeline.del(`${key}:meta`);
            const results = await pipeline.exec();
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            const deletedCount = results?.reduce((sum, [err, result]) => (err ? sum : sum + result), 0) || 0;
            logger_1.logger.debug('Cache delete', {
                key,
                deletedEntries: deletedCount,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_delete', {
                key,
                deletedEntries: deletedCount,
                responseTime,
            });
            return deletedCount > 0;
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache delete error', {
                key,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return false;
        }
    }
    /**
     * Get multiple keys at once
     */
    async mget(keys) {
        const startTime = perf_hooks_1.performance.now();
        const result = new Map();
        if (keys.length === 0) {
            return result;
        }
        try {
            const values = await this.redis.mget(...keys);
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            let hits = 0;
            let misses = 0;
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const value = values[i];
                if (!key || value === null || value === undefined) {
                    misses++;
                    continue;
                }
                hits++;
                try {
                    result.set(key, JSON.parse(value));
                }
                catch {
                    result.set(key, value);
                }
                // Update access metadata (async, don't wait)
                this.updateAccessMetadata(key);
            }
            this.metrics.hits += hits;
            this.metrics.misses += misses;
            logger_1.logger.debug('Cache mget', {
                keys: keys.length,
                hits,
                misses,
                hitRate: hits > 0 ? ((hits / keys.length) * 100).toFixed(1) + '%' : '0%',
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return result;
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache mget error', {
                keys: keys.length,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return result;
        }
    }
    /**
     * Set multiple keys at once
     */
    async mset(entries) {
        const startTime = perf_hooks_1.performance.now();
        let successCount = 0;
        if (entries.size === 0) {
            return 0;
        }
        try {
            const pipeline = this.redis.pipeline();
            for (const [key, entry] of entries) {
                const { value, ttl = 3600, tags = [] } = entry;
                const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
                pipeline.setex(key, ttl, serializedValue);
                // Add metadata
                const metadata = {
                    key,
                    ttl,
                    createdAt: Date.now(),
                    accessCount: 0,
                    lastAccessed: Date.now(),
                    tags,
                };
                pipeline.setex(`${key}:meta`, ttl, JSON.stringify(metadata));
                // Add to tag indices
                if (tags.length > 0) {
                    for (const tag of tags) {
                        pipeline.sadd(`tag:${tag}`, key);
                        pipeline.expire(`tag:${tag}`, ttl);
                    }
                }
            }
            const results = await pipeline.exec();
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            // Count successful operations
            successCount = results?.filter(([err, result]) => !err && result === 'OK').length || 0;
            logger_1.logger.debug('Cache mset', {
                entries: entries.size,
                successful: successCount,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_mset', {
                entries: entries.size,
                successful: successCount,
                responseTime,
            });
            return successCount;
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache mset error', {
                entries: entries.size,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return successCount;
        }
    }
    /**
     * Invalidate cache entries by pattern
     */
    async invalidateByPattern(pattern) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length === 0) {
                logger_1.logger.debug('No keys found for invalidation pattern', { pattern });
                return 0;
            }
            const pipeline = this.redis.pipeline();
            for (const key of keys) {
                pipeline.del(key);
                pipeline.del(`${key}:meta`);
            }
            const results = await pipeline.exec();
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;
            logger_1.logger.info('Cache invalidated by pattern', {
                pattern,
                keysFound: keys.length,
                deleted: deletedCount,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_invalidated', {
                pattern,
                keysFound: keys.length,
                deleted: deletedCount,
                responseTime,
            });
            return deletedCount;
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache invalidation error', {
                pattern,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return 0;
        }
    }
    /**
     * Invalidate cache entries by tags
     */
    async invalidateByTags(tags) {
        const startTime = perf_hooks_1.performance.now();
        let totalDeleted = 0;
        try {
            for (const tag of tags) {
                const keys = await this.redis.smembers(`tag:${tag}`);
                if (keys.length > 0) {
                    const pipeline = this.redis.pipeline();
                    for (const key of keys) {
                        pipeline.del(key);
                        pipeline.del(`${key}:meta`);
                    }
                    // Also remove the tag set
                    pipeline.del(`tag:${tag}`);
                    const results = await pipeline.exec();
                    const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;
                    totalDeleted += deletedCount;
                    logger_1.logger.debug('Cache invalidated by tag', {
                        tag,
                        keys: keys.length,
                        deleted: deletedCount,
                    });
                }
            }
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.info('Cache invalidated by tags', {
                tags,
                totalDeleted,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_invalidated_by_tags', {
                tags,
                totalDeleted,
                responseTime,
            });
            return totalDeleted;
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            this.recordResponseTime(responseTime);
            logger_1.logger.error('Cache invalidation by tags error', {
                tags,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            return totalDeleted;
        }
    }
    /**
     * Intelligent cache warming for frequently accessed entities
     */
    async warmCache(entityType, entityIds, dataLoader) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const cacheOperations = new Map();
            for (const entityId of entityIds) {
                try {
                    const data = await dataLoader(entityId);
                    const cacheKey = `${entityType}:${entityId}`;
                    cacheOperations.set(cacheKey, {
                        value: data,
                        ttl: this.getTTLForEntityType(entityType),
                        tags: [entityType, `${entityType}:${entityId}`],
                    });
                }
                catch (error) {
                    logger_1.logger.warn('Failed to load data for cache warming', {
                        entityType,
                        entityId,
                        error: error.message,
                    });
                }
            }
            if (cacheOperations.size > 0) {
                await this.mset(cacheOperations);
            }
            const responseTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.info('Cache warming completed', {
                entityType,
                entityIds: entityIds.length,
                cached: cacheOperations.size,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
            this.emit('cache_warmed', {
                entityType,
                entityIds: entityIds.length,
                cached: cacheOperations.size,
                responseTime,
            });
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('Cache warming error', {
                entityType,
                entityIds: entityIds.length,
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`,
            });
        }
    }
    /**
     * Get TTL for specific entity types
     */
    getTTLForEntityType(entityType) {
        const ttlMap = {
            user: 1800, // 30 minutes
            channel: 3600, // 1 hour
            task: 900, // 15 minutes
            file: 7200, // 2 hours
            command: 300, // 5 minutes
            session: 1800, // 30 minutes
            organization: 7200, // 2 hours
            default: 3600, // 1 hour
        };
        return ttlMap[entityType] ?? ttlMap['default'] ?? 3600;
    }
    /**
     * Add key to tag indices
     */
    async addToTagIndices(key, tags, ttl) {
        const pipeline = this.redis.pipeline();
        for (const tag of tags) {
            pipeline.sadd(`tag:${tag}`, key);
            pipeline.expire(`tag:${tag}`, ttl);
        }
        await pipeline.exec();
    }
    /**
     * Update access metadata for analytics
     */
    async updateAccessMetadata(key) {
        try {
            const metaKey = `${key}:meta`;
            const metaData = await this.redis.get(metaKey);
            if (metaData) {
                const metadata = JSON.parse(metaData);
                metadata.accessCount++;
                metadata.lastAccessed = Date.now();
                await this.redis.set(metaKey, JSON.stringify(metadata), 'KEEPTTL');
            }
        }
        catch (error) {
            // Silently fail for metadata updates
        }
    }
    /**
     * Record response time for metrics
     */
    recordResponseTime(time) {
        this.metrics.operations++;
        this.metrics.responseTimes.push(time);
        // Keep only recent measurements
        if (this.metrics.responseTimes.length > this.maxMetricsHistory) {
            this.metrics.responseTimes.shift();
        }
    }
    /**
     * Calculate hit rate
     */
    getHitRate() {
        const total = this.metrics.hits + this.metrics.misses;
        return total > 0 ? (this.metrics.hits / total) * 100 : 0;
    }
    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        this.metricsTimer = setInterval(async () => {
            await this.collectMemoryMetrics();
        }, 60000); // Every minute
    }
    /**
     * Collect memory usage metrics
     */
    async collectMemoryMetrics() {
        try {
            const memoryInfo = await this.redis.call('MEMORY', 'USAGE');
            if (typeof memoryInfo === 'number') {
                this.metrics.memoryUsage = memoryInfo;
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to collect memory metrics', {
                error: error.message,
            });
            // Silently fail for metrics collection
        }
    }
    /**
     * Get comprehensive cache metrics
     */
    async getMetrics() {
        const responseTimes = this.metrics.responseTimes;
        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;
        const sortedTimes = [...responseTimes].sort((a, b) => a - b);
        const p95ResponseTime = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0 : 0;
        // Get current key count
        const keyCount = await this.redis.dbsize();
        return {
            hits: this.metrics.hits,
            misses: this.metrics.misses,
            hitRate: this.getHitRate(),
            averageResponseTime: Math.round(averageResponseTime * 100) / 100,
            p95ResponseTime: Math.round(p95ResponseTime * 100) / 100,
            memoryUsage: this.metrics.memoryUsage,
            keyCount,
            totalOperations: this.metrics.operations,
        };
    }
    /**
     * Get cache health status
     */
    async getHealthStatus() {
        const metrics = await this.getMetrics();
        const checks = {
            connected: this.redis.status === 'ready',
            hitRateAcceptable: metrics.hitRate >= 85, // 85% minimum hit rate
            responseTimeAcceptable: metrics.averageResponseTime < 100, // Sub-100ms average
            memoryUsageAcceptable: true, // Would need Redis configuration to check properly
        };
        const passedChecks = Object.values(checks).filter(Boolean).length;
        const totalChecks = Object.values(checks).length;
        let status = 'healthy';
        if (passedChecks < totalChecks * 0.5) {
            status = 'unhealthy';
        }
        else if (passedChecks < totalChecks) {
            status = 'degraded';
        }
        return {
            status,
            checks,
            metrics,
        };
    }
    /**
     * Cleanup and close connection
     */
    async destroy() {
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
        }
        this.removeAllListeners();
        await this.redis.disconnect();
        logger_1.logger.info('Redis Cache Manager destroyed');
    }
}
exports.RedisCacheManager = RedisCacheManager;
//# sourceMappingURL=RedisCacheManager.js.map