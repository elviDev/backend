"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPerformanceMiddleware = exports.performanceMonitor = exports.PerformanceMonitor = void 0;
exports.Timed = Timed;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("./logger");
class PerformanceMonitor {
    static instance;
    metrics = new Map();
    activeTimers = new Map();
    maxMetricsPerType = 1000; // Prevent memory leaks
    constructor() {
        // Start periodic cleanup
        setInterval(() => this.cleanup(), 60000); // Every minute
    }
    static getInstance() {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }
    /**
     * Start timing an operation
     */
    startTimer(operationName, context) {
        const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
        this.activeTimers.set(timerId, perf_hooks_1.performance.now());
        logger_1.loggers.performance.debug?.({
            operation: operationName,
            timerId,
            context,
        }, 'Performance timer started');
        return timerId;
    }
    /**
     * End timing an operation and record metric
     */
    endTimer(timerId, tags) {
        const startTime = this.activeTimers.get(timerId);
        if (!startTime) {
            logger_1.loggers.performance.warn?.({ timerId }, 'Timer not found');
            return null;
        }
        const endTime = perf_hooks_1.performance.now();
        const duration = endTime - startTime;
        this.activeTimers.delete(timerId);
        const operationName = timerId.split('_')[0] || 'unknown';
        const metric = {
            name: operationName,
            duration,
            timestamp: Date.now(),
            ...(tags && { tags }),
        };
        this.recordMetric(metric);
        logger_1.loggers.performance.debug?.({
            operation: operationName,
            duration,
            timerId,
            tags,
        }, 'Performance timer completed');
        return metric;
    }
    /**
     * Time a synchronous operation
     */
    timeSync(operationName, operation, context) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const result = operation();
            const duration = perf_hooks_1.performance.now() - startTime;
            this.recordMetric({
                name: operationName,
                duration,
                timestamp: Date.now(),
                ...(context && { context }),
            });
            logger_1.loggers.performance.debug?.({
                operation: operationName,
                duration,
                context,
            }, 'Sync operation timed');
            return result;
        }
        catch (error) {
            const duration = perf_hooks_1.performance.now() - startTime;
            logger_1.loggers.performance.error({
                operation: operationName,
                duration,
                error,
                context,
            }, 'Sync operation failed');
            throw error;
        }
    }
    /**
     * Time an asynchronous operation
     */
    async timeAsync(operationName, operation, context) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const result = await operation();
            const duration = perf_hooks_1.performance.now() - startTime;
            this.recordMetric({
                name: operationName,
                duration,
                timestamp: Date.now(),
                ...(context && { context }),
            });
            logger_1.loggers.performance.debug?.({
                operation: operationName,
                duration,
                context,
            }, 'Async operation timed');
            // Log slow operations
            if (duration > 1000) {
                logger_1.loggers.performance.warn?.({
                    operation: operationName,
                    duration,
                    context,
                }, 'Slow async operation detected');
            }
            return result;
        }
        catch (error) {
            const duration = perf_hooks_1.performance.now() - startTime;
            logger_1.loggers.performance.error({
                operation: operationName,
                duration,
                error,
                context,
            }, 'Async operation failed');
            throw error;
        }
    }
    /**
     * Record a performance metric
     */
    recordMetric(metric) {
        if (!this.metrics.has(metric.name)) {
            this.metrics.set(metric.name, []);
        }
        const metrics = this.metrics.get(metric.name);
        metrics.push(metric);
        // Prevent memory leaks by keeping only recent metrics
        if (metrics.length > this.maxMetricsPerType) {
            metrics.splice(0, metrics.length - this.maxMetricsPerType);
        }
    }
    /**
     * Get performance statistics for an operation
     */
    getStats(operationName) {
        const metrics = this.metrics.get(operationName);
        if (!metrics || metrics.length === 0) {
            return null;
        }
        const durations = metrics.map((m) => m.duration).sort((a, b) => a - b);
        const count = durations.length;
        return {
            count,
            min: durations[0] ?? 0,
            max: durations[count - 1] ?? 0,
            avg: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / count : 0,
            p50: durations.length > 0 ? this.percentile(durations, 50) : 0,
            p95: durations.length > 0 ? this.percentile(durations, 95) : 0,
            p99: durations.length > 0 ? this.percentile(durations, 99) : 0,
        };
    }
    /**
     * Get all performance statistics
     */
    getAllStats() {
        const stats = {};
        for (const operationName of this.metrics.keys()) {
            stats[operationName] = this.getStats(operationName);
        }
        return stats;
    }
    /**
     * Get current memory usage
     */
    getMemoryMetrics() {
        const memUsage = process.memoryUsage();
        return {
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
            arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
        };
    }
    /**
     * Get current CPU usage
     */
    getCPUMetrics() {
        const cpuUsage = process.cpuUsage();
        return {
            user: cpuUsage.user,
            system: cpuUsage.system,
        };
    }
    /**
     * Get comprehensive system metrics
     */
    getSystemMetrics() {
        return {
            memory: this.getMemoryMetrics(),
            cpu: this.getCPUMetrics(),
            uptime: process.uptime(),
            performance: this.getAllStats(),
        };
    }
    /**
     * Clear all metrics (useful for testing)
     */
    clearMetrics() {
        this.metrics.clear();
        this.activeTimers.clear();
    }
    /**
     * Log system metrics at regular intervals
     */
    startMetricsLogging(intervalMs = 30000) {
        return setInterval(() => {
            const metrics = this.getSystemMetrics();
            logger_1.loggers.performance.info({
                memory: metrics.memory,
                cpu: metrics.cpu,
                uptime: metrics.uptime,
                activeTimers: this.activeTimers.size,
                metricsCount: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
            }, 'System metrics snapshot');
            // Log performance warnings
            if (metrics.memory.heapUsed > 512) {
                // More than 512MB
                logger_1.loggers.performance.warn({
                    heapUsed: metrics.memory.heapUsed,
                }, 'High memory usage detected');
            }
        }, intervalMs);
    }
    percentile(sortedArray, percentile) {
        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;
        if (lower === upper) {
            return sortedArray[lower] ?? 0;
        }
        const lowerValue = sortedArray[lower] ?? 0;
        const upperValue = sortedArray[upper] ?? 0;
        return lowerValue * (1 - weight) + upperValue * weight;
    }
    cleanup() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        for (const [operationName, metrics] of this.metrics.entries()) {
            const validMetrics = metrics.filter((metric) => now - metric.timestamp < maxAge);
            if (validMetrics.length === 0) {
                this.metrics.delete(operationName);
            }
            else if (validMetrics.length !== metrics.length) {
                this.metrics.set(operationName, validMetrics);
            }
        }
        // Clean up orphaned timers (older than 1 hour)
        for (const [timerId, startTime] of this.activeTimers.entries()) {
            if (perf_hooks_1.performance.now() - startTime > 3600000) {
                // 1 hour
                this.activeTimers.delete(timerId);
                logger_1.loggers.performance.warn({ timerId }, 'Orphaned timer cleaned up');
            }
        }
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
// Export singleton instance
exports.performanceMonitor = PerformanceMonitor.getInstance();
// Decorator for timing class methods
function Timed(operationName) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const opName = operationName || `${target.constructor.name}.${propertyName}`;
        descriptor.value = async function (...args) {
            return await exports.performanceMonitor.timeAsync(opName, () => method.apply(this, args), {
                className: target.constructor.name,
                methodName: propertyName,
            });
        };
    };
}
// Utility functions
const createPerformanceMiddleware = () => {
    return async (request, reply, next) => {
        const timerId = exports.performanceMonitor.startTimer('api_request', {
            method: request.method,
            url: request.url,
            userId: request.user?.userId,
        });
        try {
            await next();
        }
        finally {
            const metric = exports.performanceMonitor.endTimer(timerId, ['api', 'request']);
            if (metric && metric.duration > 2000) {
                // Log slow requests (>2s)
                logger_1.loggers.performance.warn({
                    method: request.method,
                    url: request.url,
                    duration: metric.duration,
                    userId: request.user?.userId,
                }, 'Slow API request detected');
            }
        }
    };
};
exports.createPerformanceMiddleware = createPerformanceMiddleware;
// Export performance monitoring utilities
exports.default = exports.performanceMonitor;
//# sourceMappingURL=performance.js.map