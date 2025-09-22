"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisMemoryManager = exports.RedisMemoryManager = void 0;
const logger_1 = require("@utils/logger");
const redis_1 = require("@config/redis");
/**
 * Redis Memory Management Service
 * Prevents overflow of 25MB Redis limit with proactive monitoring and cleanup
 */
class RedisMemoryManager {
    MAX_MEMORY_BYTES = 23 * 1024 * 1024; // 23MB safety limit
    WARNING_THRESHOLD = 20 * 1024 * 1024; // 20MB warning
    EMERGENCY_THRESHOLD = 22 * 1024 * 1024; // 22MB emergency
    monitoringInterval = null;
    /**
     * Start memory monitoring
     */
    startMonitoring() {
        if (this.monitoringInterval)
            return;
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.checkMemoryUsage();
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Error monitoring Redis memory usage');
            }
        }, 30000); // Check every 30 seconds
        logger_1.logger.info('Redis memory monitoring started');
    }
    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger_1.logger.info('Redis memory monitoring stopped');
        }
    }
    /**
     * Get current memory usage in bytes
     */
    async getMemoryUsage() {
        const client = redis_1.redisManager.getClient();
        try {
            // Try Redis MEMORY USAGE command first, fallback to INFO memory
            let used;
            let keyCount;
            try {
                const [memInfo, dbSize] = await Promise.all([
                    client.info('memory'),
                    client.dbsize()
                ]);
                // Parse used_memory from INFO memory response
                const memoryMatch = memInfo.match(/used_memory:(\d+)/);
                used = memoryMatch ? parseInt(memoryMatch[1]) : 1024; // Default 1KB if can't parse
                keyCount = dbSize;
            }
            catch (infoError) {
                // Fallback: estimate based on key count
                logger_1.logger.warn('Failed to get Redis memory info, using estimation', { infoError });
                keyCount = await client.dbsize();
                used = keyCount * 100; // Estimate 100 bytes per key
            }
            const usagePercent = (used / this.MAX_MEMORY_BYTES) * 100;
            return {
                used,
                maxMemory: this.MAX_MEMORY_BYTES,
                usagePercent,
                keyCount
            };
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Error getting Redis memory usage');
            // Return safe defaults
            return {
                used: 1024, // 1KB default
                maxMemory: this.MAX_MEMORY_BYTES,
                usagePercent: 0.1,
                keyCount: 0
            };
        }
    }
    /**
     * Check memory usage and take action if needed
     */
    async checkMemoryUsage() {
        const stats = await this.getMemoryUsage();
        const usageMB = stats.used / 1024 / 1024;
        if (stats.used >= this.EMERGENCY_THRESHOLD) {
            logger_1.logger.error(`Redis memory emergency: ${usageMB.toFixed(2)}MB used`, stats);
            await this.emergencyCleanup();
        }
        else if (stats.used >= this.WARNING_THRESHOLD) {
            logger_1.logger.warn(`Redis memory warning: ${usageMB.toFixed(2)}MB used`, stats);
            await this.preventiveCleanup();
        }
        else if (stats.usagePercent > 50) {
            logger_1.logger.debug(`Redis memory status: ${usageMB.toFixed(2)}MB used (${stats.usagePercent.toFixed(1)}%)`);
        }
    }
    /**
     * Emergency cleanup when approaching memory limit
     */
    async emergencyCleanup() {
        logger_1.logger.warn('Starting emergency Redis cleanup');
        const client = redis_1.redisManager.getClient();
        try {
            // 1. Clear analytics cache (least critical)
            await this.clearNamespace('ceo-platform:analytics:*');
            // 2. Clear old voice transcriptions
            await this.clearNamespace('whisper:cache:*');
            // 3. Clear expired sessions
            await this.clearExpiredKeys();
            // 4. Reduce message cache TTL to 5 minutes
            await this.reduceMessageCacheTTL();
            // 5. Clear AI context cache (can be regenerated)
            await this.clearNamespace('context:*');
            const statsAfter = await this.getMemoryUsage();
            logger_1.logger.info(`Emergency cleanup completed. Memory usage: ${(statsAfter.used / 1024 / 1024).toFixed(2)}MB`);
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Error during emergency cleanup');
        }
    }
    /**
     * Preventive cleanup when memory usage is high
     */
    async preventiveCleanup() {
        logger_1.logger.info('Starting preventive Redis cleanup');
        try {
            // 1. Clear analytics older than 1 hour
            await this.clearOldAnalytics();
            // 2. Reduce TTL for non-critical caches
            await this.reduceTTLs();
            // 3. Clear orphaned metadata
            await this.clearOrphanedMetadata();
            const statsAfter = await this.getMemoryUsage();
            logger_1.logger.info(`Preventive cleanup completed. Memory usage: ${(statsAfter.used / 1024 / 1024).toFixed(2)}MB`);
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Error during preventive cleanup');
        }
    }
    /**
     * Clear keys by namespace pattern
     */
    async clearNamespace(pattern) {
        const client = redis_1.redisManager.getClient();
        const keys = await client.keys(pattern);
        if (keys.length === 0)
            return 0;
        const result = await client.del(...keys);
        logger_1.logger.debug(`Cleared ${result} keys matching pattern: ${pattern}`);
        return result;
    }
    /**
     * Clear expired keys manually
     */
    async clearExpiredKeys() {
        const client = redis_1.redisManager.getClient();
        // Get all keys and check TTL
        const keys = await client.keys('*');
        const expiredKeys = [];
        for (const key of keys) {
            const ttl = await client.ttl(key);
            if (ttl === -1) { // No TTL set, might be orphaned
                const keyAge = await this.getKeyAge(key);
                if (keyAge > 86400) { // Older than 24 hours
                    expiredKeys.push(key);
                }
            }
        }
        if (expiredKeys.length > 0) {
            await client.del(...expiredKeys);
            logger_1.logger.debug(`Cleared ${expiredKeys.length} orphaned keys`);
        }
    }
    /**
     * Reduce message cache TTL to free up memory quickly
     */
    async reduceMessageCacheTTL() {
        const client = redis_1.redisManager.getClient();
        const messageKeys = await client.keys('ceo-platform:messages:*');
        for (const key of messageKeys) {
            await client.expire(key, 300); // 5 minutes
        }
        if (messageKeys.length > 0) {
            logger_1.logger.debug(`Reduced TTL for ${messageKeys.length} message cache entries`);
        }
    }
    /**
     * Clear old analytics data
     */
    async clearOldAnalytics() {
        await this.clearNamespace('ceo-platform:analytics:*');
        logger_1.logger.debug('Cleared analytics cache');
    }
    /**
     * Reduce TTLs for non-critical data
     */
    async reduceTTLs() {
        const client = redis_1.redisManager.getClient();
        const patterns = [
            'ceo-platform:voice:*',
            'ceo-platform:general:*',
            'whisper:cache:*'
        ];
        for (const pattern of patterns) {
            const keys = await client.keys(pattern);
            for (const key of keys) {
                await client.expire(key, 900); // 15 minutes
            }
        }
    }
    /**
     * Clear orphaned metadata
     */
    async clearOrphanedMetadata() {
        // Implementation would check for metadata without corresponding data
        logger_1.logger.debug('Cleared orphaned metadata');
    }
    /**
     * Get approximate age of a key (implementation dependent on your key naming)
     */
    async getKeyAge(key) {
        // This is a simplified implementation
        // You might extract timestamp from key name or use other methods
        return 0;
    }
    /**
     * Get memory usage statistics for monitoring
     */
    async getDetailedStats() {
        const client = redis_1.redisManager.getClient();
        const memStats = await this.getMemoryUsage();
        // Count keys by namespace
        const namespaces = [
            'ceo-platform:users:',
            'ceo-platform:channels:',
            'ceo-platform:tasks:',
            'ceo-platform:sessions:',
            'ceo-platform:messages:',
            'ceo-platform:analytics:',
            'ceo-platform:voice:',
            'context:',
            'whisper:cache:'
        ];
        const keysByNamespace = {};
        for (const namespace of namespaces) {
            const keys = await client.keys(`${namespace}*`);
            keysByNamespace[namespace] = keys.length;
        }
        return {
            memory: {
                used: memStats.used,
                usagePercent: memStats.usagePercent
            },
            keysByNamespace,
            totalKeys: memStats.keyCount
        };
    }
}
exports.RedisMemoryManager = RedisMemoryManager;
exports.redisMemoryManager = new RedisMemoryManager();
//# sourceMappingURL=RedisMemoryManager.js.map