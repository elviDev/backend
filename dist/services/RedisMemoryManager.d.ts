/**
 * Redis Memory Management Service
 * Prevents overflow of 25MB Redis limit with proactive monitoring and cleanup
 */
export declare class RedisMemoryManager {
    private readonly MAX_MEMORY_BYTES;
    private readonly WARNING_THRESHOLD;
    private readonly EMERGENCY_THRESHOLD;
    private monitoringInterval;
    /**
     * Start memory monitoring
     */
    startMonitoring(): void;
    /**
     * Stop memory monitoring
     */
    stopMonitoring(): void;
    /**
     * Get current memory usage in bytes
     */
    getMemoryUsage(): Promise<{
        used: number;
        maxMemory: number;
        usagePercent: number;
        keyCount: number;
    }>;
    /**
     * Check memory usage and take action if needed
     */
    private checkMemoryUsage;
    /**
     * Emergency cleanup when approaching memory limit
     */
    private emergencyCleanup;
    /**
     * Preventive cleanup when memory usage is high
     */
    private preventiveCleanup;
    /**
     * Clear keys by namespace pattern
     */
    private clearNamespace;
    /**
     * Clear expired keys manually
     */
    private clearExpiredKeys;
    /**
     * Reduce message cache TTL to free up memory quickly
     */
    private reduceMessageCacheTTL;
    /**
     * Clear old analytics data
     */
    private clearOldAnalytics;
    /**
     * Reduce TTLs for non-critical data
     */
    private reduceTTLs;
    /**
     * Clear orphaned metadata
     */
    private clearOrphanedMetadata;
    /**
     * Get approximate age of a key (implementation dependent on your key naming)
     */
    private getKeyAge;
    /**
     * Get memory usage statistics for monitoring
     */
    getDetailedStats(): Promise<{
        memory: {
            used: number;
            usagePercent: number;
        };
        keysByNamespace: Record<string, number>;
        totalKeys: number;
    }>;
}
export declare const redisMemoryManager: RedisMemoryManager;
//# sourceMappingURL=RedisMemoryManager.d.ts.map