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
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';
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
  progress: number; // 0-100
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
  totalProgress: number; // 0-100
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

export class ProgressBroadcaster extends EventEmitter {
  private socketManager: ISocketManager;
  private activeSessions: Map<string, ProgressSession> = new Map();
  private sessionHistory: Map<string, ProgressSession> = new Map();
  private broadcastMetrics: number[] = [];
  private readonly historyRetention = 3600000; // 1 hour

  constructor(socketManager: ISocketManager) {
    super();

    this.socketManager = socketManager;

    // Cleanup old sessions periodically
    setInterval(() => this.cleanupOldSessions(), 300000); // Every 5 minutes

    logger.info('Progress Broadcaster initialized');
  }

  /**
   * Initialize progress tracking for a command
   */
  initializeProgressTracking(
    commandId: string,
    userId: string,
    organizationId: string,
    steps: Array<{ id: string; name: string; estimatedDuration: number }>,
    targetUsers: string[]
  ): ProgressSession {
    const sessionId = `progress_${commandId}_${Date.now()}`;

    const session: ProgressSession = {
      sessionId,
      commandId,
      userId,
      organizationId,
      totalSteps: steps.length,
      currentStep: 0,
      stepProgress: new Map(),
      startTime: performance.now(),
      estimatedDuration: steps.reduce((sum, step) => sum + step.estimatedDuration, 0),
      status: 'active',
      targetUsers,
    };

    // Initialize step progress
    steps.forEach((step, index) => {
      const stepProgress: StepProgress = {
        stepId: step.id,
        stepName: step.name,
        status: index === 0 ? 'pending' : 'pending',
        progress: 0,
        estimatedDuration: step.estimatedDuration,
      };

      session.stepProgress.set(step.id, stepProgress);
    });

    this.activeSessions.set(sessionId, session);

    logger.info('Progress tracking initialized', {
      sessionId,
      commandId,
      totalSteps: steps.length,
      estimatedDuration: `${session.estimatedDuration.toFixed(0)}ms`,
      targetUsers: targetUsers.length,
    });

    // Send initial progress update
    this.broadcastProgressUpdate(session);

    return session;
  }

  /**
   * Update step progress
   */
  async updateStepProgress(
    sessionId: string,
    stepId: string,
    progress: number,
    status?: StepProgress['status'],
    result?: any,
    error?: string
  ): Promise<void> {
    const startTime = performance.now();

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('Progress update for unknown session', { sessionId, stepId });
      return;
    }

    const stepProgress = session.stepProgress.get(stepId);
    if (!stepProgress) {
      logger.warn('Progress update for unknown step', { sessionId, stepId });
      return;
    }

    // Update step progress
    const previousProgress = stepProgress.progress;
    stepProgress.progress = Math.min(100, Math.max(0, progress));

    if (status) {
      stepProgress.status = status;

      if (status === 'running' && !stepProgress.startTime) {
        stepProgress.startTime = performance.now();
      }

      if (['completed', 'failed', 'skipped'].includes(status) && !stepProgress.endTime) {
        stepProgress.endTime = performance.now();

        if (stepProgress.startTime) {
          stepProgress.actualDuration = stepProgress.endTime - stepProgress.startTime;
        }
      }
    }

    if (result !== undefined) {
      stepProgress.result = result;
    }

    if (error) {
      stepProgress.error = error;
      stepProgress.status = 'failed';
    }

    // Update current step if this step is completed
    if (stepProgress.status === 'completed') {
      const steps = Array.from(session.stepProgress.values());
      const completedSteps = steps.filter((s) => s.status === 'completed').length;
      session.currentStep = Math.max(session.currentStep, completedSteps);
    }

    // Check if command is complete
    if (this.isSessionComplete(session)) {
      session.status = 'completed';
      session.actualDuration = performance.now() - session.startTime;

      // Move to history
      this.sessionHistory.set(sessionId, { ...session });
      this.activeSessions.delete(sessionId);

      logger.info('Command execution completed', {
        sessionId,
        commandId: session.commandId,
        actualDuration: `${session.actualDuration.toFixed(2)}ms`,
        estimatedDuration: `${session.estimatedDuration.toFixed(2)}ms`,
      });
    }

    // Broadcast progress update
    await this.broadcastProgressUpdate(session);

    const processingTime = performance.now() - startTime;
    this.recordBroadcastMetrics(processingTime);

