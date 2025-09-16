import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from './index';
import { logger, performanceLogger } from '@utils/logger';
import { DatabaseConnectionError, DatabaseError } from '@utils/errors';

/**
 * Database configuration and connection management
 * Optimized for high-performance concurrent operations with voice processing
 */

// Enhanced pool configuration for CEO platform requirements
const poolConfig: PoolConfig = {
  connectionString: config.database.url,
  min: config.database.pool.min,
  max: config.database.pool.max,

  // Connection lifecycle settings
  idleTimeoutMillis: 30000, // 30 seconds idle timeout
  connectionTimeoutMillis: 10000, // 10 seconds connection timeout
  maxUses: 7500, // Maximum uses per connection before recycling

  // SSL configuration for production and AWS RDS
  ssl: config.app.isProduction || config.database.url.includes('rds.amazonaws.com')
    ? {
        rejectUnauthorized: false, // Configure properly in production
      }
    : false,

  // Query timeout settings
  query_timeout: 30000, // 30 seconds max query time
  statement_timeout: 30000, // Statement timeout

  // Performance optimizations
  application_name: 'ceo-communication-platform',

  // Error handling
};

// Global connection pool
let pool: Pool | null = null;

/**
 * Initialize the database connection pool
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    pool = new Pool(poolConfig);

    // Set up connection pool event handlers
    pool.on('connect', (client) => {
      logger.debug(
        {
          totalCount: pool?.totalCount,
          idleCount: pool?.idleCount,
          waitingCount: pool?.waitingCount,
        },
        'Database client connected'
      );
    });

    pool.on('acquire', (client) => {
      logger.debug('Database client acquired from pool');
    });

    pool.on('remove', (client) => {
      logger.debug('Database client removed from pool');
    });

    pool.on('error', (err, client) => {
      logger.error({ error: err }, 'Database pool error');
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

    logger.info(
      {
        poolSize: pool.totalCount,
        currentTime: result.rows[0].current_time,
        postgresVersion: result.rows[0].pg_version,
      },
      'Database initialized'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database connection pool');
    throw new DatabaseConnectionError('Failed to connect to database', { error });
  }
};

/**
 * Get the database connection pool
 */
export const getPool = (): Pool => {
  if (!pool) {
    throw new DatabaseConnectionError('Database pool not initialized');
  }
  return pool;
};

/**
 * Execute a query with performance monitoring
 */
export const query = async <T = any>(
  text: string,
  params?: any[],
  client?: PoolClient
): Promise<{ rows: T[]; rowCount: number }> => {
  const queryClient = client || pool;

  if (!queryClient) {
    throw new DatabaseConnectionError('No database connection available');
  }

  return performanceLogger.trackAsyncOperation(
    async () => {
      try {
        const result = await queryClient.query(text, params);

        if (config.development.debugSql) {
          logger.debug(
            {
              query: text,
              params: params,
              rowCount: result.rowCount,
            },
            'SQL Query executed'
          );
        }

        return {
          rows: result.rows,
          rowCount: result.rowCount || 0,
        };
      } catch (error) {
        logger.error(
          {
            error,
            query: text,
            params: params,
          },
          'Database query failed'
        );

        throw new DatabaseError(
          `Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { query: text, params }
        );
      }
    },
    'database-query',
    { query: text.substring(0, 100) + (text.length > 100 ? '...' : '') }
  );
};

/**
 * Execute a transaction with automatic rollback on errors
 */
export const transaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    logger.debug('Database transaction started');

    const result = await performanceLogger.trackAsyncOperation(
      () => callback(client),
      'database-transaction'
    );

    await client.query('COMMIT');
    logger.debug('Database transaction committed');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, 'Database transaction rolled back');

    throw new DatabaseError(
      `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error }
    );
  } finally {
    client.release();
  }
};

/**
 * Check database health and connection status
 */
export const healthCheck = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    poolStats: {
      total: number;
      idle: number;
      waiting: number;
    };
    queryTime?: number;
    error?: string;
  };
}> => {
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
  } catch (error) {
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

/**
 * Gracefully close the database connection pool
 */
export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    logger.info('Closing database connection pool...');
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
};

/**
 * Get current pool statistics for monitoring
 */
export const getPoolStats = () => {
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

// Performance monitoring utilities
export const databaseMetrics = {
  /**
   * Log slow queries for optimization
   */
  logSlowQuery: (queryText: string, duration: number, params?: any[]) => {
    if (duration > 1000) {
      // Log queries taking more than 1 second
      logger.warn(
        {
          query: queryText,
          duration,
          params,
          threshold: '1000ms',
        },
        'Slow query detected'
      );
    }
  },

  /**
   * Monitor connection pool health
   */
  monitorPoolHealth: () => {
    if (!pool) return;

    const stats = getPoolStats();
    const utilizationRate = (stats.total - stats.idle) / stats.total;

    if (utilizationRate > 0.8) {
      logger.warn(
        {
          stats,
          utilizationRate,
        },
        'High database connection pool utilization'
      );
    }

    if (stats.waiting > 0) {
      logger.warn(
        {
          stats,
        },
        'Clients waiting for database connections'
      );
    }
  },
};

// Export types for use throughout the application
export type DatabaseClient = PoolClient;
export type QueryResult<T = any> = { rows: T[]; rowCount: number };
