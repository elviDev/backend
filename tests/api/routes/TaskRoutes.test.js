"use strict";
/**
 * Task Routes API Tests
 * Comprehensive tests for task management endpoints with performance validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const setup_1 = require("../../setup");
// Mock dependencies
globals_1.jest.mock('../../../src/repositories/TaskRepository');
globals_1.jest.mock('../../../src/websocket/SocketManager');
globals_1.jest.mock('../../../src/services/CacheService');
(0, globals_1.describe)('Task Routes API', () => {
    let app;
    let mockTaskRepository;
    let mockSocketManager;
    let testUser;
    let testTask;
    (0, globals_1.beforeEach)(async () => {
        // Setup test data
        testUser = (0, setup_1.createTestUser)({
            id: 'task-test-user',
            role: 'staff',
            permissions: ['tasks:read', 'tasks:create', 'tasks:update']
        });
        testTask = (0, setup_1.createTestTask)({
            id: 'task-test-123',
            title: 'Test Task',
            assigned_to: [testUser.id],
            created_by: testUser.id,
        });
        // Setup mocks
        mockTaskRepository = require('../../../src/repositories/TaskRepository').TaskRepository;
        mockSocketManager = require('../../../src/websocket/SocketManager').socketManager;
        mockTaskRepository.findById = globals_1.jest.fn();
        mockTaskRepository.findMany = globals_1.jest.fn();
        mockTaskRepository.create = globals_1.jest.fn();
        mockTaskRepository.update = globals_1.jest.fn();
        mockTaskRepository.delete = globals_1.jest.fn();
        mockTaskRepository.getTaskStats = globals_1.jest.fn();
        mockTaskRepository.assignUsers = globals_1.jest.fn();
        mockTaskRepository.updateStatus = globals_1.jest.fn();
        mockSocketManager.sendToUser = globals_1.jest.fn();
        mockSocketManager.sendToChannel = globals_1.jest.fn();
        mockSocketManager.broadcast = globals_1.jest.fn();
        // Setup Fastify instance with routes
        const { setupTestApp } = require('../../helpers/testApp');
        app = await setupTestApp();
    });
    (0, globals_1.afterEach)(async () => {
        await (0, setup_1.cleanupTestData)();
        globals_1.jest.clearAllMocks();
        await app?.close();
    });
    (0, globals_1.describe)('GET /api/v1/tasks', () => {
        (0, globals_1.it)('should list tasks with pagination and filtering', async () => {
            const mockTasks = {
                data: [testTask, (0, setup_1.createTestTask)({ id: 'task-2' })],
                total: 2,
                page: 1,
                limit: 10,
                totalPages: 1,
            };
            mockTaskRepository.findMany.mockResolvedValueOnce(mockTasks);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return app.inject({
                    method: 'GET',
                    url: '/api/v1/tasks?page=1&limit=10&status=pending',
                    headers: {
                        authorization: `Bearer ${await generateTestToken(testUser)}`,
                    },
                });
            });
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.data).toHaveLength(2);
            (0, globals_1.expect)(responseBody.total).toBe(2);
            (0, globals_1.expect)(responseBody.page).toBe(1);
            (0, globals_1.expect)(mockTaskRepository.findMany).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                status: 'pending',
            }), globals_1.expect.objectContaining({
                page: 1,
                limit: 10,
            }));
        });
        (0, globals_1.it)('should support advanced filtering options', async () => {
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
            (0, globals_1.expect)(response.statusCode).toBe(200);
            (0, globals_1.expect)(mockTaskRepository.findMany).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                assigned_to: ['user-123'],
                priority: 'high',
                due_date_before: globals_1.expect.any(Date),
                tags: ['urgent', 'important'],
            }), globals_1.expect.any(Object));
        });
        (0, globals_1.it)('should require authentication', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/tasks',
            });
            (0, globals_1.expect)(response.statusCode).toBe(401);
            (0, globals_1.expect)(mockTaskRepository.findMany).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should respect user permissions for task visibility', async () => {
            const limitedUser = (0, setup_1.createTestUser)({
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
            (0, globals_1.expect)(response.statusCode).toBe(200);
            (0, globals_1.expect)(mockTaskRepository.findMany).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                assigned_to: [limitedUser.id], // Filtered to user's own tasks
            }), globals_1.expect.any(Object));
        });
    });
    (0, globals_1.describe)('GET /api/v1/tasks/:id', () => {
        (0, globals_1.it)('should get task by ID successfully', async () => {
            mockTaskRepository.findById.mockResolvedValueOnce(testTask);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return app.inject({
                    method: 'GET',
                    url: `/api/v1/tasks/${testTask.id}`,
                    headers: {
                        authorization: `Bearer ${await generateTestToken(testUser)}`,
                    },
                });
            });
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.id).toBe(testTask.id);
            (0, globals_1.expect)(responseBody.title).toBe(testTask.title);
            (0, globals_1.expect)(mockTaskRepository.findById).toHaveBeenCalledWith(testTask.id);
        });
        (0, globals_1.it)('should return 404 for non-existent task', async () => {
            mockTaskRepository.findById.mockResolvedValueOnce(null);
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/tasks/non-existent-id',
                headers: {
                    authorization: `Bearer ${await generateTestToken(testUser)}`,
                },
            });
            (0, globals_1.expect)(response.statusCode).toBe(404);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('TASK_NOT_FOUND');
        });
        (0, globals_1.it)('should enforce task access permissions', async () => {
            const restrictedTask = (0, setup_1.createTestTask)({
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
            (0, globals_1.expect)(response.statusCode).toBe(403);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('ACCESS_DENIED');
        });
    });
    (0, globals_1.describe)('POST /api/v1/tasks', () => {
        (0, globals_1.it)('should create task successfully', async () => {
            const newTaskData = {
                title: 'New Task via API',
                description: 'Task created through API endpoint',
                priority: 'high',
                due_date: '2024-12-31T23:59:59Z',
                assigned_to: [testUser.id],
            };
            const createdTask = (0, setup_1.createTestTask)({
                ...newTaskData,
                id: 'new-task-id',
                created_by: testUser.id,
            });
            mockTaskRepository.create.mockResolvedValueOnce(createdTask);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
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
            setup_1.validateSuccessCriteria.simpleCommandSpeed(duration);
            (0, globals_1.expect)(result.statusCode).toBe(201);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.id).toBe(createdTask.id);
            (0, globals_1.expect)(responseBody.title).toBe(newTaskData.title);
            (0, globals_1.expect)(mockTaskRepository.create).toHaveBeenCalledWith(globals_1.expect.objectContaining(newTaskData), testUser.id);
            // Should send real-time notifications
            (0, globals_1.expect)(mockSocketManager.sendToUser).toHaveBeenCalledWith(testUser.id, 'task_assigned', globals_1.expect.objectContaining({
                task: createdTask,
            }));
        });
        (0, globals_1.it)('should validate required task fields', async () => {
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
            (0, globals_1.expect)(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('VALIDATION_ERROR');
            (0, globals_1.expect)(responseBody.error.details).toContain('title');
            (0, globals_1.expect)(mockTaskRepository.create).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should enforce task creation permissions', async () => {
            const unauthorizedUser = (0, setup_1.createTestUser)({
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
            (0, globals_1.expect)(response.statusCode).toBe(403);
            (0, globals_1.expect)(mockTaskRepository.create).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should support voice-created task metadata', async () => {
            const voiceTaskData = {
                title: 'Voice Created Task',
                description: 'Created via voice command',
                voice_created: true,
                voice_command_id: 'voice-cmd-123',
                voice_instructions: 'Create a task for project review due Friday',
            };
            const voiceTask = (0, setup_1.createTestTask)({
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
            (0, globals_1.expect)(response.statusCode).toBe(201);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.voice_created).toBe(true);
            (0, globals_1.expect)(responseBody.voice_command_id).toBe('voice-cmd-123');
        });
    });
    (0, globals_1.describe)('PUT /api/v1/tasks/:id', () => {
        (0, globals_1.it)('should update task successfully', async () => {
            const updateData = {
                title: 'Updated Task Title',
                priority: 'urgent',
                status: 'in_progress',
            };
            const updatedTask = { ...testTask, ...updateData, version: 2 };
            mockTaskRepository.update.mockResolvedValueOnce(updatedTask);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
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
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.title).toBe(updateData.title);
            (0, globals_1.expect)(responseBody.priority).toBe(updateData.priority);
            (0, globals_1.expect)(responseBody.version).toBe(2);
            (0, globals_1.expect)(mockTaskRepository.update).toHaveBeenCalledWith(testTask.id, globals_1.expect.objectContaining(updateData), testUser.id, 1);
        });
        (0, globals_1.it)('should handle version conflicts', async () => {
            mockTaskRepository.update.mockRejectedValueOnce(new Error('Version conflict or record not found'));
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
            (0, globals_1.expect)(response.statusCode).toBe(409);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('VERSION_CONFLICT');
        });
        (0, globals_1.it)('should broadcast task updates to relevant users', async () => {
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
            (0, globals_1.expect)(mockSocketManager.sendToUser).toHaveBeenCalledWith(testUser.id, 'task_updated', globals_1.expect.objectContaining({
                task: updatedTask,
                changes: globals_1.expect.objectContaining({
                    status: { old: 'pending', new: 'completed' },
                }),
            }));
            // Should also send to watchers if any
            if (updatedTask.watchers && updatedTask.watchers.length > 0) {
                updatedTask.watchers.forEach((watcherId) => {
                    (0, globals_1.expect)(mockSocketManager.sendToUser).toHaveBeenCalledWith(watcherId, 'watched_task_updated', globals_1.expect.any(Object));
                });
            }
        });
    });
    (0, globals_1.describe)('PATCH /api/v1/tasks/:id/status', () => {
        (0, globals_1.it)('should update task status efficiently', async () => {
            const statusUpdate = { status: 'completed', progress_percentage: 100 };
            const updatedTask = { ...testTask, ...statusUpdate };
            mockTaskRepository.updateStatus.mockResolvedValueOnce(updatedTask);
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
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
            (0, globals_1.expect)(duration).toBeLessThan(50);
            (0, globals_1.expect)(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.status).toBe('completed');
            (0, globals_1.expect)(responseBody.progress_percentage).toBe(100);
            (0, globals_1.expect)(mockTaskRepository.updateStatus).toHaveBeenCalledWith(testTask.id, statusUpdate, testUser.id);
        });
        (0, globals_1.it)('should validate status transitions', async () => {
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
            (0, globals_1.expect)(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('INVALID_STATUS');
        });
    });
    (0, globals_1.describe)('POST /api/v1/tasks/:id/assign', () => {
        (0, globals_1.it)('should assign users to task', async () => {
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
            (0, globals_1.expect)(response.statusCode).toBe(200);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.assigned_to).toContain('user-1');
            (0, globals_1.expect)(responseBody.assigned_to).toContain('user-2');
            // Should notify newly assigned users
            assignmentData.user_ids.forEach(userId => {
                (0, globals_1.expect)(mockSocketManager.sendToUser).toHaveBeenCalledWith(userId, 'task_assigned', globals_1.expect.objectContaining({
                    task: assignedTask,
                }));
            });
        });
        (0, globals_1.it)('should enforce assignment permissions', async () => {
            const unauthorizedUser = (0, setup_1.createTestUser)({
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
            (0, globals_1.expect)(response.statusCode).toBe(403);
            (0, globals_1.expect)(mockTaskRepository.assignUsers).not.toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('GET /api/v1/tasks/stats', () => {
        (0, globals_1.it)('should return task statistics', async () => {
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
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return app.inject({
                    method: 'GET',
                    url: '/api/v1/tasks/stats',
                    headers: {
                        authorization: `Bearer ${await generateTestToken(testUser)}`,
                    },
                });
            });
            // Statistics should load quickly for dashboard performance
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            (0, globals_1.expect)(responseBody.total_tasks).toBe(150);
            (0, globals_1.expect)(responseBody.completion_rate).toBe(0.73);
            (0, globals_1.expect)(responseBody.by_priority).toBeDefined();
            (0, globals_1.expect)(responseBody.by_assignee).toBeDefined();
        });
        (0, globals_1.it)('should support date range filtering for stats', async () => {
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
            (0, globals_1.expect)(response.statusCode).toBe(200);
            (0, globals_1.expect)(mockTaskRepository.getTaskStats).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                start_date: globals_1.expect.any(Date),
                end_date: globals_1.expect.any(Date),
            }));
        });
    });
    (0, globals_1.describe)('DELETE /api/v1/tasks/:id', () => {
        (0, globals_1.it)('should delete task successfully', async () => {
            mockTaskRepository.delete.mockResolvedValueOnce(testTask);
            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/tasks/${testTask.id}`,
                headers: {
                    authorization: `Bearer ${await generateTestToken(testUser)}`,
                },
            });
            (0, globals_1.expect)(response.statusCode).toBe(200);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.message).toBe('Task deleted successfully');
            (0, globals_1.expect)(mockTaskRepository.delete).toHaveBeenCalledWith(testTask.id, testUser.id, undefined, // version
            false // soft delete by default
            );
        });
        (0, globals_1.it)('should enforce deletion permissions', async () => {
            const unauthorizedUser = (0, setup_1.createTestUser)({
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
            (0, globals_1.expect)(response.statusCode).toBe(403);
            (0, globals_1.expect)(mockTaskRepository.delete).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should prevent deletion of tasks with dependencies', async () => {
            const taskWithDependents = (0, setup_1.createTestTask)({
                id: 'parent-task',
                dependent_tasks: ['child-task-1', 'child-task-2'],
            });
            mockTaskRepository.delete.mockRejectedValueOnce(new Error('Cannot delete task with active dependencies'));
            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/tasks/${taskWithDependents.id}`,
                headers: {
                    authorization: `Bearer ${await generateTestToken(testUser)}`,
                },
            });
            (0, globals_1.expect)(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.body);
            (0, globals_1.expect)(responseBody.error.code).toBe('TASK_HAS_DEPENDENCIES');
        });
    });
    (0, globals_1.describe)('Performance and Load Testing', () => {
        (0, globals_1.it)('should handle concurrent task operations', async () => {
            const concurrentOperations = Array.from({ length: 50 }, (_, i) => ({
                method: 'GET',
                url: `/api/v1/tasks/task-${i}`,
                headers: {
                    authorization: `Bearer ${await generateTestToken(testUser)}`,
                },
            }));
            mockTaskRepository.findById.mockResolvedValue(testTask);
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = concurrentOperations.map(operation => app.inject(operation));
                await Promise.all(promises);
            });
            // 50 concurrent requests should complete within 2 seconds
            (0, globals_1.expect)(duration).toBeLessThan(2000);
        });
        (0, globals_1.it)('should maintain performance under high load', async () => {
            const loadTestOperations = Array.from({ length: 100 }, () => ({
                method: 'GET',
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
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = loadTestOperations.map(operation => app.inject(operation));
                await Promise.all(promises);
            });
            // 100 list operations should complete within 3 seconds
            (0, globals_1.expect)(duration).toBeLessThan(3000);
        });
    });
});
// Helper function to generate test JWT tokens
async function generateTestToken(user) {
    const { generateTokens } = require('../../../src/auth/jwt');
    const tokens = await generateTokens(user);
    return tokens.accessToken;
}
//# sourceMappingURL=TaskRoutes.test.js.map