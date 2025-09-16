import { Pool, PoolClient } from 'pg';
/**
 * Initialize the database connection pool
 */
export declare const initializeDatabase: () => Promise<void>;
/**
 * Get the database connection pool
 */
export declare const getPool: () => Pool;
/**
 * Execute a query with performance monitoring
 */
export declare const query: <T = any>(text: string, params?: any[], client?: PoolClient) => Promise<{
    rows: T[];
    rowCount: number;
}>;
/**
 * Execute a transaction with automatic rollback on errors
 */
export declare const transaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
/**
 * Check database health and connection status
 */
export declare const healthCheck: () => Promise<{
    status: "healthy" | "unhealthy";
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
}>;
/**
 * Gracefully close the database connection pool
 */
export declare const closeDatabase: () => Promise<void>;
/**
 * Get current pool statistics for monitoring
 */
export declare const getPoolStats: () => {
    total: number;
    idle: number;
    waiting: number;
    connected: boolean;
};
export declare const databaseMetrics: {
    /**
     * Log slow queries for optimization
     */
    logSlowQuery: (queryText: string, duration: number, params?: any[]) => void;
    /**
     * Monitor connection pool health
     */
    monitorPoolHealth: () => void;
};
export type DatabaseClient = PoolClient;
export type QueryResult<T = any> = {
    rows: T[];
    rowCount: number;
};
//# sourceMappingURL=database.d.ts.map