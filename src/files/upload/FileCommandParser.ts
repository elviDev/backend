/**
 * File Command Parser - Phase 2 Voice File Operations
 * Parses file-related voice commands and extracts parameters
 *
 * Success Criteria:
 * - Supports upload, share, organize, delete operations
 * - Extracts file names, descriptions, target entities
 * - Handles file type inference
 * - Context-aware target resolution
 */

import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
import { ContextData, UserContext } from '../../voice/types';

export interface ParsedFileCommand {
  id: string;
  operation: FileOperation;
  fileName?: string | undefined;
  description?: string | undefined;
  targetChannels: ResolvedEntity[];
  targetTasks: ResolvedEntity[];
  targetUsers: ResolvedEntity[];
  fileType?: string | undefined;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
  processingTime: number;
  confidence: number;
}

export enum FileOperation {
  UPLOAD = 'upload',
  SHARE = 'share',
  ORGANIZE = 'organize',
  DELETE = 'delete',
  SEARCH = 'search',
  DOWNLOAD = 'download',
}

export interface ResolvedEntity {
  id: string;
  name: string;
  type: string;
  confidence: number;
}

export interface FileParameters {
  fileName?: string | undefined;
  description?: string | undefined;
  targetEntities: string[];
  fileType?: string | undefined;
  operation: FileOperation;
  tags: string[];
  priority: string;
}

export class FileCommandParser {
  private performanceMetrics: number[] = [];

  constructor() {
    logger.info('File Command Parser initialized');
  }

