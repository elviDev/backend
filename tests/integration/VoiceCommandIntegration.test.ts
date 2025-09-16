/**
 * Voice Command Integration Tests - Phase 2 Quality Assurance
 * Comprehensive integration tests for the complete voice command processing pipeline
 * 
 * Test Coverage:
 * - End-to-end voice command processing
 * - Multi-step command execution
 * - Real-time broadcasting
 * - File upload workflows
 * - Error handling and recovery
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import supertest from 'supertest';
import { Server } from 'http';
import { io as Client } from 'socket.io-client';
import fs from 'fs';
import path from 'path';

// Import services to be tested
import { WhisperService } from '../../src/services/ai/WhisperService';
import { OpenAIService } from '../../src/services/ai/OpenAIService';
import { MultiActionExecutor } from '../../src/ai/execution/MultiActionExecutor';
import { ExecutionEventManager } from '../../src/realtime/broadcasting/ExecutionEventManager';
import { ProgressBroadcaster } from '../../src/realtime/broadcasting/ProgressBroadcaster';
import { VoiceFileUploadService } from '../../src/files/upload/VoiceFileUploadService';
import { SecurityManager } from '../../src/security/SecurityManager';
import { PerformanceMonitor } from '../../src/performance/monitoring/PerformanceMonitor';

// Test utilities
interface TestContext {
  server: Server;
  request: supertest.SuperTest<supertest.Test>;
  socketClient: any;
  whisperService: WhisperService;
  openAIService: OpenAIService;
  multiActionExecutor: MultiActionExecutor;
  executionEventManager: ExecutionEventManager;
  progressBroadcaster: ProgressBroadcaster;
  fileUploadService: VoiceFileUploadService;
  securityManager: SecurityManager;
  performanceMonitor: PerformanceMonitor;
}

interface TestUser {
  id: string;
  organizationId: string;
  token: string;
  permissions: string[];
}

interface TestVoiceCommand {
  audioBuffer: Buffer;
  expectedTranscription: string;
  expectedActions: string[];
  expectedEntities: string[];
}

describe('Voice Command Integration Tests', () => {
  let context: TestContext;
  let testUser: TestUser;
  let testCommands: TestVoiceCommand[];
  
  // Test constants
  const TEST_TIMEOUT = 30000;
  const WEBSOCKET_URL = 'http://localhost:3001';
  const API_BASE_URL = '/api/v1';
  
  beforeAll(async () => {
    jest.setTimeout(TEST_TIMEOUT);
    
    // Initialize test context
    context = await initializeTestContext();
    
    // Setup test user
    testUser = await createTestUser();
    
    // Prepare test voice commands
    testCommands = await prepareTestVoiceCommands();
    
    console.log('✓ Integration test environment initialized');
  }, TEST_TIMEOUT);
  
  afterAll(async () => {
    await cleanupTestContext(context);
    console.log('✓ Integration test environment cleaned up');
  });
  
  beforeEach(async () => {
    // Reset metrics and clear any pending operations
    await context.performanceMonitor.recordCustomMetric('test_start', Date.now());
  });
  
  afterEach(async () => {
    // Cleanup any test data
    await cleanupTestData();
  });
  
  describe('Complete Voice Command Pipeline', () => {
    test('should process simple task creation command end-to-end', async () => {
      const startTime = Date.now();
      const command = testCommands.find(cmd => cmd.expectedActions.includes('create_task'));
      expect(command).toBeDefined();
      
      // Step 1: Audio transcription
      const transcriptionResult = await context.whisperService.transcribeAudio(
        command!.audioBuffer,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          language: 'en'
        }
      );
      
      expect(transcriptionResult).toBeDefined();
      expect(transcriptionResult.transcription).toContain('create task');
      expect(transcriptionResult.confidence).toBeGreaterThan(0.8);
      
      // Step 2: AI command processing
      const aiResult = await context.openAIService.processVoiceCommand(
        transcriptionResult.transcription,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          conversationHistory: []
        }
      );
      
      expect(aiResult).toBeDefined();
      expect(aiResult.actions).toContainEqual(
        expect.objectContaining({
          type: 'create_task',
          parameters: expect.objectContaining({
            title: expect.any(String),
            description: expect.any(String)
          })
        })
      );
      
      // Step 3: Security authorization
      const securityCheck = await context.securityManager.authorizeVoiceCommand(
        testUser.id,
        testUser.organizationId,
        'create_task',
        testUser.permissions,
        aiResult.actions[0].parameters
      );
      
      expect(securityCheck.approved).toBe(true);
      
      // Step 4: Multi-action execution with progress tracking
      const executionResult = await context.multiActionExecutor.executeActions(
        aiResult.actions,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          sessionId: 'test-session',
          commandId: securityCheck.commandId
        }
      );
      
      expect(executionResult).toBeDefined();
      expect(executionResult.success).toBe(true);
      expect(executionResult.results).toHaveLength(aiResult.actions.length);
      
      // Verify performance metrics
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(5000); // Under 5 seconds
      
      console.log(`✓ Task creation command processed in ${processingTime}ms`);
    });
    
    test('should handle multi-step file upload with entity linking', async () => {
      const startTime = Date.now();
      const command = testCommands.find(cmd => cmd.expectedActions.includes('upload_file'));
      expect(command).toBeDefined();
      
      // Create mock file data
      const mockFile = {
        fileName: 'test-document.pdf',
        fileSize: 1024 * 1024, // 1MB
        contentType: 'application/pdf',
        buffer: Buffer.from('mock pdf content'),
        entityLinks: [
          { type: 'task', id: 'task-123' },
          { type: 'channel', id: 'channel-456' }
        ]
      };
      
      // Step 1: Voice command transcription
      const transcriptionResult = await context.whisperService.transcribeAudio(
        command!.audioBuffer,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          language: 'en'
        }
      );
      
      expect(transcriptionResult.transcription).toContain('upload');
      
      // Step 2: AI processing with file context
      const aiResult = await context.openAIService.processVoiceCommand(
        transcriptionResult.transcription,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          conversationHistory: [],
          contextData: {
            availableFiles: [mockFile.fileName],
            currentChannel: 'channel-456',
            activeTasks: ['task-123']
          }
        }
      );
      
      expect(aiResult.actions).toContainEqual(
        expect.objectContaining({
          type: 'upload_file',
          parameters: expect.objectContaining({
            fileName: expect.stringContaining('test-document'),
            linkedEntities: expect.arrayContaining([
              expect.objectContaining({ type: 'task' })
            ])
          })
        })
      );
      
      // Step 3: File upload workflow
      const uploadResult = await context.fileUploadService.initiateVoiceUpload({
        fileName: mockFile.fileName,
        fileSize: mockFile.fileSize,
        contentType: mockFile.contentType,
        userId: testUser.id,
        organizationId: testUser.organizationId,
        linkedEntities: mockFile.entityLinks,
        description: 'Voice uploaded test document'
      });
      
      expect(uploadResult).toBeDefined();
      expect(uploadResult.uploadUrl).toBeDefined();
      expect(uploadResult.fileId).toBeDefined();
      expect(uploadResult.linkedEntities).toHaveLength(2);
      
      // Step 4: Verify real-time progress broadcasting
      const progressEvents: any[] = [];
      
      const socketPromise = new Promise((resolve) => {
        context.socketClient.on('progress_update', (data: any) => {
          progressEvents.push(data);
          if (data.status === 'completed') {
            resolve(data);
          }
        });
      });
      
      // Simulate file upload completion
      setTimeout(async () => {
        await context.progressBroadcaster.updateStepProgress(
          uploadResult.sessionId || 'test-session',
          'file_upload',
          100,
          'completed',
          { fileId: uploadResult.fileId }
        );
      }, 100);
      
      const finalProgress = await socketPromise;
      expect(finalProgress).toBeDefined();
      expect(progressEvents.length).toBeGreaterThan(0);
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(10000); // Under 10 seconds
      
      console.log(`✓ File upload workflow completed in ${processingTime}ms`);
    });
    
    test('should handle error scenarios gracefully', async () => {
      const command = testCommands.find(cmd => cmd.expectedActions.includes('delete_task'));
      expect(command).toBeDefined();
      
      // Step 1: Process command that will fail due to permissions
      const transcriptionResult = await context.whisperService.transcribeAudio(
        command!.audioBuffer,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          language: 'en'
        }
      );
      
      const aiResult = await context.openAIService.processVoiceCommand(
        transcriptionResult.transcription,
        {
          userId: testUser.id,
          organizationId: testUser.organizationId,
          conversationHistory: []
        }
      );
      
      // Step 2: Security check should fail (user doesn't have delete permissions)
      const securityCheck = await context.securityManager.authorizeVoiceCommand(
        testUser.id,
        testUser.organizationId,
        'delete_task',
        ['tasks:read', 'tasks:write'], // Missing 'tasks:delete'
        aiResult.actions[0].parameters
      );
      
      expect(securityCheck.approved).toBe(false);
      expect(securityCheck.reason).toBe('Insufficient permissions');
      
      // Step 3: Verify error is properly logged and broadcasted
      const errorEvents: any[] = [];
      
      context.socketClient.on('command_error', (data: any) => {
        errorEvents.push(data);
      });
      
      await context.executionEventManager.broadcastCommandError(
        securityCheck.commandId,
        testUser.id,
        testUser.organizationId,
        'Authorization failed: ' + securityCheck.reason,
        [testUser.id]
      );
      
      // Wait for error broadcast
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0]).toMatchObject({
        commandId: securityCheck.commandId,
        error: expect.stringContaining('Authorization failed')
      });
      
      console.log('✓ Error handling workflow completed successfully');
    });
  });
  
  describe('Real-time Broadcasting System', () => {
    test('should broadcast command execution events to affected users', async () => {
      const commandId = 'test-cmd-' + Date.now();
      const affectedUsers = [testUser.id, 'user-2', 'user-3'];
      
      const broadcastEvents: any[] = [];
      
      context.socketClient.on('command_start', (data: any) => {
        broadcastEvents.push({ type: 'start', data });
      });
      
      context.socketClient.on('command_complete', (data: any) => {
        broadcastEvents.push({ type: 'complete', data });
      });
      
      // Start command execution
      const startResult = await context.executionEventManager.broadcastCommandStart(
        commandId,
        testUser.id,
        testUser.organizationId,
        affectedUsers
      );
      
      expect(startResult.successful).toBeGreaterThan(0);
      
      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Complete command execution
      await context.executionEventManager.broadcastCommandComplete(
        commandId,
        testUser.id,
        testUser.organizationId,
        { success: true, resultCount: 1 },
        affectedUsers
      );
      
      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(broadcastEvents).toHaveLength(2);
      expect(broadcastEvents[0].type).toBe('start');
      expect(broadcastEvents[1].type).toBe('complete');
      
      console.log('✓ Real-time broadcasting system working correctly');
    });
    
    test('should track and broadcast step-by-step progress', async () => {
      const steps = [
        { id: 'step1', name: 'Parse command', estimatedDuration: 500 },
        { id: 'step2', name: 'Validate data', estimatedDuration: 300 },
        { id: 'step3', name: 'Execute action', estimatedDuration: 1000 },
        { id: 'step4', name: 'Send notifications', estimatedDuration: 200 }
      ];
      
      const progressUpdates: any[] = [];
      
      context.socketClient.on('progress_update', (data: any) => {
        progressUpdates.push(data);
      });
      
      // Initialize progress tracking
      const session = context.progressBroadcaster.initializeProgressTracking(
        'test-command-' + Date.now(),
        testUser.id,
        testUser.organizationId,
        steps,
        [testUser.id]
      );
      
      // Simulate step progression
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Start step
        await context.progressBroadcaster.updateStepProgress(
          session.sessionId,
          step.id,
          0,
          'running'
        );
        
        // Progress through step
        for (let progress = 25; progress <= 100; progress += 25) {
          await context.progressBroadcaster.updateStepProgress(
            session.sessionId,
            step.id,
            progress,
            progress === 100 ? 'completed' : 'running'
          );
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Wait for final broadcasts
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(progressUpdates.length).toBeGreaterThan(steps.length);
      
      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate.totalProgress).toBe(100);
      expect(finalUpdate.status).toBe('completed');
      
      console.log(`✓ Step-by-step progress tracking completed (${progressUpdates.length} updates)`);
    });
  });
  
  describe('Performance and Security Validation', () => {
    test('should maintain sub-100ms response times for cached operations', async () => {
      const iterations = 50;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        // Simulate cached operation (context retrieval)
        await context.openAIService.getConversationContext(testUser.id);
        
        const endTime = performance.now();
        responseTimes.push(endTime - startTime);
      }
      
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];
      
      expect(averageTime).toBeLessThan(100);
      expect(p95Time).toBeLessThan(150);
      
      console.log(`✓ Cache performance: avg=${averageTime.toFixed(2)}ms, p95=${p95Time.toFixed(2)}ms`);
    });
    
    test('should enforce rate limiting for voice commands', async () => {
      const rateLimitResults: any[] = [];
      
      // Attempt to exceed rate limit
      for (let i = 0; i < 25; i++) { // Assuming limit is 20 per minute
        const result = await context.securityManager.checkRateLimit(testUser.id, 'voice_command');
        rateLimitResults.push(result);
      }
      
      const allowedRequests = rateLimitResults.filter(r => r.allowed).length;
      const blockedRequests = rateLimitResults.filter(r => !r.allowed).length;
      
      expect(allowedRequests).toBeLessThan(25);
      expect(blockedRequests).toBeGreaterThan(0);
      
      // Verify rate limit information
      const lastBlocked = rateLimitResults.find(r => !r.allowed);
      expect(lastBlocked).toBeDefined();
      expect(lastBlocked.retryAfter).toBeGreaterThan(0);
      
      console.log(`✓ Rate limiting: ${allowedRequests} allowed, ${blockedRequests} blocked`);
    });
    
    test('should validate and sanitize input data', async () => {
      const testInputs = [
        {
          input: { title: '<script>alert("xss")</script>Task Title', description: 'Normal description' },
          schema: { 
            title: { required: true, type: 'string', maxLength: 100 },
            description: { required: true, type: 'string', maxLength: 500 }
          }
        },
        {
          input: { title: '', description: 'Description without title' },
          schema: { 
            title: { required: true, type: 'string', minLength: 1 },
            description: { required: true, type: 'string' }
          }
        }
      ];
      
      for (const testCase of testInputs) {
        const result = context.securityManager.validateAndSanitizeInput(
          testCase.input,
          testCase.schema
        );
        
        if (testCase.input.title === '') {
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('title is required');
        } else {
          expect(result.valid).toBe(true);
          expect(result.sanitized?.title).not.toContain('<script>');
        }
      }
      
      console.log('✓ Input validation and sanitization working correctly');
    });
  });
  
  describe('System Health and Monitoring', () => {
    test('should collect comprehensive performance metrics', async () => {
      // Record various performance metrics
      context.performanceMonitor.recordCustomMetric('voice_command_processing', 150);
      context.performanceMonitor.recordCustomMetric('database_query', 45);
      context.performanceMonitor.recordCustomMetric('cache_operation', 12);
      context.performanceMonitor.recordError('voice', { error: 'Test error' });
      
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const summary = context.performanceMonitor.getPerformanceSummary();
      
      expect(summary).toBeDefined();
      expect(summary.currentMetrics).toBeDefined();
      expect(summary.uptime).toBeGreaterThan(0);
      
      console.log('✓ Performance metrics collection working');
    });
    
    test('should detect and alert on performance issues', async () => {
      const alerts: any[] = [];
      
      context.performanceMonitor.on('performance_alert', (alert) => {
        alerts.push(alert);
      });
      
      // Simulate high response time
      for (let i = 0; i < 10; i++) {
        context.performanceMonitor.recordCustomMetric('voice_command_processing', 2500); // Over threshold
      }
      
      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toMatchObject({
        type: 'response_time',
        severity: expect.stringMatching(/(medium|high|critical)/),
        currentValue: expect.any(Number),
        threshold: expect.any(Number)
      });
      
      console.log(`✓ Performance alerting: ${alerts.length} alerts generated`);
    });
  });
});

// Helper functions

async function initializeTestContext(): Promise<TestContext> {
  // Initialize all services with test configuration
  const whisperService = new WhisperService({
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    model: 'whisper-1',
    baseUrl: 'https://api.openai.com/v1'
  });
  
  const openAIService = new OpenAIService({
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    model: 'gpt-4',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 4000,
    temperature: 0.7
  });
  
  const securityManager = new SecurityManager({
    jwtSecret: 'test-jwt-secret',
    jwtExpiresIn: '1h',
    bcryptSaltRounds: 10,
    rateLimiting: {
      windowMs: 60000,
      maxRequests: 20,
      skipSuccessfulRequests: false
    },
    encryption: {
      algorithm: 'aes-256-cbc',
      keyLength: 32
    },
    auditLogging: {
      enabled: true,
      logLevel: 'all'
    }
  });
  
  const performanceMonitor = new PerformanceMonitor({
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    responseTime: { warning: 1000, critical: 2000 },
    errorRate: { warning: 5, critical: 10 },
    diskUsage: { warning: 80, critical: 95 }
  });
  
  // Mock other services for testing
  const mockSocketManager = {
    isUserConnected: jest.fn().mockReturnValue(true),
    emitToUser: jest.fn().mockResolvedValue(undefined),
    emitToOrganization: jest.fn().mockResolvedValue(undefined)
  };
  
  const executionEventManager = new ExecutionEventManager(mockSocketManager as any);
  const progressBroadcaster = new ProgressBroadcaster(mockSocketManager as any);
  
  const fileUploadService = new VoiceFileUploadService(
    {} as any, // S3FileManager
    {} as any, // FileMetadataManager
    {} as any  // FileCommandParser
  );
  
  const multiActionExecutor = new MultiActionExecutor(
    {} as any, // TaskService
    {} as any, // ChannelService
    {} as any, // MessageService
    fileUploadService
  );
  
  // Setup WebSocket client
  const socketClient = Client(WEBSOCKET_URL, {
    auth: {
      token: 'test-token'
    }
  });
  
  return {
    server: {} as Server, // Would be initialized in real test setup
    request: supertest({} as any), // Would be initialized with actual app
    socketClient,
    whisperService,
    openAIService,
    multiActionExecutor,
    executionEventManager,
    progressBroadcaster,
    fileUploadService,
    securityManager,
    performanceMonitor
  };
}

async function createTestUser(): Promise<TestUser> {
  return {
    id: 'test-user-' + Date.now(),
    organizationId: 'test-org-' + Date.now(),
    token: 'test-jwt-token',
    permissions: [
      'tasks:read',
      'tasks:write',
      'channels:read',
      'channels:write',
      'files:read',
      'files:write',
      'messages:read',
      'messages:write'
    ]
  };
}

async function prepareTestVoiceCommands(): Promise<TestVoiceCommand[]> {
  // In a real implementation, these would be actual audio files
  // For testing, we'll use mock audio buffers
  return [
    {
      audioBuffer: Buffer.from('mock-audio-create-task'),
      expectedTranscription: 'Create a new task called "Review quarterly reports" in the marketing channel',
      expectedActions: ['create_task'],
      expectedEntities: ['task', 'channel']
    },
    {
      audioBuffer: Buffer.from('mock-audio-upload-file'),
      expectedTranscription: 'Upload the document quarterly-report.pdf to task 123 and share it with the team',
      expectedActions: ['upload_file', 'share_file'],
      expectedEntities: ['file', 'task', 'user']
    },
    {
      audioBuffer: Buffer.from('mock-audio-delete-task'),
      expectedTranscription: 'Delete the task with ID 456',
      expectedActions: ['delete_task'],
      expectedEntities: ['task']
    }
  ];
}

async function cleanupTestContext(context: TestContext): Promise<void> {
  // Cleanup all services
  if (context.socketClient) {
    context.socketClient.disconnect();
  }
  
  if (context.performanceMonitor) {
    context.performanceMonitor.destroy();
  }
  
  if (context.securityManager) {
    context.securityManager.destroy();
  }
  
  if (context.executionEventManager) {
    context.executionEventManager.destroy();
  }
  
  if (context.progressBroadcaster) {
    context.progressBroadcaster.destroy();
  }
}

async function cleanupTestData(): Promise<void> {
  // Clean up any test data created during tests
  // This would include database cleanup, file cleanup, etc.
}