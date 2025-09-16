"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsLogger = exports.startupLogger = exports.securityLogger = exports.performanceLogger = exports.loggers = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const index_1 = require("@config/index");
// Create logger configuration based on environment
const loggerConfig = {
    level: index_1.config.logging.level,
    formatters: {
        level: (label) => ({ level: label }),
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    ...(index_1.config.app.isDevelopment && index_1.config.logging.format === 'pretty'
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
const baseLogger = (0, pino_1.default)(loggerConfig);
// Enhanced logger with context support
exports.logger = Object.assign(baseLogger, {
    withContext: (context) => baseLogger.child(context),
});
// Specialized loggers for different components
exports.loggers = {
    // Database operations
    db: exports.logger.child({ component: 'database' }),
    // Authentication and security
    auth: exports.logger.child({ component: 'auth' }),
    // API requests and responses
    api: exports.logger.child({ component: 'api' }),
    // WebSocket real-time communication
    websocket: exports.logger.child({ component: 'websocket' }),
    // Caching operations
    cache: exports.logger.child({ component: 'cache' }),
    // Voice processing (for Phase 2)
    voice: exports.logger.child({ component: 'voice' }),
    // AI operations (for Phase 2-3)
    ai: exports.logger.child({ component: 'ai' }),
    // Command execution (for Phase 3)
    commands: exports.logger.child({ component: 'commands' }),
    // Analytics and monitoring (for Phase 4)
    analytics: exports.logger.child({ component: 'analytics' }),
    // Performance monitoring
    performance: exports.logger.child({ component: 'performance' }),
    // Security events
    security: exports.logger.child({ component: 'security' }),
};
// Performance tracking utilities
exports.performanceLogger = {
    /**
     * Track execution time of async operations
     */
    trackAsyncOperation: async (operation, operationName, context) => {
        const startTime = Date.now();
        const operationLogger = exports.logger.withContext({ operation: operationName, ...context });
        try {
            // Only log start for critical operations or when debug level is enabled
            if (index_1.config.logging.level === 'debug' || operationName.includes('migration') || operationName.includes('startup')) {
                operationLogger.debug('Operation started');
            }
            const result = await operation();
            const duration = Date.now() - startTime;
            // Only log completion for operations that take > 500ms or are critical
            if (duration > 500 || operationName.includes('migration') || operationName.includes('startup')) {
                operationLogger.info({ duration }, 'Operation completed');
            }
            else if (index_1.config.logging.level === 'debug') {
                operationLogger.debug({ duration }, 'Operation completed');
            }
            // Log performance warning if operation takes too long
            if (duration > 1000) {
                exports.loggers.performance.warn({ operation: operationName, duration }, 'Slow operation detected');
            }
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            operationLogger.error({ error, duration }, 'Operation failed');
            throw error;
        }
    },
    /**
     * Track sync operation performance
     */
    trackSyncOperation: (operation, operationName, context) => {
        const startTime = Date.now();
        const operationLogger = exports.logger.withContext({ operation: operationName, ...context });
        try {
            operationLogger.debug('Sync operation started');
            const result = operation();
            const duration = Date.now() - startTime;
            operationLogger.debug({ duration }, 'Sync operation completed');
            // Log performance warning for slow sync operations
            if (duration > 100) {
                exports.loggers.performance.warn({ operation: operationName, duration }, 'Slow sync operation');
            }
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            operationLogger.error({ error, duration }, 'Sync operation failed');
            throw error;
        }
    },
};
// Security event logging
exports.securityLogger = {
    /**
     * Log authentication events
     */
    logAuthEvent: (event, context) => {
        exports.loggers.security.info({ event, ...context }, 'Authentication event');
    },
    /**
     * Log authorization events
     */
    logAuthzEvent: (event, context) => {
        exports.loggers.security.info({ event, ...context }, 'Authorization event');
    },
    /**
     * Log security violations
     */
    logSecurityViolation: (violation, context) => {
        exports.loggers.security.error({ violation, ...context }, 'Security violation detected');
    },
};
// Startup logging utilities to reduce verbosity during initialization
exports.startupLogger = {
    /**
     * Log startup steps with grouped output
     */
    logStep: (step, status = 'starting') => {
        switch (status) {
            case 'starting':
                exports.logger.info(`📋 ${step}...`);
                break;
            case 'completed':
                exports.logger.info(`✅ ${step}`);
                break;
            case 'failed':
                exports.logger.error(`❌ ${step}`);
                break;
        }
    },
    /**
     * Log initialization summary
     */
    logSummary: (services) => {
        exports.logger.info('\n🚀 Server Initialization Summary:');
        services.forEach(service => {
            const status = service.status ? '✅' : '❌';
            const duration = service.duration ? ` (${service.duration}ms)` : '';
            exports.logger.info(`   ${status} ${service.name}${duration}`);
        });
    },
    /**
     * Create a startup timer
     */
    createTimer: (name) => {
        const start = Date.now();
        return {
            end: () => Date.now() - start,
            log: (status = 'completed') => {
                const duration = Date.now() - start;
                exports.startupLogger.logStep(`${name} (${duration}ms)`, status);
                return duration;
            }
        };
    }
};
// Utility to reduce metrics logging noise
exports.metricsLogger = {
    /**
     * Log metrics only when significant changes occur
     */
    logMetricsIfSignificant: (component, currentMetrics, previousMetrics, threshold = 0.1) => {
        if (!previousMetrics) {
            exports.loggers[component]?.info({ metrics: currentMetrics }, `${component} metrics`);
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
            exports.loggers[component]?.info({ metrics: currentMetrics }, `${component} metrics`);
        }
    }
};
// Export default logger
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map