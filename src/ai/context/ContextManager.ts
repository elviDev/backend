/**
 * Context Manager - Phase 2 AI Intelligence
 * Builds comprehensive context for AI command processing
 * 
 * Success Criteria:
 * - Aggregates user, organization, and conversation data
 * - Includes recent tasks, channels, and team members
 * - Context building time <500ms
 * - Caches context data for 5-minute TTL
 */

import { performance } from 'perf_hooks';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import { DatabaseManager } from '../../db/index';
import { 
  UserContext, 
  ContextData, 
  ResolvedEntities,
  AIProcessingError 
} from '../../voice/types';
import { EntityResolver } from './EntityResolver';
import { TemporalProcessor } from './TemporalProcessor';

export interface ContextManagerConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  maxRecentTasks: number;
  maxRecentChannels: number;
  maxTeamMembers: number;
}

export class ContextManager {
  public entityResolver: EntityResolver;
  public temporalProcessor: TemporalProcessor;
  
  private redis: Redis;
  private db: DatabaseManager;
  private config: ContextManagerConfig;
  private performanceMetrics: number[] = [];
  
  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = {
      cacheEnabled: true,
      cacheTTL: 300, // 5 minutes
      maxRecentTasks: 20,
      maxRecentChannels: 15,
      maxTeamMembers: 50,
      ...config
    };
    
