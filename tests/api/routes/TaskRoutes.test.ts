/**
 * Task Routes API Tests
 * Comprehensive tests for task management endpoints with performance validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { 
  createTestUser, 
  createTestTask, 
  createMockRequest,
  validateSuccessCriteria, 
  measureExecutionTime,
  cleanupTestData 
} from '../../setup';

// Mock dependencies
jest.mock('../../../src/repositories/TaskRepository');
jest.mock('../../../src/websocket/SocketManager');
jest.mock('../../../src/services/CacheService');

describe('Task Routes API', () => {
  let app: FastifyInstance;
  let mockTaskRepository: any;
  let mockSocketManager: any;
  let testUser: any;
  let testTask: any;

  beforeEach(async () => {
    // Setup test data
    testUser = createTestUser({
      id: 'task-test-user',
      role: 'staff',
      permissions: ['tasks:read', 'tasks:create', 'tasks:update']
    });

    testTask = createTestTask({
      id: 'task-test-123',
      title: 'Test Task',
      assigned_to: [testUser.id],
      created_by: testUser.id,
    });

    // Setup mocks
    mockTaskRepository = require('../../../src/repositories/TaskRepository').TaskRepository;
    mockSocketManager = require('../../../src/websocket/SocketManager').socketManager;

    mockTaskRepository.findById = jest.fn();
    mockTaskRepository.findMany = jest.fn();
    mockTaskRepository.create = jest.fn();
    mockTaskRepository.update = jest.fn();
    mockTaskRepository.delete = jest.fn();
    mockTaskRepository.getTaskStats = jest.fn();
    mockTaskRepository.assignUsers = jest.fn();
    mockTaskRepository.updateStatus = jest.fn();

    mockSocketManager.sendToUser = jest.fn();
    mockSocketManager.sendToChannel = jest.fn();
    mockSocketManager.broadcast = jest.fn();

    // Setup Fastify instance with routes
    const { setupTestApp } = require('../../helpers/testApp');
    app = await setupTestApp();
  });

  afterEach(async () => {
    await cleanupTestData();
    jest.clearAllMocks();
    await app?.close();
  });

  describe('GET /api/v1/tasks', () => {
    it('should list tasks with pagination and filtering', async () => {
      const mockTasks = {
        data: [testTask, createTestTask({ id: 'task-2' })],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockTaskRepository.findMany.mockResolvedValueOnce(mockTasks);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'GET',
          url: '/api/v1/tasks?page=1&limit=10&status=pending',
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
          },
        });
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(2);
      expect(responseBody.total).toBe(2);
      expect(responseBody.page).toBe(1);

      expect(mockTaskRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
        }),
        expect.objectContaining({
          page: 1,
          limit: 10,
        })
      );
    });

    it('should support advanced filtering options', async () => {
      const mockFilteredTasks = {
        data: [testTask],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockTaskRepository.findMany.mockResolvedValueOnce(mockFilteredTasks);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks?assignedTo=user-123&priority=high&dueBefore=2024-12-31&tags=urgent,important',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTaskRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_to: ['user-123'],
          priority: 'high',
          due_date_before: expect.any(Date),
          tags: ['urgent', 'important'],
        }),
        expect.any(Object)
      );
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
      });

      expect(response.statusCode).toBe(401);
      expect(mockTaskRepository.findMany).not.toHaveBeenCalled();
    });

    it('should respect user permissions for task visibility', async () => {
      const limitedUser = createTestUser({
        role: 'staff',
        permissions: ['tasks:read:own'], // Can only see own tasks
      });

      mockTaskRepository.findMany.mockResolvedValueOnce({
        data: [testTask],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${await generateTestToken(limitedUser)}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTaskRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_to: [limitedUser.id], // Filtered to user's own tasks
        }),
        expect.any(Object)
      );
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('should get task by ID successfully', async () => {
      mockTaskRepository.findById.mockResolvedValueOnce(testTask);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'GET',
          url: `/api/v1/tasks/${testTask.id}`,
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
          },
        });
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.id).toBe(testTask.id);
      expect(responseBody.title).toBe(testTask.title);

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(testTask.id);
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskRepository.findById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/non-existent-id',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('TASK_NOT_FOUND');
    });

    it('should enforce task access permissions', async () => {
      const restrictedTask = createTestTask({
        id: 'restricted-task',
        assigned_to: ['other-user-id'], // Not assigned to test user
        privacy: 'private',
      });

      mockTaskRepository.findById.mockResolvedValueOnce(restrictedTask);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${restrictedTask.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('POST /api/v1/tasks', () => {
    it('should create task successfully', async () => {
      const newTaskData = {
        title: 'New Task via API',
        description: 'Task created through API endpoint',
        priority: 'high',
        due_date: '2024-12-31T23:59:59Z',
        assigned_to: [testUser.id],
      };

      const createdTask = createTestTask({
        ...newTaskData,
        id: 'new-task-id',
        created_by: testUser.id,
      });

      mockTaskRepository.create.mockResolvedValueOnce(createdTask);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'POST',
          url: '/api/v1/tasks',
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
            'content-type': 'application/json',
          },
          payload: newTaskData,
        });
      });

      // Task creation should be fast for good UX
      validateSuccessCriteria.simpleCommandSpeed(duration);

      expect(result.statusCode).toBe(201);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.id).toBe(createdTask.id);
      expect(responseBody.title).toBe(newTaskData.title);

      expect(mockTaskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining(newTaskData),
        testUser.id
      );

      // Should send real-time notifications
      expect(mockSocketManager.sendToUser).toHaveBeenCalledWith(
        testUser.id,
        'task_assigned',
        expect.objectContaining({
          task: createdTask,
        })
      );
    });

    it('should validate required task fields', async () => {
      const invalidTaskData = {
        description: 'Task without title', // Missing required title
        priority: 'high',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: invalidTaskData,
      });

      expect(response.statusCode).toBe(400);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error.details).toContain('title');

      expect(mockTaskRepository.create).not.toHaveBeenCalled();
    });

    it('should enforce task creation permissions', async () => {
      const unauthorizedUser = createTestUser({
        role: 'staff',
        permissions: ['tasks:read'], // No create permission
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${await generateTestToken(unauthorizedUser)}`,
          'content-type': 'application/json',
        },
        payload: {
          title: 'Unauthorized Task',
          description: 'Should not be created',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(mockTaskRepository.create).not.toHaveBeenCalled();
    });

    it('should support voice-created task metadata', async () => {
      const voiceTaskData = {
        title: 'Voice Created Task',
        description: 'Created via voice command',
        voice_created: true,
        voice_command_id: 'voice-cmd-123',
        voice_instructions: 'Create a task for project review due Friday',
      };

      const voiceTask = createTestTask({
        ...voiceTaskData,
        id: 'voice-task-id',
      });

      mockTaskRepository.create.mockResolvedValueOnce(voiceTask);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: voiceTaskData,
      });

      expect(response.statusCode).toBe(201);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.voice_created).toBe(true);
      expect(responseBody.voice_command_id).toBe('voice-cmd-123');
    });
  });

  describe('PUT /api/v1/tasks/:id', () => {
    it('should update task successfully', async () => {
      const updateData = {
        title: 'Updated Task Title',
        priority: 'urgent',
        status: 'in_progress',
      };

      const updatedTask = { ...testTask, ...updateData, version: 2 };
      mockTaskRepository.update.mockResolvedValueOnce(updatedTask);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'PUT',
          url: `/api/v1/tasks/${testTask.id}`,
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
            'content-type': 'application/json',
          },
          payload: { ...updateData, version: 1 },
        });
      });

      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.title).toBe(updateData.title);
      expect(responseBody.priority).toBe(updateData.priority);
      expect(responseBody.version).toBe(2);

      expect(mockTaskRepository.update).toHaveBeenCalledWith(
        testTask.id,
        expect.objectContaining(updateData),
        testUser.id,
        1
      );
    });

    it('should handle version conflicts', async () => {
      mockTaskRepository.update.mockRejectedValueOnce(
        new Error('Version conflict or record not found')
      );

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/tasks/${testTask.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: {
          title: 'Conflicted Update',
          version: 1, // Stale version
        },
      });

      expect(response.statusCode).toBe(409);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('VERSION_CONFLICT');
    });

    it('should broadcast task updates to relevant users', async () => {
      const updatedTask = { ...testTask, status: 'completed', version: 2 };
      mockTaskRepository.update.mockResolvedValueOnce(updatedTask);

      await app.inject({
        method: 'PUT',
        url: `/api/v1/tasks/${testTask.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: { status: 'completed', version: 1 },
      });

      // Should broadcast to all assigned users
      expect(mockSocketManager.sendToUser).toHaveBeenCalledWith(
        testUser.id,
        'task_updated',
        expect.objectContaining({
          task: updatedTask,
          changes: expect.objectContaining({
            status: { old: 'pending', new: 'completed' },
          }),
        })
      );

      // Should also send to watchers if any
      if (updatedTask.watchers && updatedTask.watchers.length > 0) {
        updatedTask.watchers.forEach((watcherId: string) => {
          expect(mockSocketManager.sendToUser).toHaveBeenCalledWith(
            watcherId,
            'watched_task_updated',
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('PATCH /api/v1/tasks/:id/status', () => {
    it('should update task status efficiently', async () => {
      const statusUpdate = { status: 'completed', progress_percentage: 100 };
      const updatedTask = { ...testTask, ...statusUpdate };

      mockTaskRepository.updateStatus.mockResolvedValueOnce(updatedTask);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'PATCH',
          url: `/api/v1/tasks/${testTask.id}/status`,
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
            'content-type': 'application/json',
          },
          payload: statusUpdate,
        });
      });

      // Status updates should be very fast for real-time UX
      expect(duration).toBeLessThan(50);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.status).toBe('completed');
      expect(responseBody.progress_percentage).toBe(100);

      expect(mockTaskRepository.updateStatus).toHaveBeenCalledWith(
        testTask.id,
        statusUpdate,
        testUser.id
      );
    });

    it('should validate status transitions', async () => {
      const invalidStatusUpdate = { status: 'invalid_status' };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${testTask.id}/status`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: invalidStatusUpdate,
      });

      expect(response.statusCode).toBe(400);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('INVALID_STATUS');
    });
  });

  describe('POST /api/v1/tasks/:id/assign', () => {
    it('should assign users to task', async () => {
      const assignmentData = {
        user_ids: ['user-1', 'user-2'],
        notify: true,
      };

      const assignedTask = {
        ...testTask,
        assigned_to: [...testTask.assigned_to, ...assignmentData.user_ids],
      };

      mockTaskRepository.assignUsers.mockResolvedValueOnce(assignedTask);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${testTask.id}/assign`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
          'content-type': 'application/json',
        },
        payload: assignmentData,
      });

      expect(response.statusCode).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.assigned_to).toContain('user-1');
      expect(responseBody.assigned_to).toContain('user-2');

      // Should notify newly assigned users
      assignmentData.user_ids.forEach(userId => {
        expect(mockSocketManager.sendToUser).toHaveBeenCalledWith(
          userId,
          'task_assigned',
          expect.objectContaining({
            task: assignedTask,
          })
        );
      });
    });

    it('should enforce assignment permissions', async () => {
      const unauthorizedUser = createTestUser({
        role: 'staff',
        permissions: ['tasks:read', 'tasks:update'], // No assign permission
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${testTask.id}/assign`,
        headers: {
          authorization: `Bearer ${await generateTestToken(unauthorizedUser)}`,
          'content-type': 'application/json',
        },
        payload: { user_ids: ['user-1'] },
      });

      expect(response.statusCode).toBe(403);
      expect(mockTaskRepository.assignUsers).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/tasks/stats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        total_tasks: 150,
        pending_tasks: 45,
        in_progress_tasks: 60,
        completed_tasks: 40,
        overdue_tasks: 5,
        by_priority: {
          low: 20,
          medium: 80,
          high: 35,
          urgent: 10,
          critical: 5,
        },
        by_assignee: {
          [testUser.id]: {
            total: 25,
            pending: 8,
            in_progress: 12,
            completed: 5,
          },
        },
        completion_rate: 0.73,
        average_completion_time: 4.2, // days
      };

      mockTaskRepository.getTaskStats.mockResolvedValueOnce(mockStats);

      const { result, duration } = await measureExecutionTime(async () => {
        return app.inject({
          method: 'GET',
          url: '/api/v1/tasks/stats',
          headers: {
            authorization: `Bearer ${await generateTestToken(testUser)}`,
          },
        });
      });

      // Statistics should load quickly for dashboard performance
      validateSuccessCriteria.realTimeUpdate(duration);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.total_tasks).toBe(150);
      expect(responseBody.completion_rate).toBe(0.73);
      expect(responseBody.by_priority).toBeDefined();
      expect(responseBody.by_assignee).toBeDefined();
    });

    it('should support date range filtering for stats', async () => {
      const dateRangeStats = {
        total_tasks: 25,
        completed_tasks: 20,
        completion_rate: 0.80,
      };

      mockTaskRepository.getTaskStats.mockResolvedValueOnce(dateRangeStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/stats?startDate=2024-01-01&endDate=2024-01-31',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTaskRepository.getTaskStats).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: expect.any(Date),
          end_date: expect.any(Date),
        })
      );
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('should delete task successfully', async () => {
      mockTaskRepository.delete.mockResolvedValueOnce(testTask);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/tasks/${testTask.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.message).toBe('Task deleted successfully');

      expect(mockTaskRepository.delete).toHaveBeenCalledWith(
        testTask.id,
        testUser.id,
        undefined, // version
        false // soft delete by default
      );
    });

    it('should enforce deletion permissions', async () => {
      const unauthorizedUser = createTestUser({
        role: 'staff',
        permissions: ['tasks:read', 'tasks:update'], // No delete permission
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/tasks/${testTask.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(unauthorizedUser)}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(mockTaskRepository.delete).not.toHaveBeenCalled();
    });

    it('should prevent deletion of tasks with dependencies', async () => {
      const taskWithDependents = createTestTask({
        id: 'parent-task',
        dependent_tasks: ['child-task-1', 'child-task-2'],
      });

      mockTaskRepository.delete.mockRejectedValueOnce(
        new Error('Cannot delete task with active dependencies')
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/tasks/${taskWithDependents.id}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error.code).toBe('TASK_HAS_DEPENDENCIES');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent task operations', async () => {
      const concurrentOperations = Array.from({ length: 50 }, (_, i) => ({
        method: 'GET' as const,
        url: `/api/v1/tasks/task-${i}`,
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      }));

      mockTaskRepository.findById.mockResolvedValue(testTask);

      const { duration } = await measureExecutionTime(async () => {
        const promises = concurrentOperations.map(operation =>
          app.inject(operation)
        );
        await Promise.all(promises);
      });

      // 50 concurrent requests should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should maintain performance under high load', async () => {
      const loadTestOperations = Array.from({ length: 100 }, () => ({
        method: 'GET' as const,
        url: '/api/v1/tasks?page=1&limit=10',
        headers: {
          authorization: `Bearer ${await generateTestToken(testUser)}`,
        },
      }));

      const mockTaskList = {
        data: Array.from({ length: 10 }, () => testTask),
        total: 100,
        page: 1,
        limit: 10,
        totalPages: 10,
      };

      mockTaskRepository.findMany.mockResolvedValue(mockTaskList);

      const { duration } = await measureExecutionTime(async () => {
        const promises = loadTestOperations.map(operation =>
          app.inject(operation)
        );
        await Promise.all(promises);
      });

      // 100 list operations should complete within 3 seconds
      expect(duration).toBeLessThan(3000);
    });
  });
});

// Helper function to generate test JWT tokens
async function generateTestToken(user: any): Promise<string> {
  const { generateTokens } = require('../../../src/auth/jwt');
  const tokens = await generateTokens(user);
  return tokens.accessToken;
}