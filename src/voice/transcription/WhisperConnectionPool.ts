/**
 * Whisper Connection Pool - Phase 2 Voice Processing
 * Pre-warmed connection pool for OpenAI Whisper API
 *
 * Success Criteria:
 * - 5 pre-warmed connections maintained
 * - Connection health monitoring
 * - Automatic connection recovery
 * - <50ms connection acquisition time
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { performance } from 'perf_hooks';
import { logger } from '../../utils/logger';

export interface PoolStats {
  totalConnections: number;
  availableConnections: number;
  activeConnections: number;
  healthyConnections: number;
  totalRequests: number;
  failedRequests: number;
  averageAcquisitionTime: number;
}

export class WhisperConnectionPool {
  private connections: AxiosInstance[] = [];
  private availableConnections: AxiosInstance[] = [];
  private activeConnections: Set<AxiosInstance> = new Set();
  private connectionHealth: Map<
    AxiosInstance,
    { healthy: boolean; lastCheck: number; failures: number }
  > = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private warmupInterval: NodeJS.Timeout | null = null;

  // Statistics
  private totalRequests = 0;
  private failedRequests = 0;
  private acquisitionTimes: number[] = [];

  constructor(private poolSize: number = 5) {
    this.initializePool();
    this.startHealthMonitoring();
    this.startConnectionWarming();

    logger.info('Whisper connection pool initialized', {
      poolSize: this.poolSize,
      apiVersion: 'v1',
    });
  }

  /**
   * Get a connection from the pool
   * Target: <50ms acquisition time
   */
  async getConnection(): Promise<AxiosInstance> {
    const startTime = performance.now();
    this.totalRequests++;

    try {
      // Try to get a healthy available connection
      const connection = await this.acquireHealthyConnection();

      const acquisitionTime = performance.now() - startTime;
      this.recordAcquisitionTime(acquisitionTime);

      // Log slow acquisition
      if (acquisitionTime > 50) {
        logger.warn('Slow connection acquisition', {
          acquisitionTime: `${acquisitionTime.toFixed(2)}ms`,
          availableConnections: this.availableConnections.length,
          activeConnections: this.activeConnections.size,
        });
      }

      // Mark as active
      this.activeConnections.add(connection);

      return connection;
    } catch (error) {
      this.failedRequests++;
      logger.error('Failed to acquire connection', {
        error: error instanceof Error ? error.message : String(error),
        availableConnections: this.availableConnections.length,
        healthyConnections: this.getHealthyConnectionCount(),
      });

      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: AxiosInstance): void {
    if (!this.connections.includes(connection)) {
      logger.warn('Attempting to release unknown connection');
      return;
    }

    // Remove from active set
    this.activeConnections.delete(connection);

    // Add back to available pool if healthy
    const health = this.connectionHealth.get(connection);
    if (health?.healthy !== false) {
      this.availableConnections.push(connection);
    }

    logger.debug('Connection released', {
      availableConnections: this.availableConnections.length,
      activeConnections: this.activeConnections.size,
    });
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const avgAcquisitionTime =
      this.acquisitionTimes.length > 0
        ? this.acquisitionTimes.reduce((sum, time) => sum + time, 0) / this.acquisitionTimes.length
        : 0;

    return {
      totalConnections: this.connections.length,
      availableConnections: this.availableConnections.length,
      activeConnections: this.activeConnections.size,
      healthyConnections: this.getHealthyConnectionCount(),
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
      averageAcquisitionTime: Math.round(avgAcquisitionTime * 100) / 100,
    };
  }

  /**
   * Force health check on all connections
   */
  async checkAllConnectionsHealth(): Promise<void> {
    logger.info('Starting manual health check for all connections');

    const healthChecks = this.connections.map((conn) => this.checkConnectionHealth(conn));
    await Promise.allSettled(healthChecks);

    const stats = this.getStats();
    logger.info('Manual health check completed', stats);
  }

  /**
   * Shut down the connection pool
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Whisper connection pool');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
    }

    // Clear all arrays and maps
    this.connections = [];
    this.availableConnections = [];
    this.activeConnections.clear();
    this.connectionHealth.clear();

    logger.info('Whisper connection pool shut down');
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const connection = this.createConnection();
      this.connections.push(connection);
      this.availableConnections.push(connection);
      this.connectionHealth.set(connection, {
        healthy: true,
        lastCheck: Date.now(),
        failures: 0,
      });
    }

    logger.debug('Connection pool initialized', {
      totalConnections: this.connections.length,
      availableConnections: this.availableConnections.length,
    });
  }

  private createConnection(): AxiosInstance {
    const connection = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 30000, // 30 second timeout for uploads
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'User-Agent': 'CEO-Platform/1.0',
        'Keep-Alive': 'timeout=30, max=100',
      },
      httpAgent: new (require('http').Agent)({
        keepAlive: true,
        maxSockets: 10,
        timeout: 30000,
      }),
      httpsAgent: new (require('https').Agent)({
        keepAlive: true,
        maxSockets: 10,
        timeout: 30000,
        rejectUnauthorized: true,
      }),
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Add request interceptor for logging
    connection.interceptors.request.use(
      (config) => {
        logger.debug('Whisper API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          timeout: config.timeout,
        });
        return config;
      },
      (error) => {
        logger.error('Whisper API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    connection.interceptors.response.use(
      (response) => {
        // Mark connection as healthy on successful response
        const health = this.connectionHealth.get(connection);
        if (health) {
          health.healthy = true;
          health.failures = 0;
          health.lastCheck = Date.now();
        }

        return response;
      },
      (error: AxiosError) => {
        // Mark connection as potentially unhealthy on error
        const health = this.connectionHealth.get(connection);
        if (health) {
          health.failures++;
          health.lastCheck = Date.now();

          // Mark as unhealthy after 3 consecutive failures
          if (health.failures >= 3) {
            health.healthy = false;
            logger.warn('Connection marked as unhealthy', {
              failures: health.failures,
              errorStatus: error.response?.status,
              errorMessage: error.message,
            });
          }
        }

        logger.error('Whisper API response error', {
          status: error.response?.status,
          message: error.message,
          code: error.code,
        });

        return Promise.reject(error);
      }
    );

    return connection;
  }

  private async acquireHealthyConnection(): Promise<AxiosInstance> {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Get next available connection
      const connection = this.availableConnections.shift();

      if (!connection) {
        // No available connections - wait for one to be released
        await this.waitForConnection();
        attempts++;
        continue;
      }

      // Check if connection is healthy
      const health = this.connectionHealth.get(connection);
      if (health?.healthy !== false) {
        return connection;
      }

      // Connection is unhealthy - try to replace it
      logger.warn('Replacing unhealthy connection');
      this.replaceConnection(connection);
      attempts++;
    }

    throw new Error('Unable to acquire healthy connection after maximum attempts');
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.availableConnections.length > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 10); // Check every 10ms

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
  }

  private replaceConnection(oldConnection: AxiosInstance): void {
    // Remove from all collections
    const connectionIndex = this.connections.indexOf(oldConnection);
    if (connectionIndex !== -1) {
      this.connections[connectionIndex] = this.createConnection();
      this.availableConnections.push(this.connections[connectionIndex]);
      this.connectionHealth.set(this.connections[connectionIndex], {
        healthy: true,
        lastCheck: Date.now(),
        failures: 0,
      });
    }

    this.connectionHealth.delete(oldConnection);
    this.activeConnections.delete(oldConnection);
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 60000); // Check every minute
  }

  private startConnectionWarming(): void {
    this.warmupInterval = setInterval(async () => {
      await this.warmupConnections();
    }, 300000); // Warm up every 5 minutes
  }

  private async performHealthCheck(): Promise<void> {
    logger.debug('Starting connection health check');

    const healthPromises = this.connections.map((conn) => this.checkConnectionHealth(conn));

    await Promise.allSettled(healthPromises);

    const stats = this.getStats();
    logger.debug('Health check completed', {
      healthyConnections: stats.healthyConnections,
      totalConnections: stats.totalConnections,
    });

    // Replace unhealthy connections
    const unhealthyConnections = this.connections.filter((conn) => {
      const health = this.connectionHealth.get(conn);
      return health?.healthy === false;
    });

    for (const conn of unhealthyConnections) {
      this.replaceConnection(conn);
    }
  }

  private async checkConnectionHealth(connection: AxiosInstance): Promise<void> {
    try {
      // Make a lightweight request to check health
      await connection.get('/models', {
        timeout: 5000,
        params: { limit: 1 },
      });

      // Mark as healthy
      const health = this.connectionHealth.get(connection);
      if (health) {
        health.healthy = true;
        health.failures = 0;
        health.lastCheck = Date.now();
      }
    } catch (error) {
      // Mark as potentially unhealthy
      const health = this.connectionHealth.get(connection);
      if (health) {
        health.failures++;
        health.lastCheck = Date.now();

        if (health.failures >= 2) {
          health.healthy = false;
          logger.warn('Connection health check failed', {
            failures: health.failures,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private async warmupConnections(): Promise<void> {
    // Warm up a subset of available connections
    const connectionsToWarm = this.availableConnections.slice(0, 2);

    const warmupPromises = connectionsToWarm.map(async (conn) => {
      try {
        await conn.get('/models', { timeout: 5000 });
        logger.debug('Connection warmed up successfully');
      } catch (error) {
        logger.warn('Connection warmup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(warmupPromises);
  }

  private getHealthyConnectionCount(): number {
    return Array.from(this.connectionHealth.values()).filter((health) => health.healthy !== false)
      .length;
  }

  private recordAcquisitionTime(time: number): void {
    this.acquisitionTimes.push(time);

    // Keep only last 100 measurements
    if (this.acquisitionTimes.length > 100) {
      this.acquisitionTimes.shift();
    }
  }
}
