"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressBroadcaster = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class ProgressBroadcaster extends events_1.EventEmitter {
    socketManager;
    activeSessions = new Map();
    sessionHistory = new Map();
    broadcastMetrics = [];
    historyRetention = 3600000; // 1 hour
    constructor(socketManager) {
        super();
        this.socketManager = socketManager;
        // Cleanup old sessions periodically
        setInterval(() => this.cleanupOldSessions(), 300000); // Every 5 minutes
        logger_1.logger.info('Progress Broadcaster initialized');
    }
    /**
     * Initialize progress tracking for a command
     */
    initializeProgressTracking(commandId, userId, organizationId, steps, targetUsers) {
        const sessionId = `progress_${commandId}_${Date.now()}`;
        const session = {
            sessionId,
            commandId,
            userId,
            organizationId,
            totalSteps: steps.length,
            currentStep: 0,
            stepProgress: new Map(),
            startTime: perf_hooks_1.performance.now(),
            estimatedDuration: steps.reduce((sum, step) => sum + step.estimatedDuration, 0),
            status: 'active',
            targetUsers,
        };
        // Initialize step progress
        steps.forEach((step, index) => {
            const stepProgress = {
                stepId: step.id,
                stepName: step.name,
                status: index === 0 ? 'pending' : 'pending',
                progress: 0,
                estimatedDuration: step.estimatedDuration,
            };
            session.stepProgress.set(step.id, stepProgress);
        });
        this.activeSessions.set(sessionId, session);
        logger_1.logger.info('Progress tracking initialized', {
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
    async updateStepProgress(sessionId, stepId, progress, status, result, error) {
        const startTime = perf_hooks_1.performance.now();
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            logger_1.logger.warn('Progress update for unknown session', { sessionId, stepId });
            return;
        }
        const stepProgress = session.stepProgress.get(stepId);
        if (!stepProgress) {
            logger_1.logger.warn('Progress update for unknown step', { sessionId, stepId });
            return;
        }
        // Update step progress
        const previousProgress = stepProgress.progress;
        stepProgress.progress = Math.min(100, Math.max(0, progress));
        if (status) {
            stepProgress.status = status;
            if (status === 'running' && !stepProgress.startTime) {
                stepProgress.startTime = perf_hooks_1.performance.now();
            }
            if (['completed', 'failed', 'skipped'].includes(status) && !stepProgress.endTime) {
                stepProgress.endTime = perf_hooks_1.performance.now();
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
            session.actualDuration = perf_hooks_1.performance.now() - session.startTime;
            // Move to history
            this.sessionHistory.set(sessionId, { ...session });
            this.activeSessions.delete(sessionId);
            logger_1.logger.info('Command execution completed', {
                sessionId,
                commandId: session.commandId,
                actualDuration: `${session.actualDuration.toFixed(2)}ms`,
                estimatedDuration: `${session.estimatedDuration.toFixed(2)}ms`,
            });
        }
        // Broadcast progress update
        await this.broadcastProgressUpdate(session);
        const processingTime = perf_hooks_1.performance.now() - startTime;
        this.recordBroadcastMetrics(processingTime);
        logger_1.logger.debug('Step progress updated', {
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
    async markSessionFailed(sessionId, error, failedStepId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return;
        }
        session.status = 'failed';
        session.actualDuration = perf_hooks_1.performance.now() - session.startTime;
        // Mark current step as failed if specified
        if (failedStepId) {
            const stepProgress = session.stepProgress.get(failedStepId);
            if (stepProgress) {
                stepProgress.status = 'failed';
                stepProgress.error = error;
                stepProgress.endTime = perf_hooks_1.performance.now();
            }
        }
        // Move to history
        this.sessionHistory.set(sessionId, { ...session });
        this.activeSessions.delete(sessionId);
        await this.broadcastProgressUpdate(session);
        logger_1.logger.warn('Command execution failed', {
            sessionId,
            commandId: session.commandId,
            error,
            failedStepId,
        });
    }
    /**
     * Cancel active session
     */
    async cancelSession(sessionId, reason = 'Cancelled by user') {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return;
        }
        session.status = 'cancelled';
        session.actualDuration = perf_hooks_1.performance.now() - session.startTime;
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
        logger_1.logger.info('Command execution cancelled', {
            sessionId,
            commandId: session.commandId,
            reason,
        });
    }
    /**
     * Get progress for a specific session
     */
    getSessionProgress(sessionId) {
        return this.activeSessions.get(sessionId) || this.sessionHistory.get(sessionId) || null;
    }
    /**
     * Get all active progress sessions
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Get progress sessions for a specific user
     */
    getUserSessions(userId) {
        const active = Array.from(this.activeSessions.values()).filter((session) => session.userId === userId);
        const historical = Array.from(this.sessionHistory.values())
            .filter((session) => session.userId === userId)
            .slice(-10); // Last 10 sessions
        return [...active, ...historical];
    }
    /**
     * Broadcast progress update to target users
     */
    async broadcastProgressUpdate(session) {
        const startTime = perf_hooks_1.performance.now();
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
            const processingTime = perf_hooks_1.performance.now() - startTime;
            this.emit('progress_broadcast', {
                sessionId: session.sessionId,
                targetUsers: session.targetUsers.length,
                processingTime,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to broadcast progress update', {
                sessionId: session.sessionId,
                error: error.message,
            });
        }
    }
    /**
     * Create progress update object for broadcasting
     */
    createProgressUpdate(session) {
        const steps = Array.from(session.stepProgress.values());
        const completedSteps = steps.filter((s) => s.status === 'completed').length;
        const totalProgress = session.totalSteps > 0 ? (completedSteps / session.totalSteps) * 100 : 0;
        // Find current step
        const currentStepProgress = steps.find((s) => s.status === 'running') ||
            steps.find((s) => s.status === 'pending') ||
            steps[steps.length - 1];
        // Calculate time remaining
        const elapsedTime = perf_hooks_1.performance.now() - session.startTime;
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
    isSessionComplete(session) {
        const steps = Array.from(session.stepProgress.values());
        return steps.every((step) => ['completed', 'failed', 'skipped'].includes(step.status));
    }
    /**
     * Cleanup old sessions from history
     */
    cleanupOldSessions() {
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
            logger_1.logger.debug('Cleaned up old progress sessions', { cleanedCount });
        }
    }
    /**
     * Record broadcast performance metrics
     */
    recordBroadcastMetrics(time) {
        this.broadcastMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.broadcastMetrics.length > 1000) {
            this.broadcastMetrics.shift();
        }
    }
    /**
     * Get performance statistics
     */
    getPerformanceStats() {
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
        const average = this.broadcastMetrics.reduce((sum, time) => sum + time, 0) / this.broadcastMetrics.length;
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
    destroy() {
        this.activeSessions.clear();
        this.sessionHistory.clear();
        this.broadcastMetrics.length = 0;
        this.removeAllListeners();
        logger_1.logger.info('Progress Broadcaster destroyed');
    }
}
exports.ProgressBroadcaster = ProgressBroadcaster;
//# sourceMappingURL=ProgressBroadcaster.js.map