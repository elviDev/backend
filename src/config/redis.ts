import Redis from 'ioredis';
import { config } from './index';
import { logger, loggers } from '@utils/logger';
import { CacheError } from '@utils/errors';

/**
 * Redis configuration and connection management
 * Enterprise-grade caching with performance monitoring
 */

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalOperations: number;
  hitRate: number;
}

class RedisManager {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    totalOperations: 0,
    hitRate: 0,
  };

  /**
   * Initialize Redis connections
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Redis connections...');

      // Use Redis URL if available, otherwise use individual parameters
      let redisOptions: any;
      
      if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
        // Use URL-based configuration (supports Redis Enterprise Cloud with TLS)
        const redisUrl = process.env.REDIS_URL;
        redisOptions = {
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          connectTimeout: 10000, // Increased timeout for cloud services
          lazyConnect: true,
          keepAlive: 30000,
          // Enable TLS if using rediss:// protocol
          ...(redisUrl.startsWith('rediss://') && {
            tls: {
              rejectUnauthorized: false, // Required for Redis Enterprise Cloud
            }
          })
        };
        
        // Create client with URL
        this.client = new Redis(redisUrl, redisOptions);
        logger.info(`Using Redis URL: ${redisUrl.replace(/:([^:@]*@)/, ':****@')}`);
      } else {
        // Use individual parameters (for local development)
        redisOptions = {
          host: config.redis?.host || 'localhost',
          port: config.redis?.port || 6379,
          db: config.redis?.db || 0,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          lazyConnect: true,
          keepAlive: 30000,
        };
        if (typeof config.redis?.password === 'string') {
          redisOptions.password = config.redis.password;
        }
        
        // Main client for general operations
        this.client = new Redis(redisOptions);
        logger.info(`Using Redis host: ${redisOptions.host}:${redisOptions.port}`);
      }

      // Subscriber for pub/sub operations
      if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
        // For URL-based config, create new instances with the same URL
        this.subscriber = new Redis(process.env.REDIS_URL, redisOptions);
        this.publisher = new Redis(process.env.REDIS_URL, redisOptions);
      } else {
        // For individual parameters, use db parameter
        this.subscriber = new Redis({
          ...redisOptions,
          db: config.redis?.pubSubDb || 1,
        });
        this.publisher = new Redis({
          ...redisOptions,
          db: config.redis?.pubSubDb || 1,
        });
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('Redis initialized');

      // Start metrics collection
      this.startMetricsCollection();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis connections');
      throw new CacheError('Redis initialization failed', { error });
    }
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      loggers.cache.info('Redis client connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      loggers.cache.info('Redis client ready for operations');
    });

    this.client.on('error', (error: Error) => {
      loggers.cache.error({ error }, 'Redis client error');
      this.metrics.errors++;
      this.isConnected = false;
    });

    this.client.on('close', () => {
      loggers.cache.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.reconnectAttempts++;
      loggers.cache.warn({ attempt: this.reconnectAttempts }, 'Redis client reconnecting');

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        loggers.cache.error('Max reconnection attempts reached');
        this.client?.disconnect();
      }
    });

    // Setup similar handlers for subscriber and publisher
    this.subscriber?.on('error', (error: Error) => {
      loggers.cache.error({ error, type: 'subscriber' }, 'Redis subscriber error');
    });

    this.publisher?.on('error', (error: Error) => {
      loggers.cache.error({ error, type: 'publisher' }, 'Redis publisher error');
    });
  }

  /**
   * Get the main Redis client
   */
  getClient(): Redis {
    if (!this.client) {
      throw new CacheError('Redis client not initialized');
    }
    return this.client;
  }

  /**
   * Get the subscriber client
   */
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new CacheError('Redis subscriber not initialized');
    }
    return this.subscriber;
  }

  /**
   * Get the publisher client
   */
  getPublisher(): Redis {
    if (!this.publisher) {
      throw new CacheError('Redis publisher not initialized');
    }
    return this.publisher;
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  /**
   * Health check for Redis
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) return false;

      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      loggers.cache.error({ error }, 'Redis health check failed');
      return false;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    const totalOperations = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      totalOperations,
      hitRate: totalOperations > 0 ? (this.metrics.hits / totalOperations) * 100 : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalOperations: 0,
      hitRate: 0,
    };
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Log metrics every 5 minutes
    setInterval(
      () => {
        const metrics = this.getMetrics();
        loggers.cache.info(
          {
            metrics,
            isConnected: this.isConnected,
            status: this.client?.status,
          },
          'Redis cache metrics'
        );

        // Log warnings for poor performance
        if (metrics.hitRate < 80 && metrics.totalOperations > 100) {
          loggers.cache.warn({ hitRate: metrics.hitRate }, 'Low cache hit rate detected');
        }

        if (metrics.errors > 10) {
          loggers.cache.warn({ errors: metrics.errors }, 'High error rate in Redis operations');
        }
      },
      5 * 60 * 1000
    );
  }

  /**
   * Increment hit counter
   */
  incrementHits(): void {
    this.metrics.hits++;
  }

  /**
   * Increment miss counter
   */
  incrementMisses(): void {
    this.metrics.misses++;
  }

  /**
   * Increment sets counter
   */
  incrementSets(): void {
    this.metrics.sets++;
  }

  /**
   * Increment deletes counter
   */
  incrementDeletes(): void {
    this.metrics.deletes++;
  }

  /**
   * Close all Redis connections
   */
  async close(): Promise<void> {
    try {
      logger.info('Closing Redis connections...');

      await Promise.allSettled([
        this.client?.quit(),
        this.subscriber?.quit(),
        this.publisher?.quit(),
      ]);

      this.client = null;
      this.subscriber = null;
      this.publisher = null;
      this.isConnected = false;

      logger.info('Redis connections closed successfully');
    } catch (error) {
      logger.error({ error }, 'Error closing Redis connections');
    }
  }
}

// Export singleton instance
export const redisManager = new RedisManager();
export default redisManager;
