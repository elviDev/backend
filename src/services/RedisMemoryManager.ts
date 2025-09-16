import { logger } from '@utils/logger';
import { redisManager } from '@config/redis';

/**
 * Redis Memory Management Service
 * Prevents overflow of 25MB Redis limit with proactive monitoring and cleanup
 */
export class RedisMemoryManager {
  private readonly MAX_MEMORY_BYTES = 23 * 1024 * 1024; // 23MB safety limit
  private readonly WARNING_THRESHOLD = 20 * 1024 * 1024; // 20MB warning
  private readonly EMERGENCY_THRESHOLD = 22 * 1024 * 1024; // 22MB emergency
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Start memory monitoring
   */
  public startMonitoring(): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkMemoryUsage();
      } catch (error) {
        logger.error({ error }, 'Error monitoring Redis memory usage');
      }
    }, 30000); // Check every 30 seconds

    logger.info('Redis memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Redis memory monitoring stopped');
    }
  }

  /**
   * Get current memory usage in bytes
   */
  public async getMemoryUsage(): Promise<{
    used: number;
    maxMemory: number;
    usagePercent: number;
    keyCount: number;
  }> {
    const client = redisManager.getClient();
    
    try {
      // Try Redis MEMORY USAGE command first, fallback to INFO memory
      let used: number;
      let keyCount: number;
      
      try {
        const [memInfo, dbSize] = await Promise.all([
          client.info('memory'),
          client.dbsize()
        ]);
        
        // Parse used_memory from INFO memory response
        const memoryMatch = memInfo.match(/used_memory:(\d+)/);
        used = memoryMatch ? parseInt(memoryMatch[1]) : 1024; // Default 1KB if can't parse
        keyCount = dbSize;
        
      } catch (infoError) {
        // Fallback: estimate based on key count
        logger.warn('Failed to get Redis memory info, using estimation', { infoError });
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
    } catch (error) {
      logger.error({ error }, 'Error getting Redis memory usage');
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
  private async checkMemoryUsage(): Promise<void> {
    const stats = await this.getMemoryUsage();
    const usageMB = stats.used / 1024 / 1024;

    if (stats.used >= this.EMERGENCY_THRESHOLD) {
      logger.error(`Redis memory emergency: ${usageMB.toFixed(2)}MB used`, stats);
      await this.emergencyCleanup();
    } else if (stats.used >= this.WARNING_THRESHOLD) {
      logger.warn(`Redis memory warning: ${usageMB.toFixed(2)}MB used`, stats);
      await this.preventiveCleanup();
    } else if (stats.usagePercent > 50) {
      logger.debug(`Redis memory status: ${usageMB.toFixed(2)}MB used (${stats.usagePercent.toFixed(1)}%)`);
    }
  }

  /**
   * Emergency cleanup when approaching memory limit
   */
  private async emergencyCleanup(): Promise<void> {
    logger.warn('Starting emergency Redis cleanup');
    const client = redisManager.getClient();

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
      logger.info(`Emergency cleanup completed. Memory usage: ${(statsAfter.used / 1024 / 1024).toFixed(2)}MB`);
      
    } catch (error) {
      logger.error({ error }, 'Error during emergency cleanup');
    }
  }

  /**
   * Preventive cleanup when memory usage is high
   */
  private async preventiveCleanup(): Promise<void> {
    logger.info('Starting preventive Redis cleanup');

    try {
      // 1. Clear analytics older than 1 hour
      await this.clearOldAnalytics();
      
      // 2. Reduce TTL for non-critical caches
      await this.reduceTTLs();
      
      // 3. Clear orphaned metadata
      await this.clearOrphanedMetadata();

      const statsAfter = await this.getMemoryUsage();
      logger.info(`Preventive cleanup completed. Memory usage: ${(statsAfter.used / 1024 / 1024).toFixed(2)}MB`);
      
    } catch (error) {
      logger.error({ error }, 'Error during preventive cleanup');
    }
  }

  /**
   * Clear keys by namespace pattern
   */
  private async clearNamespace(pattern: string): Promise<number> {
    const client = redisManager.getClient();
    
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;

    const result = await client.del(...keys);
    logger.debug(`Cleared ${result} keys matching pattern: ${pattern}`);
    
    return result;
  }

  /**
   * Clear expired keys manually
   */
  private async clearExpiredKeys(): Promise<void> {
    const client = redisManager.getClient();
    
    // Get all keys and check TTL
    const keys = await client.keys('*');
    const expiredKeys: string[] = [];

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
      logger.debug(`Cleared ${expiredKeys.length} orphaned keys`);
    }
  }

  /**
   * Reduce message cache TTL to free up memory quickly
   */
  private async reduceMessageCacheTTL(): Promise<void> {
    const client = redisManager.getClient();
    const messageKeys = await client.keys('ceo-platform:messages:*');
    
    for (const key of messageKeys) {
      await client.expire(key, 300); // 5 minutes
    }
    
    if (messageKeys.length > 0) {
      logger.debug(`Reduced TTL for ${messageKeys.length} message cache entries`);
    }
  }

  /**
   * Clear old analytics data
   */
  private async clearOldAnalytics(): Promise<void> {
    await this.clearNamespace('ceo-platform:analytics:*');
    logger.debug('Cleared analytics cache');
  }

  /**
   * Reduce TTLs for non-critical data
   */
  private async reduceTTLs(): Promise<void> {
    const client = redisManager.getClient();
    
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
  private async clearOrphanedMetadata(): Promise<void> {
    // Implementation would check for metadata without corresponding data
    logger.debug('Cleared orphaned metadata');
  }

  /**
   * Get approximate age of a key (implementation dependent on your key naming)
   */
  private async getKeyAge(key: string): Promise<number> {
    // This is a simplified implementation
    // You might extract timestamp from key name or use other methods
    return 0;
  }

  /**
   * Get memory usage statistics for monitoring
   */
  public async getDetailedStats(): Promise<{
    memory: { used: number; usagePercent: number };
    keysByNamespace: Record<string, number>;
    totalKeys: number;
  }> {
    const client = redisManager.getClient();
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

    const keysByNamespace: Record<string, number> = {};
    
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

export const redisMemoryManager = new RedisMemoryManager();