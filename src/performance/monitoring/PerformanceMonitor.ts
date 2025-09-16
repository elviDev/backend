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
import { performance, PerformanceObserver } from 'perf_hooks';
import os from 'os';
import process from 'process';
import { logger } from '../../utils/logger';

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
  cpu: { warning: number; critical: number };
  memory: { warning: number; critical: number };
  responseTime: { warning: number; critical: number };
  errorRate: { warning: number; critical: number };
  diskUsage: { warning: number; critical: number };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number; // 0-100
  checks: {
    cpu: { status: 'pass' | 'warn' | 'fail'; value: number };
    memory: { status: 'pass' | 'warn' | 'fail'; value: number };
    responseTime: { status: 'pass' | 'warn' | 'fail'; value: number };
    errorRate: { status: 'pass' | 'warn' | 'fail'; value: number };
    connectivity: { status: 'pass' | 'warn' | 'fail'; value: number };
  };
  lastChecked: string;
}

export class PerformanceMonitor extends EventEmitter {
  private metricsHistory: PerformanceMetrics[] = [];
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private performanceObserver?: PerformanceObserver;
  private monitoringTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private readonly maxHistorySize = 1440; // 24 hours at 1-minute intervals
  private readonly monitoringInterval = 60000; // 1 minute
  private readonly healthCheckInterval = 30000; // 30 seconds

  // Performance tracking maps
  private voiceCommandMetrics: number[] = [];
  private databaseQueryMetrics: number[] = [];
  private cacheOperationMetrics: number[] = [];
  private websocketMetrics: { latency: number[]; connections: number } = {
    latency: [],
    connections: 0,
  };
  private networkMetrics = { bytesIn: 0, bytesOut: 0, connections: 0 };
  private errorCounts = { total: 0, voice: 0, database: 0, network: 0, general: 0 };

