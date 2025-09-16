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
import { UserContext, ContextData } from '../../voice/types';
import { EntityResolver } from './EntityResolver';
import { TemporalProcessor } from './TemporalProcessor';
export interface ContextManagerConfig {
    cacheEnabled: boolean;
    cacheTTL: number;
    maxRecentTasks: number;
    maxRecentChannels: number;
    maxTeamMembers: number;
}
export declare class ContextManager {
    entityResolver: EntityResolver;
    temporalProcessor: TemporalProcessor;
    private redis;
    private db;
    private config;
    private performanceMetrics;
    constructor(config?: Partial<ContextManagerConfig>);
    /**
     * Build comprehensive context for command processing
     * Target: <500ms processing time
     */
    buildContext(userContext: UserContext): Promise<ContextData>;
    /**
     * Get conversation history for a user
     */
    getConversationHistory(userId: string, limit?: number): Promise<{
        recentCommands: any[];
        context: string[];
    }>;
    /**
     * Invalidate cached context for a user
     */
    invalidateUserContext(userId: string, organizationId?: string): Promise<void>;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    private generateCacheKey;
    private getCachedContext;
    private cacheContext;
    private getUserInfo;
    private getOrganizationInfo;
    private getActiveChannels;
    private getRecentTasks;
    private getTeamMembers;
    private recordPerformance;
}
//# sourceMappingURL=ContextManager.d.ts.map