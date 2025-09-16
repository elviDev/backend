/**
 * Performance Monitor - Phase 2 Performance Monitoring & Analytics
 * Comprehensive performance monitoring for voice command processing
 *
 * Success Criteria:
 * - Real-time performance metrics collection
 * - Automated performance alerting
 * - Performance bottleneck identification
 * - System health monitoring
 */
import { EventEmitter } from 'events';
export interface PerformanceMetrics {
    timestamp: string;
    cpu: {
        usage: number;
        loadAverage: number[];
        cores: number;
    };
    memory: {
        used: number;
        total: number;
        usage: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
    network: {
        bytesIn: number;
        bytesOut: number;
        connectionsActive: number;
    };
    voice: {
        averageProcessingTime: number;
        p95ProcessingTime: number;
        commandsPerMinute: number;
        errorRate: number;
        successRate: number;
    };
    database: {
        activeConnections: number;
        averageQueryTime: number;
        slowQueries: number;
        connectionPoolUsage: number;
    };
    cache: {
        hitRate: number;
        averageResponseTime: number;
        memoryUsage: number;
        operationsPerSecond: number;
    };
    websocket: {
        activeConnections: number;
        messagesPerSecond: number;
        averageLatency: number;
        disconnectionRate: number;
    };
}
export interface PerformanceAlert {
    alertId: string;
    type: 'cpu' | 'memory' | 'response_time' | 'error_rate' | 'connection' | 'disk' | 'custom';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    threshold: number;
    currentValue: number;
    timestamp: string;
    resolved: boolean;
    resolvedAt?: string;
}
export interface PerformanceThresholds {
    cpu: {
        warning: number;
        critical: number;
    };
    memory: {
        warning: number;
        critical: number;
    };
    responseTime: {
        warning: number;
        critical: number;
    };
    errorRate: {
        warning: number;
        critical: number;
    };
    diskUsage: {
        warning: number;
        critical: number;
    };
}
export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
    score: number;
    checks: {
        cpu: {
            status: 'pass' | 'warn' | 'fail';
            value: number;
        };
        memory: {
            status: 'pass' | 'warn' | 'fail';
            value: number;
        };
        responseTime: {
            status: 'pass' | 'warn' | 'fail';
            value: number;
        };
        errorRate: {
            status: 'pass' | 'warn' | 'fail';
            value: number;
        };
        connectivity: {
            status: 'pass' | 'warn' | 'fail';
            value: number;
        };
    };
    lastChecked: string;
}
export declare class PerformanceMonitor extends EventEmitter {
    private metricsHistory;
    private activeAlerts;
    private performanceObserver?;
    private monitoringTimer?;
    private healthCheckTimer?;
    private readonly maxHistorySize;
    private readonly monitoringInterval;
    private readonly healthCheckInterval;
    private voiceCommandMetrics;
    private databaseQueryMetrics;
    private cacheOperationMetrics;
    private websocketMetrics;
    private networkMetrics;
    private errorCounts;
    private thresholds;
    constructor(customThresholds?: Partial<PerformanceThresholds>);
    /**
     * Setup Node.js Performance Observer
     */
    private setupPerformanceObserver;
    /**
     * Start continuous monitoring
     */
    private startMonitoring;
    /**
     * Start health checks
     */
    private startHealthChecks;
    /**
     * Collect comprehensive performance metrics
     */
    private collectMetrics;
    /**
     * Get CPU metrics
     */
    private getCPUMetrics;
    /**
     * Get memory metrics
     */
    private getMemoryMetrics;
    /**
     * Get network metrics
     */
    private getNetworkMetrics;
    /**
     * Get voice command processing metrics
     */
    private getVoiceCommandMetrics;
    /**
     * Get database metrics
     */
    private getDatabaseMetrics;
    /**
     * Get cache metrics
     */
    private getCacheMetrics;
    /**
     * Get WebSocket metrics
     */
    private getWebSocketMetrics;
    /**
     * Record custom performance metric
     */
    recordCustomMetric(name: string, value: number): void;
    /**
     * Record error event
     */
    recordError(type: 'voice' | 'database' | 'network' | 'general', details?: any): void;
    /**
     * Record network activity
     */
    recordNetworkActivity(bytesIn: number, bytesOut: number, connectionChange?: number): void;
    /**
     * Update WebSocket connection count
     */
    updateWebSocketConnections(count: number): void;
    /**
     * Analyze metrics for performance issues
     */
    private analyzeMetrics;
    /**
     * Create performance alert
     */
    private createAlert;
    /**
     * Resolve performance alert
     */
    private resolveAlert;
    /**
     * Perform comprehensive system health check
     */
    private performHealthCheck;
    /**
     * Evaluate individual metric against thresholds
     */
    private evaluateMetric;
    /**
     * Get recent performance metrics
     */
    getMetrics(limit?: number): PerformanceMetrics[];
    /**
     * Get active performance alerts
     */
    getActiveAlerts(): PerformanceAlert[];
    /**
     * Get all alerts (including resolved)
     */
    getAllAlerts(limit?: number): PerformanceAlert[];
    /**
     * Get performance summary
     */
    getPerformanceSummary(): {
        currentMetrics: PerformanceMetrics | null;
        activeAlerts: number;
        averageResponseTime24h: number;
        errorRate24h: number;
        uptime: number;
    };
    /**
     * Clean up old data and stop monitoring
     */
    destroy(): void;
}
//# sourceMappingURL=PerformanceMonitor.d.ts.map