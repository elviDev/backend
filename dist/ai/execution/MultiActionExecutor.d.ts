/**
 * Multi-Action Executor - Phase 2 Complex Command Execution
 * Executes complex voice commands with multiple actions, dependencies, and transactions
 *
 * Success Criteria:
 * - Supports all 10 action types from command parsing
 * - ACID transaction compliance for multi-action commands
 * - Automatic rollback on any action failure
 * - Permission validation per action with detailed audit logging
 * - Transaction timeout handling (30 seconds maximum)
 */
import { EventEmitter } from 'events';
import { UserContext, ParsedCommand, ExecutionSummary, AuditEntry } from '../../voice/types';
export interface MultiActionExecutionOptions {
    transactionTimeout?: number;
    parallelExecutionLimit?: number;
    rollbackOnAnyFailure?: boolean;
    auditLogging?: boolean;
    progressTracking?: boolean;
}
export interface ExecutionContext {
    userId: string;
    organizationId: string;
    sessionId: string;
    commandId: string;
    timestamp: string;
    permissions: UserPermissions;
    transaction?: any;
}
export interface UserPermissions {
    canCreateTasks: boolean;
    canAssignTasks: boolean;
    canCreateChannels: boolean;
    canInviteUsers: boolean;
    canUploadFiles: boolean;
    canSendMessages: boolean;
    canUpdateTasks: boolean;
    canDeleteTasks: boolean;
    canManageChannels: boolean;
    canSendNotifications: boolean;
}
export interface ActionExecutionResult {
    actionId: string;
    actionType: string;
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
    affectedEntities: string[];
    rollbackData?: any;
}
export interface MultiActionResult {
    commandId: string;
    success: boolean;
    executedActions: ActionExecutionResult[];
    failedActions: ActionExecutionResult[];
    totalExecutionTime: number;
    rollbackRequired: boolean;
    rollbackCompleted: boolean;
    summary: ExecutionSummary;
    auditEntry: AuditEntry;
}
export interface TransactionManager {
    transaction: any;
    startTime: number;
    timeout: NodeJS.Timeout;
    isActive: boolean;
    rollbackData: Map<string, any>;
}
export declare class MultiActionExecutor extends EventEmitter {
    private dependencyResolver;
    private db;
    private repositories;
    private voiceFileUploadService;
    private activeTransactions;
    private performanceMetrics;
    constructor();
    /**
     * Execute a complex multi-action voice command
     * Main entry point for command execution with full dependency resolution and transaction management
     */
    executeMultiActionCommand(command: ParsedCommand, userContext: UserContext, options?: MultiActionExecutionOptions): Promise<MultiActionResult>;
    /**
     * Execute a single stage of the execution plan
     */
    private executeStage;
    /**
     * Execute a single action
     */
    private executeAction;
    private executeCreateTask;
    private executeAssignTask;
    private executeUpdateTask;
    private executeCreateChannel;
    private executeSendMessage;
    private executeInviteUser;
    private executeUploadFile;
    private executeSendNotification;
    private executeScheduleMeeting;
    private executeGenerateReport;
    private validateActionPermissions;
    private getUserPermissions;
    private beginTransaction;
    private commitTransaction;
    private rollbackTransaction;
    private handleTransactionTimeout;
    private cleanupStaleTransactions;
    private convertParsedActionsToActions;
    private getEstimatedDuration;
    private actionRequiresInput;
    private actionProducesOutput;
    private createExecutionSummary;
    private createActionBreakdown;
    private createAuditEntry;
    private logAuditEntry;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    private recordPerformance;
}
//# sourceMappingURL=MultiActionExecutor.d.ts.map