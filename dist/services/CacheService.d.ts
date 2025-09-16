/**
 * High-performance caching service with Redis backend
 * Enterprise-grade caching with compression, serialization, and TTL management
 */
export interface CacheOptions {
    ttl?: number;
    compress?: boolean;
    serialize?: boolean;
    namespace?: string;
    tags?: string[];
}
export interface CacheSetOptions extends CacheOptions {
    nx?: boolean;
    ex?: number;
}
export interface CacheStats {
    totalKeys: number;
    memoryUsage: number;
    hitRate: number;
    operations: {
        gets: number;
        sets: number;
        deletes: number;
        hits: number;
        misses: number;
    };
}
declare class CacheService {
    private defaultTTL;
    private compressionThreshold;
    private maxKeyLength;
    private namespacePrefix;
    private namespaces;
    /**
     * Generate cache key with namespace
     */
    private generateKey;
    /**
     * Serialize value for storage
     */
    private serialize;
    /**
     * Deserialize value from storage
     */
    private deserialize;
    /**
     * Compress value if needed
     */
    private compress;
    /**
     * Decompress value if needed
     */
    private decompress;
    /**
     * Get value from cache
     */
    get<T = any>(key: string, options?: CacheOptions): Promise<T | null>;
    /**
     * Set value in cache
     */
    set(key: string, value: any, options?: CacheSetOptions): Promise<boolean>;
    /**
     * Delete value from cache
     */
    delete(key: string, options?: CacheOptions): Promise<boolean>;
    /**
     * Check if key exists in cache
     */
    exists(key: string, options?: CacheOptions): Promise<boolean>;
    /**
     * Set expiration time for existing key
     */
    expire(key: string, ttl: number, options?: CacheOptions): Promise<boolean>;
    /**
     * Get remaining TTL for key
     */
    ttl(key: string, options?: CacheOptions): Promise<number>;
    /**
     * Get multiple values at once
     */
    mget<T = any>(keys: string[], options?: CacheOptions): Promise<(T | null)[]>;
    /**
     * Set multiple values at once
     */
    mset(keyValuePairs: Record<string, any>, options?: CacheOptions): Promise<boolean>;
    /**
     * Delete multiple keys at once
     */
    mdel(keys: string[], options?: CacheOptions): Promise<number>;
    /**
     * Clear all cache keys with pattern
     */
    clear(pattern?: string, options?: CacheOptions): Promise<number>;
    /**
     * Tag a key for bulk invalidation
     */
    private tagKey;
    /**
     * Invalidate all keys with specific tags
     */
    invalidateByTags(tags: string[]): Promise<number>;
    /**
     * Get cache statistics
     */
    getStats(): Promise<CacheStats>;
    /**
     * Cache wrapper for functions
     */
    wrap<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T>;
    users: {
        get: <T>(key: string, options?: CacheOptions) => Promise<T | null>;
        set: (key: string, value: any, options?: CacheSetOptions) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        clear: (pattern?: string) => Promise<number>;
    };
    channels: {
        get: <T>(key: string, options?: CacheOptions) => Promise<T | null>;
        set: (key: string, value: any, options?: CacheSetOptions) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        clear: (pattern?: string) => Promise<number>;
    };
    tasks: {
        get: <T>(key: string, options?: CacheOptions) => Promise<T | null>;
        set: (key: string, value: any, options?: CacheSetOptions) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        clear: (pattern?: string) => Promise<number>;
    };
    sessions: {
        get: <T>(key: string, options?: CacheOptions) => Promise<T | null>;
        set: (key: string, value: any, options?: CacheSetOptions) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        clear: (pattern?: string) => Promise<number>;
    };
    messages: {
        get: <T>(key: string, options?: CacheOptions) => Promise<T | null>;
        set: (key: string, value: any, options?: CacheSetOptions) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        clear: (pattern?: string) => Promise<number>;
    };
}
export declare const cacheService: CacheService;
export default cacheService;
//# sourceMappingURL=CacheService.d.ts.map