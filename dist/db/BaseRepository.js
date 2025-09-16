"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const database_1 = require("@config/database");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
class BaseRepository {
    tableName;
    primaryKey = 'id';
    selectFields = ['*'];
    constructor(tableName) {
        this.tableName = tableName;
    }
    /**
     * Create a new entity
     */
    async create(data, client) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
        const sql = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING ${this.selectFields.join(', ')}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, values, client);
            if (result.rows.length === 0 || result.rows[0] === undefined) {
                throw new errors_1.DatabaseError('Failed to create entity - no rows returned');
            }
            logger_1.logger.debug({
                table: this.tableName,
                operation: 'create',
                entityId: result.rows[0].id,
            }, 'Entity created successfully');
            // Ensure result.rows[0] is not undefined before returning
            if (result.rows[0] === undefined) {
                throw new errors_1.DatabaseError('Failed to create entity - undefined row returned');
            }
            return result.rows[0];
        }, `repository-create-${this.tableName}`, { entityType: this.tableName });
    }
    /**
     * Find entity by ID
     */
    async findById(id, includeDeleted = false, client) {
        const deletedCondition = includeDeleted ? '' : 'AND deleted_at IS NULL';
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE ${this.primaryKey} = $1 ${deletedCondition}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, [id], client);
            return result.rows[0] || null;
        }, `repository-findById-${this.tableName}`, { entityId: id });
    }
    /**
     * Find entity by ID or throw NotFoundError
     */
    async findByIdOrThrow(id, includeDeleted = false, client) {
        const entity = await this.findById(id, includeDeleted, client);
        if (!entity) {
            throw new errors_1.NotFoundError(`${this.tableName} with id ${id} not found`);
        }
        return entity;
    }
    /**
     * Update entity by ID with optimistic locking
     */
    async update(id, data, expectedVersion, client) {
        // Exclude audit fields from update data
        const { created_at, updated_at, version, deleted_at, deleted_by, ...updateData } = data;
        const fields = Object.keys(updateData);
        const values = Object.values(updateData);
        if (fields.length === 0) {
            throw new errors_1.ValidationError('No fields provided for update', []);
        }
        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const versionCondition = expectedVersion ? 'AND version = $' + (fields.length + 3) : '';
        const versionParams = expectedVersion ? [expectedVersion] : [];
        const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE ${this.primaryKey} = $1 
      AND deleted_at IS NULL 
      ${versionCondition}
      RETURNING ${this.selectFields.join(', ')}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, [id, ...values, ...versionParams], client);
            if (result.rows.length === 0) {
                if (expectedVersion) {
                    throw new errors_1.ValidationError('Optimistic locking failure - entity was modified by another transaction', []);
                }
                throw new errors_1.NotFoundError(`${this.tableName} with id ${id} not found or already deleted`);
            }
            logger_1.logger.debug({
                table: this.tableName,
                operation: 'update',
                entityId: id,
                fields: fields,
            }, 'Entity updated successfully');
            if (result.rows[0] === undefined) {
                throw new errors_1.DatabaseError('Failed to update entity - undefined row returned');
            }
            return result.rows[0];
        }, `repository-update-${this.tableName}`, { entityId: id, fieldsUpdated: fields.length });
    }
    /**
     * Soft delete entity
     */
    async softDelete(id, deletedBy, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET deleted_at = NOW(), deleted_by = $2
      WHERE ${this.primaryKey} = $1 AND deleted_at IS NULL
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, [id, deletedBy], client);
            const wasDeleted = result.rowCount > 0;
            if (wasDeleted) {
                logger_1.logger.info({
                    table: this.tableName,
                    operation: 'softDelete',
                    entityId: id,
                    deletedBy: deletedBy,
                }, 'Entity soft deleted successfully');
            }
            return wasDeleted;
        }, `repository-softDelete-${this.tableName}`, { entityId: id });
    }
    /**
     * Restore soft deleted entity
     */
    async restore(id, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET deleted_at = NULL, deleted_by = NULL
      WHERE ${this.primaryKey} = $1 AND deleted_at IS NOT NULL
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, [id], client);
            const wasRestored = result.rowCount > 0;
            if (wasRestored) {
                logger_1.logger.info({
                    table: this.tableName,
                    operation: 'restore',
                    entityId: id,
                }, 'Entity restored successfully');
            }
            return wasRestored;
        }, `repository-restore-${this.tableName}`, { entityId: id });
    }
    /**
     * Hard delete entity (use with caution)
     */
    async hardDelete(id, client) {
        const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, [id], client);
            const wasDeleted = result.rowCount > 0;
            if (wasDeleted) {
                logger_1.logger.warn({
                    table: this.tableName,
                    operation: 'hardDelete',
                    entityId: id,
                }, 'Entity permanently deleted');
            }
            return wasDeleted;
        }, `repository-hardDelete-${this.tableName}`, { entityId: id });
    }
    /**
     * Find multiple entities with filtering and pagination
     */
    async findMany(options = {}, client) {
        const { limit = 20, offset = 0, orderBy = 'created_at', orderDirection = 'DESC', includeDeleted = false, filters = {}, } = options;
        // Build WHERE conditions
        const whereConditions = [];
        const values = [];
        let paramCounter = 1;
        // Soft delete condition
        if (!includeDeleted) {
            whereConditions.push('deleted_at IS NULL');
        }
        // Additional filters
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    whereConditions.push(`${field} = ANY($${paramCounter})`);
                    values.push(value);
                }
                else {
                    whereConditions.push(`${field} = $${paramCounter}`);
                    values.push(value);
                }
                paramCounter++;
            }
        });
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Count query
        const countSql = `
      SELECT COUNT(*) as total
      FROM ${this.tableName}
      ${whereClause}
    `;
        // Data query
        const dataSql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            // Execute both queries in parallel for better performance
            const [countResult, dataResult] = await Promise.all([
                (0, database_1.query)(countSql, values, client),
                (0, database_1.query)(dataSql, [...values, limit, offset], client),
            ]);
            const total = countResult.rows[0]?.total ? parseInt(countResult.rows[0].total, 10) : 0;
            const data = dataResult.rows;
            const hasMore = offset + limit < total;
            return {
                data,
                total,
                limit,
                offset,
                hasMore,
            };
        }, `repository-findMany-${this.tableName}`, { limit, offset, filterCount: Object.keys(filters).length });
    }
    /**
     * Count entities with optional filters
     */
    async count(filters = {}, includeDeleted = false, client) {
        const whereConditions = [];
        const values = [];
        let paramCounter = 1;
        // Soft delete condition
        if (!includeDeleted) {
            whereConditions.push('deleted_at IS NULL');
        }
        // Additional filters
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                whereConditions.push(`${field} = $${paramCounter}`);
                values.push(value);
                paramCounter++;
            }
        });
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const sql = `
      SELECT COUNT(*) as total
      FROM ${this.tableName}
      ${whereClause}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, values, client);
            return result.rows[0]?.total ? parseInt(result.rows[0].total, 10) : 0;
        }, `repository-count-${this.tableName}`, { filterCount: Object.keys(filters).length });
    }
    /**
     * Check if entity exists
     */
    async exists(id, includeDeleted = false, client) {
        const deletedCondition = includeDeleted ? '' : 'AND deleted_at IS NULL';
        const sql = `
      SELECT 1 FROM ${this.tableName}
      WHERE ${this.primaryKey} = $1 ${deletedCondition}
      LIMIT 1
    `;
        const result = await (0, database_1.query)(sql, [id], client);
        return result.rows.length > 0;
    }
    /**
     * Execute raw SQL query within repository context
     */
    async executeRawQuery(sql, params = [], client) {
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, params, client);
            logger_1.logger.debug({
                table: this.tableName,
                operation: 'rawQuery',
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                paramCount: params.length,
                rowCount: result.rowCount,
            }, 'Raw query executed');
            return result;
        }, `repository-rawQuery-${this.tableName}`, { paramCount: params.length });
    }
    /**
     * Execute multiple operations in a transaction
     */
    async executeInTransaction(callback) {
        return (0, database_1.transaction)(callback);
    }
    /**
     * Bulk insert entities (for seeding and imports)
     */
    async bulkCreate(entities, client) {
        if (entities.length === 0) {
            return [];
        }
        // Get all unique field names
        const allFields = new Set();
        entities.forEach((entity) => {
            Object.keys(entity).forEach((field) => allFields.add(field));
        });
        const fields = Array.from(allFields);
        const values = [];
        const valuePlaceholders = [];
        entities.forEach((entity, entityIndex) => {
            const entityValues = fields.map((field) => entity[field] ?? null);
            values.push(...entityValues);
            const startParam = entityIndex * fields.length + 1;
            const entityPlaceholders = fields.map((_, fieldIndex) => `$${startParam + fieldIndex}`);
            valuePlaceholders.push(`(${entityPlaceholders.join(', ')})`);
        });
        const sql = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING ${this.selectFields.join(', ')}
    `;
        return logger_1.performanceLogger.trackAsyncOperation(async () => {
            const result = await (0, database_1.query)(sql, values, client);
            logger_1.logger.info({
                table: this.tableName,
                operation: 'bulkCreate',
                entityCount: entities.length,
                fieldsCount: fields.length,
            }, 'Bulk create completed successfully');
            return result.rows;
        }, `repository-bulkCreate-${this.tableName}`, { entityCount: entities.length });
    }
    /**
     * Get repository statistics
     */
    async getStats(client) {
        const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as created_today,
        COUNT(*) FILTER (WHERE DATE(updated_at) = CURRENT_DATE AND updated_at::date > created_at::date) as updated_today
      FROM ${this.tableName}
    `;
        const result = await (0, database_1.query)(sql, [], client);
        const stats = result.rows[0];
        return {
            total: parseInt(stats.total, 10),
            active: parseInt(stats.active, 10),
            deleted: parseInt(stats.deleted, 10),
            createdToday: parseInt(stats.created_today, 10),
            updatedToday: parseInt(stats.updated_today, 10),
        };
    }
    /**
     * Direct query method for complex database operations
     */
    async query(sql, params = [], client) {
        return this.executeRawQuery(sql, params, client);
    }
}
exports.BaseRepository = BaseRepository;
exports.default = BaseRepository;
//# sourceMappingURL=BaseRepository.js.map