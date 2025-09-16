"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("./index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
class RedisManager {
    client = null;
    subscriber = null;
    publisher = null;
    isConnected = false;
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    metrics = {
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
    async initialize() {
        try {
            logger_1.logger.info('Initializing Redis connections...');
            const redisOptions = {
                host: index_1.config.redis?.host || 'localhost',
                port: index_1.config.redis?.port || 6379,
                db: index_1.config.redis?.db || 0,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                connectTimeout: 5000,
                lazyConnect: true,
                keepAlive: 30000,
            };
            if (typeof index_1.config.redis?.password === 'string') {
                redisOptions.password = index_1.config.redis.password;
            }
            // Main client for general operations
            this.client = new ioredis_1.default(redisOptions);
            // Subscriber for pub/sub operations
            this.subscriber = new ioredis_1.default({
                ...redisOptions,
                db: index_1.config.redis?.pubSubDb || 1,
            });
            // Publisher for pub/sub operations
            this.publisher = new ioredis_1.default({
                ...redisOptions,
                db: index_1.config.redis?.pubSubDb || 1,
            });
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
            logger_1.logger.info('Redis initialized');
            // Start metrics collection
            this.startMetricsCollection();
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to initialize Redis connections');
            throw new errors_1.CacheError('Redis initialization failed', { error });
        }
    }
    /**
     * Setup Redis event handlers
     */
    setupEventHandlers() {
        if (!this.client)
            return;
        this.client.on('connect', () => {
            logger_1.loggers.cache.info('Redis client connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });
        this.client.on('ready', () => {
            logger_1.loggers.cache.info('Redis client ready for operations');
        });
        this.client.on('error', (error) => {
            logger_1.loggers.cache.error({ error }, 'Redis client error');
            this.metrics.errors++;
            this.isConnected = false;
        });
        this.client.on('close', () => {
            logger_1.loggers.cache.warn('Redis client connection closed');
            this.isConnected = false;
        });
        this.client.on('reconnecting', () => {
            this.reconnectAttempts++;
            logger_1.loggers.cache.warn({ attempt: this.reconnectAttempts }, 'Redis client reconnecting');
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                logger_1.loggers.cache.error('Max reconnection attempts reached');
                this.client?.disconnect();
            }
        });
        // Setup similar handlers for subscriber and publisher
        this.subscriber?.on('error', (error) => {
            logger_1.loggers.cache.error({ error, type: 'subscriber' }, 'Redis subscriber error');
        });
        this.publisher?.on('error', (error) => {
            logger_1.loggers.cache.error({ error, type: 'publisher' }, 'Redis publisher error');
        });
    }
    /**
     * Get the main Redis client
     */
    getClient() {
        if (!this.client) {
            throw new errors_1.CacheError('Redis client not initialized');
        }
        return this.client;
    }
    /**
     * Get the subscriber client
     */
    getSubscriber() {
        if (!this.subscriber) {
            throw new errors_1.CacheError('Redis subscriber not initialized');
        }
        return this.subscriber;
    }
    /**
     * Get the publisher client
     */
    getPublisher() {
        if (!this.publisher) {
            throw new errors_1.CacheError('Redis publisher not initialized');
        }
        return this.publisher;
    }
    /**
     * Check if Redis is connected
     */
    isRedisConnected() {
        return this.isConnected && this.client?.status === 'ready';
    }
    /**
     * Health check for Redis
     */
    async healthCheck() {
        try {
            if (!this.client)
                return false;
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch (error) {
            logger_1.loggers.cache.error({ error }, 'Redis health check failed');
            return false;
        }
    }
    /**
     * Get cache metrics
     */
    getMetrics() {
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
    resetMetrics() {
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
    startMetricsCollection() {
        // Log metrics every 5 minutes
        setInterval(() => {
            const metrics = this.getMetrics();
            logger_1.loggers.cache.info({
                metrics,
                isConnected: this.isConnected,
                status: this.client?.status,
            }, 'Redis cache metrics');
            // Log warnings for poor performance
            if (metrics.hitRate < 80 && metrics.totalOperations > 100) {
                logger_1.loggers.cache.warn({ hitRate: metrics.hitRate }, 'Low cache hit rate detected');
            }
            if (metrics.errors > 10) {
                logger_1.loggers.cache.warn({ errors: metrics.errors }, 'High error rate in Redis operations');
            }
        }, 5 * 60 * 1000);
    }
    /**
     * Increment hit counter
     */
    incrementHits() {
        this.metrics.hits++;
    }
    /**
     * Increment miss counter
     */
    incrementMisses() {
        this.metrics.misses++;
    }
    /**
     * Increment sets counter
     */
    incrementSets() {
        this.metrics.sets++;
    }
    /**
     * Increment deletes counter
     */
    incrementDeletes() {
        this.metrics.deletes++;
    }
    /**
     * Close all Redis connections
     */
    async close() {
        try {
            logger_1.logger.info('Closing Redis connections...');
            await Promise.allSettled([
                this.client?.quit(),
                this.subscriber?.quit(),
                this.publisher?.quit(),
            ]);
            this.client = null;
            this.subscriber = null;
            this.publisher = null;
            this.isConnected = false;
            logger_1.logger.info('Redis connections closed successfully');
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Error closing Redis connections');
        }
    }
}
// Export singleton instance
exports.redisManager = new RedisManager();
exports.default = exports.redisManager;
//# sourceMappingURL=redis.js.map