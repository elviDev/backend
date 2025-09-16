/**
 * Progress Broadcaster - Phase 2 Real-Time Progress Tracking
 * Shows live progress of multi-step command execution
 *
 * Success Criteria:
 * - Step-by-step progress visualization
 * - Estimated time remaining calculation
 * - Progress persistence for reconnecting clients
 * - Progress completion notifications
 */
import { EventEmitter } from 'events';
import { ISocketManager } from '../../websocket/types';
export interface ProgressSession {
    sessionId: string;
    commandId: string;
    userId: string;
    organizationId: string;
    totalSteps: number;
    currentStep: number;
    stepProgress: Map<string, StepProgress>;
    startTime: number;
    estimatedDuration: number;
    actualDuration?: number;
    status: 'active' | 'completed' | 'failed' | 'cancelled';
    targetUsers: string[];
}
export interface StepProgress {
    stepId: string;
    stepName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    progress: number;
    startTime?: number;
    endTime?: number;
    estimatedDuration: number;
    actualDuration?: number;
    result?: any;
    error?: string;
}
export interface ProgressUpdate {
    sessionId: string;
    commandId: string;
    totalProgress: number;
    currentStep: number;
    totalSteps: number;
    currentStepName: string;
    currentStepProgress: number;
    estimatedTimeRemaining: number;
    elapsedTime: number;
    status: ProgressSession['status'];
    stepDetails: StepProgress[];
    lastUpdated: string;
}
export declare class ProgressBroadcaster extends EventEmitter {
    private socketManager;
    private activeSessions;
    private sessionHistory;
    private broadcastMetrics;
    private readonly historyRetention;
    constructor(socketManager: ISocketManager);
    /**
     * Initialize progress tracking for a command
     */
    initializeProgressTracking(commandId: string, userId: string, organizationId: string, steps: Array<{
        id: string;
        name: string;
        estimatedDuration: number;
    }>, targetUsers: string[]): ProgressSession;
    /**
     * Update step progress
     */
    updateStepProgress(sessionId: string, stepId: string, progress: number, status?: StepProgress['status'], result?: any, error?: string): Promise<void>;
    /**
     * Mark session as failed
     */
    markSessionFailed(sessionId: string, error: string, failedStepId?: string): Promise<void>;
    /**
     * Cancel active session
     */
    cancelSession(sessionId: string, reason?: string): Promise<void>;
    /**
     * Get progress for a specific session
     */
    getSessionProgress(sessionId: string): ProgressSession | null;
    /**
     * Get all active progress sessions
     */
    getActiveSessions(): ProgressSession[];
    /**
     * Get progress sessions for a specific user
     */
    getUserSessions(userId: string): ProgressSession[];
    /**
     * Broadcast progress update to target users
     */
    private broadcastProgressUpdate;
    /**
     * Create progress update object for broadcasting
     */
    private createProgressUpdate;
    /**
     * Check if session is complete
     */
    private isSessionComplete;
    /**
     * Cleanup old sessions from history
     */
    private cleanupOldSessions;
    /**
     * Record broadcast performance metrics
     */
    private recordBroadcastMetrics;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        averageUpdateTime: number;
        p95UpdateTime: number;
        totalUpdates: number;
        activeSessions: number;
        historicalSessions: number;
    };
    /**
     * Destroy the progress broadcaster and clean up resources
     */
    destroy(): void;
}
//# sourceMappingURL=ProgressBroadcaster.d.ts.map