    logger.debug('Step progress updated', {
      sessionId,
      stepId,
      progress: stepProgress.progress,
      status: stepProgress.status,
      previousProgress,
      processingTime: `${processingTime.toFixed(2)}ms`,
    });
  }

  /**
   * Mark session as failed
   */
  async markSessionFailed(sessionId: string, error: string, failedStepId?: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = 'failed';
    session.actualDuration = performance.now() - session.startTime;

    // Mark current step as failed if specified
    if (failedStepId) {
      const stepProgress = session.stepProgress.get(failedStepId);
      if (stepProgress) {
        stepProgress.status = 'failed';
        stepProgress.error = error;
        stepProgress.endTime = performance.now();
      }
    }

    // Move to history
    this.sessionHistory.set(sessionId, { ...session });
    this.activeSessions.delete(sessionId);

    await this.broadcastProgressUpdate(session);

    logger.warn('Command execution failed', {
      sessionId,
      commandId: session.commandId,
      error,
      failedStepId,
    });
  }

  /**
   * Cancel active session
   */
  async cancelSession(sessionId: string, reason: string = 'Cancelled by user'): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = 'cancelled';
    session.actualDuration = performance.now() - session.startTime;

    // Mark all pending/running steps as skipped
    for (const stepProgress of session.stepProgress.values()) {
      if (['pending', 'running'].includes(stepProgress.status)) {
        stepProgress.status = 'skipped';
        stepProgress.error = reason;
      }
    }

    // Move to history
    this.sessionHistory.set(sessionId, { ...session });
    this.activeSessions.delete(sessionId);

    await this.broadcastProgressUpdate(session);

    logger.info('Command execution cancelled', {
      sessionId,
      commandId: session.commandId,
      reason,
    });
  }

  /**
   * Get progress for a specific session
   */
  getSessionProgress(sessionId: string): ProgressSession | null {
    return this.activeSessions.get(sessionId) || this.sessionHistory.get(sessionId) || null;
  }

  /**
   * Get all active progress sessions
   */
  getActiveSessions(): ProgressSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get progress sessions for a specific user
   */
  getUserSessions(userId: string): ProgressSession[] {
    const active = Array.from(this.activeSessions.values()).filter(
      (session) => session.userId === userId
    );

    const historical = Array.from(this.sessionHistory.values())
      .filter((session) => session.userId === userId)
      .slice(-10); // Last 10 sessions

    return [...active, ...historical];
  }

  /**
   * Broadcast progress update to target users
   */
  private async broadcastProgressUpdate(session: ProgressSession): Promise<void> {
    const startTime = performance.now();

    try {
      const progressUpdate = this.createProgressUpdate(session);

      // Broadcast to all target users
      const broadcastPromises = session.targetUsers.map((userId) => {
        if (this.socketManager.isUserConnected(userId)) {
          return this.socketManager.emitToUser(userId, 'progress_update', progressUpdate);
        }
        return Promise.resolve();
      });

      await Promise.allSettled(broadcastPromises);

      const processingTime = performance.now() - startTime;

      this.emit('progress_broadcast', {
        sessionId: session.sessionId,
        targetUsers: session.targetUsers.length,
        processingTime,
      });
    } catch (error: any) {
      logger.error('Failed to broadcast progress update', {
        sessionId: session.sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Create progress update object for broadcasting
   */
  private createProgressUpdate(session: ProgressSession): ProgressUpdate {
    const steps = Array.from(session.stepProgress.values());
    const completedSteps = steps.filter((s) => s.status === 'completed').length;
    const totalProgress = session.totalSteps > 0 ? (completedSteps / session.totalSteps) * 100 : 0;

    // Find current step
    const currentStepProgress =
      steps.find((s) => s.status === 'running') ||
      steps.find((s) => s.status === 'pending') ||
      steps[steps.length - 1];

    // Calculate time remaining
    const elapsedTime = performance.now() - session.startTime;
    let estimatedTimeRemaining = 0;

    if (session.status === 'active' && totalProgress > 0 && totalProgress < 100) {
      const averageTimePerPercent = elapsedTime / totalProgress;
      estimatedTimeRemaining = Math.max(0, averageTimePerPercent * (100 - totalProgress));
    }

    return {
      sessionId: session.sessionId,
      commandId: session.commandId,
      totalProgress: Math.round(totalProgress * 100) / 100,
      currentStep: session.currentStep,
      totalSteps: session.totalSteps,
      currentStepName: currentStepProgress?.stepName || 'Unknown',
      currentStepProgress: currentStepProgress?.progress || 0,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      elapsedTime: Math.round(elapsedTime),
      status: session.status,
      stepDetails: steps.map((step) => ({ ...step })),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if session is complete
   */
  private isSessionComplete(session: ProgressSession): boolean {
    const steps = Array.from(session.stepProgress.values());
    return steps.every((step) => ['completed', 'failed', 'skipped'].includes(step.status));
  }

  /**
   * Cleanup old sessions from history
   */
  private cleanupOldSessions(): void {
    const cutoffTime = Date.now() - this.historyRetention;
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessionHistory.entries()) {
      const sessionTime = session.actualDuration
        ? session.startTime + session.actualDuration
        : session.startTime;

      if (sessionTime < cutoffTime) {
        this.sessionHistory.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up old progress sessions', { cleanedCount });
    }
  }

  /**
   * Record broadcast performance metrics
   */
  private recordBroadcastMetrics(time: number): void {
    this.broadcastMetrics.push(time);

    // Keep only last 1000 measurements
    if (this.broadcastMetrics.length > 1000) {
      this.broadcastMetrics.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    averageUpdateTime: number;
    p95UpdateTime: number;
    totalUpdates: number;
    activeSessions: number;
    historicalSessions: number;
  } {
    if (this.broadcastMetrics.length === 0) {
      return {
        averageUpdateTime: 0,
        p95UpdateTime: 0,
        totalUpdates: 0,
        activeSessions: this.activeSessions.size,
        historicalSessions: this.sessionHistory.size,
      };
    }

    const sorted = [...this.broadcastMetrics].sort((a, b) => a - b);
    const average =
      this.broadcastMetrics.reduce((sum, time) => sum + time, 0) / this.broadcastMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

    return {
      averageUpdateTime: Math.round(average * 100) / 100,
      p95UpdateTime: Math.round(p95 * 100) / 100,
      totalUpdates: this.broadcastMetrics.length,
      activeSessions: this.activeSessions.size,
      historicalSessions: this.sessionHistory.size,
    };
  }

  /**
   * Destroy the progress broadcaster and clean up resources
   */
  destroy(): void {
    this.activeSessions.clear();
    this.sessionHistory.clear();
    this.broadcastMetrics.length = 0;
    this.removeAllListeners();

    logger.info('Progress Broadcaster destroyed');
  }
}
