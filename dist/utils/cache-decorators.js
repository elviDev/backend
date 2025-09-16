"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheWarmer = exports.CacheKeyUtils = void 0;
exports.Cacheable = Cacheable;
exports.CacheEvict = CacheEvict;
exports.CachePut = CachePut;
exports.CacheConfig = CacheConfig;
const CacheService_1 = require("../services/CacheService");
const logger_1 = require("./logger");
/**
 * Decorator for caching method results
 */
function Cacheable(options = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const className = target.constructor.name;
            const methodName = propertyKey;
            // Check condition if provided
            if (options.condition && !options.condition.apply(this, args)) {
                return await originalMethod.apply(this, args);
            }
            // Generate cache key
            const defaultKeyGenerator = (...args) => {
                const serializedArgs = args
                    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
                    .join(':');
                return `${className}:${methodName}:${serializedArgs}`;
            };
            const keyGenerator = options.keyGenerator || defaultKeyGenerator;
            const cacheKey = keyGenerator.apply(this, args);
            try {
                // Try to get from cache
                const getOptions = {};
                if (typeof options.namespace !== 'undefined') {
                    getOptions.namespace = options.namespace;
                }
                if (typeof options.serialize !== 'undefined') {
                    getOptions.serialize = options.serialize;
                }
                const cached = await CacheService_1.cacheService.get(cacheKey, getOptions);
                if (cached !== null) {
                    logger_1.loggers.cache.debug?.({
                        className,
                        methodName,
                        cacheKey,
                        hit: true,
                    }, 'Cache hit for method');
                    return cached;
                }
                // Execute original method
                const result = await originalMethod.apply(this, args);
                // Cache the result
                const setOptions = {};
                if (typeof options.ttl !== 'undefined')
                    setOptions.ttl = options.ttl;
                if (typeof options.namespace !== 'undefined')
                    setOptions.namespace = options.namespace;
                if (typeof options.serialize !== 'undefined')
                    setOptions.serialize = options.serialize;
                if (typeof options.compress !== 'undefined')
                    setOptions.compress = options.compress;
                if (typeof options.tags !== 'undefined')
                    setOptions.tags = options.tags;
                await CacheService_1.cacheService.set(cacheKey, result, setOptions);
                logger_1.loggers.cache.debug?.({
                    className,
                    methodName,
                    cacheKey,
                    hit: false,
                    ttl: options.ttl,
                }, 'Cache miss, result cached');
                return result;
            }
            catch (cacheError) {
                logger_1.loggers.cache.warn?.({
                    error: cacheError,
                    className,
                    methodName,
                    cacheKey,
                }, 'Cache operation failed, executing method directly');
                // Fall back to executing the method directly
                return await originalMethod.apply(this, args);
            }
        };
        return descriptor;
    };
}
/**
 * Decorator for cache invalidation on method execution
 */
function CacheEvict(options = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const className = target.constructor.name;
            const methodName = propertyKey;
            // Check condition if provided
            if (options.condition && !options.condition.apply(this, args)) {
                return await originalMethod.apply(this, args);
            }
            const evictCache = async () => {
                try {
                    if (options.tags && options.tags.length > 0) {
                        // Invalidate by tags
                        const invalidated = await CacheService_1.cacheService.invalidateByTags(options.tags);
                        logger_1.loggers.cache.info?.({
                            className,
                            methodName,
                            tags: options.tags,
                            invalidated,
                        }, 'Cache invalidated by tags');
                    }
                    else if (options.allEntries) {
                        // Clear all entries in namespace
                        const clearOptions = {};
                        if (typeof options.namespace !== 'undefined') {
                            clearOptions.namespace = options.namespace;
                        }
                        const cleared = await CacheService_1.cacheService.clear(undefined, clearOptions);
                        logger_1.loggers.cache.info?.({
                            className,
                            methodName,
                            namespace: options.namespace,
                            cleared,
                        }, 'All cache entries cleared');
                    }
                    else if (options.keys) {
                        // Invalidate specific keys
                        const keysToEvict = typeof options.keys === 'function' ? options.keys.apply(this, args) : options.keys;
                        const keys = Array.isArray(keysToEvict) ? keysToEvict : [keysToEvict];
                        for (const key of keys) {
                            const deleteOptions = {};
                            if (typeof options.namespace !== 'undefined') {
                                deleteOptions.namespace = options.namespace;
                            }
                            await CacheService_1.cacheService.delete(key, deleteOptions);
                        }
                        logger_1.loggers.cache.info?.({
                            className,
                            methodName,
                            keys,
                            namespace: options.namespace,
                        }, 'Cache keys evicted');
                    }
                }
                catch (error) {
                    logger_1.loggers.cache.error?.({
                        error,
                        className,
                        methodName,
                    }, 'Cache eviction failed');
                }
            };
            if (options.beforeInvocation) {
                await evictCache();
            }
            try {
                const result = await originalMethod.apply(this, args);
                if (!options.beforeInvocation) {
                    await evictCache();
                }
                return result;
            }
            catch (error) {
                // If method fails and beforeInvocation is false, don't evict cache
                if (options.beforeInvocation) {
                    logger_1.loggers.cache.warn?.({
                        className,
                        methodName,
                        error,
                    }, 'Method failed after cache eviction');
                }
                throw error;
            }
        };
        return descriptor;
    };
}
/**
 * Decorator for caching with automatic invalidation
 */
