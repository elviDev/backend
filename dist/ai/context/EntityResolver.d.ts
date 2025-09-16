/**
 * Entity Resolver - Phase 2 AI Intelligence
 * Smart entity resolution with fuzzy matching and context awareness
 *
 * Success Criteria:
 * - Fuzzy matching with 85%+ accuracy
 * - Handles pronouns (this, that, it)
 * - Context-aware disambiguation
 * - <200ms resolution time per entity
 */
import { DatabaseManager } from '../../db';
import { ContextData, ResolvedEntities } from '../../voice/types';
export interface ResolvedUser {
    id: string;
    name: string;
    email: string;
    role: string;
    confidence: number;
}
export interface ResolvedChannel {
    id: string;
    name: string;
    type: string;
    memberCount: number;
    confidence: number;
}
export interface ResolvedTask {
    id: string;
    title: string;
    status: string;
    assignedTo: string[];
    confidence: number;
}
export declare class EntityResolver {
    private db;
    private performanceMetrics;
    private fuzzyCache;
    constructor(db: DatabaseManager);
    /**
     * Resolve user entity with fuzzy matching and context
     * Target: <200ms resolution time
     */
    resolveUser(name: string, context: ContextData): Promise<ResolvedUser | null>;
    /**
     * Resolve channel entity with context awareness
     */
    resolveChannel(name: string, context: ContextData): Promise<ResolvedChannel | null>;
    /**
     * Resolve task entity with smart matching
     */
    resolveTask(reference: string, context: ContextData): Promise<ResolvedTask | null>;
    /**
     * Validate and enhance entities from AI parsing
     */
    validateAndEnhanceEntities(entities: any, context: ContextData): Promise<ResolvedEntities>;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    private findUserExactMatch;
    private findUserFuzzyMatch;
    private resolveUserByRole;
    private findChannelExactMatch;
    private findChannelFuzzyMatch;
    private findChannelInDatabase;
    private findTaskExactMatch;
    private findTaskFuzzyMatch;
    private resolveTaskContextually;
    private fuzzyMatchUsers;
    private fuzzyMatchChannels;
    private fuzzyMatchTasks;
    private calculateSimilarity;
    private recordPerformance;
}
//# sourceMappingURL=EntityResolver.d.ts.map