"use strict";
/**
 * Test setup and configuration
 * Sets up test database, mocks, and global test utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSuccessCriteria = exports.validatePerformanceBenchmark = exports.cleanupTestData = exports.measureExecutionTime = exports.createMockReply = exports.createMockRequest = exports.createTestTask = exports.createTestChannel = exports.createTestUser = void 0;
const database_1 = require("../src/config/database");
const redis_1 = require("../src/config/redis");
// Mock logger in tests to reduce noise
jest.mock('../src/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        fatal: jest.fn(),
    },
    loggers: {
        api: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        websocket: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        cache: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        security: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        performance: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
    },
    performanceLogger: {
        trackAsyncOperation: jest.fn().mockImplementation(async (fn) => await fn()),
        trackSyncOperation: jest.fn().mockImplementation((fn) => fn()),
    },
    securityLogger: {
        logAuthEvent: jest.fn(),
        logAuthzEvent: jest.fn(),
        logSecurityViolation: jest.fn(),
    },
}));
// Mock Redis in tests
jest.mock('../src/config/redis', () => ({
    redisManager: {
        initialize: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        isRedisConnected: jest.fn().mockReturnValue(true),
        getClient: jest.fn().mockReturnValue({
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            expire: jest.fn(),
            ttl: jest.fn(),
            mget: jest.fn(),
            mset: jest.fn(),
            keys: jest.fn(),
            pipeline: jest.fn().mockReturnValue({
                setex: jest.fn(),
                exec: jest.fn().mockResolvedValue([]),
            }),
        }),
        getPublisher: jest.fn(),
        getSubscriber: jest.fn(),
        incrementHits: jest.fn(),
        incrementMisses: jest.fn(),
        incrementSets: jest.fn(),
        incrementDeletes: jest.fn(),
        getMetrics: jest.fn().mockReturnValue({
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            totalOperations: 0,
            hitRate: 0,
        }),
    },
}));
// Mock WebSocket manager in tests
jest.mock('../src/websocket/SocketManager', () => ({
    socketManager: {
        initialize: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getServer: jest.fn().mockReturnValue({}),
        sendToUser: jest.fn().mockReturnValue(true),
        sendToChannel: jest.fn(),
        broadcast: jest.fn(),
        getConnectedUsersCount: jest.fn().mockReturnValue(0),
        getChannelMemberCount: jest.fn().mockReturnValue(0),
        getChannelMembers: jest.fn().mockReturnValue([]),
        isUserOnline: jest.fn().mockReturnValue(false),
        getMetrics: jest.fn().mockReturnValue({
            connections: 0,
            disconnections: 0,
            events: 0,
            errors: 0,
            rooms: 0,
            totalUsers: 0,
        }),
    },
}));
// Global test setup
beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test_user:test_pass@localhost:5432/test_db';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    // Initialize test database
    try {
        await (0, database_1.initializeDatabase)();
    }
    catch (error) {
        console.warn('Test database initialization skipped (database not available)');
    }
});
// Global test cleanup
afterAll(async () => {
    try {
        await (0, database_1.closeDatabase)();
        await redis_1.redisManager.close();
    }
    catch (error) {
        console.warn('Test cleanup completed with warnings');
    }
});
// Test utilities
const createTestUser = (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'staff',
    password_hash: 'hashed-password',
    email_verified: true,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    version: 1,
    ...overrides,
});
exports.createTestUser = createTestUser;
const createTestChannel = (overrides = {}) => ({
    id: 'test-channel-id',
    name: 'Test Channel',
    description: 'Test channel description',
    type: 'general',
    privacy: 'public',
    created_by: 'test-user-id',
    settings: {},
    tags: [],
    member_count: 1,
    message_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    version: 1,
    ...overrides,
});
exports.createTestChannel = createTestChannel;
const createTestTask = (overrides = {}) => ({
    id: 'test-task-id',
    title: 'Test Task',
    description: 'Test task description',
    created_by: 'test-user-id',
    assigned_to: ['test-user-id'],
    owned_by: 'test-user-id',
    priority: 'medium',
    status: 'pending',
    task_type: 'general',
    complexity: 1,
    estimated_hours: null,
    actual_hours: 0,
    progress_percentage: 0,
    tags: [],
    labels: {},
    voice_created: false,
    ai_generated: false,
    ai_suggestions: {},
    automation_rules: {},
    watchers: [],
    comments_count: 0,
    attachments_count: 0,
    business_value: 'medium',
    external_references: {},
    integrations: {},
    is_recurring: false,
    last_activity_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    version: 1,
    ...overrides,
});
exports.createTestTask = createTestTask;
const createMockRequest = (overrides = {}) => ({
    id: 'test-request-id',
    method: 'GET',
    url: '/test',
    headers: {
        'user-agent': 'test-agent',
    },
    ip: '127.0.0.1',
    user: {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'staff',
        name: 'Test User',
        permissions: [],
        isAuthenticated: true,
    },
    body: {},
    query: {},
    params: {},
    ...overrides,
});
exports.createMockRequest = createMockRequest;
const createMockReply = () => ({
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    addHook: jest.fn(),
});
exports.createMockReply = createMockReply;
// Performance testing utilities
const measureExecutionTime = async (operation) => {
    const start = Date.now();
    const result = await operation();
    const duration = Date.now() - start;
    return { result, duration };
};
exports.measureExecutionTime = measureExecutionTime;
// Database test utilities
const cleanupTestData = async () => {
    // This would clean up test data if database is available
    // Implementation depends on actual database setup
};
exports.cleanupTestData = cleanupTestData;
// Success criteria validation helpers
const validatePerformanceBenchmark = (duration, benchmark, operation) => {
    if (duration > benchmark) {
        throw new Error(`Performance benchmark failed for ${operation}: ${duration}ms > ${benchmark}ms`);
    }
};
exports.validatePerformanceBenchmark = validatePerformanceBenchmark;
exports.validateSuccessCriteria = {
    // Voice processing speed: <2 seconds for simple commands
    simpleCommandSpeed: (duration) => (0, exports.validatePerformanceBenchmark)(duration, 2000, 'simple command'),
    // Complex commands: <5 seconds
    complexCommandSpeed: (duration) => (0, exports.validatePerformanceBenchmark)(duration, 5000, 'complex command'),
    // Real-time updates: <100ms
    realTimeUpdate: (duration) => (0, exports.validatePerformanceBenchmark)(duration, 100, 'real-time update'),
    // Notification delivery: <500ms
    notificationDelivery: (duration) => (0, exports.validatePerformanceBenchmark)(duration, 500, 'notification delivery'),
    // Message delivery: <300ms
    messageDelivery: (duration) => (0, exports.validatePerformanceBenchmark)(duration, 300, 'message delivery'),
};
exports.default = {
    createTestUser: exports.createTestUser,
    createTestChannel: exports.createTestChannel,
    createTestTask: exports.createTestTask,
    createMockRequest: exports.createMockRequest,
    createMockReply: exports.createMockReply,
    measureExecutionTime: exports.measureExecutionTime,
    validateSuccessCriteria: exports.validateSuccessCriteria,
};
//# sourceMappingURL=setup.js.map