  /**
   * Parse file-related voice command
   * Target: <500ms parsing time
   */
  async parseFileCommand(
    transcript: string,
    context: ContextData,
    userContext: UserContext
  ): Promise<ParsedFileCommand> {
    const startTime = performance.now();
    const commandId = `file_cmd_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      logger.debug('Parsing file command', {
        commandId,
        transcript: transcript.substring(0, 100),
        userId: userContext.userId,
      });

      // Step 1: Identify file operation
      const operation = this.identifyFileOperation(transcript);

      // Step 2: Extract file parameters
      const parameters = this.extractFileParameters(transcript);

      // Step 3: Resolve target entities with context
      const resolvedTargets = await this.resolveFileTargets(parameters.targetEntities, context);

      // Step 4: Infer file type if not explicitly mentioned
      const inferredFileType = this.inferFileType(transcript, parameters.fileName);

      // Step 5: Extract tags and metadata
      const tags = this.extractTags(transcript);
      const priority = this.determinePriority(transcript);

      // Step 6: Calculate confidence score
      const confidence = this.calculateConfidence(transcript, operation, resolvedTargets);

      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);

      const parsedCommand: ParsedFileCommand = {
        id: commandId,
        operation,
        fileName: parameters.fileName,
        description: parameters.description,
        targetChannels: resolvedTargets.channels,
        targetTasks: resolvedTargets.tasks,
        targetUsers: resolvedTargets.users,
        fileType: inferredFileType || parameters.fileType,
        tags,
        priority: priority as any,
        processingTime,
        confidence,
      };

      logger.info('File command parsed successfully', {
        commandId,
        operation,
        fileName: parameters.fileName,
        targetChannels: resolvedTargets.channels.length,
        targetTasks: resolvedTargets.tasks.length,
        targetUsers: resolvedTargets.users.length,
        confidence,
        processingTime: `${processingTime.toFixed(2)}ms`,
      });

      return parsedCommand;
    } catch (error: any) {
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);

      logger.error('File command parsing failed', {
        commandId,
        error: error.message,
        transcript: transcript.substring(0, 100),
        processingTime: `${processingTime.toFixed(2)}ms`,
      });

      // Return default command with low confidence
      return {
        id: commandId,
        operation: FileOperation.UPLOAD,
        targetChannels: [],
        targetTasks: [],
        targetUsers: [],
        tags: [],
        priority: 'medium',
        processingTime,
        confidence: 0.1,
      };
    }
  }

  /**
   * Extract file parameters from transcript
   */
  extractFileParameters(transcript: string): FileParameters {
    const lowerTranscript = transcript.toLowerCase();

    // Extract file name patterns
    const fileNamePatterns = [
      /(?:file|document|report|presentation)\s+(?:called|named|titled)\s+"([^"]+)"/i,
      /(?:file|document|report|presentation)\s+"([^"]+)"/i,
      /(?:upload|share|send)\s+(?:the\s+)?([a-zA-Z0-9\s\.-]+\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|png|mp4|zip))/i,
      /"([^"]+\.[a-zA-Z0-9]+)"/i,
    ];

    let fileName: string | undefined;
    for (const pattern of fileNamePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        if (match[1] !== undefined) {
          fileName = match[1].trim();
          break;
        }
      }
    }

    // Extract description patterns
    const descriptionPatterns = [
      /description\s+"([^"]+)"/i,
      /(?:about|regarding|for)\s+"([^"]+)"/i,
      /(?:with\s+)?(?:description|notes?)\s+([^,.!?]+)/i,
    ];

    let description: string | undefined;
    for (const pattern of descriptionPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        if (match[1] !== undefined) {
          description = match[1].trim();
          break;
        }
      }
    }

    // Extract target entities (channels, tasks, users)
    const targetEntities = this.extractTargetEntities(transcript);

    // Determine file type from context
    const fileType = this.extractFileType(transcript);

    // Determine operation
    const operation = this.identifyFileOperation(transcript);

    // Extract tags
    const tags = this.extractTags(transcript);

    // Determine priority
    const priority = this.determinePriority(transcript);

    return {
      fileName,
      description,
      targetEntities,
      fileType,
      operation,
      tags,
      priority,
    };
  }

  /**
   * Resolve file targets with context awareness
   */
  async resolveFileTargets(
    targetEntities: string[],
    context: ContextData
  ): Promise<{
    channels: ResolvedEntity[];
    tasks: ResolvedEntity[];
    users: ResolvedEntity[];
  }> {
    const resolved = {
      channels: [] as ResolvedEntity[],
      tasks: [] as ResolvedEntity[],
      users: [] as ResolvedEntity[],
    };

    for (const entityName of targetEntities) {
      const lowerName = entityName.toLowerCase();

      // Try to resolve as channel
      const channel = this.findBestChannelMatch(lowerName, context.activeChannels);
      if (channel) {
        resolved.channels.push({
          id: channel.id,
          name: channel.name,
          type: 'channel',
          confidence: this.calculateMatchConfidence(lowerName, channel.name),
        });
        continue;
      }

      // Try to resolve as task
      const task = this.findBestTaskMatch(lowerName, context.recentTasks);
      if (task) {
        resolved.tasks.push({
          id: task.id,
          name: task.title,
          type: 'task',
          confidence: this.calculateMatchConfidence(lowerName, task.title),
        });
        continue;
      }

      // Try to resolve as user
      const user = this.findBestUserMatch(lowerName, context.teamMembers);
      if (user) {
        resolved.users.push({
          id: user.id,
          name: user.name,
          type: 'user',
          confidence: this.calculateMatchConfidence(lowerName, user.name),
        });
      }
    }

    return resolved;
  }

  /**
   * Identify the primary file operation from transcript
   */
  private identifyFileOperation(transcript: string): FileOperation {
    const lowerTranscript = transcript.toLowerCase();

    // Upload patterns
    if (/\b(?:upload|send|attach|add|share)\b/i.test(lowerTranscript)) {
      return FileOperation.UPLOAD;
    }

    // Share patterns
    if (/\b(?:share|distribute|send to|forward)\b/i.test(lowerTranscript)) {
      return FileOperation.SHARE;
    }

    // Organize patterns
    if (/\b(?:organize|sort|categorize|group|move)\b/i.test(lowerTranscript)) {
      return FileOperation.ORGANIZE;
    }

    // Delete patterns
    if (/\b(?:delete|remove|trash|discard)\b/i.test(lowerTranscript)) {
      return FileOperation.DELETE;
    }

    // Search patterns
    if (/\b(?:find|search|look for|locate)\b/i.test(lowerTranscript)) {
      return FileOperation.SEARCH;
    }

    // Download patterns
    if (/\b(?:download|get|retrieve|access)\b/i.test(lowerTranscript)) {
      return FileOperation.DOWNLOAD;
    }

    // Default to upload if unclear
    return FileOperation.UPLOAD;
  }

  /**
   * Extract target entities (channels, tasks, users) from transcript
   */
  private extractTargetEntities(transcript: string): string[] {
    const entities: string[] = [];

    // Channel patterns
    const channelPatterns = [
      /(?:to|in|on)\s+(?:the\s+)?([a-zA-Z0-9\s]+)\s+channel/gi,
      /(?:channel\s+)([a-zA-Z0-9\s]+)/gi,
      /(?:to|with)\s+([a-zA-Z0-9\s]+)\s+(?:team|group)/gi,
    ];

    channelPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        if (match[1] !== undefined) {
          entities.push(match[1].trim());
        }
      }
    });

    // Task patterns
    const taskPatterns = [
      /(?:for|to)\s+(?:the\s+)?([a-zA-Z0-9\s]+)\s+(?:task|project)/gi,
      /(?:task\s+)([a-zA-Z0-9\s]+)/gi,
    ];

    taskPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        entities.push(match[1]!.trim());
      }
    });

    // User patterns
    const userPatterns = [
      /(?:to|with|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/gi,
      /(?:send|share)\s+(?:to|with)\s+([A-Z][a-zA-Z]+)/gi,
    ];

    userPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        if (match[1] !== undefined) {
          const name = match[1].trim();
          if (name.length > 2 && !['the', 'and', 'for', 'to'].includes(name.toLowerCase())) {
            entities.push(name);
          }
        }
      }
    });

    return [...new Set(entities)]; // Remove duplicates
  }

  /**
   * Extract file type from transcript
   */
  private extractFileType(transcript: string): string | undefined {
    const typePatterns = [
      /\b(pdf|document|doc|docx)\b/i,
      /\b(spreadsheet|excel|xls|xlsx)\b/i,
      /\b(presentation|powerpoint|ppt|pptx)\b/i,
      /\b(image|photo|picture|jpg|jpeg|png)\b/i,
      /\b(video|movie|mp4|mov|avi)\b/i,
      /\b(audio|sound|music|mp3|wav)\b/i,
      /\b(zip|archive|compressed)\b/i,
    ];

    for (const pattern of typePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        return match[1] ? match[1].toLowerCase() : undefined;
      }
    }

    return undefined;
  }

  /**
   * Infer file type from context and file name
   */
  private inferFileType(transcript: string, fileName?: string): string | undefined {
    if (fileName) {
      const extension = fileName.split('.').pop()?.toLowerCase();
      if (extension) {
        return extension;
      }
    }

    // Infer from context words
    const lowerTranscript = transcript.toLowerCase();

    if (/\b(?:report|document|letter|memo)\b/.test(lowerTranscript)) {
      return 'pdf';
    }

    if (/\b(?:budget|financial|numbers|data|spreadsheet)\b/.test(lowerTranscript)) {
      return 'xlsx';
    }

    if (/\b(?:slides|presentation|deck|pitch)\b/.test(lowerTranscript)) {
      return 'pptx';
    }

    if (/\b(?:photo|image|screenshot|picture)\b/.test(lowerTranscript)) {
      return 'jpg';
    }

    if (/\b(?:video|recording|demo|clip)\b/.test(lowerTranscript)) {
      return 'mp4';
    }

    return undefined;
  }

  /**
   * Extract tags from transcript
   */
  private extractTags(transcript: string): string[] {
    const tags: string[] = [];

    // Tag patterns
    const tagPatterns = [
      /(?:tag|tags|tagged|label|labels)\s+(?:as\s+|with\s+)?([a-zA-Z0-9,\s]+)/gi,
      /(?:category|categories)\s+([a-zA-Z0-9,\s]+)/gi,
    ];

    tagPatterns.forEach((pattern) => {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        const extractedTags = match[1]
          .split(/[,\s]+/)
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0);
        tags.push(...extractedTags);
      }
    });

    // Auto-generate contextual tags
    const contextTags = this.generateContextualTags(transcript);
    tags.push(...contextTags);

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Generate contextual tags based on transcript content
   */
  private generateContextualTags(transcript: string): string[] {
    const tags: string[] = [];
    const lowerTranscript = transcript.toLowerCase();

    // Business context tags
    if (/\b(?:urgent|priority|asap|immediately)\b/.test(lowerTranscript)) {
      tags.push('urgent');
    }

    if (/\b(?:confidential|private|internal|sensitive)\b/.test(lowerTranscript)) {
      tags.push('confidential');
    }

    if (/\b(?:public|external|client|customer)\b/.test(lowerTranscript)) {
      tags.push('external');
    }

    if (/\b(?:draft|preliminary|wip|work in progress)\b/.test(lowerTranscript)) {
      tags.push('draft');
    }

    if (/\b(?:final|approved|completed|done)\b/.test(lowerTranscript)) {
      tags.push('final');
    }

    // Department tags
    const departments = ['marketing', 'sales', 'engineering', 'finance', 'hr', 'operations'];
    departments.forEach((dept) => {
      if (new RegExp(`\\b${dept}\\b`, 'i').test(transcript)) {
        tags.push(dept);
      }
    });

    return tags;
  }

  /**
   * Determine priority level from transcript
   */
  private determinePriority(transcript: string): string {
    const lowerTranscript = transcript.toLowerCase();

    if (/\b(?:urgent|critical|emergency|asap|immediately|high priority)\b/.test(lowerTranscript)) {
      return 'high';
    }

    if (/\b(?:low priority|later|when you have time|no rush)\b/.test(lowerTranscript)) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Find best matching channel from context
   */
  private findBestChannelMatch(name: string, channels: any[]): any | null {
    let bestMatch: any = null;
    let bestScore = 0;

    for (const channel of channels) {
      const score = this.calculateMatchConfidence(name, channel.name);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = channel;
      }
    }

    return bestMatch;
  }

  /**
   * Find best matching task from context
   */
  private findBestTaskMatch(name: string, tasks: any[]): any | null {
    let bestMatch: any = null;
    let bestScore = 0;

    for (const task of tasks) {
      const score = this.calculateMatchConfidence(name, task.title);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = task;
      }
    }

    return bestMatch;
  }

  /**
   * Find best matching user from context
   */
  private findBestUserMatch(name: string, users: any[]): any | null {
    let bestMatch: any = null;
    let bestScore = 0;

    for (const user of users) {
      const score = this.calculateMatchConfidence(name, user.name);
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = user;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate match confidence between two strings
   */
  private calculateMatchConfidence(input: string, target: string): number {
    const inputLower = input.toLowerCase().trim();
    const targetLower = target.toLowerCase().trim();

    // Exact match
    if (inputLower === targetLower) {
      return 1.0;
    }

    // Contains match
    if (targetLower.includes(inputLower) || inputLower.includes(targetLower)) {
      return 0.8;
    }

    // Fuzzy matching using simple word overlap
    const inputWords = inputLower.split(/\s+/);
    const targetWords = targetLower.split(/\s+/);

    const commonWords = inputWords.filter((word) =>
      targetWords.some((targetWord) => targetWord.includes(word) || word.includes(targetWord))
    );

    if (commonWords.length === 0) {
      return 0;
    }

    const overlap = commonWords.length / Math.max(inputWords.length, targetWords.length);
    return overlap * 0.7; // Scale down fuzzy matches
  }

  /**
   * Calculate overall confidence for the parsed command
   */
  private calculateConfidence(
    transcript: string,
    operation: FileOperation,
    resolvedTargets: {
      channels: ResolvedEntity[];
      tasks: ResolvedEntity[];
      users: ResolvedEntity[];
    }
  ): number {
    let confidence = 0.5; // Base confidence

    // Operation identification confidence
    const operationKeywords = {
      [FileOperation.UPLOAD]: ['upload', 'send', 'attach', 'add'],
      [FileOperation.SHARE]: ['share', 'distribute', 'forward'],
      [FileOperation.ORGANIZE]: ['organize', 'sort', 'categorize'],
      [FileOperation.DELETE]: ['delete', 'remove', 'trash'],
      [FileOperation.SEARCH]: ['find', 'search', 'look for'],
      [FileOperation.DOWNLOAD]: ['download', 'get', 'retrieve'],
    };

    const keywords = operationKeywords[operation] || [];
    const hasOperationKeyword = keywords.some((keyword) =>
      transcript.toLowerCase().includes(keyword)
    );

    if (hasOperationKeyword) {
      confidence += 0.2;
    }

    // Entity resolution confidence
    const totalTargets =
      resolvedTargets.channels.length + resolvedTargets.tasks.length + resolvedTargets.users.length;
    if (totalTargets > 0) {
      const avgEntityConfidence =
        [...resolvedTargets.channels, ...resolvedTargets.tasks, ...resolvedTargets.users].reduce(
          (sum, entity) => sum + entity.confidence,
          0
        ) / totalTargets;

      confidence += avgEntityConfidence * 0.3;
    }

    // File name extraction confidence
    if (/\b[a-zA-Z0-9\s\.-]+\.[a-zA-Z0-9]{2,4}\b/.test(transcript)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    averageParsingTime: number;
    p95ParsingTime: number;
    totalCommandsParsed: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageParsingTime: 0,
        p95ParsingTime: 0,
        totalCommandsParsed: 0,
      };
    }

    const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
    const average =
      this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

    return {
      averageParsingTime: Math.round(average * 100) / 100,
      p95ParsingTime: Math.round(p95 * 100) / 100,
      totalCommandsParsed: this.performanceMetrics.length,
    };
  }

  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);

    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}
