/**
 * Base Repository Tests
 * Tests for the core database repository pattern with caching, soft deletes, and performance monitoring
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BaseRepository } from '../../src/db/BaseRepository';
import { DatabaseError, NotFoundError, ValidationError } from '../../src/utils/errors';
import { 
  createTestUser, 
  validateSuccessCriteria, 
  measureExecutionTime,
  cleanupTestData 
} from '../setup';

// Mock database and cache dependencies
jest.mock('../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  },
}));

jest.mock('../../src/services/CacheService', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidateByTag: jest.fn(),
    clear: jest.fn(),
  },
}));

// Test implementation of BaseRepository
class TestRepository extends BaseRepository<any> {
  constructor() {
    super('test_table', 'test_cache');
  }

  protected validateCreate(data: any): void {
    if (!data.name) {
      throw new ValidationError('Name is required');
    }
  }

  protected validateUpdate(data: any): void {
    if (data.name === '') {
      throw new ValidationError('Name cannot be empty');
    }
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;
  let mockPool: any;
  let mockCache: any;

  beforeEach(() => {
    repository = new TestRepository();
    mockPool = require('../../src/config/database').pool;
    mockCache = require('../../src/services/CacheService').cacheService;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Create Operations', () => {
    it('should create a new record successfully', async () => {
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

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.create(testData, 'test-user-id');
      });

      // Should meet database operation performance requirements
      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result).toEqual(mockResult.rows[0]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO test_table'),
        expect.any(Array)
      );
      expect(mockCache.invalidateByTag).toHaveBeenCalledWith('test_cache');
    });

    it('should validate data before creation', async () => {
      const invalidData = { description: 'Missing required name' };

      await expect(repository.create(invalidData, 'test-user-id'))
        .rejects
        .toThrow(ValidationError);
      
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database errors during creation', async () => {
      const testData = { name: 'Test Record' };
      mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.create(testData, 'test-user-id'))
        .rejects
        .toThrow(DatabaseError);
    });

    it('should include audit fields in creation', async () => {
      const testData = { name: 'Audit Test' };
      const mockResult = { rows: [{ id: 'audit-test-id', ...testData }] };
      mockPool.query.mockResolvedValueOnce(mockResult);

      await repository.create(testData, 'audit-user-id');

      const queryCall = mockPool.query.mock.calls[0];
      const queryParams = queryCall[1];
      
      expect(queryParams).toContain('audit-user-id'); // created_by
      expect(queryParams).toContain('audit-user-id'); // updated_by
    });
  });

  describe('Read Operations', () => {
    it('should find record by ID with caching', async () => {
      const mockRecord = { 
        id: 'cached-record-id', 
        name: 'Cached Record',
        created_at: new Date(),
        deleted_at: null 
      };

      // First call - cache miss, database hit
      mockCache.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [mockRecord] });

      const { result: result1, duration: duration1 } = await measureExecutionTime(async () => {
        return repository.findById('cached-record-id');
      });

      expect(result1).toEqual(mockRecord);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM test_table WHERE id = $1'),
        ['cached-record-id']
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        'test_cache:cached-record-id',
        mockRecord,
        expect.any(Object)
      );

      // Second call - cache hit
      mockCache.get.mockResolvedValueOnce(mockRecord);
      
      const { result: result2, duration: duration2 } = await measureExecutionTime(async () => {
        return repository.findById('cached-record-id');
      });

      expect(result2).toEqual(mockRecord);
      // Cache hit should be much faster
      expect(duration2).toBeLessThan(duration1);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // No additional DB call
    });

    it('should return null for non-existent records', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should exclude soft-deleted records by default', async () => {
      const deletedRecord = { 
        id: 'deleted-id', 
        name: 'Deleted Record', 
        deleted_at: new Date() 
      };

      mockCache.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [deletedRecord] });

      const result = await repository.findById('deleted-id');

      expect(result).toBeNull();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should support finding with filters and pagination', async () => {
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

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.findMany(filters, options);
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result).toEqual({
        data: mockResults.rows,
        total: 10,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('Update Operations', () => {
    it('should update record with optimistic locking', async () => {
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

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.update('update-test-id', updateData, 'updater-user-id', 1);
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result).toEqual(mockResult.rows[0]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND version = $2'),
        expect.arrayContaining(['update-test-id', 1])
      );
      expect(mockCache.delete).toHaveBeenCalledWith('test_cache:update-test-id');
    });

    it('should handle version conflicts in optimistic locking', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No rows updated

      await expect(
        repository.update('conflict-id', { name: 'Updated' }, 'user-id', 1)
      ).rejects.toThrow('Version conflict or record not found');
    });

    it('should validate update data', async () => {
      const invalidData = { name: '' }; // Empty name should fail validation

      await expect(
        repository.update('test-id', invalidData, 'user-id', 1)
      ).rejects.toThrow(ValidationError);

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('Delete Operations', () => {
    it('should perform soft delete by default', async () => {
      const mockResult = { 
        rows: [{ 
          id: 'soft-delete-id', 
          name: 'Soft Deleted Record',
          deleted_at: new Date(),
          version: 2 
        }] 
      };

      mockPool.query.mockResolvedValueOnce(mockResult);

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.delete('soft-delete-id', 'deleter-user-id', 1);
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result).toEqual(mockResult.rows[0]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at = NOW()'),
        expect.any(Array)
      );
      expect(mockCache.delete).toHaveBeenCalledWith('test_cache:soft-delete-id');
    });

    it('should perform hard delete when specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await repository.delete('hard-delete-id', 'deleter-user-id', 1, true);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM test_table'),
        expect.any(Array)
      );
    });

    it('should handle delete conflicts', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.delete('conflict-id', 'user-id', 1)
      ).rejects.toThrow('Version conflict or record not found');
    });
  });

  describe('Bulk Operations', () => {
    it('should support bulk creation with transaction', async () => {
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
        query: jest.fn().mockResolvedValue(mockResults),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValueOnce(mockClient);

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.createMany(bulkData, 'bulk-user-id');
      });

      // Bulk operations should still be performant
      expect(duration).toBeLessThan(1000); // Under 1 second for bulk ops

      expect(result).toHaveLength(3);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback bulk creation on error', async () => {
      const bulkData = [
        { name: 'Valid Record' },
        { description: 'Invalid - missing name' }, // Should fail validation
      ];

      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Validation failed')),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValueOnce(mockClient);

      await expect(
        repository.createMany(bulkData, 'bulk-user-id')
      ).rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Performance and Caching', () => {
    it('should meet performance benchmarks for read operations', async () => {
      const testRecord = { id: 'perf-test', name: 'Performance Test' };
      mockCache.get.mockResolvedValue(testRecord);

      const { duration } = await measureExecutionTime(async () => {
        const promises = Array.from({ length: 100 }, () =>
          repository.findById('perf-test')
        );
        await Promise.all(promises);
      });

      // 100 cached reads should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should invalidate cache on mutations', async () => {
      const mockResult = { rows: [{ id: 'cache-test', name: 'Updated' }] };
      mockPool.query.mockResolvedValueOnce(mockResult);

      await repository.update('cache-test', { name: 'Updated' }, 'user-id', 1);

      expect(mockCache.delete).toHaveBeenCalledWith('test_cache:cache-test');
      expect(mockCache.invalidateByTag).toHaveBeenCalledWith('test_cache');
    });

    it('should handle cache failures gracefully', async () => {
      const testRecord = { id: 'cache-fail-test', name: 'Cache Fail Test' };
      
      // Cache throws error but DB works
      mockCache.get.mockRejectedValueOnce(new Error('Cache unavailable'));
      mockPool.query.mockResolvedValueOnce({ rows: [testRecord] });

      const result = await repository.findById('cache-fail-test');

      expect(result).toEqual(testRecord);
      expect(mockPool.query).toHaveBeenCalled(); // Still queries database
    });
  });

  describe('Advanced Features', () => {
    it('should support complex queries with joins', async () => {
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

      expect(result).toEqual(mockResults.rows);
      expect(mockPool.query).toHaveBeenCalledWith(customQuery, ['active']);
    });

    it('should support search with full-text indexing', async () => {
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

      expect(result).toEqual(mockResults.rows);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        expect.arrayContaining([searchTerm])
      );
    });

    it('should support aggregation queries', async () => {
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

      expect(result).toEqual(mockAggregation.rows[0]);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent update conflicts', async () => {
      // Simulate concurrent update scenario
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Version conflict

      await expect(
        repository.update('concurrent-test', { name: 'Updated' }, 'user-1', 1)
      ).rejects.toThrow('Version conflict or record not found');
    });

    it('should validate input sanitization', async () => {
      const maliciousData = {
        name: "'; DROP TABLE test_table; --",
        description: '<script>alert("xss")</script>'
      };

      // Should not throw error (parameterized queries handle this)
      const mockResult = { rows: [{ id: 'sanitized-test', ...maliciousData }] };
      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await repository.create(maliciousData, 'test-user');

      expect(result).toBeDefined();
      // Verify parameterized query was used
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([maliciousData.name, maliciousData.description])
      );
    });

    it('should handle large result sets efficiently', async () => {
      const largeResultSet = {
        rows: Array.from({ length: 1000 }, (_, i) => ({
          id: `large-result-${i}`,
          name: `Record ${i}`,
          data: 'Large data payload'.repeat(100),
        }))
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1000' }] });
      mockPool.query.mockResolvedValueOnce(largeResultSet);

      const { result, duration } = await measureExecutionTime(async () => {
        return repository.findMany({}, { page: 1, limit: 1000 });
      });

      expect(result.data).toHaveLength(1000);
      expect(duration).toBeLessThan(2000); // Should handle large sets under 2 seconds
    });
  });
});