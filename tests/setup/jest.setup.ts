/**
 * Jest Test Setup - Phase 2 Testing Environment
 * Global test setup and configuration for Phase 2 testing suite
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(min: number, max: number): R;
      toMatchSchema(schema: any): R;
      toHaveValidationError(field: string): R;
      toBeValidVoiceCommand(): R;
      toHavePerformanceMetrics(): R;
    }
  }
}

// Mock external dependencies that aren't needed for testing
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue([]),
      del: jest.fn(),
      setex: jest.fn()
    })),
    keys: jest.fn().mockResolvedValue([]),
    smembers: jest.fn().mockResolvedValue([]),
    sadd: jest.fn(),
    expire: jest.fn(),
    memory: jest.fn().mockResolvedValue(1024),
    dbsize: jest.fn().mockResolvedValue(100),
    on: jest.fn(),
    disconnect: jest.fn(),
    status: 'ready'
  };
  return jest.fn(() => mockRedis);
});

// Mock AWS S3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn()
  })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn()
}));

// Mock Socket.IO
jest.mock('socket.io', () => ({
  Server: jest.fn(() => ({
    on: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    })),
    sockets: {
      sockets: new Map()
    },
    disconnectSockets: jest.fn()
  }))
}));

// Mock file system operations for testing
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn(),
    access: jest.fn()
  },
  createReadStream: jest.fn(),
  createWriteStream: jest.fn()
}));

// Mock performance monitoring
const mockPerformanceNow = jest.fn(() => Date.now());
Object.defineProperty(performance, 'now', {
  value: mockPerformanceNow,
  writable: true
});

// Mock database operations
const mockDatabase = {
  query: jest.fn(),
  transaction: jest.fn(),
  one: jest.fn(),
  many: jest.fn(),
  none: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn()
};

// Global test database instance
global.testDb = mockDatabase;

// Test data cleanup utilities
global.testUtils = {
  // Generate test user
  createTestUser: (overrides = {}) => ({
    id: `test-user-${Date.now()}`,
    email: 'test@example.com',
    organizationId: `test-org-${Date.now()}`,
    permissions: ['tasks:read', 'tasks:write'],
    ...overrides
  }),
  
  // Generate test organization
  createTestOrganization: (overrides = {}) => ({
    id: `test-org-${Date.now()}`,
    name: 'Test Organization',
    domain: 'test.com',
    ...overrides
  }),
  
  // Generate test voice command
  createTestVoiceCommand: (overrides = {}) => ({
    transcription: 'Create a test task',
    userId: `test-user-${Date.now()}`,
    organizationId: `test-org-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...overrides
  }),
  
  // Generate test file data
  createTestFile: (overrides = {}) => ({
    id: `test-file-${Date.now()}`,
    fileName: 'test-document.pdf',
    originalName: 'test-document.pdf',
    size: 1024 * 1024, // 1MB
    contentType: 'application/pdf',
    s3Key: `files/test-document-${Date.now()}.pdf`,
    ...overrides
  }),
  
  // Wait utility for async testing
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Assert async conditions
  waitForCondition: async (condition: () => boolean | Promise<boolean>, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await global.testUtils.wait(100);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },
  
  // Mock socket client
  createMockSocketClient: () => ({
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    connected: true
  }),
  
  // Performance measurement helper
  measurePerformance: async (fn: () => Promise<any>) => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  }
};

// Cleanup function for after each test
global.testCleanup = async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset performance mock
  mockPerformanceNow.mockClear();
  
  // Clear any test data
  if (global.testDb) {
    global.testDb.query.mockClear();
    global.testDb.transaction.mockClear();
    global.testDb.one.mockClear();
    global.testDb.many.mockClear();
    global.testDb.none.mockClear();
  }
  
  // Clear console outputs for cleaner test results
  jest.clearAllMocks();
};

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in tests, just log
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit process in tests, just log
});

// Suppress console outputs during tests (unless debugging)
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Setup test database with initial data
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Mock successful database operations
  global.testDb.query.mockResolvedValue([]);
  global.testDb.one.mockResolvedValue({});
  global.testDb.many.mockResolvedValue([]);
  global.testDb.none.mockResolvedValue(undefined);
  global.testDb.transaction.mockImplementation(async (callback) => {
    return await callback(global.testDb);
  });
  
  console.log('✅ Test environment ready');
});

// Cleanup after all tests
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Close any open handles
  await global.testCleanup();
  
  console.log('✅ Test environment cleaned up');
});

// Setup before each test
beforeEach(async () => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Reset performance timing
  mockPerformanceNow.mockReturnValue(Date.now());
});

// Cleanup after each test
afterEach(async () => {
  await global.testCleanup();
});

export {};

// Type declarations for global test utilities
declare global {
  var testDb: any;
  var testUtils: {
    createTestUser: (overrides?: any) => any;
    createTestOrganization: (overrides?: any) => any;
    createTestVoiceCommand: (overrides?: any) => any;
    createTestFile: (overrides?: any) => any;
    wait: (ms: number) => Promise<void>;
    waitForCondition: (condition: () => boolean | Promise<boolean>, timeout?: number) => Promise<boolean>;
    createMockSocketClient: () => any;
    measurePerformance: (fn: () => Promise<any>) => Promise<{ result: any; duration: number }>;
  };
  var testCleanup: () => Promise<void>;
}