    this.db = new DatabaseManager();
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_CONTEXT_DB || '2'),
      keyPrefix: 'context:',
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    
    this.entityResolver = new EntityResolver(this.db);
    this.temporalProcessor = new TemporalProcessor();
    
    logger.info('Context Manager initialized', { config: this.config });
  }
  
  /**
   * Build comprehensive context for command processing
   * Target: <500ms processing time
   */
  async buildContext(userContext: UserContext): Promise<ContextData> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(userContext);
    
    try {
      // Check cache first if enabled
      if (this.config.cacheEnabled) {
        const cached = await this.getCachedContext(cacheKey);
        if (cached) {
          const processingTime = performance.now() - startTime;
          this.recordPerformance(processingTime);
          
          logger.debug('Context cache hit', {
            cacheKey,
            processingTime: `${processingTime.toFixed(2)}ms`
          });
          
          return cached;
        }
      }
      
      // Build context from database
      const [
        userInfo,
        organizationInfo,
        activeChannels,
        recentTasks,
        teamMembers,
        temporalContext
      ] = await Promise.all([
        this.getUserInfo(userContext.userId),
        this.getOrganizationInfo(userContext.organizationId),
        this.getActiveChannels(userContext.userId),
        this.getRecentTasks(userContext.userId),
        this.getTeamMembers(userContext.organizationId),
        this.temporalProcessor.getCurrentTemporalContext(userContext.timezone)
      ]);
      
      const contextData: ContextData = {
        user: userInfo,
        organization: organizationInfo,
        activeChannels,
        recentTasks,
        teamMembers,
        temporal: temporalContext
      };
      
      // Cache the result if caching is enabled
      if (this.config.cacheEnabled) {
        await this.cacheContext(cacheKey, contextData);
      }
      
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      // Log slow context building
      if (processingTime > 500) {
        logger.warn('Slow context building', {
          processingTime: `${processingTime.toFixed(2)}ms`,
          userId: userContext.userId,
          channelCount: activeChannels.length,
          taskCount: recentTasks.length
        });
      }
      
      logger.debug('Context built successfully', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        channelCount: activeChannels.length,
        taskCount: recentTasks.length,
        teamMemberCount: teamMembers.length
      });
      
      return contextData;
      
    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      logger.error('Context building failed', {
        error: (error as any).message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: userContext.userId,
        organizationId: userContext.organizationId
      });
      
      throw new AIProcessingError('Failed to build context', {
        userId: userContext.userId,
        organizationId: userContext.organizationId,
        processingTime,
        originalError: (error as any).message
      });
    }
  }
  
  /**
   * Get conversation history for a user
   */
  async getConversationHistory(
    userId: string, 
    limit: number = 10
  ): Promise<{ recentCommands: any[]; context: string[] }> {
    try {
      const recentCommands = await this.db.query(`
        SELECT 
          id,
          transcript,
          processed_transcript,
          intent_analysis,
          execution_status,
          created_at
        FROM voice_commands 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [userId, limit]);
      
      // Extract context hints from recent commands
      const context = recentCommands
        .filter((cmd: any) => cmd.execution_status === 'completed')
        .map((cmd: any) => cmd.processed_transcript || cmd.transcript)
        .slice(0, 5); // Last 5 successful commands
      
      return {
        recentCommands: recentCommands.rows || [],
        context
      };
      
    } catch (error) {
      logger.error('Failed to get conversation history', {
        userId,
        error: (error as any).message
      });
      
      return {
        recentCommands: [],
        context: []
      };
    }
  }
  
  /**
   * Invalidate cached context for a user
   */
  async invalidateUserContext(userId: string, organizationId?: string): Promise<void> {
    try {
      if (organizationId) {
        const cacheKey = this.generateCacheKey({ userId, organizationId });
        await this.redis.del(cacheKey);
      } else {
        // Delete all contexts for this user
        const pattern = `*:${userId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      
      logger.debug('User context invalidated', { userId, organizationId });
      
    } catch (error) {
      logger.error('Failed to invalidate user context', {
        userId,
        organizationId,
        error: (error as any).message
      });
    }
  }
  
  /**
   * Get performance statistics
   */
  getPerformanceStats(): { average: number; p95: number; p99: number; count: number } {
    if (this.performanceMetrics.length === 0) {
      return { average: 0, p95: 0, p99: 0, count: 0 };
    }
    
    const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
    const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    return {
      average: Math.round(average * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      count: this.performanceMetrics.length
    };
  }
  
  private generateCacheKey(userContext: UserContext): string {
    return `ctx:${userContext.organizationId}:${userContext.userId}:${userContext.sessionId || 'default'}`;
  }
  
  private async getCachedContext(key: string): Promise<ContextData | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Cache lookup failed', { key, error: (error as any).message });
    }
    
    return null;
  }
  
  private async cacheContext(key: string, context: ContextData): Promise<void> {
    try {
      await this.redis.setex(key, this.config.cacheTTL, JSON.stringify(context));
    } catch (error) {
      logger.warn('Cache set failed', { key, error: (error as any).message });
    }
  }
  
  private async getUserInfo(userId: string): Promise<ContextData['user']> {
    const result = await this.db.query(`
      SELECT id, name, email, role
      FROM users 
      WHERE id = $1
    `, [userId]);
    
    if (!result.rows[0]) {
      throw new Error(`User not found: ${userId}`);
    }
    
    const user = result.rows[0];
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email
    };
  }
  
  private async getOrganizationInfo(organizationId: string): Promise<ContextData['organization']> {
    // For now, return mock organization info
    // In a real implementation, this would query an organizations table
    return {
      id: organizationId,
      name: 'CEO Communication Platform',
      timezone: 'UTC'
    };
  }
  
  private async getActiveChannels(userId: string): Promise<ContextData['activeChannels']> {
    const result = await this.db.query(`
      SELECT DISTINCT 
        c.id,
        c.name,
        c.channel_type as type,
        COUNT(cm.user_id) as member_count
      FROM channels c
      LEFT JOIN channel_members cm ON c.id = cm.channel_id
      WHERE c.status = 'active'
        AND c.id IN (
          SELECT channel_id 
          FROM channel_members 
          WHERE user_id = $1
        )
      GROUP BY c.id, c.name, c.channel_type
      ORDER BY c.created_at DESC
      LIMIT $2
    `, [userId, this.config.maxRecentChannels]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      memberCount: parseInt(row.member_count) || 0
    }));
  }
  
  private async getRecentTasks(userId: string): Promise<ContextData['recentTasks']> {
    const result = await this.db.query(`
      SELECT 
        id,
        title,
        status,
        assigned_to,
        due_date
      FROM tasks
      WHERE (created_by = $1 OR $1 = ANY(assigned_to))
        AND status IN ('pending', 'in_progress', 'review')
      ORDER BY 
        CASE 
          WHEN due_date IS NOT NULL THEN due_date
          ELSE created_at
        END DESC
      LIMIT $2
    `, [userId, this.config.maxRecentTasks]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      assignedTo: row.assigned_to || [],
      dueDate: row.due_date ? row.due_date.toISOString() : undefined
    }));
  }
  
  private async getTeamMembers(organizationId: string): Promise<ContextData['teamMembers']> {
    const result = await this.db.query(`
      SELECT 
        id,
        name,
        role,
        CASE 
          WHEN last_active > NOW() - INTERVAL '5 minutes' THEN 'online'
          WHEN last_active > NOW() - INTERVAL '30 minutes' THEN 'busy'
          ELSE 'offline'
        END as status
      FROM users
      WHERE organization_id = $1
        OR $1 IS NULL  -- Handle case where organization_id is not set
      ORDER BY 
        CASE 
          WHEN last_active > NOW() - INTERVAL '5 minutes' THEN 1
          WHEN last_active > NOW() - INTERVAL '30 minutes' THEN 2
          ELSE 3
        END,
        name
      LIMIT $2
    `, [organizationId, this.config.maxTeamMembers]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status
    }));
  }
  
  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}