function CachePut(options = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const className = target.constructor.name;
            const methodName = propertyKey;
            // Check condition if provided
            if (options.condition && !options.condition.apply(this, args)) {
                return await originalMethod.apply(this, args);
            }
            const result = await originalMethod.apply(this, args);
            // Check unless condition
            if (options.unless && options.unless(result)) {
                return result;
            }
            try {
                // Generate cache key
                const defaultKey = `${className}:${methodName}:${args
                    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
                    .join(':')}`;
                const cacheKey = options.key
                    ? typeof options.key === 'function'
                        ? options.key.apply(this, args)
                        : options.key
                    : defaultKey;
                // Cache the result
                const setOptions = {};
                if (typeof options.ttl !== 'undefined')
                    setOptions.ttl = options.ttl;
                if (typeof options.namespace !== 'undefined')
                    setOptions.namespace = options.namespace;
                if (typeof options.tags !== 'undefined')
                    setOptions.tags = options.tags;
                await CacheService_1.cacheService.set(cacheKey, result, setOptions);
                logger_1.loggers.cache.debug?.({
                    className,
                    methodName,
                    cacheKey,
                    namespace: options.namespace,
                    ttl: options.ttl,
                }, 'Result cached via @CachePut');
            }
            catch (error) {
                logger_1.loggers.cache.warn?.({
                    error,
                    className,
                    methodName,
                }, 'Failed to cache result via @CachePut');
            }
            return result;
        };
        return descriptor;
    };
}
/**
 * Class-level cache configuration
 */
function CacheConfig(config) {
    return function (constructor) {
        // Store cache configuration on the prototype
        constructor.prototype._cacheConfig = config;
        return constructor;
    };
}
/**
 * Utility functions for cache key generation
 */
exports.CacheKeyUtils = {
    /**
     * Generate key from user ID
     */
    userKey: (userId, suffix) => `user:${userId}${suffix ? `:${suffix}` : ''}`,
    /**
     * Generate key from channel ID
     */
    channelKey: (channelId, suffix) => `channel:${channelId}${suffix ? `:${suffix}` : ''}`,
    /**
     * Generate key from task ID
     */
    taskKey: (taskId, suffix) => `task:${taskId}${suffix ? `:${suffix}` : ''}`,
    /**
     * Generate key from multiple parameters
     */
    multiKey: (...parts) => parts.join(':'),
    /**
     * Generate pagination key
     */
    paginationKey: (baseKey, limit, offset) => `${baseKey}:page:${limit}:${offset}`,
    /**
     * Generate search key
     */
    searchKey: (query, filters) => {
        const filterKey = filters ? `:${JSON.stringify(filters)}` : '';
        return `search:${encodeURIComponent(query)}${filterKey}`;
    },
    /**
     * Generate key from message ID
     */
    messageKey: (messageId, suffix) => `message:${messageId}${suffix ? `:${suffix}` : ''}`,
    /**
     * Generate key for channel messages
     */
    channelMessagesKey: (channelId, suffix) => `channel:${channelId}:messages${suffix ? `:${suffix}` : ''}`,
};
/**
 * Cache warming utilities
 */
class CacheWarmer {
    /**
     * Warm cache with user data
     */
    static async warmUserCache(userId, userData) {
        try {
            await CacheService_1.cacheService.users.set(exports.CacheKeyUtils.userKey(userId), userData, { ttl: 3600 } // 1 hour
            );
        }
        catch (error) {
            logger_1.loggers.cache.warn?.({ error, userId }, 'Failed to warm user cache');
        }
    }
    /**
     * Warm cache with channel data
     */
    static async warmChannelCache(channelId, channelData) {
        try {
            await CacheService_1.cacheService.channels.set(exports.CacheKeyUtils.channelKey(channelId), channelData, { ttl: 1800 } // 30 minutes
            );
        }
        catch (error) {
            logger_1.loggers.cache.warn?.({ error, channelId }, 'Failed to warm channel cache');
        }
    }
    /**
     * Warm cache with task data
     */
    static async warmTaskCache(taskId, taskData) {
        try {
            await CacheService_1.cacheService.tasks.set(exports.CacheKeyUtils.taskKey(taskId), taskData, { ttl: 900 } // 15 minutes
            );
        }
        catch (error) {
            logger_1.loggers.cache.warn?.({ error, taskId }, 'Failed to warm task cache');
        }
    }
}
exports.CacheWarmer = CacheWarmer;
exports.default = {
    Cacheable,
    CacheEvict,
    CachePut,
    CacheConfig,
    CacheKeyUtils: exports.CacheKeyUtils,
    CacheWarmer,
};
//# sourceMappingURL=cache-decorators.js.map