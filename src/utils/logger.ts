import pino, { Logger } from 'pino';
import { config } from '@config/index';

// Create logger configuration based on environment
const loggerConfig = {
  level: config.logging.level,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.app.isDevelopment && config.logging.format === 'pretty'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            messageFormat: '{time} [{level}] {component}: {msg}',
            hideObject: false,
            singleLine: false,
          },
        },
      }
    : {}),
  // Reduce noise from frequent operations
  redact: {
    paths: ['password', 'token', 'secret', 'key'],
    censor: '[REDACTED]'
  },
};

// Create base logger
const baseLogger: Logger = pino(loggerConfig);

// Logger interface with context support
export interface ContextLogger extends Logger {
  withContext(context: Record<string, unknown>): Logger;
}

// Enhanced logger with context support
export const logger: ContextLogger = Object.assign(baseLogger, {
  withContext: (context: Record<string, unknown>) => baseLogger.child(context),
});

// Specialized loggers for different components
export const loggers = {
  // Database operations
  db: logger.child({ component: 'database' }),
  
  // Authentication and security
  auth: logger.child({ component: 'auth' }),
  
  // API requests and responses
  api: logger.child({ component: 'api' }),
  
  // WebSocket real-time communication
  websocket: logger.child({ component: 'websocket' }),
  
  // Caching operations
  cache: logger.child({ component: 'cache' }),
  
  // Voice processing (for Phase 2)
  voice: logger.child({ component: 'voice' }),
  
  // AI operations (for Phase 2-3)
  ai: logger.child({ component: 'ai' }),
  
  // Command execution (for Phase 3)
  commands: logger.child({ component: 'commands' }),
  
  // Analytics and monitoring (for Phase 4)
  analytics: logger.child({ component: 'analytics' }),
  
  // Performance monitoring
  performance: logger.child({ component: 'performance' }),
  
  // Security events
  security: logger.child({ component: 'security' }),
} as const;

// Performance tracking utilities
export const performanceLogger = {
  /**
   * Track execution time of async operations
   */
  trackAsyncOperation: async <T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>
  ): Promise<T> => {
    const startTime = Date.now();
    const operationLogger = logger.withContext({ operation: operationName, ...context });
    
    try {
      // Only log start for critical operations or when debug level is enabled
      if (config.logging.level === 'debug' || operationName.includes('migration') || operationName.includes('startup')) {
        operationLogger.debug('Operation started');
      }
      
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // Only log completion for operations that take > 500ms or are critical
      if (duration > 500 || operationName.includes('migration') || operationName.includes('startup')) {
        operationLogger.info({ duration }, 'Operation completed');
      } else if (config.logging.level === 'debug') {
        operationLogger.debug({ duration }, 'Operation completed');
      }
      
      // Log performance warning if operation takes too long
      if (duration > 1000) {
        loggers.performance.warn({ operation: operationName, duration }, 'Slow operation detected');
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      operationLogger.error({ error, duration }, 'Operation failed');
      throw error;
    }
  },

  /**
   * Track sync operation performance
   */
  trackSyncOperation: <T>(
    operation: () => T,
    operationName: string,
    context?: Record<string, unknown>
  ): T => {
    const startTime = Date.now();
    const operationLogger = logger.withContext({ operation: operationName, ...context });
    
    try {
      operationLogger.debug('Sync operation started');
      const result = operation();
      const duration = Date.now() - startTime;
      
      operationLogger.debug({ duration }, 'Sync operation completed');
      
      // Log performance warning for slow sync operations
      if (duration > 100) {
        loggers.performance.warn({ operation: operationName, duration }, 'Slow sync operation');
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      operationLogger.error({ error, duration }, 'Sync operation failed');
      throw error;
    }
  },
};

// Security event logging
export const securityLogger = {
  /**
   * Log authentication events
   */
  logAuthEvent: (event: 'login' | 'logout' | 'token_refresh' | 'failed_login' | 'login_attempt' | 'registration_attempt' | 'registration_success' | 'password_reset_requested' | 'password_reset' | 'email_verified' | 'token_generated' | 'token_refreshed' | 'authentication_success' | 'refresh_token_expired' | 'missing_token' | 'otp_requested', context: {
    userId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    [key: string]: unknown;
  }) => {
    loggers.security.info({ event, ...context }, 'Authentication event');
  },

  /**
   * Log authorization events
   */
  logAuthzEvent: (event: 'access_granted' | 'access_denied', context: {
    userId: string;
    resource: string;
    action: string;
    ip?: string;
    [key: string]: unknown;
  }) => {
    loggers.security.info({ event, ...context }, 'Authorization event');
  },

  /**
   * Log security violations
   */
  logSecurityViolation: (violation: string, context: Record<string, unknown>) => {
    loggers.security.error({ violation, ...context }, 'Security violation detected');
  },
};

// Startup logging utilities to reduce verbosity during initialization
export const startupLogger = {
  /**
   * Log startup steps with grouped output
   */
  logStep: (step: string, status: 'starting' | 'completed' | 'failed' = 'starting') => {
    switch (status) {
      case 'starting':
        logger.info(`📋 ${step}...`);
        break;
      case 'completed':
        logger.info(`✅ ${step}`);
        break;
      case 'failed':
        logger.error(`❌ ${step}`);
        break;
    }
  },

  /**
   * Log initialization summary
   */
  logSummary: (services: Array<{ name: string; status: boolean; duration?: number }>) => {
    logger.info('\n🚀 Server Initialization Summary:');
    services.forEach(service => {
      const status = service.status ? '✅' : '❌';
      const duration = service.duration ? ` (${service.duration}ms)` : '';
      logger.info(`   ${status} ${service.name}${duration}`);
    });
  },

  /**
   * Create a startup timer
   */
  createTimer: (name: string) => {
    const start = Date.now();
    return {
      end: () => Date.now() - start,
      log: (status: 'completed' | 'failed' = 'completed') => {
        const duration = Date.now() - start;
        startupLogger.logStep(`${name} (${duration}ms)`, status);
        return duration;
      }
    };
  }
};

// Utility to reduce metrics logging noise
export const metricsLogger = {
  /**
   * Log metrics only when significant changes occur
   */
  logMetricsIfSignificant: (
    component: string,
    currentMetrics: Record<string, any>,
    previousMetrics?: Record<string, any>,
    threshold = 0.1
  ) => {
    if (!previousMetrics) {
      loggers[component as keyof typeof loggers]?.info({ metrics: currentMetrics }, `${component} metrics`);
      return;
    }

    // Check if metrics have changed significantly
    let hasSignificantChange = false;
    for (const [key, value] of Object.entries(currentMetrics)) {
      if (typeof value === 'number' && typeof previousMetrics[key] === 'number') {
        const change = Math.abs(value - previousMetrics[key]) / (previousMetrics[key] || 1);
        if (change > threshold) {
          hasSignificantChange = true;
          break;
        }
      }
    }

    if (hasSignificantChange) {
      loggers[component as keyof typeof loggers]?.info({ metrics: currentMetrics }, `${component} metrics`);
    }
  }
};

// Export default logger
export default logger;