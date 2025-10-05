import { PoolClient } from 'pg';
import { DatabaseClient } from '@config/database';
/**
 * Base Repository class providing common CRUD operations
 * Implements enterprise patterns: soft delete, audit trail, optimistic locking
 */
export interface BaseEntity {
    id: string;
    created_at: Date;
    updated_at: Date;
    version: number;
    deleted_at?: Date | null;
    deleted_by?: string | null;
}
export interface FilterOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    includeDeleted?: boolean;
    filters?: Record<string, any>;
}
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}
export declare abstract class BaseRepository<T extends BaseEntity> {
    protected tableName: string;
    protected primaryKey: string;
    protected selectFields: string[];
    constructor(tableName: string);
    /**
     * Create a new entity
     */
    create(data: Partial<Omit<T, keyof BaseEntity>>, client?: DatabaseClient): Promise<T>;
    /**
     * Find entity by ID
     */
    findById(id: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<T | null>;
    /**
     * Find entity by ID or throw NotFoundError
     */
    findByIdOrThrow(id: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<T>;
    /**
     * Update entity by ID with optimistic locking
     */
    update(id: string, data: Partial<Omit<T, keyof BaseEntity>>, expectedVersion?: number, client?: DatabaseClient): Promise<T>;
    /**
     * Soft delete entity
     */
    softDelete(id: string, deletedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Restore soft deleted entity
     */
    restore(id: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Hard delete entity (use with caution)
     */
    hardDelete(id: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Find multiple entities with filtering and pagination
     */
    findMany(options?: FilterOptions, client?: DatabaseClient): Promise<PaginatedResult<T>>;
    /**
     * Count entities with optional filters
     */
    count(filters?: Record<string, any>, includeDeleted?: boolean, client?: DatabaseClient): Promise<number>;
    /**
     * Check if entity exists
     */
    exists(id: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<boolean>;
    /**
     * Execute raw SQL query within repository context
     */
    protected executeRawQuery<R = any>(sql: string, params?: any[], client?: DatabaseClient): Promise<{
        rows: R[];
        rowCount: number;
    }>;
    /**
     * Execute multiple operations in a transaction
     */
    executeInTransaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R>;
    /**
     * Bulk insert entities (for data imports)
     */
    bulkCreate(entities: Partial<Omit<T, keyof BaseEntity>>[], client?: DatabaseClient): Promise<T[]>;
    /**
     * Get repository statistics
     */
    getStats(client?: DatabaseClient): Promise<{
        total: number;
        active: number;
        deleted: number;
        createdToday: number;
        updatedToday: number;
    }>;
    /**
     * Direct query method for complex database operations
     */
    query<R = any>(sql: string, params?: any[], client?: DatabaseClient): Promise<{
        rows: R[];
        rowCount: number;
    }>;
}
export default BaseRepository;
//# sourceMappingURL=BaseRepository.d.ts.map