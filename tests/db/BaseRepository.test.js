"use strict";
/**
 * Base Repository Tests
 * Tests for the core database repository pattern with caching, soft deletes, and performance monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const BaseRepository_1 = require("../../src/db/BaseRepository");
const errors_1 = require("../../src/utils/errors");
const setup_1 = require("../setup");
// Mock database and cache dependencies
globals_1.jest.mock('../../src/config/database', () => ({
    pool: {
        query: globals_1.jest.fn(),
        connect: globals_1.jest.fn().mockResolvedValue({
            query: globals_1.jest.fn(),
            release: globals_1.jest.fn(),
        }),
    },
}));
globals_1.jest.mock('../../src/services/CacheService', () => ({
    cacheService: {
        get: globals_1.jest.fn(),
        set: globals_1.jest.fn(),
        delete: globals_1.jest.fn(),
        invalidateByTag: globals_1.jest.fn(),
        clear: globals_1.jest.fn(),
    },
}));
// Test implementation of BaseRepository
class TestRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super('test_table', 'test_cache');
    }
    validateCreate(data) {
        if (!data.name) {
            throw new errors_1.ValidationError('Name is required');
        }
    }
    validateUpdate(data) {
        if (data.name === '') {
            throw new errors_1.ValidationError('Name cannot be empty');
        }
    }
}
(0, globals_1.describe)('BaseRepository', () => {
    let repository;
    let mockPool;
    let mockCache;
    (0, globals_1.beforeEach)(() => {
        repository = new TestRepository();
        mockPool = require('../../src/config/database').pool;
        mockCache = require('../../src/services/CacheService').cacheService;
        // Reset mocks
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.afterEach)(async () => {
        await (0, setup_1.cleanupTestData)();
    });
    (0, globals_1.describe)('Create Operations', () => {
        (0, globals_1.it)('should create a new record successfully', async () => {
            const testData = { name: 'Test Record', description: 'Test description' };
            const mockResult = {
                rows: [{
                        id: 'test-id-123',
                        ...testData,
                        created_at: new Date(),
                        updated_at: new Date(),
                        version: 1
                    }]
            };
            mockPool.query.mockResolvedValueOnce(mockResult);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.create(testData, 'test-user-id');
            });
            // Should meet database operation performance requirements
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result).toEqual(mockResult.rows[0]);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('INSERT INTO test_table'), globals_1.expect.any(Array));
            (0, globals_1.expect)(mockCache.invalidateByTag).toHaveBeenCalledWith('test_cache');
        });
        (0, globals_1.it)('should validate data before creation', async () => {
            const invalidData = { description: 'Missing required name' };
            await (0, globals_1.expect)(repository.create(invalidData, 'test-user-id'))
                .rejects
                .toThrow(errors_1.ValidationError);
            (0, globals_1.expect)(mockPool.query).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should handle database errors during creation', async () => {
            const testData = { name: 'Test Record' };
            mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));
            await (0, globals_1.expect)(repository.create(testData, 'test-user-id'))
                .rejects
                .toThrow(errors_1.DatabaseError);
        });
        (0, globals_1.it)('should include audit fields in creation', async () => {
            const testData = { name: 'Audit Test' };
            const mockResult = { rows: [{ id: 'audit-test-id', ...testData }] };
            mockPool.query.mockResolvedValueOnce(mockResult);
            await repository.create(testData, 'audit-user-id');
            const queryCall = mockPool.query.mock.calls[0];
            const queryParams = queryCall[1];
            (0, globals_1.expect)(queryParams).toContain('audit-user-id'); // created_by
            (0, globals_1.expect)(queryParams).toContain('audit-user-id'); // updated_by
        });
    });
    (0, globals_1.describe)('Read Operations', () => {
        (0, globals_1.it)('should find record by ID with caching', async () => {
            const mockRecord = {
                id: 'cached-record-id',
                name: 'Cached Record',
                created_at: new Date(),
                deleted_at: null
            };
            // First call - cache miss, database hit
            mockCache.get.mockResolvedValueOnce(null);
            mockPool.query.mockResolvedValueOnce({ rows: [mockRecord] });
            const { result: result1, duration: duration1 } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.findById('cached-record-id');
            });
            (0, globals_1.expect)(result1).toEqual(mockRecord);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('SELECT * FROM test_table WHERE id = $1'), ['cached-record-id']);
            (0, globals_1.expect)(mockCache.set).toHaveBeenCalledWith('test_cache:cached-record-id', mockRecord, globals_1.expect.any(Object));
            // Second call - cache hit
            mockCache.get.mockResolvedValueOnce(mockRecord);
            const { result: result2, duration: duration2 } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.findById('cached-record-id');
            });
            (0, globals_1.expect)(result2).toEqual(mockRecord);
            // Cache hit should be much faster
            (0, globals_1.expect)(duration2).toBeLessThan(duration1);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledTimes(1); // No additional DB call
        });
        (0, globals_1.it)('should return null for non-existent records', async () => {
            mockCache.get.mockResolvedValueOnce(null);
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const result = await repository.findById('non-existent-id');
            (0, globals_1.expect)(result).toBeNull();
        });
        (0, globals_1.it)('should exclude soft-deleted records by default', async () => {
            const deletedRecord = {
                id: 'deleted-id',
                name: 'Deleted Record',
                deleted_at: new Date()
            };
            mockCache.get.mockResolvedValueOnce(null);
            mockPool.query.mockResolvedValueOnce({ rows: [deletedRecord] });
            const result = await repository.findById('deleted-id');
            (0, globals_1.expect)(result).toBeNull();
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('AND deleted_at IS NULL'), globals_1.expect.any(Array));
        });
        (0, globals_1.it)('should support finding with filters and pagination', async () => {
            const mockResults = {
                rows: [
                    { id: 'result-1', name: 'Result 1' },
                    { id: 'result-2', name: 'Result 2' },
                ],
                count: 10,
            };
            mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }] }); // Count query
            mockPool.query.mockResolvedValueOnce(mockResults); // Results query
            const filters = { status: 'active' };
            const options = { page: 1, limit: 10 };
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.findMany(filters, options);
            });
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result).toEqual({
                data: mockResults.rows,
                total: 10,
                page: 1,
                limit: 10,
                totalPages: 1,
            });
        });
    });
    (0, globals_1.describe)('Update Operations', () => {
        (0, globals_1.it)('should update record with optimistic locking', async () => {
            const updateData = { name: 'Updated Name' };
            const mockResult = {
                rows: [{
                        id: 'update-test-id',
                        ...updateData,
                        version: 2,
                        updated_at: new Date()
                    }]
            };
            mockPool.query.mockResolvedValueOnce(mockResult);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.update('update-test-id', updateData, 'updater-user-id', 1);
            });
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result).toEqual(mockResult.rows[0]);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('WHERE id = $1 AND version = $2'), globals_1.expect.arrayContaining(['update-test-id', 1]));
            (0, globals_1.expect)(mockCache.delete).toHaveBeenCalledWith('test_cache:update-test-id');
        });
        (0, globals_1.it)('should handle version conflicts in optimistic locking', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] }); // No rows updated
            await (0, globals_1.expect)(repository.update('conflict-id', { name: 'Updated' }, 'user-id', 1)).rejects.toThrow('Version conflict or record not found');
        });
        (0, globals_1.it)('should validate update data', async () => {
            const invalidData = { name: '' }; // Empty name should fail validation
            await (0, globals_1.expect)(repository.update('test-id', invalidData, 'user-id', 1)).rejects.toThrow(errors_1.ValidationError);
            (0, globals_1.expect)(mockPool.query).not.toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('Delete Operations', () => {
        (0, globals_1.it)('should perform soft delete by default', async () => {
            const mockResult = {
                rows: [{
                        id: 'soft-delete-id',
                        name: 'Soft Deleted Record',
                        deleted_at: new Date(),
                        version: 2
                    }]
            };
            mockPool.query.mockResolvedValueOnce(mockResult);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.delete('soft-delete-id', 'deleter-user-id', 1);
            });
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result).toEqual(mockResult.rows[0]);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('SET deleted_at = NOW()'), globals_1.expect.any(Array));
            (0, globals_1.expect)(mockCache.delete).toHaveBeenCalledWith('test_cache:soft-delete-id');
        });
        (0, globals_1.it)('should perform hard delete when specified', async () => {
            mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
            await repository.delete('hard-delete-id', 'deleter-user-id', 1, true);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('DELETE FROM test_table'), globals_1.expect.any(Array));
        });
        (0, globals_1.it)('should handle delete conflicts', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            await (0, globals_1.expect)(repository.delete('conflict-id', 'user-id', 1)).rejects.toThrow('Version conflict or record not found');
        });
    });
    (0, globals_1.describe)('Bulk Operations', () => {
        (0, globals_1.it)('should support bulk creation with transaction', async () => {
            const bulkData = [
                { name: 'Bulk Record 1' },
                { name: 'Bulk Record 2' },
                { name: 'Bulk Record 3' },
            ];
            const mockResults = {
                rows: bulkData.map((data, index) => ({
                    id: `bulk-${index}`,
                    ...data,
                    created_at: new Date(),
                }))
            };
            const mockClient = {
                query: globals_1.jest.fn().mockResolvedValue(mockResults),
                release: globals_1.jest.fn(),
            };
            mockPool.connect.mockResolvedValueOnce(mockClient);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.createMany(bulkData, 'bulk-user-id');
            });
            // Bulk operations should still be performant
            (0, globals_1.expect)(duration).toBeLessThan(1000); // Under 1 second for bulk ops
            (0, globals_1.expect)(result).toHaveLength(3);
            (0, globals_1.expect)(mockClient.query).toHaveBeenCalledWith('BEGIN');
            (0, globals_1.expect)(mockClient.query).toHaveBeenCalledWith('COMMIT');
            (0, globals_1.expect)(mockClient.release).toHaveBeenCalled();
        });
        (0, globals_1.it)('should rollback bulk creation on error', async () => {
            const bulkData = [
                { name: 'Valid Record' },
                { description: 'Invalid - missing name' }, // Should fail validation
            ];
            const mockClient = {
                query: globals_1.jest.fn().mockRejectedValue(new Error('Validation failed')),
                release: globals_1.jest.fn(),
            };
            mockPool.connect.mockResolvedValueOnce(mockClient);
            await (0, globals_1.expect)(repository.createMany(bulkData, 'bulk-user-id')).rejects.toThrow();
            (0, globals_1.expect)(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            (0, globals_1.expect)(mockClient.release).toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('Performance and Caching', () => {
        (0, globals_1.it)('should meet performance benchmarks for read operations', async () => {
            const testRecord = { id: 'perf-test', name: 'Performance Test' };
            mockCache.get.mockResolvedValue(testRecord);
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = Array.from({ length: 100 }, () => repository.findById('perf-test'));
                await Promise.all(promises);
            });
            // 100 cached reads should complete in under 100ms
            (0, globals_1.expect)(duration).toBeLessThan(100);
        });
        (0, globals_1.it)('should invalidate cache on mutations', async () => {
            const mockResult = { rows: [{ id: 'cache-test', name: 'Updated' }] };
            mockPool.query.mockResolvedValueOnce(mockResult);
            await repository.update('cache-test', { name: 'Updated' }, 'user-id', 1);
            (0, globals_1.expect)(mockCache.delete).toHaveBeenCalledWith('test_cache:cache-test');
            (0, globals_1.expect)(mockCache.invalidateByTag).toHaveBeenCalledWith('test_cache');
        });
        (0, globals_1.it)('should handle cache failures gracefully', async () => {
            const testRecord = { id: 'cache-fail-test', name: 'Cache Fail Test' };
            // Cache throws error but DB works
            mockCache.get.mockRejectedValueOnce(new Error('Cache unavailable'));
            mockPool.query.mockResolvedValueOnce({ rows: [testRecord] });
            const result = await repository.findById('cache-fail-test');
            (0, globals_1.expect)(result).toEqual(testRecord);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalled(); // Still queries database
        });
    });
    (0, globals_1.describe)('Advanced Features', () => {
        (0, globals_1.it)('should support complex queries with joins', async () => {
            const mockResults = {
                rows: [
                    {
                        id: 'join-test-1',
                        name: 'Record 1',
                        related_name: 'Related Record 1'
                    }
                ]
            };
            mockPool.query.mockResolvedValueOnce(mockResults);
            const customQuery = `
        SELECT t.*, r.name as related_name 
        FROM test_table t 
        LEFT JOIN related_table r ON t.related_id = r.id 
        WHERE t.status = $1
      `;
            const result = await repository.customQuery(customQuery, ['active']);
            (0, globals_1.expect)(result).toEqual(mockResults.rows);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(customQuery, ['active']);
        });
        (0, globals_1.it)('should support search with full-text indexing', async () => {
            const searchTerm = 'important document';
            const mockResults = {
                rows: [
                    {
                        id: 'search-1',
                        name: 'Important Document 1',
                        rank: 0.95
                    }
                ]
            };
            mockPool.query.mockResolvedValueOnce(mockResults);
            const result = await repository.search(searchTerm, {
                fields: ['name', 'description'],
                limit: 10
            });
            (0, globals_1.expect)(result).toEqual(mockResults.rows);
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.stringContaining('ts_rank'), globals_1.expect.arrayContaining([searchTerm]));
        });
        (0, globals_1.it)('should support aggregation queries', async () => {
            const mockAggregation = {
                rows: [{
                        total_count: 150,
                        active_count: 120,
                        avg_score: 4.2,
                    }]
            };
            mockPool.query.mockResolvedValueOnce(mockAggregation);
            const result = await repository.aggregate({
                count: '*',
                countWhere: { status: 'active' },
                avg: 'score',
            });
            (0, globals_1.expect)(result).toEqual(mockAggregation.rows[0]);
        });
    });
    (0, globals_1.describe)('Error Handling and Edge Cases', () => {
        (0, globals_1.it)('should handle concurrent update conflicts', async () => {
            // Simulate concurrent update scenario
            mockPool.query.mockResolvedValueOnce({ rows: [] }); // Version conflict
            await (0, globals_1.expect)(repository.update('concurrent-test', { name: 'Updated' }, 'user-1', 1)).rejects.toThrow('Version conflict or record not found');
        });
        (0, globals_1.it)('should validate input sanitization', async () => {
            const maliciousData = {
                name: "'; DROP TABLE test_table; --",
                description: '<script>alert("xss")</script>'
            };
            // Should not throw error (parameterized queries handle this)
            const mockResult = { rows: [{ id: 'sanitized-test', ...maliciousData }] };
            mockPool.query.mockResolvedValueOnce(mockResult);
            const result = await repository.create(maliciousData, 'test-user');
            (0, globals_1.expect)(result).toBeDefined();
            // Verify parameterized query was used
            (0, globals_1.expect)(mockPool.query).toHaveBeenCalledWith(globals_1.expect.any(String), globals_1.expect.arrayContaining([maliciousData.name, maliciousData.description]));
        });
        (0, globals_1.it)('should handle large result sets efficiently', async () => {
            const largeResultSet = {
                rows: Array.from({ length: 1000 }, (_, i) => ({
                    id: `large-result-${i}`,
                    name: `Record ${i}`,
                    data: 'Large data payload'.repeat(100),
                }))
            };
            mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1000' }] });
            mockPool.query.mockResolvedValueOnce(largeResultSet);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return repository.findMany({}, { page: 1, limit: 1000 });
            });
            (0, globals_1.expect)(result.data).toHaveLength(1000);
            (0, globals_1.expect)(duration).toBeLessThan(2000); // Should handle large sets under 2 seconds
        });
    });
});
//# sourceMappingURL=BaseRepository.test.js.map