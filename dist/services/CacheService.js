"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
const redis_1 = require("@config/redis");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
class CacheService {
    defaultTTL = 3600; // 1 hour default
    compressionThreshold = 1024; // Compress values larger than 1KB
    maxKeyLength = 250; // Redis key length limit
    namespacePrefix = 'ceo-platform:';
    // Cache namespaces for different data types
    namespaces = {
        users: 'users:',
        channels: 'channels:',
        tasks: 'tasks:',
        sessions: 'sessions:',
        analytics: 'analytics:',
        voice: 'voice:',
        general: 'general:',
    };
    /**
     * Generate cache key with namespace
     */
    generateKey(key, namespace) {
        const prefix = this.namespacePrefix + (namespace || this.namespaces.general);
        const fullKey = prefix + key;
        if (fullKey.length > this.maxKeyLength) {
            // Use hash for very long keys
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(fullKey).digest('hex').substring(0, 16);
            return `${prefix}hashed:${hash}`;
        }
        return fullKey;
    }
    /**
     * Serialize value for storage
     */
    serialize(value, options = {}) {
        if (options.serialize === false) {
            return value;
        }
        try {
            return JSON.stringify(value);
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, value }, 'Failed to serialize cache value');
            throw new errors_1.CacheError('Cache serialization failed');
        }
    }
    /**
     * Deserialize value from storage
     */
    deserialize(value, options = {}) {
        if (options.serialize === false) {
            return value;
        }
        try {
            return JSON.parse(value);
        }
        catch (error) {
            logger_1.loggers.cache.warn({ error, value }, 'Failed to deserialize cache value, returning raw');
            return value;
        }
    }
    /**
     * Compress value if needed
     */
    async compress(value, options = {}) {
        if (!options.compress || value.length < this.compressionThreshold) {
            return value;
        }
        try {
            const zlib = require('zlib');
            const compressed = zlib.gzipSync(value).toString('base64');
            return `compressed:${compressed}`;
        }
        catch (error) {
            logger_1.loggers.cache.warn({ error }, 'Failed to compress cache value');
            return value;
        }
    }
    /**
     * Decompress value if needed
     */
    async decompress(value) {
        if (!value.startsWith('compressed:')) {
            return value;
        }
        try {
            const zlib = require('zlib');
            const compressed = value.substring('compressed:'.length);
            return zlib.gunzipSync(Buffer.from(compressed, 'base64')).toString();
        }
        catch (error) {
            logger_1.loggers.cache.warn({ error }, 'Failed to decompress cache value');
            return value;
        }
    }
    /**
     * Get value from cache
     */
    async get(key, options = {}) {
        return await logger_1.performanceLogger.trackAsyncOperation(async () => {
            try {
                // Check if Redis is available
                if (!redis_1.redisManager.isRedisConnected()) {
                    logger_1.loggers.cache.debug({ key }, 'Redis not available - cache miss');
                    return null;
                }
                const client = redis_1.redisManager.getClient();
                const cacheKey = this.generateKey(key, options.namespace);
                const value = await client.get(cacheKey);
                if (value === null) {
                    redis_1.redisManager.incrementMisses();
                    logger_1.loggers.cache.debug({ key: cacheKey }, 'Cache miss');
                    return null;
                }
                redis_1.redisManager.incrementHits();
                logger_1.loggers.cache.debug({ key: cacheKey, size: value.length }, 'Cache hit');
                // Decompress and deserialize
                const decompressed = await this.decompress(value);
                const result = this.deserialize(decompressed, options);
                return result;
            }
            catch (error) {
                logger_1.loggers.cache.error({ error, key }, 'Cache get operation failed');
                redis_1.redisManager.incrementMisses();
                return null;
            }
        }, 'cache_get', { key, namespace: options.namespace });
    }
    /**
     * Set value in cache
     */
    async set(key, value, options = {}) {
        return await logger_1.performanceLogger.trackAsyncOperation(async () => {
            try {
                // Check if Redis is available
                if (!redis_1.redisManager.isRedisConnected()) {
                    logger_1.loggers.cache.debug({ key }, 'Redis not available - cache set skipped');
                    return false;
                }
                const client = redis_1.redisManager.getClient();
                const cacheKey = this.generateKey(key, options.namespace);
                // Serialize and compress
                const serialized = this.serialize(value, options);
                const compressed = await this.compress(serialized, options);
                const ttl = options.ttl || options.ex || this.defaultTTL;
                let result;
                if (options.nx) {
                    result = await client.set(cacheKey, compressed, 'EX', ttl, 'NX');
                }
                else {
                    result = await client.setex(cacheKey, ttl, compressed);
                }
                const success = result === 'OK';
                if (success) {
                    redis_1.redisManager.incrementSets();
                    logger_1.loggers.cache.debug({
                        key: cacheKey,
                        ttl,
                        size: compressed.length,
                        compressed: compressed.startsWith('compressed:'),
                    }, 'Cache set successful');
                    // Set tags for bulk invalidation if provided
                    if (options.tags && options.tags.length > 0) {
                        await this.tagKey(cacheKey, options.tags);
                    }
                }
                else {
                    logger_1.loggers.cache.warn({ key: cacheKey }, 'Cache set failed');
                }
                return success;
            }
            catch (error) {
                logger_1.loggers.cache.error({ error, key }, 'Cache set operation failed');
                return false;
            }
        }, 'cache_set', { key, namespace: options.namespace, ttl: options.ttl });
    }
    /**
     * Delete value from cache
     */
    async delete(key, options = {}) {
        try {
            // Check if Redis is available
            if (!redis_1.redisManager.isRedisConnected()) {
                logger_1.loggers.cache.debug({ key }, 'Redis not available - cache delete skipped');
                return false;
            }
            const client = redis_1.redisManager.getClient();
            const cacheKey = this.generateKey(key, options.namespace);
            const result = await client.del(cacheKey);
            const deleted = result > 0;
            if (deleted) {
                redis_1.redisManager.incrementDeletes();
                logger_1.loggers.cache.debug({ key: cacheKey }, 'Cache delete successful');
            }
            return deleted;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, key }, 'Cache delete operation failed');
            return false;
        }
    }
    /**
     * Check if key exists in cache
     */
    async exists(key, options = {}) {
        try {
            const client = redis_1.redisManager.getClient();
            const cacheKey = this.generateKey(key, options.namespace);
            const result = await client.exists(cacheKey);
            return result === 1;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, key }, 'Cache exists check failed');
            return false;
        }
    }
    /**
     * Set expiration time for existing key
     */
    async expire(key, ttl, options = {}) {
        try {
            const client = redis_1.redisManager.getClient();
            const cacheKey = this.generateKey(key, options.namespace);
            const result = await client.expire(cacheKey, ttl);
            return result === 1;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, key, ttl }, 'Cache expire operation failed');
            return false;
        }
    }
    /**
     * Get remaining TTL for key
     */
    async ttl(key, options = {}) {
        try {
            const client = redis_1.redisManager.getClient();
            const cacheKey = this.generateKey(key, options.namespace);
            return await client.ttl(cacheKey);
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, key }, 'Cache TTL check failed');
            return -2; // Key doesn't exist
        }
    }
    /**
     * Get multiple values at once
     */
    async mget(keys, options = {}) {
        return await logger_1.performanceLogger.trackAsyncOperation(async () => {
            try {
                const client = redis_1.redisManager.getClient();
                const cacheKeys = keys.map((key) => this.generateKey(key, options.namespace));
                const values = await client.mget(...cacheKeys);
                const results = await Promise.all(values.map(async (value, index) => {
                    if (value === null) {
                        redis_1.redisManager.incrementMisses();
                        return null;
                    }
                    redis_1.redisManager.incrementHits();
                    const decompressed = await this.decompress(value);
                    return this.deserialize(decompressed, options);
                }));
                logger_1.loggers.cache.debug({
                    keys: cacheKeys,
                    hits: values.filter((v) => v !== null).length,
                    misses: values.filter((v) => v === null).length,
                }, 'Cache mget operation');
                return results;
            }
            catch (error) {
                logger_1.loggers.cache.error({ error, keys }, 'Cache mget operation failed');
                return keys.map(() => null);
            }
        }, 'cache_mget', { keyCount: keys.length, namespace: options.namespace });
    }
    /**
     * Set multiple values at once
     */
    async mset(keyValuePairs, options = {}) {
        return await logger_1.performanceLogger.trackAsyncOperation(async () => {
            try {
                const client = redis_1.redisManager.getClient();
                const pipeline = client.pipeline();
                const ttl = options.ttl || this.defaultTTL;
                for (const [key, value] of Object.entries(keyValuePairs)) {
                    const cacheKey = this.generateKey(key, options.namespace);
                    const serialized = this.serialize(value, options);
                    const compressed = await this.compress(serialized, options);
                    pipeline.setex(cacheKey, ttl, compressed);
                }
                const results = await pipeline.exec();
                const success = results?.every(([err, result]) => err === null && result === 'OK') || false;
                if (success) {
                    redis_1.redisManager.incrementSets();
                    logger_1.loggers.cache.debug({
                        keyCount: Object.keys(keyValuePairs).length,
                        ttl,
                    }, 'Cache mset operation successful');
                }
                return success;
            }
            catch (error) {
                logger_1.loggers.cache.error({ error, keyCount: Object.keys(keyValuePairs).length }, 'Cache mset operation failed');
                return false;
            }
        }, 'cache_mset', { keyCount: Object.keys(keyValuePairs).length, namespace: options.namespace });
    }
    /**
     * Delete multiple keys at once
     */
    async mdel(keys, options = {}) {
        try {
            const client = redis_1.redisManager.getClient();
            const cacheKeys = keys.map((key) => this.generateKey(key, options.namespace));
            const result = await client.del(...cacheKeys);
            if (result > 0) {
                redis_1.redisManager.incrementDeletes();
                logger_1.loggers.cache.debug({ keys: cacheKeys, deleted: result }, 'Cache mdel operation');
            }
            return result;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, keys }, 'Cache mdel operation failed');
            return 0;
        }
    }
    /**
     * Clear all cache keys with pattern
     */
    async clear(pattern, options = {}) {
        try {
            const client = redis_1.redisManager.getClient();
            const searchPattern = pattern
                ? this.generateKey(pattern, options.namespace)
                : this.generateKey('*', options.namespace);
            const keys = await client.keys(searchPattern);
            if (keys.length === 0) {
                return 0;
            }
            const result = await client.del(...keys);
            logger_1.loggers.cache.info({ pattern: searchPattern, deleted: result }, 'Cache clear operation');
            return result;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, pattern }, 'Cache clear operation failed');
            return 0;
        }
    }
    /**
     * Tag a key for bulk invalidation
     */
    async tagKey(key, tags) {
        try {
            const client = redis_1.redisManager.getClient();
            const pipeline = client.pipeline();
            for (const tag of tags) {
                const tagKey = this.generateKey(`tag:${tag}`, 'general');
                pipeline.sadd(tagKey, key);
                pipeline.expire(tagKey, this.defaultTTL * 2); // Tags live longer than data
            }
            await pipeline.exec();
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, key, tags }, 'Failed to tag cache key');
        }
    }
    /**
     * Invalidate all keys with specific tags
     */
    async invalidateByTags(tags) {
        try {
            const client = redis_1.redisManager.getClient();
            let totalDeleted = 0;
            for (const tag of tags) {
                const tagKey = this.generateKey(`tag:${tag}`, 'general');
                const keys = await client.smembers(tagKey);
                if (keys.length > 0) {
                    const deleted = await client.del(...keys);
                    totalDeleted += deleted;
                }
                // Remove the tag itself
                await client.del(tagKey);
            }
            logger_1.loggers.cache.info({ tags, deleted: totalDeleted }, 'Cache invalidation by tags');
            return totalDeleted;
        }
        catch (error) {
            logger_1.loggers.cache.error({ error, tags }, 'Cache invalidation by tags failed');
            return 0;
        }
    }
    /**
     * Get cache statistics
     */
    async getStats() {
        try {
            const client = redis_1.redisManager.getClient();
            const info = await client.info('memory');
            const keyspace = await client.info('keyspace');
            const metrics = redis_1.redisManager.getMetrics();
            // Parse memory usage
            const memoryMatch = info.match(/used_memory:(\d+)/);
            const memoryUsage = memoryMatch && memoryMatch[1] ? parseInt(memoryMatch[1], 10) : 0;
            // Parse total keys
            const keyspaceMatch = keyspace.match(/keys=(\d+)/);
            const totalKeys = keyspaceMatch && keyspaceMatch[1] ? parseInt(keyspaceMatch[1], 10) : 0;
            return {
                totalKeys,
                memoryUsage,
                hitRate: metrics.hitRate,
                operations: {
                    gets: metrics.hits + metrics.misses,
                    sets: metrics.sets,
                    deletes: metrics.deletes,
                    hits: metrics.hits,
                    misses: metrics.misses,
                },
            };
        }
        catch (error) {
            logger_1.loggers.cache.error({ error }, 'Failed to get cache stats');
            return {
                totalKeys: 0,
                memoryUsage: 0,
                hitRate: 0,
                operations: { gets: 0, sets: 0, deletes: 0, hits: 0, misses: 0 },
            };
        }
    }
    /**
     * Cache wrapper for functions
     */
    async wrap(key, fn, options = {}) {
        // Try to get from cache first
        const cached = await this.get(key, options);
        if (cached !== null) {
            return cached;
        }
        // Execute function and cache result
        const result = await fn();
        await this.set(key, result, options);
        return result;
    }
    // Namespace-specific helper methods
    users = {
        get: (key, options) => this.get(key, { ...options, namespace: this.namespaces.users }),
        set: (key, value, options) => this.set(key, value, { ...options, namespace: this.namespaces.users }),
        delete: (key) => this.delete(key, { namespace: this.namespaces.users }),
        clear: (pattern) => this.clear(pattern, { namespace: this.namespaces.users }),
    };
    channels = {
        get: (key, options) => this.get(key, { ...options, namespace: this.namespaces.channels }),
        set: (key, value, options) => this.set(key, value, { ...options, namespace: this.namespaces.channels }),
        delete: (key) => this.delete(key, { namespace: this.namespaces.channels }),
        clear: (pattern) => this.clear(pattern, { namespace: this.namespaces.channels }),
    };
    tasks = {
        get: (key, options) => this.get(key, { ...options, namespace: this.namespaces.tasks }),
        set: (key, value, options) => this.set(key, value, { ...options, namespace: this.namespaces.tasks }),
        delete: (key) => this.delete(key, { namespace: this.namespaces.tasks }),
        clear: (pattern) => this.clear(pattern, { namespace: this.namespaces.tasks }),
    };
    sessions = {
        get: (key, options) => this.get(key, { ...options, namespace: this.namespaces.sessions }),
        set: (key, value, options) => this.set(key, value, { ...options, namespace: this.namespaces.sessions }),
        delete: (key) => this.delete(key, { namespace: this.namespaces.sessions }),
        clear: (pattern) => this.clear(pattern, { namespace: this.namespaces.sessions }),
    };
    messages = {
        get: (key, options) => this.get(key, { ...options, namespace: 'messages' }),
        set: (key, value, options) => this.set(key, value, { ...options, namespace: 'messages' }),
        delete: (key) => this.delete(key, { namespace: 'messages' }),
        clear: (pattern) => this.clear(pattern, { namespace: 'messages' }),
    };
}
// Export singleton instance
exports.cacheService = new CacheService();
exports.default = exports.cacheService;
//# sourceMappingURL=CacheService.js.map