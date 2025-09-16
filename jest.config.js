/**
 * Jest Configuration - Phase 2 Testing Setup
 * Comprehensive test configuration for Phase 2 implementation
 */

module.exports = {
  // Test environment
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directories
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts'
  ],
  
  // File extensions to process
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  
  // Module name mapping for path resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.ts'
  ],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'clover'
  ],
  
  // Coverage collection patterns
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/types/**/*',
    '!src/**/__tests__/**/*',
    '!src/**/__mocks__/**/*'
  ],
  
  // Coverage thresholds for Phase 2 requirements
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Critical components need higher coverage
    './src/services/ai/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/ai/execution/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/security/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/files/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Test timeout (important for integration tests)
  testTimeout: 30000,
  
  // Verbose output for better debugging
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test result processor for custom reporting
  testResultsProcessor: '<rootDir>/tests/utils/testResultsProcessor.ts',
  
  // Custom reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/test-results',
        filename: 'test-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'Phase 2 Test Results',
        logoImgPath: undefined,
        inlineSource: false
      }
    ]
  ],
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Global variables available in tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true,
      diagnostics: {
        ignoreCodes: [151001]
      }
    }
  },
  
  // Files to ignore during testing
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/coverage/',
    '<rootDir>/tests/fixtures/',
    '<rootDir>/tests/utils/',
    '<rootDir>/tests/setup/'
  ],
  
  // Module paths to ignore for transformation
  transformIgnorePatterns: [
    'node_modules/(?!(some-esm-module|another-esm-module)/)'
  ],
  
  // Watch mode configuration
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/test-results/',
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Snapshot testing
  snapshotSerializers: [],
  
  // Custom matchers and expect extensions
  setupFiles: [
    '<rootDir>/tests/setup/customMatchers.ts'
  ],
  
  // Maximum worker processes (optimize for CI/local)
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Cache configuration
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Projects configuration for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 60000 // Longer timeout for integration tests
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 120000, // 2 minutes for performance tests
      maxWorkers: 1 // Run performance tests sequentially
    }
  ],
  
  // Fail fast configuration
  bail: process.env.CI ? 1 : 0, // Stop after first failure in CI
  
  // Notify configuration (local development)
  notify: !process.env.CI,
  notifyMode: 'failure-change',
  
  // Silent mode for CI
  silent: !!process.env.CI,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles (useful for debugging)
  detectOpenHandles: !process.env.CI
};