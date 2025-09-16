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

import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
import { AIProcessingError } from '../../voice/types';

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
  impact: number; // Estimated time savings in ms
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

export class DependencyResolver {
  private performanceMetrics: number[] = [];
  
  constructor() {
    logger.info('Dependency Resolver initialized');
  }
  
  /**
   * Analyze dependencies between actions and create dependency graph
   * Target: <100ms processing time
   */
  async analyzeDependencies(actions: Action[]): Promise<DependencyGraph> {
    const startTime = performance.now();
    
    if (!actions || actions.length === 0) {
      throw new AIProcessingError('No actions provided for dependency analysis');
    }
    
    try {
      logger.debug('Analyzing dependencies for actions', {
        actionCount: actions.length,
        actionTypes: actions.map(a => a.type)
      });
      
      // Create dependency graph
      const graph: DependencyGraph = {
        nodes: new Map(),
        edges: new Set(),
        levels: []
      };
      
      // Initialize nodes
      for (const action of actions) {
        const node: DependencyNode = {
          action,
          dependsOn: new Set(),
          dependents: new Set(),
          level: 0,
          canRunInParallel: true
        };
        graph.nodes.set(action.id, node);
      }
      
      // Analyze explicit dependencies
      this.analyzeExplicitDependencies(actions, graph);
      
      // Analyze implicit dependencies
      await this.analyzeImplicitDependencies(actions, graph);
      
      // Calculate dependency levels
      this.calculateDependencyLevels(graph);
      
      // Check for circular dependencies
      this.detectCircularDependencies(graph);
      
      // Create execution levels
      this.createExecutionLevels(graph);
      
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      logger.debug('Dependency analysis completed', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.size,
        levelCount: graph.levels.length
      });
      
      return graph;
      
    } catch (error: unknown) {
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Dependency analysis failed', {
        error: errorMessage,
        processingTime: `${processingTime.toFixed(2)}ms`,
        actionCount: actions.length
      });
      
      throw new AIProcessingError('Failed to analyze action dependencies', {
        actionCount: actions.length,
        processingTime,
        originalError: errorMessage
      });
    }
  }
  
  /**
   * Create execution plan from dependency graph
   */
  async createExecutionPlan(graph: DependencyGraph): Promise<ExecutionPlan> {
    const startTime = performance.now();
    
    try {
      const stages: ExecutionStage[] = [];
      let totalEstimatedTime = 0;
      const dependencyChain: string[] = [];
      
      // Create execution stages from dependency levels
      for (let i = 0; i < graph.levels.length; i++) {
        const level = graph.levels[i];
        if (!level) {
          throw new AIProcessingError('Invalid dependency level in graph', {
            levelIndex: i,
            totalLevels: graph.levels.length
          });
        }
        
        const stageId = `stage-${i}`;
        
        const stage: ExecutionStage = {
          stageId,
          level: i,
          actions: level.actions,
          parallelExecution: level.parallelizable && level.actions.length > 1,
          estimatedDuration: level.estimatedDuration,
          prerequisites: this.getStagePrerequisites(level, graph)
        };
        
        stages.push(stage);
        
        // For parallel stages, use the max duration. For sequential, add durations
        if (stage.parallelExecution) {
          totalEstimatedTime += Math.max(...level.actions.map(a => a.metadata?.estimatedDuration || 1000));
        } else {
          totalEstimatedTime += level.estimatedDuration;
        }
        
        // Build dependency chain
        dependencyChain.push(...level.actions.map(a => a.id));
      }
      
      // Assess risks
      const riskAssessment = this.assessExecutionRisks(stages, graph);
      
      const plan: ExecutionPlan = {
        totalEstimatedTime,
        parallelStages: stages,
        dependencyChain,
        riskAssessment
      };
      
      const processingTime = performance.now() - startTime;
      
      logger.debug('Execution plan created', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        stageCount: stages.length,
        totalEstimatedTime: `${totalEstimatedTime}ms`,
        parallelizableStages: stages.filter(s => s.parallelExecution).length
      });
      
      return plan;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create execution plan', {
        error: errorMessage,
        graphNodes: graph.nodes.size
      });
      
      throw new AIProcessingError('Failed to create execution plan', {
        graphSize: graph.nodes.size,
        originalError: errorMessage
      });
    }
  }
  
  /**
   * Optimize execution plan for better performance
   */
  async optimizeExecutionOrder(plan: ExecutionPlan): Promise<OptimizedPlan> {
    const startTime = performance.now();
    
    try {
      const optimizations: Optimization[] = [];
      let optimizedStages = [...plan.parallelStages];
      
      // Optimization 1: Maximize parallelization
      const parallelizationGains = this.optimizeParallelization(optimizedStages);
      if (parallelizationGains.impact > 0) {
        optimizations.push(parallelizationGains);
      }
      
      // Optimization 2: Reorder actions within stages for efficiency
      const reorderingGains = this.optimizeActionOrdering(optimizedStages);
      if (reorderingGains.impact > 0) {
        optimizations.push(reorderingGains);
      }
      
      // Optimization 3: Batch similar actions
      const batchingGains = this.optimizeBatching(optimizedStages);
      if (batchingGains.impact > 0) {
        optimizations.push(batchingGains);
      }
      
      // Optimization 4: Cache repeated operations
      const cachingGains = this.optimizeCaching(optimizedStages);
      if (cachingGains.impact > 0) {
        optimizations.push(cachingGains);
      }
      
      // Calculate performance gains
      const totalTimeSavings = optimizations.reduce((sum, opt) => sum + opt.impact, 0);
      const originalTime = plan.totalEstimatedTime;
      const optimizedTime = Math.max(originalTime - totalTimeSavings, originalTime * 0.3); // Don't optimize beyond 70% improvement
      
      const performanceGains: PerformanceGains = {
        originalEstimatedTime: originalTime,
        optimizedEstimatedTime: optimizedTime,
        timeSavings: totalTimeSavings,
        parallelizationGains: parallelizationGains.impact
      };
      
      const optimizedPlan: OptimizedPlan = {
        ...plan,
        totalEstimatedTime: optimizedTime,
        parallelStages: optimizedStages,
        optimizations,
        performanceGains
      };
      
      const processingTime = performance.now() - startTime;
      
      logger.info('Execution plan optimized', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        originalTime: `${originalTime}ms`,
        optimizedTime: `${optimizedTime}ms`,
        timeSavings: `${totalTimeSavings}ms`,
        optimizationCount: optimizations.length
      });
      
      return optimizedPlan;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to optimize execution plan', {
        error: errorMessage
      });
      
      // Return original plan if optimization fails
      return {
        ...plan,
        optimizations: [],
        performanceGains: {
          originalEstimatedTime: plan.totalEstimatedTime,
          optimizedEstimatedTime: plan.totalEstimatedTime,
          timeSavings: 0,
          parallelizationGains: 0
        }
      };
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
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    
    return {
      average: Math.round(average * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      count: this.performanceMetrics.length
    };
  }
  
  private analyzeExplicitDependencies(actions: Action[], graph: DependencyGraph): void {
    for (const action of actions) {
      if (action.dependencies && action.dependencies.length > 0) {
        const node = graph.nodes.get(action.id);
        if (node) {
          for (const depId of action.dependencies) {
            const depNode = graph.nodes.get(depId);
            if (depNode) {
              node.dependsOn.add(depId);
              depNode.dependents.add(action.id);
              graph.edges.add(`${depId}->${action.id}`);
            }
          }
        }
      }
    }
  }
  
  private async analyzeImplicitDependencies(actions: Action[], graph: DependencyGraph): Promise<void> {
    // Analyze action types and parameters to infer dependencies
    const actionsByType = new Map<string, Action[]>();
    
    for (const action of actions) {
      if (!actionsByType.has(action.type)) {
        actionsByType.set(action.type, []);
      }
      actionsByType.get(action.type)?.push(action);
    }
    
    // Common dependency patterns
    const dependencyRules = [
      // Create before assign/update
      { prerequisite: 'create_task', dependent: 'assign_task' },
      { prerequisite: 'create_channel', dependent: 'send_message' },
      { prerequisite: 'create_task', dependent: 'update_task' },
      
      // User operations must come after user-related creates
      { prerequisite: 'invite_user', dependent: 'assign_task' },
      { prerequisite: 'invite_user', dependent: 'add_to_channel' },
      
      // File operations
      { prerequisite: 'upload_file', dependent: 'share_file' },
      { prerequisite: 'create_task', dependent: 'attach_file' },
      
      // Notification dependencies
      { prerequisite: 'create_task', dependent: 'send_notification' },
      { prerequisite: 'assign_task', dependent: 'send_notification' }
    ];
    
    // Apply dependency rules
    for (const rule of dependencyRules) {
      const prerequisites = actionsByType.get(rule.prerequisite) || [];
      const dependents = actionsByType.get(rule.dependent) || [];
      
      for (const prereq of prerequisites) {
        for (const dependent of dependents) {
          if (this.shouldCreateImplicitDependency(prereq, dependent)) {
            const prereqNode = graph.nodes.get(prereq.id);
            const depNode = graph.nodes.get(dependent.id);
            
            if (prereqNode && depNode) {
              depNode.dependsOn.add(prereq.id);
              prereqNode.dependents.add(dependent.id);
              graph.edges.add(`${prereq.id}->${dependent.id}`);
            }
          }
        }
      }
    }
  }
  
  private shouldCreateImplicitDependency(prereq: Action, dependent: Action): boolean {
    // Check if actions operate on the same entity
    if (prereq.parameters?.entityId && dependent.parameters?.entityId) {
      return prereq.parameters.entityId === dependent.parameters.entityId;
    }
    
    // Check if dependent action needs output from prerequisite
    if (prereq.metadata?.producesOutput && dependent.metadata?.requiresInput) {
      return true;
    }
    
    // Default to no dependency
    return false;
  }
  
  private calculateDependencyLevels(graph: DependencyGraph): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const calculateLevel = (nodeId: string): number => {
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected: ${nodeId}`);
      }
      
      if (visited.has(nodeId)) {
        return graph.nodes.get(nodeId)?.level || 0;
      }
      
      visiting.add(nodeId);
      
      const node = graph.nodes.get(nodeId);
      if (!node) {
        return 0;
      }
      
      let maxDepLevel = -1;
      for (const depId of node.dependsOn) {
        maxDepLevel = Math.max(maxDepLevel, calculateLevel(depId));
      }
      
      node.level = maxDepLevel + 1;
      visited.add(nodeId);
      visiting.delete(nodeId);
      
      return node.level;
    };
    
    // Calculate levels for all nodes
    for (const nodeId of graph.nodes.keys()) {
      calculateLevel(nodeId);
    }
  }
  
  private detectCircularDependencies(graph: DependencyGraph): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const node = graph.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependsOn) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of graph.nodes.keys()) {
      if (hasCycle(nodeId)) {
        throw new AIProcessingError(`Circular dependency detected involving: ${nodeId}`);
      }
    }
  }
  
  private createExecutionLevels(graph: DependencyGraph): void {
    const levelMap = new Map<number, Action[]>();
    
    // Group actions by level
    for (const node of graph.nodes.values()) {
      if (!levelMap.has(node.level)) {
        levelMap.set(node.level, []);
      }
      levelMap.get(node.level)?.push(node.action);
    }
    
    // Create dependency levels
    graph.levels = [];
    for (const [level, actions] of levelMap.entries()) {
      const estimatedDuration = actions.reduce((sum, action) => 
        sum + (action.metadata?.estimatedDuration || 1000), 0
      );
      
      const parallelizable = actions.length > 1 && 
        actions.every(action => !action.metadata?.requiresInput);
      
      graph.levels.push({
        level,
        actions,
        parallelizable,
        estimatedDuration: parallelizable ? 
          Math.max(...actions.map(a => a.metadata?.estimatedDuration || 1000)) : 
          estimatedDuration
      });
    }
    
    // Sort levels by level number
    graph.levels.sort((a, b) => a.level - b.level);
  }
  
  private getStagePrerequisites(level: DependencyLevel, graph: DependencyGraph): string[] {
    const prerequisites = new Set<string>();
    
    for (const action of level.actions) {
      const node = graph.nodes.get(action.id);
      if (node) {
        for (const depId of node.dependsOn) {
          prerequisites.add(depId);
        }
      }
    }
    
    return Array.from(prerequisites);
  }
  
  private assessExecutionRisks(stages: ExecutionStage[], graph: DependencyGraph): RiskAssessment {
    const potentialIssues: string[] = [];
    const mitigations: string[] = [];
    const failureRecovery: string[] = [];
    
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    
    // Assess complexity risks
    if (stages.length > 5) {
      potentialIssues.push('Complex multi-stage execution with many dependencies');
      mitigations.push('Implement comprehensive progress tracking and rollback capabilities');
      riskLevel = 'medium';
    }
    
    // Assess parallel execution risks
    const parallelStages = stages.filter(s => s.parallelExecution);
    if (parallelStages.length > 2) {
      potentialIssues.push('Multiple parallel execution stages increase failure probability');
      mitigations.push('Implement stage-level transaction management');
      riskLevel = 'medium';
    }
    
    // Assess external dependency risks
    const hasExternalDependencies = Array.from(graph.nodes.values())
      .some(node => node.action.type.includes('external') || node.action.type.includes('api'));
    
    if (hasExternalDependencies) {
      potentialIssues.push('External API dependencies may cause failures');
      mitigations.push('Implement retry mechanisms and fallback strategies');
      if (riskLevel === 'low') riskLevel = 'medium';
    }
    
    // General failure recovery strategies
    failureRecovery.push('Database transaction rollback for data consistency');
    failureRecovery.push('Detailed error reporting for manual intervention');
    failureRecovery.push('Automatic retry for transient failures');
    failureRecovery.push('User notification of partial completion status');
    
    return {
      riskLevel,
      potentialIssues,
      mitigations,
      failureRecovery
    };
  }
  
  private optimizeParallelization(stages: ExecutionStage[]): Optimization {
    let impact = 0;
    const appliedTo: string[] = [];
    
    for (const stage of stages) {
      if (!stage.parallelExecution && stage.actions.length > 1) {
        // Check if actions can be parallelized
        const canParallelize = stage.actions.every(action => 
          !action.metadata?.requiresInput && 
          !stage.actions.some(other => 
            other.id !== action.id && 
            other.dependencies?.includes(action.id)
          )
        );
        
        if (canParallelize) {
          const originalDuration = stage.estimatedDuration;
          const parallelDuration = Math.max(...stage.actions.map(a => a.metadata?.estimatedDuration || 1000));
          impact += originalDuration - parallelDuration;
          appliedTo.push(stage.stageId);
          
          // Update stage
          stage.parallelExecution = true;
          stage.estimatedDuration = parallelDuration;
        }
      }
    }
    
    return {
      type: 'parallelization',
      description: `Enabled parallel execution for ${appliedTo.length} stages`,
      impact,
      appliedTo
    };
  }
  
  private optimizeActionOrdering(stages: ExecutionStage[]): Optimization {
    let impact = 0;
    const appliedTo: string[] = [];
    
    for (const stage of stages) {
      if (stage.actions.length > 2 && !stage.parallelExecution) {
        // Sort by estimated duration (shortest first for better perceived performance)
        const originalOrder = [...stage.actions];
        stage.actions.sort((a, b) => {
          const durationA = a.metadata?.estimatedDuration || 1000;
          const durationB = b.metadata?.estimatedDuration || 1000;
          return durationA - durationB;
        });
        
        // Estimate impact (faster feedback to user)
        const hasOrderChange = originalOrder.some((action, index) => 
          action.id !== (stage.actions[index]?.id || '')
        );
        
        if (hasOrderChange) {
          impact += 200; // Estimated user experience improvement
          appliedTo.push(stage.stageId);
        }
      }
    }
    
    return {
      type: 'reordering',
      description: `Optimized action ordering for ${appliedTo.length} stages`,
      impact,
      appliedTo
    };
  }
  
  private optimizeBatching(stages: ExecutionStage[]): Optimization {
    let impact = 0;
    const appliedTo: string[] = [];
    
    for (const stage of stages) {
      // Group similar actions that can be batched
      const actionGroups = new Map<string, Action[]>();
      
      for (const action of stage.actions) {
        if (!actionGroups.has(action.type)) {
          actionGroups.set(action.type, []);
        }
        actionGroups.get(action.type)?.push(action);
      }
      
      // Find batchable groups
      for (const [type, actions] of actionGroups.entries()) {
        if (actions.length > 1 && this.isBatchableActionType(type)) {
          const originalTime = actions.reduce((sum, a) => sum + (a.metadata?.estimatedDuration || 1000), 0);
          const batchTime = Math.max(actions.length * 100, 500); // Batch overhead
          
          if (batchTime < originalTime) {
            impact += originalTime - batchTime;
            appliedTo.push(stage.stageId);
          }
        }
      }
    }
    
    return {
      type: 'batching',
      description: `Applied batching optimizations to ${appliedTo.length} stages`,
      impact,
      appliedTo
    };
  }
  
  private optimizeCaching(stages: ExecutionStage[]): Optimization {
    let impact = 0;
    const appliedTo: string[] = [];
    
    // Look for repeated operations that can be cached
    const operationCounts = new Map<string, number>();
    
    for (const stage of stages) {
      for (const action of stage.actions) {
        const key = `${action.type}:${JSON.stringify(action.parameters)}`;
        operationCounts.set(key, (operationCounts.get(key) || 0) + 1);
      }
    }
    
    // Calculate caching benefits for repeated operations
    for (const [operation, count] of operationCounts.entries()) {
      if (count > 1) {
        const estimatedSavings = (count - 1) * 200; // Cache hit savings
        impact += estimatedSavings;
        appliedTo.push(operation);
      }
    }
    
    return {
      type: 'caching',
      description: `Identified ${appliedTo.length} cacheable operations`,
      impact,
      appliedTo
    };
  }
  
  private isBatchableActionType(actionType: string): boolean {
    const batchableTypes = [
      'send_notification',
      'assign_task', 
      'update_task',
      'create_task',
      'send_message'
    ];
    
    return batchableTypes.includes(actionType);
  }
  
  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}