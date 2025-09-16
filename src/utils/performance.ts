import { performance } from 'perf_hooks';
import { logger, loggers } from './logger';

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

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private readonly maxMetricsPerType = 1000; // Prevent memory leaks

  private constructor() {
    // Start periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  startTimer(operationName: string, context?: Record<string, unknown>): string {
    const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
    this.activeTimers.set(timerId, performance.now());

    loggers.performance.debug?.(
      {
        operation: operationName,
        timerId,
        context,
      },
      'Performance timer started'
    );

    return timerId;
  }

  /**
   * End timing an operation and record metric
   */
  endTimer(timerId: string, tags?: string[]): PerformanceMetric | null {
    const startTime = this.activeTimers.get(timerId);
    if (!startTime) {
      loggers.performance.warn?.({ timerId }, 'Timer not found');
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    this.activeTimers.delete(timerId);

    const operationName = timerId.split('_')[0] || 'unknown';
    const metric: PerformanceMetric = {
      name: operationName,
      duration,
      timestamp: Date.now(),
      ...(tags && { tags }),
    };

    this.recordMetric(metric);

    loggers.performance.debug?.(
      {
        operation: operationName,
        duration,
        timerId,
        tags,
      },
      'Performance timer completed'
    );

    return metric;
  }

  /**
   * Time a synchronous operation
   */
  timeSync<T>(operationName: string, operation: () => T, context?: Record<string, unknown>): T {
    const startTime = performance.now();

    try {
      const result = operation();
      const duration = performance.now() - startTime;

      this.recordMetric({
        name: operationName,
        duration,
        timestamp: Date.now(),
        ...(context && { context }),
      });

      loggers.performance.debug?.(
        {
          operation: operationName,
          duration,
          context,
        },
        'Sync operation timed'
      );

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      loggers.performance.error(
        {
          operation: operationName,
          duration,
          error,
          context,
        },
        'Sync operation failed'
      );

      throw error;
    }
  }

  /**
   * Time an asynchronous operation
   */
  async timeAsync<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await operation();
      const duration = performance.now() - startTime;

      this.recordMetric({
        name: operationName,
        duration,
        timestamp: Date.now(),
        ...(context && { context }),
      });

      loggers.performance.debug?.(
        {
          operation: operationName,
          duration,
          context,
        },
        'Async operation timed'
      );

      // Log slow operations
      if (duration > 1000) {
        loggers.performance.warn?.(
          {
            operation: operationName,
            duration,
            context,
          },
          'Slow async operation detected'
        );
      }

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      loggers.performance.error(
        {
          operation: operationName,
          duration,
          error,
          context,
        },
        'Async operation failed'
      );

      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metrics = this.metrics.get(metric.name)!;
    metrics.push(metric);

    // Prevent memory leaks by keeping only recent metrics
    if (metrics.length > this.maxMetricsPerType) {
      metrics.splice(0, metrics.length - this.maxMetricsPerType);
    }
  }

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
  } | null {
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
  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const stats: Record<string, ReturnType<typeof this.getStats>> = {};

    for (const operationName of this.metrics.keys()) {
      stats[operationName] = this.getStats(operationName);
    }

    return stats;
  }

  /**
   * Get current memory usage
   */
  getMemoryMetrics(): MemoryMetrics {
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
  getCPUMetrics(): CPUMetrics {
    const cpuUsage = process.cpuUsage();
    return {
      user: cpuUsage.user,
      system: cpuUsage.system,
    };
  }

  /**
   * Get comprehensive system metrics
   */
  getSystemMetrics(): {
    memory: MemoryMetrics;
    cpu: CPUMetrics;
    uptime: number;
    performance: Record<
      string,
      {
        count: number;
        min: number;
        max: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
      } | null
    >;
  } {
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
  clearMetrics(): void {
    this.metrics.clear();
    this.activeTimers.clear();
  }

  /**
   * Log system metrics at regular intervals
   */
  startMetricsLogging(intervalMs: number = 30000): NodeJS.Timer {
    return setInterval(() => {
      const metrics = this.getSystemMetrics();

      loggers.performance.info(
        {
          memory: metrics.memory,
          cpu: metrics.cpu,
          uptime: metrics.uptime,
          activeTimers: this.activeTimers.size,
          metricsCount: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
        },
        'System metrics snapshot'
      );

      // Log performance warnings
      if (metrics.memory.heapUsed > 512) {
        // More than 512MB
        loggers.performance.warn(
          {
            heapUsed: metrics.memory.heapUsed,
          },
          'High memory usage detected'
        );
      }
    }, intervalMs);
  }

  private percentile(sortedArray: number[], percentile: number): number {
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

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [operationName, metrics] of this.metrics.entries()) {
      const validMetrics = metrics.filter((metric) => now - metric.timestamp < maxAge);

      if (validMetrics.length === 0) {
        this.metrics.delete(operationName);
      } else if (validMetrics.length !== metrics.length) {
        this.metrics.set(operationName, validMetrics);
      }
    }

    // Clean up orphaned timers (older than 1 hour)
    for (const [timerId, startTime] of this.activeTimers.entries()) {
      if (performance.now() - startTime > 3600000) {
        // 1 hour
        this.activeTimers.delete(timerId);
        loggers.performance.warn({ timerId }, 'Orphaned timer cleaned up');
      }
    }
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Decorator for timing class methods
export function Timed(operationName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      return await performanceMonitor.timeAsync(opName, () => method.apply(this, args), {
        className: target.constructor.name,
        methodName: propertyName,
      });
    };
  };
}

// Utility functions
export const createPerformanceMiddleware = () => {
  return async (request: any, reply: any, next: () => void) => {
    const timerId = performanceMonitor.startTimer('api_request', {
      method: request.method,
      url: request.url,
      userId: request.user?.userId,
    });

    try {
      await next();
    } finally {
      const metric = performanceMonitor.endTimer(timerId, ['api', 'request']);

      if (metric && metric.duration > 2000) {
        // Log slow requests (>2s)
        loggers.performance.warn(
          {
            method: request.method,
            url: request.url,
            duration: metric.duration,
            userId: request.user?.userId,
          },
          'Slow API request detected'
        );
      }
    }
  };
};

// Export performance monitoring utilities
export default performanceMonitor;
