import { CacheOptions } from '../services/CacheService';
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
export declare function Cacheable(options?: CacheableOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Decorator for cache invalidation on method execution
 */
export declare function CacheEvict(options?: {
    keys?: string | string[] | ((...args: any[]) => string | string[]);
    allEntries?: boolean;
    beforeInvocation?: boolean;
    namespace?: string;
    tags?: string[];
    condition?: (...args: any[]) => boolean;
}): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Decorator for caching with automatic invalidation
 */
export declare function CachePut(options?: {
    key?: string | ((...args: any[]) => string);
    namespace?: string;
    ttl?: number;
    condition?: (...args: any[]) => boolean;
    unless?: (result: any) => boolean;
    tags?: string[];
}): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Class-level cache configuration
 */
export declare function CacheConfig(config: {
    namespace?: string;
    defaultTTL?: number;
    keyPrefix?: string;
}): <T extends {
    new (...args: any[]): {};
}>(constructor: T) => T;
/**
 * Utility functions for cache key generation
 */
export declare const CacheKeyUtils: {
    /**
     * Generate key from user ID
     */
    userKey: (userId: string, suffix?: string) => string;
    /**
     * Generate key from channel ID
     */
    channelKey: (channelId: string, suffix?: string) => string;
    /**
     * Generate key from task ID
     */
    taskKey: (taskId: string, suffix?: string) => string;
    /**
     * Generate key from multiple parameters
     */
    multiKey: (...parts: string[]) => string;
    /**
     * Generate pagination key
     */
    paginationKey: (baseKey: string, limit: number, offset: number) => string;
    /**
     * Generate search key
     */
    searchKey: (query: string, filters?: Record<string, any>) => string;
    /**
     * Generate key from message ID
     */
    messageKey: (messageId: string, suffix?: string) => string;
    /**
     * Generate key for channel messages
     */
    channelMessagesKey: (channelId: string, suffix?: string) => string;
};
/**
 * Cache warming utilities
 */
export declare class CacheWarmer {
    /**
     * Warm cache with user data
     */
    static warmUserCache(userId: string, userData: any): Promise<void>;
    /**
     * Warm cache with channel data
     */
    static warmChannelCache(channelId: string, channelData: any): Promise<void>;
    /**
     * Warm cache with task data
     */
    static warmTaskCache(taskId: string, taskData: any): Promise<void>;
}
declare const _default: {
    Cacheable: typeof Cacheable;
    CacheEvict: typeof CacheEvict;
    CachePut: typeof CachePut;
    CacheConfig: typeof CacheConfig;
    CacheKeyUtils: {
        /**
         * Generate key from user ID
         */
        userKey: (userId: string, suffix?: string) => string;
        /**
         * Generate key from channel ID
         */
        channelKey: (channelId: string, suffix?: string) => string;
        /**
         * Generate key from task ID
         */
        taskKey: (taskId: string, suffix?: string) => string;
        /**
         * Generate key from multiple parameters
         */
        multiKey: (...parts: string[]) => string;
        /**
         * Generate pagination key
         */
        paginationKey: (baseKey: string, limit: number, offset: number) => string;
        /**
         * Generate search key
         */
        searchKey: (query: string, filters?: Record<string, any>) => string;
        /**
         * Generate key from message ID
         */
        messageKey: (messageId: string, suffix?: string) => string;
        /**
         * Generate key for channel messages
         */
        channelMessagesKey: (channelId: string, suffix?: string) => string;
    };
    CacheWarmer: typeof CacheWarmer;
};
export default _default;
//# sourceMappingURL=cache-decorators.d.ts.map