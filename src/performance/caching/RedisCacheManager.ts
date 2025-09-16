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

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';

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

export class RedisCacheManager extends EventEmitter {
  private redis: Redis;
  private config: CacheConfig;
  private metrics = {
    hits: 0,
    misses: 0,
    operations: 0,
    responseTimes: [] as number[],
    memoryUsage: 0,
  };
  private readonly maxMetricsHistory = 10000;
  private metricsTimer?: NodeJS.Timeout;

  // Cache invalidation patterns for different entity types
  private readonly invalidationPatterns: CacheInvalidationPattern[] = [
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

  constructor(config: CacheConfig) {
    super();

    this.config = config;
    this.redis = new Redis({
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

    logger.info('Redis Cache Manager initialized', {
      host: config.host,
      port: config.port,
      db: config.db,
      keyPrefix: config.keyPrefix,
    });
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.redis.on('ready', () => {
      logger.info('Redis connection established');
      this.emit('ready');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
      this.emit('close');
    });
  }

  /**
   * Get value from cache with performance tracking
   */
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = performance.now();

    try {
      const value = await this.redis.get(key);
      const responseTime = performance.now() - startTime;

      this.recordResponseTime(responseTime);

      if (value === null) {
        this.metrics.misses++;
        logger.debug('Cache miss', { key, responseTime: `${responseTime.toFixed(2)}ms` });
        return null;
      }

      this.metrics.hits++;

      // Update access metadata
      await this.updateAccessMetadata(key);

      logger.debug('Cache hit', {
        key,
        responseTime: `${responseTime.toFixed(2)}ms`,
        hitRate: this.getHitRate().toFixed(2) + '%',
      });

      // Parse JSON if it's a JSON string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache get error', {
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
  async set(key: string, value: any, ttl: number = 3600, tags: string[] = []): Promise<boolean> {
    const startTime = performance.now();

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

      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.debug('Cache set', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache set error', {
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
  async delete(key: string): Promise<boolean> {
    const startTime = performance.now();

    try {
      const pipeline = this.redis.pipeline();
      pipeline.del(key);
      pipeline.del(`${key}:meta`);

      const results = await pipeline.exec();
      const responseTime = performance.now() - startTime;

      this.recordResponseTime(responseTime);

      const deletedCount =
        results?.reduce((sum, [err, result]) => (err ? sum : sum + (result as number)), 0) || 0;

      logger.debug('Cache delete', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache delete error', {
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
  async mget<T = any>(keys: string[]): Promise<Map<string, T>> {
    const startTime = performance.now();
    const result = new Map<string, T>();

    if (keys.length === 0) {
      return result;
    }

    try {
      const values = await this.redis.mget(...keys);
      const responseTime = performance.now() - startTime;

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
          result.set(key, JSON.parse(value as string) as T);
        } catch {
          result.set(key, value as T);
        }

        // Update access metadata (async, don't wait)
        this.updateAccessMetadata(key);
      }

      this.metrics.hits += hits;
      this.metrics.misses += misses;

      logger.debug('Cache mget', {
        keys: keys.length,
        hits,
        misses,
        hitRate: hits > 0 ? ((hits / keys.length) * 100).toFixed(1) + '%' : '0%',
        responseTime: `${responseTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache mget error', {
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
  async mset(entries: Map<string, { value: any; ttl?: number; tags?: string[] }>): Promise<number> {
    const startTime = performance.now();
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
      const responseTime = performance.now() - startTime;

      this.recordResponseTime(responseTime);

      // Count successful operations
      successCount = results?.filter(([err, result]) => !err && result === 'OK').length || 0;

      logger.debug('Cache mset', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache mset error', {
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
  async invalidateByPattern(pattern: string): Promise<number> {
    const startTime = performance.now();

    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        logger.debug('No keys found for invalidation pattern', { pattern });
        return 0;
      }

      const pipeline = this.redis.pipeline();

      for (const key of keys) {
        pipeline.del(key);
        pipeline.del(`${key}:meta`);
      }

      const results = await pipeline.exec();
      const responseTime = performance.now() - startTime;

      this.recordResponseTime(responseTime);

      const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;

      logger.info('Cache invalidated by pattern', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache invalidation error', {
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
  async invalidateByTags(tags: string[]): Promise<number> {
    const startTime = performance.now();
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

          logger.debug('Cache invalidated by tag', {
            tag,
            keys: keys.length,
            deleted: deletedCount,
          });
        }
      }

      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.info('Cache invalidated by tags', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);

      logger.error('Cache invalidation by tags error', {
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
  async warmCache(
    entityType: string,
    entityIds: string[],
    dataLoader: (id: string) => Promise<any>
  ): Promise<void> {
    const startTime = performance.now();

    try {
      const cacheOperations = new Map<string, { value: any; ttl: number; tags: string[] }>();

      for (const entityId of entityIds) {
        try {
          const data = await dataLoader(entityId);
          const cacheKey = `${entityType}:${entityId}`;

          cacheOperations.set(cacheKey, {
            value: data,
            ttl: this.getTTLForEntityType(entityType),
            tags: [entityType, `${entityType}:${entityId}`],
          });
        } catch (error: any) {
          logger.warn('Failed to load data for cache warming', {
            entityType,
            entityId,
            error: error.message,
          });
        }
      }

      if (cacheOperations.size > 0) {
        await this.mset(cacheOperations);
      }

      const responseTime = performance.now() - startTime;

      logger.info('Cache warming completed', {
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
    } catch (error: any) {
      const responseTime = performance.now() - startTime;

      logger.error('Cache warming error', {
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
  private getTTLForEntityType(entityType: string): number {
    const ttlMap: Record<string, number> = {
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
  private async addToTagIndices(key: string, tags: string[], ttl: number): Promise<void> {
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
  private async updateAccessMetadata(key: string): Promise<void> {
    try {
      const metaKey = `${key}:meta`;
      const metaData = await this.redis.get(metaKey);

      if (metaData) {
        const metadata = JSON.parse(metaData);
        metadata.accessCount++;
        metadata.lastAccessed = Date.now();

        await this.redis.set(metaKey, JSON.stringify(metadata), 'KEEPTTL');
      }
    } catch (error) {
      // Silently fail for metadata updates
    }
  }

  /**
   * Record response time for metrics
   */
  private recordResponseTime(time: number): void {
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
  private getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? (this.metrics.hits / total) * 100 : 0;
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      await this.collectMemoryMetrics();
    }, 60000); // Every minute
  }

  /**
   * Collect memory usage metrics
   */
  private async collectMemoryMetrics(): Promise<void> {
    try {
      const memoryInfo = await this.redis.call('MEMORY', 'USAGE') as number;
      if (typeof memoryInfo === 'number') {
        this.metrics.memoryUsage = memoryInfo;
      }
    } catch (error) {
      logger.error('Failed to collect memory metrics', {
        error: (error as Error).message,
      });

      // Silently fail for metrics collection
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    const responseTimes = this.metrics.responseTimes;
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const p95ResponseTime =
      sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0 : 0;

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
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    metrics: CacheMetrics;
  }> {
    const metrics = await this.getMetrics();

    const checks = {
      connected: this.redis.status === 'ready',
      hitRateAcceptable: metrics.hitRate >= 85, // 85% minimum hit rate
      responseTimeAcceptable: metrics.averageResponseTime < 100, // Sub-100ms average
      memoryUsageAcceptable: true, // Would need Redis configuration to check properly
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.values(checks).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (passedChecks < totalChecks * 0.5) {
      status = 'unhealthy';
    } else if (passedChecks < totalChecks) {
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
  async destroy(): Promise<void> {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    this.removeAllListeners();
    await this.redis.disconnect();

    logger.info('Redis Cache Manager destroyed');
  }
}
