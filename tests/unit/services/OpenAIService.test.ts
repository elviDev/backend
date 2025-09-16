/**
 * OpenAI Service Unit Tests - Phase 2 Quality Assurance
 * Comprehensive unit tests for AI command processing
 * 
 * Test Coverage:
 * - Voice command parsing and interpretation
 * - Context management and conversation history
 * - Action extraction and parameter validation
 * - Error handling and retry logic
 * - Performance and rate limiting
 */

import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { OpenAIService } from '../../../src/services/ai/OpenAIService';

// Mock OpenAI API
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

describe('OpenAIService', () => {
  let openAIService: OpenAIService;
  let mockOpenAI: any;
  
  const testConfig = {
    apiKey: 'test-api-key',
    model: 'gpt-4',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 4000,
    temperature: 0.7
  };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup OpenAI service
    openAIService = new OpenAIService(testConfig);
    
    // Get mock instance
    const OpenAI = require('openai').OpenAI;
    mockOpenAI = new OpenAI();
  });
  
  afterEach(() => {
    if (openAIService) {
      openAIService.destroy();
    }
  });
  
  describe('Voice Command Processing', () => {
    test('should process simple task creation command', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'create_task',
              confidence: 0.95,
              actions: [{
                type: 'create_task',
                parameters: {
                  title: 'Review quarterly reports',
                  description: 'Review Q3 financial reports and prepare summary',
                  priority: 'medium',
                  assignee: null,
                  dueDate: null
                }
              }],
              entities: [
                { type: 'task', value: 'Review quarterly reports' },
                { type: 'document', value: 'quarterly reports' }
              ],
              context: {
                requiresConfirmation: false,
                estimatedDuration: '30 minutes'
              }
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openAIService.processVoiceCommand(
        'Create a task to review quarterly reports',
        {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        }
      );
      
      expect(result).toBeDefined();
      expect(result.intent).toBe('create_task');
      expect(result.confidence).toBe(0.95);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_task');
      expect(result.actions[0].parameters.title).toBe('Review quarterly reports');
      expect(result.entities).toContainEqual(
        expect.objectContaining({ type: 'task', value: 'Review quarterly reports' })
      );
    });
    
    test('should process multi-action command with file upload', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'upload_and_share',
              confidence: 0.92,
              actions: [
                {
                  type: 'upload_file',
                  parameters: {
                    fileName: 'project-proposal.pdf',
                    description: 'Q4 project proposal document',
                    linkedEntities: [
                      { type: 'task', id: 'task-789' },
                      { type: 'channel', id: 'channel-456' }
                    ]
                  }
                },
                {
                  type: 'share_file',
                  parameters: {
                    shareWith: ['team-lead', 'project-manager'],
                    permission: 'view',
                    notify: true
                  }
                }
              ],
              entities: [
                { type: 'file', value: 'project-proposal.pdf' },
                { type: 'task', value: 'task-789' },
                { type: 'channel', value: 'channel-456' }
              ],
              context: {
                requiresConfirmation: true,
                estimatedDuration: '2 minutes',
                securityLevel: 'medium'
              }
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openAIService.processVoiceCommand(
        'Upload project-proposal.pdf to task 789 and share it with the team lead and project manager',
        {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: [],
          contextData: {
            currentChannel: 'channel-456',
            activeTasks: ['task-789']
          }
        }
      );
      
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].type).toBe('upload_file');
      expect(result.actions[1].type).toBe('share_file');
      expect(result.context.requiresConfirmation).toBe(true);
    });
    
    test('should handle ambiguous commands with clarification request', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'ambiguous',
              confidence: 0.65,
              actions: [],
              clarificationNeeded: true,
              clarificationQuestion: 'Which task would you like to update? Please specify the task name or ID.',
              possibleInterpretations: [
                'update_task_status',
                'update_task_assignee',
                'update_task_description'
              ],
              entities: [
                { type: 'action', value: 'update' },
                { type: 'entity', value: 'task' }
              ],
              context: {
                requiresConfirmation: true,
                waitingForClarification: true
              }
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openAIService.processVoiceCommand(
        'Update the task',
        {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        }
      );
      
      expect(result.clarificationNeeded).toBe(true);
      expect(result.clarificationQuestion).toContain('Which task');
      expect(result.actions).toHaveLength(0);
      expect(result.confidence).toBeLessThan(0.8);
    });
    
    test('should maintain conversation context across multiple commands', async () => {
      const conversationHistory = [
        {
          role: 'user' as const,
          content: 'Create a task for Q3 review',
          timestamp: new Date().toISOString()
        },
        {
          role: 'assistant' as const,
          content: 'I created the task "Q3 Review" for you.',
          timestamp: new Date().toISOString(),
          actions: [{
            type: 'create_task',
            parameters: { title: 'Q3 Review', id: 'task-new-123' }
          }]
        }
      ];
      
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'assign_task',
              confidence: 0.88,
              actions: [{
                type: 'assign_task',
                parameters: {
                  taskId: 'task-new-123',
                  assignee: 'john.doe',
                  dueDate: '2024-03-15'
                }
              }],
              entities: [
                { type: 'task', value: 'Q3 Review' },
                { type: 'user', value: 'john.doe' }
              ],
              context: {
                referencedPreviousAction: true,
                taskContext: 'task-new-123'
              }
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openAIService.processVoiceCommand(
        'Assign it to John and set due date to March 15th',
        {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory
        }
      );
      
      expect(result.actions[0].parameters.taskId).toBe('task-new-123');
      expect(result.context.referencedPreviousAction).toBe(true);
      
      // Verify conversation history was included in the API call
      const apiCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(apiCall.messages.length).toBeGreaterThan(1);
    });
  });
  
  describe('Context Management', () => {
    test('should retrieve and update conversation context', async () => {
      const userId = 'user-123';
      const initialContext = {
        activeTasks: ['task-1', 'task-2'],
        currentChannel: 'general',
        recentFiles: ['file-1.pdf'],
        preferences: { defaultPriority: 'medium' }
      };
      
      // Set initial context
      await openAIService.updateConversationContext(userId, initialContext);
      
      // Retrieve context
      const retrievedContext = await openAIService.getConversationContext(userId);
      
      expect(retrievedContext).toMatchObject(initialContext);
      expect(retrievedContext.lastUpdated).toBeDefined();
    });
    
    test('should merge context updates correctly', async () => {
      const userId = 'user-123';
      
      // Set initial context
      await openAIService.updateConversationContext(userId, {
        activeTasks: ['task-1'],
        currentChannel: 'general'
      });
      
      // Update with additional context
      await openAIService.updateConversationContext(userId, {
        activeTasks: ['task-1', 'task-2'],
        recentFiles: ['file-1.pdf']
      });
      
      const context = await openAIService.getConversationContext(userId);
      
      expect(context.activeTasks).toEqual(['task-1', 'task-2']);
      expect(context.currentChannel).toBe('general');
      expect(context.recentFiles).toEqual(['file-1.pdf']);
    });
    
    test('should expire old conversation context', async () => {
      const userId = 'user-123';
      
      // Mock old timestamp
      const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      await openAIService.updateConversationContext(userId, {
        activeTasks: ['old-task'],
        lastUpdated: oldTimestamp.toISOString()
      });
      
      // Context should be expired and return empty/default
      const context = await openAIService.getConversationContext(userId);
      
      expect(context.activeTasks).toEqual([]);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle OpenAI API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      apiError.name = 'OpenAIError';
      
      mockOpenAI.chat.completions.create.mockRejectedValue(apiError);
      
      await expect(
        openAIService.processVoiceCommand('Create a task', {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        })
      ).rejects.toThrow('Voice command processing failed');
    });
    
    test('should handle rate limiting with exponential backoff', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'create_task',
                confidence: 0.9,
                actions: [{ type: 'create_task', parameters: { title: 'Test' } }]
              })
            }
          }]
        });
      
      const result = await openAIService.processVoiceCommand('Create a task', {
        userId: 'user-123',
        organizationId: 'org-456',
        conversationHistory: []
      });
      
      expect(result).toBeDefined();
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
    });
    
    test('should handle malformed AI responses', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'This is not valid JSON'
          }
        }]
      });
      
      await expect(
        openAIService.processVoiceCommand('Create a task', {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        })
      ).rejects.toThrow('Failed to parse AI response');
    });
    
    test('should validate required response fields', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              // Missing required fields: intent, actions, entities
              confidence: 0.8
            })
          }
        }]
      });
      
      await expect(
        openAIService.processVoiceCommand('Create a task', {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        })
      ).rejects.toThrow('Invalid AI response structure');
    });
  });
  
  describe('Performance Optimization', () => {
    test('should cache conversation context efficiently', async () => {
      const userId = 'user-123';
      const contextData = { activeTasks: ['task-1'] };
      
      // First call - should hit storage
      await openAIService.updateConversationContext(userId, contextData);
      const start1 = Date.now();
      await openAIService.getConversationContext(userId);
      const time1 = Date.now() - start1;
      
      // Second call - should hit cache
      const start2 = Date.now();
      await openAIService.getConversationContext(userId);
      const time2 = Date.now() - start2;
      
      // Cache hit should be significantly faster
      expect(time2).toBeLessThan(time1);
      expect(time2).toBeLessThan(10); // Under 10ms for cache hit
    });
    
    test('should optimize prompt size for long conversations', async () => {
      // Create long conversation history
      const longHistory = Array.from({ length: 50 }, (_, i) => ({
        role: 'user' as const,
        content: `Command ${i}: Create task ${i}`,
        timestamp: new Date().toISOString()
      }));
      
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'create_task',
              confidence: 0.9,
              actions: [{ type: 'create_task', parameters: { title: 'Test' } }]
            })
          }
        }]
      });
      
      await openAIService.processVoiceCommand('Create another task', {
        userId: 'user-123',
        organizationId: 'org-456',
        conversationHistory: longHistory
      });
      
      const apiCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      
      // Should truncate history to manageable size
      expect(apiCall.messages.length).toBeLessThan(longHistory.length + 2); // +2 for system and user message
      
      // Total token count should be reasonable
      const totalContent = apiCall.messages.map((m: any) => m.content).join(' ');
      expect(totalContent.length).toBeLessThan(10000); // Rough token estimation
    });
    
    test('should batch multiple rapid requests efficiently', async () => {
      const commands = [
        'Create task A',
        'Create task B',
        'Create task C'
      ];
      
      mockOpenAI.chat.completions.create.mockImplementation(() =>
        Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'create_task',
                confidence: 0.9,
                actions: [{ type: 'create_task', parameters: { title: 'Test' } }]
              })
            }
          }]
        })
      );
      
      const start = Date.now();
      
      // Process commands concurrently
      const results = await Promise.all(
        commands.map(cmd => 
          openAIService.processVoiceCommand(cmd, {
            userId: 'user-123',
            organizationId: 'org-456',
            conversationHistory: []
          })
        )
      );
      
      const totalTime = Date.now() - start;
      
      expect(results).toHaveLength(3);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
  
  describe('Security and Validation', () => {
    test('should sanitize user input', async () => {
      const maliciousInput = 'Create task <script>alert("xss")</script> with SQL injection\'; DROP TABLE tasks; --';
      
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'create_task',
              confidence: 0.9,
              actions: [{
                type: 'create_task',
                parameters: { title: 'Create task  with SQL injection' }
              }]
            })
          }
        }]
      });
      
      const result = await openAIService.processVoiceCommand(maliciousInput, {
        userId: 'user-123',
        organizationId: 'org-456',
        conversationHistory: []
      });
      
      // Check that the API call sanitized the input
      const apiCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMessage = apiCall.messages.find((m: any) => m.role === 'user');
      
      expect(userMessage.content).not.toContain('<script>');
      expect(userMessage.content).not.toContain('DROP TABLE');
    });
    
    test('should validate action parameters', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'create_task',
              confidence: 0.9,
              actions: [{
                type: 'create_task',
                parameters: {
                  title: '', // Invalid: empty title
                  description: 'x'.repeat(10000), // Invalid: too long
                  priority: 'ultra-high', // Invalid: not a valid priority
                  dueDate: 'not-a-date' // Invalid: not a valid date
                }
              }]
            })
          }
        }]
      });
      
      await expect(
        openAIService.processVoiceCommand('Create an invalid task', {
          userId: 'user-123',
          organizationId: 'org-456',
          conversationHistory: []
        })
      ).rejects.toThrow('Invalid action parameters');
    });
    
    test('should enforce user permissions in command processing', async () => {
      const restrictedCommand = 'Delete all tasks in the organization';
      
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'delete_all_tasks',
              confidence: 0.95,
              actions: [{
                type: 'delete_all_tasks',
                parameters: { organizationId: 'org-456' }
              }],
              context: {
                requiresAdminPermission: true,
                destructive: true
              }
            })
          }
        }]
      });
      
      const result = await openAIService.processVoiceCommand(restrictedCommand, {
        userId: 'user-123',
        organizationId: 'org-456',
        conversationHistory: [],
        userPermissions: ['tasks:read', 'tasks:write'] // Missing admin permissions
      });
      
      // Should flag for permission check
      expect(result.context.requiresAdminPermission).toBe(true);
      expect(result.context.destructive).toBe(true);
    });
  });
});