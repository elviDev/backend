/**
 * Dependency Resolver - Phase 2 Multi-Action Execution
 * Resolves dependencies between actions in complex voice commands
 *
 * Success Criteria:
 * - Identifies implicit and explicit dependencies between actions
 * - Creates optimal execution order with parallel execution where possible
 * - Handles circular dependency detection and prevention
 * - Supports dependency resolution in <100ms
 */
export interface Action {
    id: string;
    type: string;
    parameters: Record<string, any>;
    dependencies?: string[];
    metadata?: {
        priority: number;
        estimatedDuration: number;
        requiresInput?: boolean;
        producesOutput?: boolean;
    };
}
export interface DependencyGraph {
    nodes: Map<string, DependencyNode>;
    edges: Set<string>;
    levels: DependencyLevel[];
}
export interface DependencyNode {
    action: Action;
    dependsOn: Set<string>;
    dependents: Set<string>;
    level: number;
    canRunInParallel: boolean;
}
export interface DependencyLevel {
    level: number;
    actions: Action[];
    parallelizable: boolean;
    estimatedDuration: number;
}
export interface ExecutionPlan {
    totalEstimatedTime: number;
    parallelStages: ExecutionStage[];
    dependencyChain: string[];
    riskAssessment: RiskAssessment;
}
export interface ExecutionStage {
    stageId: string;
    level: number;
    actions: Action[];
    parallelExecution: boolean;
    estimatedDuration: number;
    prerequisites: string[];
}
export interface OptimizedPlan extends ExecutionPlan {
    optimizations: Optimization[];
    performanceGains: PerformanceGains;
}
export interface Optimization {
    type: 'parallelization' | 'reordering' | 'batching' | 'caching';
    description: string;
    impact: number;
    appliedTo: string[];
}
export interface PerformanceGains {
    originalEstimatedTime: number;
    optimizedEstimatedTime: number;
    timeSavings: number;
    parallelizationGains: number;
}
export interface RiskAssessment {
    riskLevel: 'low' | 'medium' | 'high';
    potentialIssues: string[];
    mitigations: string[];
    failureRecovery: string[];
}
export declare class DependencyResolver {
    private performanceMetrics;
    constructor();
    /**
     * Analyze dependencies between actions and create dependency graph
     * Target: <100ms processing time
     */
    analyzeDependencies(actions: Action[]): Promise<DependencyGraph>;
    /**
     * Create execution plan from dependency graph
     */
    createExecutionPlan(graph: DependencyGraph): Promise<ExecutionPlan>;
    /**
     * Optimize execution plan for better performance
     */
    optimizeExecutionOrder(plan: ExecutionPlan): Promise<OptimizedPlan>;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    private analyzeExplicitDependencies;
    private analyzeImplicitDependencies;
    private shouldCreateImplicitDependency;
    private calculateDependencyLevels;
    private detectCircularDependencies;
    private createExecutionLevels;
    private getStagePrerequisites;
    private assessExecutionRisks;
    private optimizeParallelization;
    private optimizeActionOrdering;
    private optimizeBatching;
    private optimizeCaching;
    private isBatchableActionType;
    private recordPerformance;
}
//# sourceMappingURL=DependencyResolver.d.ts.map