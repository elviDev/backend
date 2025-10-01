"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseMetrics = exports.getPoolStats = exports.closeDatabase = exports.healthCheck = exports.transaction = exports.query = exports.getPool = exports.initializeDatabase = void 0;
const pg_1 = require("pg");
const index_1 = require("./index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
/**
 * Database configuration and connection management
 * Optimized for high-performance concurrent operations with voice processing
 */
// Enhanced pool configuration for CEO platform requirements
const poolConfig = {
    connectionString: index_1.config.database.url,
    min: index_1.config.database.pool.min,
    max: index_1.config.database.pool.max,
    // Connection lifecycle settings
    idleTimeoutMillis: 10000, // 10 seconds idle timeout (reduced)
    connectionTimeoutMillis: 5000, // 5 seconds connection timeout (reduced for faster failure)
    maxUses: 7500, // Maximum uses per connection before recycling
    // SSL configuration for production and AWS RDS
    ssl: index_1.config.database.url.includes('rds.amazonaws.com')
        ? {
            rejectUnauthorized: false, // Required for AWS RDS
            sslmode: 'require', // Force SSL
        }
        : index_1.config.app.isProduction
            ? {
                rejectUnauthorized: false,
            }
            : false,
    // Query timeout settings - reduced for better UX
    query_timeout: 5000, // 5 seconds max query time (reduced)
    statement_timeout: 5000, // Statement timeout (reduced)
    // Performance optimizations
    application_name: 'ceo-communication-platform',
    // Error handling
};
// Global connection pool
let pool = null;
/**
 * Initialize the database connection pool
 */
const initializeDatabase = async () => {
    try {
        pool = new pg_1.Pool(poolConfig);
        // Set up connection pool event handlers
        pool.on('connect', (client) => {
            logger_1.logger.debug({
                totalCount: pool?.totalCount,
                idleCount: pool?.idleCount,
                waitingCount: pool?.waitingCount,
            }, 'Database client connected');
        });
        pool.on('acquire', (client) => {
            logger_1.logger.debug('Database client acquired from pool');
        });
        pool.on('remove', (client) => {
            logger_1.logger.debug('Database client removed from pool');
        });
        pool.on('error', (err, client) => {
            logger_1.logger.error({ error: err }, 'Database pool error');
        });
        // Test the connection
        const client = await pool.connect();
        // Optimize connection settings for performance
        await client.query(`
      SET timezone = 'UTC';
      SET statement_timeout = '30s';
      SET lock_timeout = '10s';
      SET idle_in_transaction_session_timeout = '60s';
      SET search_path = app, public;
    `);
        // Test query to verify everything is working
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        client.release();
        logger_1.logger.info({
            poolSize: pool.totalCount,
            currentTime: result.rows[0].current_time,
            postgresVersion: result.rows[0].pg_version,
        }, 'Database initialized');
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Failed to initialize database connection pool');
        throw new errors_1.DatabaseConnectionError('Failed to connect to database', { error });
    }
};
exports.initializeDatabase = initializeDatabase;
/**
 * Get the database connection pool
 */
const getPool = () => {
    if (!pool) {
        throw new errors_1.DatabaseConnectionError('Database pool not initialized');
    }
    return pool;
};
exports.getPool = getPool;
/**
 * Retry configuration for database operations
 */
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 5000, // 5 seconds max
    timeoutErrors: ['timeout', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'connection terminating'],
};
/**
 * Check if error is retryable
 */
const isRetryableError = (error) => {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    return RETRY_CONFIG.timeoutErrors.some(keyword => errorMessage.includes(keyword) || errorCode.includes(keyword));
};
/**
 * Execute operation with retry logic
 */
