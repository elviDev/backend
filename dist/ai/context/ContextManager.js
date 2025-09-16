"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
const perf_hooks_1 = require("perf_hooks");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../../utils/logger");
const index_1 = require("../../db/index");
const types_1 = require("../../voice/types");
const EntityResolver_1 = require("./EntityResolver");
const TemporalProcessor_1 = require("./TemporalProcessor");
class ContextManager {
    entityResolver;
    temporalProcessor;
    redis;
    db;
    config;
    performanceMetrics = [];
    constructor(config = {}) {
        this.config = {
            cacheEnabled: true,
            cacheTTL: 300, // 5 minutes
            maxRecentTasks: 20,
            maxRecentChannels: 15,
            maxTeamMembers: 50,
            ...config
        };
        this.db = new index_1.DatabaseManager();
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: parseInt(process.env.REDIS_CONTEXT_DB || '2'),
            keyPrefix: 'context:',
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
        this.entityResolver = new EntityResolver_1.EntityResolver(this.db);
        this.temporalProcessor = new TemporalProcessor_1.TemporalProcessor();
        logger_1.logger.info('Context Manager initialized', { config: this.config });
    }
    /**
     * Build comprehensive context for command processing
     * Target: <500ms processing time
     */
    async buildContext(userContext) {
        const startTime = perf_hooks_1.performance.now();
        const cacheKey = this.generateCacheKey(userContext);
        try {
            // Check cache first if enabled
            if (this.config.cacheEnabled) {
                const cached = await this.getCachedContext(cacheKey);
                if (cached) {
                    const processingTime = perf_hooks_1.performance.now() - startTime;
                    this.recordPerformance(processingTime);
                    logger_1.logger.debug('Context cache hit', {
                        cacheKey,
                        processingTime: `${processingTime.toFixed(2)}ms`
                    });
                    return cached;
                }
            }
            // Build context from database
            const [userInfo, organizationInfo, activeChannels, recentTasks, teamMembers, temporalContext] = await Promise.all([
                this.getUserInfo(userContext.userId),
                this.getOrganizationInfo(userContext.organizationId),
                this.getActiveChannels(userContext.userId),
                this.getRecentTasks(userContext.userId),
                this.getTeamMembers(userContext.organizationId),
                this.temporalProcessor.getCurrentTemporalContext(userContext.timezone)
            ]);
            const contextData = {
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
            const processingTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(processingTime);
            // Log slow context building
            if (processingTime > 500) {
                logger_1.logger.warn('Slow context building', {
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    userId: userContext.userId,
                    channelCount: activeChannels.length,
                    taskCount: recentTasks.length
                });
            }
            logger_1.logger.debug('Context built successfully', {
                processingTime: `${processingTime.toFixed(2)}ms`,
                channelCount: activeChannels.length,
                taskCount: recentTasks.length,
                teamMemberCount: teamMembers.length
            });
            return contextData;
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(processingTime);
            logger_1.logger.error('Context building failed', {
                error: error.message,
                processingTime: `${processingTime.toFixed(2)}ms`,
                userId: userContext.userId,
                organizationId: userContext.organizationId
            });
            throw new types_1.AIProcessingError('Failed to build context', {
                userId: userContext.userId,
                organizationId: userContext.organizationId,
                processingTime,
                originalError: error.message
            });
        }
    }
    /**
     * Get conversation history for a user
     */
    async getConversationHistory(userId, limit = 10) {
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
                .filter((cmd) => cmd.execution_status === 'completed')
                .map((cmd) => cmd.processed_transcript || cmd.transcript)
                .slice(0, 5); // Last 5 successful commands
            return {
                recentCommands: recentCommands.rows || [],
                context
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get conversation history', {
                userId,
                error: error.message
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
    async invalidateUserContext(userId, organizationId) {
        try {
            if (organizationId) {
                const cacheKey = this.generateCacheKey({ userId, organizationId });
                await this.redis.del(cacheKey);
            }
            else {
                // Delete all contexts for this user
                const pattern = `*:${userId}:*`;
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            logger_1.logger.debug('User context invalidated', { userId, organizationId });
        }
        catch (error) {
            logger_1.logger.error('Failed to invalidate user context', {
                userId,
                organizationId,
                error: error.message
            });
        }
    }
    /**
     * Get performance statistics
     */
    getPerformanceStats() {
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
    generateCacheKey(userContext) {
        return `ctx:${userContext.organizationId}:${userContext.userId}:${userContext.sessionId || 'default'}`;
    }
    async getCachedContext(key) {
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        catch (error) {
            logger_1.logger.warn('Cache lookup failed', { key, error: error.message });
        }
        return null;
    }
    async cacheContext(key, context) {
        try {
            await this.redis.setex(key, this.config.cacheTTL, JSON.stringify(context));
        }
        catch (error) {
            logger_1.logger.warn('Cache set failed', { key, error: error.message });
        }
    }
    async getUserInfo(userId) {
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
    async getOrganizationInfo(organizationId) {
        // For now, return mock organization info
        // In a real implementation, this would query an organizations table
        return {
            id: organizationId,
            name: 'CEO Communication Platform',
            timezone: 'UTC'
        };
    }
    async getActiveChannels(userId) {
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
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            memberCount: parseInt(row.member_count) || 0
        }));
    }
    async getRecentTasks(userId) {
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
        return result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            assignedTo: row.assigned_to || [],
            dueDate: row.due_date ? row.due_date.toISOString() : undefined
        }));
    }
    async getTeamMembers(organizationId) {
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
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            role: row.role,
            status: row.status
        }));
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=ContextManager.js.map