  private thresholds: PerformanceThresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    responseTime: { warning: 1000, critical: 3000 },
    errorRate: { warning: 5, critical: 10 },
    diskUsage: { warning: 80, critical: 95 },
  };

  constructor(customThresholds?: Partial<PerformanceThresholds>) {
    super();

    if (customThresholds) {
      this.thresholds = { ...this.thresholds, ...customThresholds };
    }

    this.setupPerformanceObserver();
    this.startMonitoring();
    this.startHealthChecks();

    logger.info('Performance Monitor initialized', {
      monitoringInterval: `${this.monitoringInterval / 1000}s`,
      healthCheckInterval: `${this.healthCheckInterval / 1000}s`,
      thresholds: this.thresholds,
    });
  }

  /**
   * Setup Node.js Performance Observer
   */
  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();

      for (const entry of entries) {
        if (entry.entryType === 'measure') {
          this.recordCustomMetric(entry.name, entry.duration);
        }
      }
    });

    this.performanceObserver.observe({ entryTypes: ['measure', 'resource'] });
  }

  /**
   * Start continuous monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.monitoringInterval);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Collect comprehensive performance metrics
   */
  private async collectMetrics(): Promise<void> {
    const startTime = performance.now();

    try {
      const metrics: PerformanceMetrics = {
        timestamp: new Date().toISOString(),
        cpu: await this.getCPUMetrics(),
        memory: this.getMemoryMetrics(),
        network: this.getNetworkMetrics(),
        voice: this.getVoiceCommandMetrics(),
        database: this.getDatabaseMetrics(),
        cache: this.getCacheMetrics(),
        websocket: this.getWebSocketMetrics(),
      };

      // Add to history
      this.metricsHistory.push(metrics);

      // Trim history if too large
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory.shift();
      }

      // Check for performance issues
      await this.analyzeMetrics(metrics);

      const collectionTime = performance.now() - startTime;

      logger.debug('Performance metrics collected', {
        collectionTime: `${collectionTime.toFixed(2)}ms`,
        cpuUsage: `${metrics.cpu.usage.toFixed(1)}%`,
        memoryUsage: `${metrics.memory.usage.toFixed(1)}%`,
        voiceCommandsPerMin: metrics.voice.commandsPerMinute,
      });

      this.emit('metrics_collected', metrics);
    } catch (error: any) {
      logger.error('Error collecting performance metrics', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get CPU metrics
   */
  private async getCPUMetrics(): Promise<PerformanceMetrics['cpu']> {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Calculate CPU usage (simplified)
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const usage = 100 - Math.floor((totalIdle / totalTick) * 100);

    return {
      usage,
      loadAverage,
      cores: cpus.length,
    };
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics(): PerformanceMetrics['memory'] {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    const heapStats = process.memoryUsage();

    return {
      used: usedMemory,
      total: totalMemory,
      usage: memoryUsage,
      heapUsed: heapStats.heapUsed,
      heapTotal: heapStats.heapTotal,
      external: heapStats.external,
    };
  }

  /**
   * Get network metrics
   */
  private getNetworkMetrics(): PerformanceMetrics['network'] {
    return {
      bytesIn: this.networkMetrics.bytesIn,
      bytesOut: this.networkMetrics.bytesOut,
      connectionsActive: this.networkMetrics.connections,
    };
  }

  /**
   * Get voice command processing metrics
   */
  private getVoiceCommandMetrics(): PerformanceMetrics['voice'] {
    if (this.voiceCommandMetrics.length === 0) {
      return {
        averageProcessingTime: 0,
        p95ProcessingTime: 0,
        commandsPerMinute: 0,
        errorRate: 0,
        successRate: 100,
      };
    }

    const sorted = [...this.voiceCommandMetrics].sort((a, b) => a - b);
    const average =
      this.voiceCommandMetrics.reduce((sum, time) => sum + time, 0) /
      this.voiceCommandMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

    const commandsPerMinute = this.voiceCommandMetrics.length; // Metrics collected per minute
    const errorRate =
      this.errorCounts.voice > 0
        ? (this.errorCounts.voice / this.voiceCommandMetrics.length) * 100
        : 0;
    const successRate = 100 - errorRate;

    return {
      averageProcessingTime: Math.round(average * 100) / 100,
      p95ProcessingTime: Math.round(p95 * 100) / 100,
      commandsPerMinute,
      errorRate: Math.round(errorRate * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get database metrics
   */
  private getDatabaseMetrics(): PerformanceMetrics['database'] {
    const averageQueryTime =
      this.databaseQueryMetrics.length > 0
        ? this.databaseQueryMetrics.reduce((sum, time) => sum + time, 0) /
          this.databaseQueryMetrics.length
        : 0;

    const slowQueries = this.databaseQueryMetrics.filter((time) => time > 1000).length;

    return {
      activeConnections: 0, // Would be populated by database pool
      averageQueryTime: Math.round(averageQueryTime * 100) / 100,
      slowQueries,
      connectionPoolUsage: 0, // Would be calculated from pool stats
    };
  }

  /**
   * Get cache metrics
   */
  private getCacheMetrics(): PerformanceMetrics['cache'] {
    const averageResponseTime =
      this.cacheOperationMetrics.length > 0
        ? this.cacheOperationMetrics.reduce((sum, time) => sum + time, 0) /
          this.cacheOperationMetrics.length
        : 0;

    return {
      hitRate: 90, // Would be populated by cache manager
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      memoryUsage: 0, // Would be populated by cache manager
      operationsPerSecond: this.cacheOperationMetrics.length,
    };
  }

  /**
   * Get WebSocket metrics
   */
  private getWebSocketMetrics(): PerformanceMetrics['websocket'] {
    const averageLatency =
      this.websocketMetrics.latency.length > 0
        ? this.websocketMetrics.latency.reduce((sum, time) => sum + time, 0) /
          this.websocketMetrics.latency.length
        : 0;

    return {
      activeConnections: this.websocketMetrics.connections,
      messagesPerSecond: 0, // Would be calculated from message counts
      averageLatency: Math.round(averageLatency * 100) / 100,
      disconnectionRate: 0, // Would be calculated from disconnection events
    };
  }

  /**
   * Record custom performance metric
   */
  recordCustomMetric(name: string, value: number): void {
    switch (name) {
      case 'voice_command_processing':
        this.voiceCommandMetrics.push(value);
        if (this.voiceCommandMetrics.length > 1000) {
          this.voiceCommandMetrics.shift();
        }
        break;

      case 'database_query':
        this.databaseQueryMetrics.push(value);
        if (this.databaseQueryMetrics.length > 1000) {
          this.databaseQueryMetrics.shift();
        }
        break;

      case 'cache_operation':
        this.cacheOperationMetrics.push(value);
        if (this.cacheOperationMetrics.length > 1000) {
          this.cacheOperationMetrics.shift();
        }
        break;

      case 'websocket_latency':
        this.websocketMetrics.latency.push(value);
        if (this.websocketMetrics.latency.length > 1000) {
          this.websocketMetrics.latency.shift();
        }
        break;
    }

    logger.debug('Performance metric recorded', {
      name,
      value: `${value.toFixed(2)}ms`,
    });
  }

  /**
   * Record error event
   */
  recordError(type: 'voice' | 'database' | 'network' | 'general', details?: any): void {
    this.errorCounts.total++;
    this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;

    logger.debug('Error recorded for performance monitoring', {
      type,
      totalErrors: this.errorCounts.total,
      typeErrors: this.errorCounts[type],
    });
  }

  /**
   * Record network activity
   */
  recordNetworkActivity(bytesIn: number, bytesOut: number, connectionChange: number = 0): void {
    this.networkMetrics.bytesIn += bytesIn;
    this.networkMetrics.bytesOut += bytesOut;
    this.networkMetrics.connections += connectionChange;
  }

  /**
   * Update WebSocket connection count
   */
  updateWebSocketConnections(count: number): void {
    this.websocketMetrics.connections = count;
  }

  /**
   * Analyze metrics for performance issues
   */
  private async analyzeMetrics(metrics: PerformanceMetrics): Promise<void> {
    // CPU usage check
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      await this.createAlert(
        'cpu',
        'critical',
        'Critical CPU Usage',
        `CPU usage is at ${metrics.cpu.usage.toFixed(1)}%`,
        this.thresholds.cpu.critical,
        metrics.cpu.usage
      );
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      await this.createAlert(
        'cpu',
        'medium',
        'High CPU Usage',
        `CPU usage is at ${metrics.cpu.usage.toFixed(1)}%`,
        this.thresholds.cpu.warning,
        metrics.cpu.usage
      );
    } else {
      await this.resolveAlert('cpu');
    }

    // Memory usage check
    if (metrics.memory.usage > this.thresholds.memory.critical) {
      await this.createAlert(
        'memory',
        'critical',
        'Critical Memory Usage',
        `Memory usage is at ${metrics.memory.usage.toFixed(1)}%`,
        this.thresholds.memory.critical,
        metrics.memory.usage
      );
    } else if (metrics.memory.usage > this.thresholds.memory.warning) {
      await this.createAlert(
        'memory',
        'medium',
        'High Memory Usage',
        `Memory usage is at ${metrics.memory.usage.toFixed(1)}%`,
        this.thresholds.memory.warning,
        metrics.memory.usage
      );
    } else {
      await this.resolveAlert('memory');
    }

    // Response time check
    if (metrics.voice.averageProcessingTime > this.thresholds.responseTime.critical) {
      await this.createAlert(
        'response_time',
        'critical',
        'Critical Response Time',
        `Voice command processing time is ${metrics.voice.averageProcessingTime.toFixed(2)}ms`,
        this.thresholds.responseTime.critical,
        metrics.voice.averageProcessingTime
      );
    } else if (metrics.voice.averageProcessingTime > this.thresholds.responseTime.warning) {
      await this.createAlert(
        'response_time',
        'medium',
        'High Response Time',
        `Voice command processing time is ${metrics.voice.averageProcessingTime.toFixed(2)}ms`,
        this.thresholds.responseTime.warning,
        metrics.voice.averageProcessingTime
      );
    } else {
      await this.resolveAlert('response_time');
    }

    // Error rate check
    if (metrics.voice.errorRate > this.thresholds.errorRate.critical) {
      await this.createAlert(
        'error_rate',
        'critical',
        'Critical Error Rate',
        `Voice command error rate is ${metrics.voice.errorRate.toFixed(1)}%`,
        this.thresholds.errorRate.critical,
        metrics.voice.errorRate
      );
    } else if (metrics.voice.errorRate > this.thresholds.errorRate.warning) {
      await this.createAlert(
        'error_rate',
        'medium',
        'High Error Rate',
        `Voice command error rate is ${metrics.voice.errorRate.toFixed(1)}%`,
        this.thresholds.errorRate.warning,
        metrics.voice.errorRate
      );
    } else {
      await this.resolveAlert('error_rate');
    }
  }

  /**
   * Create performance alert
   */
  private async createAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    title: string,
    message: string,
    threshold: number,
    currentValue: number
  ): Promise<void> {
    // Check if alert already exists
    const existingAlert = this.activeAlerts.get(type);
    if (existingAlert && !existingAlert.resolved) {
      // Update existing alert
      existingAlert.currentValue = currentValue;
      existingAlert.timestamp = new Date().toISOString();
      return;
    }

    const alert: PerformanceAlert = {
      alertId: `alert_${type}_${Date.now()}`,
      type,
      severity,
      title,
      message,
      threshold,
      currentValue,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.activeAlerts.set(type, alert);

    logger.warn('Performance alert created', {
      alertId: alert.alertId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      currentValue,
      threshold,
    });

    this.emit('performance_alert', alert);
  }

  /**
   * Resolve performance alert
   */
  private async resolveAlert(type: PerformanceAlert['type']): Promise<void> {
    const alert = this.activeAlerts.get(type);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();

      logger.info('Performance alert resolved', {
        alertId: alert.alertId,
        type: alert.type,
        resolvedAt: alert.resolvedAt,
      });

      this.emit('performance_alert_resolved', alert);
    }
  }

  /**
   * Perform comprehensive system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
      if (!latestMetrics) return;

      const health: SystemHealth = {
        status: 'healthy',
        score: 100,
        checks: {
          cpu: this.evaluateMetric(latestMetrics.cpu.usage, this.thresholds.cpu),
          memory: this.evaluateMetric(latestMetrics.memory.usage, this.thresholds.memory),
          responseTime: this.evaluateMetric(
            latestMetrics.voice.averageProcessingTime,
            this.thresholds.responseTime
          ),
          errorRate: this.evaluateMetric(latestMetrics.voice.errorRate, this.thresholds.errorRate),
          connectivity: { status: 'pass', value: latestMetrics.websocket.activeConnections },
        },
        lastChecked: new Date().toISOString(),
      };

      // Calculate overall health score
      let totalScore = 0;
      let checkCount = 0;

      for (const [key, check] of Object.entries(health.checks)) {
        checkCount++;
        if (check.status === 'pass') {
          totalScore += 100;
        } else if (check.status === 'warn') {
          totalScore += 70;
        } else {
          totalScore += 30;
        }
      }

      health.score = Math.round(totalScore / checkCount);

      // Determine overall status
      if (health.score >= 90) {
        health.status = 'healthy';
      } else if (health.score >= 70) {
        health.status = 'degraded';
      } else if (health.score >= 50) {
        health.status = 'unhealthy';
      } else {
        health.status = 'critical';
      }

      this.emit('health_check', health);
    } catch (error: any) {
      logger.error('Health check failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Evaluate individual metric against thresholds
   */
  private evaluateMetric(
    value: number,
    thresholds: { warning: number; critical: number }
  ): {
    status: 'pass' | 'warn' | 'fail';
    value: number;
  } {
    if (value >= thresholds.critical) {
      return { status: 'fail', value };
    } else if (value >= thresholds.warning) {
      return { status: 'warn', value };
    } else {
      return { status: 'pass', value };
    }
  }

  /**
   * Get recent performance metrics
   */
  getMetrics(limit?: number): PerformanceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values()).filter((alert) => !alert.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(limit?: number): PerformanceAlert[] {
    const alerts = Array.from(this.activeAlerts.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return limit ? alerts.slice(0, limit) : alerts;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    currentMetrics: PerformanceMetrics | null;
    activeAlerts: number;
    averageResponseTime24h: number;
    errorRate24h: number;
    uptime: number;
  } {
    const currentMetrics = this.metricsHistory[this.metricsHistory.length - 1] || null;
    const activeAlerts = this.getActiveAlerts().length;

    // Calculate 24h averages
    const last24h = this.metricsHistory.slice(-1440); // Last 24 hours
    const averageResponseTime24h =
      last24h.length > 0
        ? last24h.reduce((sum, m) => sum + m.voice.averageProcessingTime, 0) / last24h.length
        : 0;

    const errorRate24h =
      last24h.length > 0
        ? last24h.reduce((sum, m) => sum + m.voice.errorRate, 0) / last24h.length
        : 0;

    return {
      currentMetrics,
      activeAlerts,
      averageResponseTime24h: Math.round(averageResponseTime24h * 100) / 100,
      errorRate24h: Math.round(errorRate24h * 100) / 100,
      uptime: process.uptime(),
    };
  }

  /**
   * Clean up old data and stop monitoring
   */
  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    this.removeAllListeners();

    logger.info('Performance Monitor destroyed');
  }
}