const executeWithRetry = async (operation, context, retryCount = 0) => {
    try {
        return await operation();
    }
    catch (error) {
        const isTimeout = isRetryableError(error);
        const canRetry = retryCount < RETRY_CONFIG.maxRetries && isTimeout;
        if (canRetry) {
            const delay = Math.min(RETRY_CONFIG.baseDelay * Math.pow(2, retryCount), RETRY_CONFIG.maxDelay);
            logger_1.logger.warn({
                context,
                retryCount: retryCount + 1,
                maxRetries: RETRY_CONFIG.maxRetries,
                delay,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Database operation failed, retrying...');
            await new Promise(resolve => setTimeout(resolve, delay));
            return executeWithRetry(operation, context, retryCount + 1);
        }
        // Log final failure with user-friendly message
        logger_1.logger.error({
            context,
            retryCount,
            error,
            wasRetryable: isTimeout,
        }, 'Database operation failed after all retries');
        // Throw user-friendly error for timeouts
        if (isTimeout) {
            throw new errors_1.DatabaseError('Service temporarily unavailable. Please try again in a moment.', { originalError: error, isTimeout: true });
        }
        throw error;
    }
};
/**
 * Execute a query with performance monitoring
 */
const query = async (text, params, client) => {
    const queryClient = client || pool;
    if (!queryClient) {
        throw new errors_1.DatabaseConnectionError('No database connection available');
    }
    return logger_1.performanceLogger.trackAsyncOperation(async () => {
        return executeWithRetry(async () => {
            try {
                const result = await queryClient.query(text, params);
                if (index_1.config.development.debugSql) {
                    logger_1.logger.debug({
                        query: text,
                        params: params,
                        rowCount: result.rowCount,
                    }, 'SQL Query executed');
                }
                return {
                    rows: result.rows,
                    rowCount: result.rowCount || 0,
                };
            }
            catch (error) {
                logger_1.logger.error({
                    error,
                    query: text,
                    params: params,
                }, 'Database query failed');
                throw new errors_1.DatabaseError(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { query: text, params });
            }
        }, `query: ${text.substring(0, 50)}...`);
    }, 'database-query', { query: text.substring(0, 100) + (text.length > 100 ? '...' : '') });
};
exports.query = query;
/**
 * Execute a transaction with automatic rollback on errors
 */
const transaction = async (callback) => {
    const client = await (0, exports.getPool)().connect();
    try {
        await client.query('BEGIN');
        logger_1.logger.debug('Database transaction started');
        const result = await logger_1.performanceLogger.trackAsyncOperation(() => callback(client), 'database-transaction');
        await client.query('COMMIT');
        logger_1.logger.debug('Database transaction committed');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        logger_1.logger.error({ error }, 'Database transaction rolled back');
        throw new errors_1.DatabaseError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { originalError: error });
    }
    finally {
        client.release();
    }
};
exports.transaction = transaction;
/**
 * Check database health and connection status
 */
const healthCheck = async () => {
    try {
        const startTime = Date.now();
        if (!pool) {
            return {
                status: 'unhealthy',
                details: {
                    connected: false,
                    poolStats: { total: 0, idle: 0, waiting: 0 },
                    error: 'Pool not initialized',
                },
            };
        }
        // Test with a simple query
        await pool.query('SELECT 1 as health_check');
        const queryTime = Date.now() - startTime;
        return {
            status: 'healthy',
            details: {
                connected: true,
                poolStats: {
                    total: pool.totalCount,
                    idle: pool.idleCount,
                    waiting: pool.waitingCount,
                },
                queryTime,
            },
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            details: {
                connected: false,
                poolStats: {
                    total: pool?.totalCount || 0,
                    idle: pool?.idleCount || 0,
                    waiting: pool?.waitingCount || 0,
                },
                error: error instanceof Error ? error.message : 'Unknown error',
            },
        };
    }
};
exports.healthCheck = healthCheck;
/**
 * Gracefully close the database connection pool
 */
const closeDatabase = async () => {
    if (pool) {
        logger_1.logger.info('Closing database connection pool...');
        await pool.end();
        pool = null;
        logger_1.logger.info('Database connection pool closed');
    }
};
exports.closeDatabase = closeDatabase;
/**
 * Get current pool statistics for monitoring
 */
const getPoolStats = () => {
    if (!pool) {
        return {
            total: 0,
            idle: 0,
            waiting: 0,
            connected: false,
        };
    }
    return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        connected: true,
    };
};
exports.getPoolStats = getPoolStats;
// Performance monitoring utilities
exports.databaseMetrics = {
    /**
     * Log slow queries for optimization
     */
    logSlowQuery: (queryText, duration, params) => {
        if (duration > 1000) {
            // Log queries taking more than 1 second
            logger_1.logger.warn({
                query: queryText,
                duration,
                params,
                threshold: '1000ms',
            }, 'Slow query detected');
        }
    },
    /**
     * Monitor connection pool health
     */
    monitorPoolHealth: () => {
        if (!pool)
            return;
        const stats = (0, exports.getPoolStats)();
        const utilizationRate = (stats.total - stats.idle) / stats.total;
        if (utilizationRate > 0.8) {
            logger_1.logger.warn({
                stats,
                utilizationRate,
            }, 'High database connection pool utilization');
        }
        if (stats.waiting > 0) {
            logger_1.logger.warn({
                stats,
            }, 'Clients waiting for database connections');
        }
    },
};
//# sourceMappingURL=database.js.map