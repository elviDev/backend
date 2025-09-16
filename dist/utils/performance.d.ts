/**
 * Performance monitoring and metrics collection utilities
 * Enterprise-grade performance tracking for the API
 */
export interface PerformanceMetric {
    name: string;
    duration: number;
    timestamp: number;
    context?: Record<string, unknown>;
    tags?: string[];
}
export interface MemoryMetrics {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
}
export interface CPUMetrics {
    user: number;
    system: number;
}
export declare class PerformanceMonitor {
    private static instance;
    private metrics;
    private activeTimers;
    private readonly maxMetricsPerType;
    private constructor();
    static getInstance(): PerformanceMonitor;
    /**
     * Start timing an operation
     */
    startTimer(operationName: string, context?: Record<string, unknown>): string;
    /**
     * End timing an operation and record metric
     */
    endTimer(timerId: string, tags?: string[]): PerformanceMetric | null;
    /**
     * Time a synchronous operation
     */
    timeSync<T>(operationName: string, operation: () => T, context?: Record<string, unknown>): T;
    /**
     * Time an asynchronous operation
     */
    timeAsync<T>(operationName: string, operation: () => Promise<T>, context?: Record<string, unknown>): Promise<T>;
    /**
     * Record a performance metric
     */
    recordMetric(metric: PerformanceMetric): void;
    /**
     * Get performance statistics for an operation
     */
    getStats(operationName: string): {
        count: number;
        min: number;
        max: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
    } | null;
    /**
     * Get all performance statistics
     */
    getAllStats(): Record<string, ReturnType<typeof this.getStats>>;
    /**
     * Get current memory usage
     */
    getMemoryMetrics(): MemoryMetrics;
    /**
     * Get current CPU usage
     */
    getCPUMetrics(): CPUMetrics;
    /**
     * Get comprehensive system metrics
     */
    getSystemMetrics(): {
        memory: MemoryMetrics;
        cpu: CPUMetrics;
        uptime: number;
        performance: Record<string, {
            count: number;
            min: number;
            max: number;
            avg: number;
            p50: number;
            p95: number;
            p99: number;
        } | null>;
    };
    /**
     * Clear all metrics (useful for testing)
     */
    clearMetrics(): void;
    /**
     * Log system metrics at regular intervals
     */
    startMetricsLogging(intervalMs?: number): NodeJS.Timer;
    private percentile;
    private cleanup;
}
export declare const performanceMonitor: PerformanceMonitor;
export declare function Timed(operationName?: string): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void;
export declare const createPerformanceMiddleware: () => (request: any, reply: any, next: () => void) => Promise<void>;
export default performanceMonitor;
//# sourceMappingURL=performance.d.ts.map