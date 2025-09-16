/**
 * AI Command Parser - Phase 2 Voice Processing
 * GPT-4 Turbo integration for intelligent command parsing
 * 
 * Success Criteria:
 * - Parses single and multi-action commands with >95% accuracy
 * - Extracts entities (users, channels, dates, etc.) correctly
 * - Confidence scoring for each parsed element
 * - Processing time <1 second per command
 */

import OpenAI from 'openai';
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
import { 
  ParsedCommand, 
  UserContext, 
  ContextData, 
  CommandAction, 
  ResolvedEntities,
  AIProcessingError,
  ActionType 
} from '../../voice/types';
import { ContextManager } from '../context/ContextManager';

export interface ParseCommandOptions {
  maxRetries?: number;
  timeout?: number;
  temperature?: number;
  enhanceWithContext?: boolean;
}

export class AICommandParser {
  private openai: OpenAI;
  private contextManager: ContextManager;
  private promptCache: Map<string, { prompt: string; timestamp: number }> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private requestCount = 0;
  
  // System prompt template cache
  private systemPromptTemplate: string | null = null;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000, // 15 second timeout
      maxRetries: 2
    });
    
    this.contextManager = new ContextManager();
    
    logger.info('AI Command Parser initialized', {
      model: 'gpt-4-turbo',
      timeout: 15000,
      maxRetries: 2
    });
  }
  
  /**
   * Parse voice command using GPT-4
   * Target: <1 second processing time
   */
  async parseVoiceCommand(
    transcript: string,
    userContext: UserContext,
    options: ParseCommandOptions = {}
  ): Promise<ParsedCommand> {
    const startTime = performance.now();
    const requestId = `parse-${++this.requestCount}-${Date.now()}`;
    
    try {
      // Validate input
      this.validateInput(transcript, userContext);
      
      // Build comprehensive context
      const context = await this.contextManager.buildContext(userContext);
      
      // Generate system and user prompts
      const systemPrompt = await this.buildSystemPrompt(context);
      const userPrompt = this.buildUserPrompt(transcript, context);
      
      // Make GPT-4 request with retry logic
      const response = await this.makeGPTRequest(
        systemPrompt, 
        userPrompt, 
        options,
        requestId
      );
      
      const processingTime = performance.now() - startTime;
      
      // Parse and validate response
      const parsed = await this.parseAndValidateResponse(
        response,
        transcript,
        context,
        requestId
      );
      
      // Record performance metrics
      this.recordMetric('parsing_time', processingTime);
      this.recordMetric('parsing_success', 1);
      
      // Log success
      logger.info('Command parsing successful', {
        requestId,
        processingTime: `${processingTime.toFixed(2)}ms`,
        transcript: transcript.substring(0, 100) + '...',
        intent: parsed.intent,
        actionCount: parsed.actions.length,
        confidence: parsed.confidence
      });
      
      return {
        ...parsed,
        id: requestId,
        userId: userContext.userId,
        transcript,
        processingTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const processingTime = performance.now() - startTime;
      
      this.recordMetric('parsing_time', processingTime);
      this.recordMetric('parsing_error', 1);
      
      logger.error('Command parsing failed', {
        requestId,
        error: (error as any).message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        transcript: transcript.substring(0, 100) + '...',
        userId: userContext.userId
      });
      
      throw new AIProcessingError('Command parsing failed', {
        requestId,
        transcript,
        userId: userContext.userId,
        processingTime,
        originalError: (error as any).message
      });
    }
  }
  
  /**
   * Batch parse multiple commands for efficiency
   */
  async parseMultipleCommands(
    commands: Array<{ transcript: string; userContext: UserContext }>,
    options: ParseCommandOptions = {}
  ): Promise<ParsedCommand[]> {
    const startTime = performance.now();
    const batchId = `batch-${Date.now()}`;
    
    logger.info('Starting batch command parsing', {
      batchId,
      commandCount: commands.length
    });
    
    try {
      // Process commands in parallel (max 3 concurrent to avoid rate limiting)
      const concurrencyLimit = 3;
      const results: ParsedCommand[] = [];
      
      for (let i = 0; i < commands.length; i += concurrencyLimit) {
        const batch = commands.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(({ transcript, userContext }) => 
          this.parseVoiceCommand(transcript, userContext, options)
            .catch((error: any) => ({
              id: `error-${Date.now()}`,
              userId: userContext.userId,
              transcript,
              originalTranscript: transcript,
              intent: 'PARSE_ERROR',
              confidence: 0,
              actions: [],
              entities: { users: [], channels: [], tasks: [], dates: [], files: [] },
              processingTime: 0,
              timestamp: new Date().toISOString()
            } as ParsedCommand))
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches
        if (i + concurrencyLimit < commands.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      const totalTime = performance.now() - startTime;
      const successfulResults = results.filter(r => !('error' in r));
      
      logger.info('Batch command parsing completed', {
        batchId,
        totalTime: `${totalTime.toFixed(2)}ms`,
        totalCommands: commands.length,
        successfulParses: successfulResults.length,
        failedParses: results.length - successfulResults.length
      });
      
      return results;
      
    } catch (error) {
      const totalTime = performance.now() - startTime;
      
      logger.error('Batch command parsing failed', {
        batchId,
        error: (error as any).message,
        totalTime: `${totalTime.toFixed(2)}ms`,
        commandCount: commands.length
      });
      
      throw new AIProcessingError('Batch command parsing failed', {
        batchId,
        totalTime,
        commandCount: commands.length,
        originalError: (error as any).message
      });
    }
  }
  
  /**
   * Get parsing performance statistics
   */
  getPerformanceStats(): Record<string, { average: number; p95: number; p99: number; count: number }> {
    const stats: Record<string, { average: number; p95: number; p99: number; count: number }> = {};
    
    for (const [metric, values] of this.performanceMetrics.entries()) {
      if (values.length === 0) continue;
      
      const sorted = [...values].sort((a, b) => a - b);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      
      stats[metric] = {
        average: Math.round(average * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        p99: Math.round(p99 * 100) / 100,
        count: values.length
      };
    }
    
    return stats;
  }
  
  /**
   * Clear performance metrics
   */
  clearMetrics(): void {
    this.performanceMetrics.clear();
    logger.debug('Performance metrics cleared');
  }
  
  private validateInput(transcript: string, userContext: UserContext): void {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript cannot be empty');
    }
    
    if (transcript.length > 5000) {
      throw new Error('Transcript too long (>5000 characters)');
    }
    
    if (!userContext.userId || !userContext.organizationId) {
      throw new Error('User context must include userId and organizationId');
    }
  }
  
  private async buildSystemPrompt(context: ContextData): Promise<string> {
    // Check cache first (cache for 5 minutes)
    const cacheKey = `system_prompt_${context.user.id}_${context.organization.id}`;
    const cached = this.promptCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.prompt;
    }
    
    // Build system prompt with current context
    const systemPrompt = `You are an advanced AI assistant for "${context.organization.name}", a CEO communication platform.

CURRENT CONTEXT:
- User: ${context.user.name} (${context.user.role})
- Active Channels: ${context.activeChannels.map(c => `"${c.name}"`).join(', ')}
- Recent Tasks: ${context.recentTasks.slice(0, 5).map(t => `"${t.title}"`).join(', ')}
- Team Members: ${context.teamMembers.map(u => `${u.name} (${u.role})`).join(', ')}
- Current Time: ${context.temporal.currentTime}

AVAILABLE ACTIONS:
1. CREATE_CHANNEL - Create new communication channels
   Parameters: name (required), description, category_id, channel_type, privacy_level
   
2. CREATE_TASK - Create tasks with assignments and deadlines  
   Parameters: title (required), description, channel_id, assigned_to[], priority, due_date
   
3. ASSIGN_USERS - Assign users to tasks or channels
   Parameters: entity_type, entity_id, user_ids[], role
   
4. SEND_MESSAGE - Send messages to channels or users
   Parameters: target_type, target_id, content, message_type
   
5. UPLOAD_FILE - Upload and share files
   Parameters: file_name, description, target_channels[], target_tasks[]
   
6. SET_DEADLINE - Set or update task deadlines
   Parameters: task_id, due_date, priority
   
7. CREATE_DEPENDENCY - Create task dependencies
   Parameters: task_id, depends_on_task_id, dependency_type
   
8. UPDATE_STATUS - Update task or channel status
   Parameters: entity_type, entity_id, status, notes
   
9. SCHEDULE_MEETING - Schedule meetings and events
   Parameters: title, date_time, duration, attendees[], location
   
10. GENERATE_REPORT - Generate reports and summaries
    Parameters: report_type, filters, output_format

ENTITY RESOLUTION RULES:
- Use context to resolve ambiguous references
- "marketing team" → users with marketing role or marketing channel members
- "this project" → most recently mentioned channel or task
- "next Friday" → calculate actual date based on current time
- User names: Match against team members, use fuzzy matching if needed

OUTPUT FORMAT (JSON):
{
  "intent": "Primary intention of the command",
  "confidence": 0.95,
  "actions": [
    {
      "type": "ACTION_TYPE",
      "parameters": {
        "param1": "value1",
        "param2": "value2"
      },
      "priority": 1,
      "dependencies": [],
      "estimated_duration": "2 seconds"
    }
  ],
  "entities": {
    "users": [{"name": "John Smith", "resolved_id": "user-123", "confidence": 0.95}],
    "channels": [{"name": "Marketing Q1", "resolved_id": "channel-456", "confidence": 1.0}],
    "tasks": [{"title": "Campaign Launch", "resolved_id": "task-789", "confidence": 0.9}],
    "dates": [{"text": "next Friday", "resolved_date": "2024-01-19T17:00:00Z", "confidence": 0.9}]
  },
  "context_references": {
    "pronouns": ["this", "that"],
    "temporal_context": ["next week", "by Friday"],
    "implicit_entities": ["the team", "the project"]
  }
}

IMPORTANT RULES:
1. Always resolve entity references using provided context
2. Be conservative with confidence scores - use lower scores for ambiguous references
3. Create logical action sequences for complex commands
4. Validate that all required parameters are present or can be inferred
5. Use dependency relationships to ensure proper execution order`;

    // Cache the prompt
    this.promptCache.set(cacheKey, { 
      prompt: systemPrompt, 
      timestamp: Date.now() 
    });
    
    // Clean old cache entries
    this.cleanPromptCache();
    
    return systemPrompt;
  }
  
  private buildUserPrompt(transcript: string, context: ContextData): string {
    return `Please parse this voice command: "${transcript}"

Consider the current context and resolve all entity references. If any information is ambiguous, use the most likely interpretation based on the context and indicate lower confidence scores.

Respond with a valid JSON object following the specified format.`;
  }
  
  private async makeGPTRequest(
    systemPrompt: string,
    userPrompt: string,
    options: ParseCommandOptions,
    requestId: string
  ): Promise<string> {
    const maxRetries = options.maxRetries || 2;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: options.temperature || 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        });
        
        if (!response.choices[0]?.message?.content) {
          throw new Error('Empty response from GPT-4');
        }
        
        return response.choices[0].message.content;
        
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('GPT-4 request failed', {
          requestId,
          attempt,
          maxRetries,
          error: (error as any).message
        });
        
        // Don't retry on certain types of errors
        if ((error as any).message.includes('rate limit') && attempt < maxRetries) {
          // Wait before retrying rate limit errors
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else if ((error as any).message.includes('timeout') && attempt < maxRetries) {
          // Wait before retrying timeout errors
          await new Promise(resolve => setTimeout(resolve, 500));
        } else if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('All GPT-4 request attempts failed');
  }
  
  private async parseAndValidateResponse(
    responseContent: string,
    originalTranscript: string,
    context: ContextData,
    requestId: string
  ): Promise<Omit<ParsedCommand, 'id' | 'userId' | 'transcript' | 'processingTime' | 'timestamp'>> {
    try {
      const parsed = JSON.parse(responseContent);
      
      // Validate required fields
      this.validateParsedResponse(parsed);
      
      // Enhanced validation and processing
      const processedActions = await this.processActions(parsed.actions, context);
      const validatedEntities = await this.validateEntities(parsed.entities, context);
      
      return {
        intent: parsed.intent,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        actions: processedActions,
        entities: validatedEntities,
        contextReferences: parsed.context_references || {},
        originalTranscript
      };
      
    } catch (error: any) {
      logger.error('Response parsing failed', {
        requestId,
        error: error.message,
        responseContent: responseContent.substring(0, 500) + '...'
      });
      
      throw new AIProcessingError('Invalid response format from GPT-4', {
        responseContent: responseContent.substring(0, 500),
        originalTranscript,
        parseError: error.message,
        requestId
      });
    }
  }
  
  private validateParsedResponse(parsed: any): void {
    const requiredFields = ['intent', 'confidence', 'actions'];
    
    for (const field of requiredFields) {
      if (parsed[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
      throw new Error('Actions array is required and must not be empty');
    }
    
    // Validate each action
    parsed.actions.forEach((action: any, index: number) => {
      if (!action.type || !action.parameters) {
        throw new Error(`Invalid action at index ${index}: missing type or parameters`);
      }
      
      // Validate action type
      const validActionTypes: ActionType[] = [
        'CREATE_CHANNEL', 'CREATE_TASK', 'ASSIGN_USERS', 'SEND_MESSAGE', 
        'UPLOAD_FILE', 'SET_DEADLINE', 'CREATE_DEPENDENCY', 'UPDATE_STATUS',
        'SCHEDULE_MEETING', 'GENERATE_REPORT'
      ];
      
      if (!validActionTypes.includes(action.type)) {
        throw new Error(`Invalid action type: ${action.type}`);
      }
    });
  }
  
  private async processActions(actions: any[], context: ContextData): Promise<CommandAction[]> {
    return actions.map((action: any, index: number) => ({
      id: `action-${index + 1}-${Date.now()}`,
      type: action.type,
      parameters: action.parameters,
      priority: action.priority || index + 1,
      dependencies: action.dependencies || [],
      estimatedDuration: action.estimated_duration || '2 seconds',
      critical: this.isActionCritical(action.type),
      order: index + 1,
      validated: true
    }));
  }
  
  private async validateEntities(entities: any, context: ContextData): Promise<ResolvedEntities> {
    // Use context manager to validate and enhance entities
    return this.contextManager.entityResolver.validateAndEnhanceEntities(entities, context);
  }
  
  private isActionCritical(actionType: ActionType): boolean {
    // Mark certain action types as critical (failure should rollback transaction)
    const criticalActions: ActionType[] = [
      'CREATE_CHANNEL', 'CREATE_TASK', 'ASSIGN_USERS', 'CREATE_DEPENDENCY'
    ];
    
    return criticalActions.includes(actionType);
  }
  
  private recordMetric(key: string, value: number): void {
    if (!this.performanceMetrics.has(key)) {
      this.performanceMetrics.set(key, []);
    }
    
    const metrics = this.performanceMetrics.get(key)!;
    metrics.push(value);
    
    // Keep only last 1000 measurements
    if (metrics.length > 1000) {
      metrics.shift();
    }
  }
  
  private cleanPromptCache(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    for (const [key, value] of this.promptCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.promptCache.delete(key);
      }
    }
  }
}