import { cacheService, CacheOptions } from '../services/CacheService';
import { logger, loggers } from './logger';

/**
 * Cache decorators for automatic caching of method results
 * Enterprise-grade caching with TTL, invalidation, and error handling
 */

export interface CacheableOptions extends CacheOptions {
  keyGenerator?: (...args: any[]) => string;
  condition?: (...args: any[]) => boolean;
  invalidateOnError?: boolean;
}

/**
 * Decorator for caching method results
 */
export function Cacheable(options: CacheableOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const className = target.constructor.name;
      const methodName = propertyKey;

      // Check condition if provided
      if (options.condition && !options.condition.apply(this, args)) {
        return await originalMethod.apply(this, args);
      }

      // Generate cache key
      const defaultKeyGenerator = (...args: any[]) => {
        const serializedArgs = args
          .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(':');
        return `${className}:${methodName}:${serializedArgs}`;
      };

      const keyGenerator = options.keyGenerator || defaultKeyGenerator;
      const cacheKey = keyGenerator.apply(this, args);

      try {
        // Try to get from cache
        const getOptions: CacheOptions = {};
        if (typeof options.namespace !== 'undefined') {
          getOptions.namespace = options.namespace as string;
        }
        if (typeof options.serialize !== 'undefined') {
          getOptions.serialize = options.serialize;
        }
        const cached = await cacheService.get(cacheKey, getOptions);

        if (cached !== null) {
          loggers.cache.debug?.(
            {
              className,
              methodName,
              cacheKey,
              hit: true,
            },
            'Cache hit for method'
          );
          return cached;
        }

        // Execute original method
        const result = await originalMethod.apply(this, args);

        // Cache the result
        const setOptions: any = {};
        if (typeof options.ttl !== 'undefined') setOptions.ttl = options.ttl;
        if (typeof options.namespace !== 'undefined') setOptions.namespace = options.namespace;
        if (typeof options.serialize !== 'undefined') setOptions.serialize = options.serialize;
        if (typeof options.compress !== 'undefined') setOptions.compress = options.compress;
        if (typeof options.tags !== 'undefined') setOptions.tags = options.tags;

        await cacheService.set(cacheKey, result, setOptions);

        loggers.cache.debug?.(
          {
            className,
            methodName,
            cacheKey,
            hit: false,
            ttl: options.ttl,
          },
          'Cache miss, result cached'
        );

        return result;
      } catch (cacheError) {
        loggers.cache.warn?.(
          {
            error: cacheError,
            className,
            methodName,
            cacheKey,
          },
          'Cache operation failed, executing method directly'
        );

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
export function CacheEvict(
  options: {
    keys?: string | string[] | ((...args: any[]) => string | string[]);
    allEntries?: boolean;
    beforeInvocation?: boolean;
    namespace?: string;
    tags?: string[];
    condition?: (...args: any[]) => boolean;
  } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
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
            const invalidated = await cacheService.invalidateByTags(options.tags);
            loggers.cache.info?.(
              {
                className,
                methodName,
                tags: options.tags,
                invalidated,
              },
              'Cache invalidated by tags'
            );
          } else if (options.allEntries) {
            // Clear all entries in namespace
            const clearOptions: CacheOptions = {};
            if (typeof options.namespace !== 'undefined') {
              clearOptions.namespace = options.namespace as string;
            }
            const cleared = await cacheService.clear(undefined, clearOptions);
            loggers.cache.info?.(
              {
                className,
                methodName,
                namespace: options.namespace,
                cleared,
              },
              'All cache entries cleared'
            );
          } else if (options.keys) {
            // Invalidate specific keys
            const keysToEvict =
              typeof options.keys === 'function' ? options.keys.apply(this, args) : options.keys;

            const keys = Array.isArray(keysToEvict) ? keysToEvict : [keysToEvict];

            for (const key of keys) {
              const deleteOptions: CacheOptions = {};
              if (typeof options.namespace !== 'undefined') {
                deleteOptions.namespace = options.namespace as string;
              }
              await cacheService.delete(key, deleteOptions);
            }

            loggers.cache.info?.(
              {
                className,
                methodName,
                keys,
                namespace: options.namespace,
              },
              'Cache keys evicted'
            );
          }
        } catch (error) {
          loggers.cache.error?.(
            {
              error,
              className,
              methodName,
            },
            'Cache eviction failed'
          );
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
      } catch (error) {
        // If method fails and beforeInvocation is false, don't evict cache
        if (options.beforeInvocation) {
          loggers.cache.warn?.(
            {
              className,
              methodName,
              error,
            },
            'Method failed after cache eviction'
          );
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
export function CachePut(
  options: {
    key?: string | ((...args: any[]) => string);
    namespace?: string;
    ttl?: number;
    condition?: (...args: any[]) => boolean;
    unless?: (result: any) => boolean;
    tags?: string[];
  } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
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
        const setOptions: any = {};
        if (typeof options.ttl !== 'undefined') setOptions.ttl = options.ttl;
        if (typeof options.namespace !== 'undefined') setOptions.namespace = options.namespace;
        if (typeof options.tags !== 'undefined') setOptions.tags = options.tags;
        await cacheService.set(cacheKey, result, setOptions);

        loggers.cache.debug?.(
          {
            className,
            methodName,
            cacheKey,
            namespace: options.namespace,
            ttl: options.ttl,
          },
          'Result cached via @CachePut'
        );
      } catch (error) {
        loggers.cache.warn?.(
          {
            error,
            className,
            methodName,
          },
          'Failed to cache result via @CachePut'
        );
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Class-level cache configuration
 */
export function CacheConfig(config: {
  namespace?: string;
  defaultTTL?: number;
  keyPrefix?: string;
}) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    // Store cache configuration on the prototype
    constructor.prototype._cacheConfig = config;
    return constructor;
  };
}

/**
 * Utility functions for cache key generation
 */
export const CacheKeyUtils = {
  /**
   * Generate key from user ID
   */
  userKey: (userId: string, suffix?: string) => `user:${userId}${suffix ? `:${suffix}` : ''}`,

  /**
   * Generate key from channel ID
   */
  channelKey: (channelId: string, suffix?: string) =>
    `channel:${channelId}${suffix ? `:${suffix}` : ''}`,

  /**
   * Generate key from task ID
   */
  taskKey: (taskId: string, suffix?: string) => `task:${taskId}${suffix ? `:${suffix}` : ''}`,

  /**
   * Generate key from multiple parameters
   */
  multiKey: (...parts: string[]) => parts.join(':'),

  /**
   * Generate pagination key
   */
  paginationKey: (baseKey: string, limit: number, offset: number) =>
    `${baseKey}:page:${limit}:${offset}`,

  /**
   * Generate search key
   */
  searchKey: (query: string, filters?: Record<string, any>) => {
    const filterKey = filters ? `:${JSON.stringify(filters)}` : '';
    return `search:${encodeURIComponent(query)}${filterKey}`;
  },

  /**
   * Generate key from message ID
   */
  messageKey: (messageId: string, suffix?: string) =>
    `message:${messageId}${suffix ? `:${suffix}` : ''}`,

  /**
   * Generate key for channel messages
   */
  channelMessagesKey: (channelId: string, suffix?: string) =>
    `channel:${channelId}:messages${suffix ? `:${suffix}` : ''}`,
};

/**
 * Cache warming utilities
 */
export class CacheWarmer {
  /**
   * Warm cache with user data
   */
  static async warmUserCache(userId: string, userData: any): Promise<void> {
    try {
      await cacheService.users.set(
        CacheKeyUtils.userKey(userId),
        userData,
        { ttl: 3600 } // 1 hour
      );
    } catch (error) {
      loggers.cache.warn?.({ error, userId }, 'Failed to warm user cache');
    }
  }

  /**
   * Warm cache with channel data
   */
  static async warmChannelCache(channelId: string, channelData: any): Promise<void> {
    try {
      await cacheService.channels.set(
        CacheKeyUtils.channelKey(channelId),
        channelData,
        { ttl: 1800 } // 30 minutes
      );
    } catch (error) {
      loggers.cache.warn?.({ error, channelId }, 'Failed to warm channel cache');
    }
  }

  /**
   * Warm cache with task data
   */
  static async warmTaskCache(taskId: string, taskData: any): Promise<void> {
    try {
      await cacheService.tasks.set(
        CacheKeyUtils.taskKey(taskId),
        taskData,
        { ttl: 900 } // 15 minutes
      );
    } catch (error) {
      loggers.cache.warn?.({ error, taskId }, 'Failed to warm task cache');
    }
  }
}

export default {
  Cacheable,
  CacheEvict,
  CachePut,
  CacheConfig,
  CacheKeyUtils,
  CacheWarmer,
};
