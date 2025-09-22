"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.APIServer = void 0;
const fastify_1 = __importDefault(require("fastify"));
const index_1 = require("./config/index");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const RedisMemoryManager_1 = require("./services/RedisMemoryManager");
const SocketManager_1 = require("./websocket/SocketManager");
const logger_1 = require("./utils/logger");
const errors_1 = require("./utils/errors");
const middleware_1 = require("./auth/middleware");
const routes_1 = require("./auth/routes");
const index_2 = require("./api/index");
const migrator_1 = require("./db/migrator");
/**
 * High-Performance Fastify Server
 * Enterprise-grade API infrastructure with comprehensive monitoring
 */
class APIServer {
    app;
    httpServer = null;
    isShuttingDown = false;
    constructor() {
        this.app = (0, fastify_1.default)({
            logger: false, // We use pino directly
            requestIdLogLabel: 'requestId',
            requestIdHeader: 'x-request-id',
            bodyLimit: 1048576, // 1MB default
            keepAliveTimeout: 72000,
            connectionTimeout: 0,
            pluginTimeout: 10000,
            ignoreTrailingSlash: true,
            ignoreDuplicateSlashes: true,
            maxParamLength: 500,
            trustProxy: true,
        });
        this.setupGlobalHooks();
        this.setupHealthChecks();
    }
    /**
     * Initialize server with all plugins and routes
     */
    async initialize() {
        try {
            logger_1.logger.info('Initializing API server...');
            // Register core plugins
            await this.registerCorePlugins();
            // Register security plugins
            await this.registerSecurityPlugins();
            // Register validation and serialization
            await this.registerValidationPlugins();
            // Setup middleware
            await this.setupMiddleware();
            // Register routes
            await this.registerRoutes();
            // Setup error handling
            this.setupErrorHandling();
            logger_1.logger.info('API server initialized successfully');
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to initialize API server');
            throw error;
        }
    }
    /**
     * Register core Fastify plugins
     */
    async registerCorePlugins() {
        // CORS support
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/cors'))), {
            origin: index_1.config.api.cors.origin,
            credentials: index_1.config.api.cors.credentials,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        });
        // Helmet for security headers
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/helmet'))), {
            ...(index_1.config.app.isProduction ? {} : { contentSecurityPolicy: false }),
            crossOriginEmbedderPolicy: false,
        });
        // Request/Response compression - temporarily disabled for debugging
        // await this.app.register(import('@fastify/compress'), {
        //   global: true,
        //   encodings: ['gzip', 'deflate'],
        //   threshold: 1024,
        // });
        // Rate limiting (global)
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/rate-limit'))), {
            max: index_1.config.api.rateLimit.max,
            timeWindow: index_1.config.api.rateLimit.timeWindow,
            skipOnError: true,
            keyGenerator: (request) => {
                return request.user?.userId || request.ip;
            },
            errorResponseBuilder: () => ({
                error: {
                    message: 'Rate limit exceeded',
                    code: 'RATE_LIMIT_ERROR',
                    statusCode: 429,
                },
            }),
        });
        // Multipart support for file uploads
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/multipart'))), {
            limits: {
                fieldNameSize: 100,
                fieldSize: 1048576, // 1MB
                fields: 10,
                fileSize: 10485760, // 10MB
                files: 5,
            },
        });
        // Static file servingeb printenv
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/static'))), {
            root: require('path').join(__dirname, '..', 'public'),
            prefix: '/public/',
        });
        // Swagger/OpenAPI documentation
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/swagger'))), {
            openapi: {
                openapi: '3.0.0',
                info: {
                    title: 'CEO Communication Platform API',
                    description: 'Enterprise-grade backend API for the CEO Communication Platform with voice processing and real-time collaboration',
                    version: '1.0.0',
                    contact: {
                        name: 'CEO Communication Platform Team',
                        email: 'support@ceoplatform.com'
                    },
                    license: {
                        name: 'Private License'
                    }
                },
                servers: [
                    {
                        url: index_1.config.app.isDevelopment ? 'http://localhost:3001' : 'https://api.ceoplatform.com',
                        description: index_1.config.app.isDevelopment ? 'Development server' : 'Production server'
                    }
                ],
                components: {
                    securitySchemes: {
                        BearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT',
                            description: 'JWT token obtained from /auth/login endpoint'
                        }
                    }
                },
                security: [
                    {
                        BearerAuth: []
                    }
                ]
            }
        });
        // Swagger UI
        await this.app.register(Promise.resolve().then(() => __importStar(require('@fastify/swagger-ui'))), {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'none',
                deepLinking: false,
                defaultModelsExpandDepth: 2,
                defaultModelExpandDepth: 2,
                displayOperationId: false,
                displayRequestDuration: true,
                showExtensions: true,
                showCommonExtensions: true,
                tryItOutEnabled: true
            },
            uiHooks: {
                onRequest: function (request, reply, next) {
                    next();
                },
                preHandler: function (request, reply, next) {
                    next();
                }
            },
            staticCSP: true,
            transformStaticCSP: (header) => header
        });
        logger_1.logger.debug('Core plugins registered');
    }
    /**
     * Register security plugins
     */
    async registerSecurityPlugins() {
        // JWT authentication decorator
        this.app.decorate('authenticate', middleware_1.authenticate);
        this.app.decorate('optionalAuthenticate', middleware_1.optionalAuthenticate);
        logger_1.logger.debug('Security plugins registered');
    }
    /**
     * Register validation and serialization plugins
     */
    async registerValidationPlugins() {
        // Type providers for better TypeScript support
        this.app.addHook('onRoute', (routeOptions) => {
            if (routeOptions.schema) {
                // Add response serialization optimization
                routeOptions.serializerCompiler = ({ schema }) => {
                    return (data) => JSON.stringify(data);
                };
                // Add validation error handler
                routeOptions.validatorCompiler = ({ schema }) => {
                    return (data) => {
                        // Custom validation logic can be added here
                        return { value: data };
                    };
                };
            }
        });
        logger_1.logger.debug('Validation plugins registered');
    }
    /**
     * Setup middleware and hooks
     */
    async setupMiddleware() {
        // Performance monitoring middleware
        this.app.addHook('onRequest', async (request, reply) => {
            request.startTime = Date.now();
        });
        this.app.addHook('onSend', async (request, reply, payload) => {
            const duration = Date.now() - (request.startTime || 0);
            logger_1.loggers.performance.info({
                method: request.method,
                url: request.url,
                statusCode: reply.statusCode,
                duration,
                userId: request.user?.userId,
                ip: request.ip,
            }, 'API Request');
            // Log slow requests
            if (duration > 2000) {
                // 2 seconds threshold
                logger_1.loggers.performance.warn?.({
                    method: request.method,
                    url: request.url,
                    duration,
                    userId: request.user?.userId,
                }, 'Slow API request detected');
            }
            return payload;
        });
        // Request ID logging
        this.app.addHook('preHandler', async (request, reply) => {
            logger_1.loggers.api.info({
                requestId: request.id,
                method: request.method,
                url: request.url,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
                userId: request.user?.userId,
            }, 'Incoming request');
        });
        logger_1.logger.debug('Middleware setup complete');
    }
    /**
     * Setup global hooks
     */
    setupGlobalHooks() {
        // Graceful shutdown handling
        this.app.addHook('onClose', async () => {
            this.isShuttingDown = true;
            logger_1.logger.info('Server shutting down gracefully...');
        });
        // Health check for load balancers
        this.app.addHook('preHandler', async (request, reply) => {
            if (this.isShuttingDown) {
                reply.code(503).send({
                    error: {
                        message: 'Server is shutting down',
                        code: 'SERVER_SHUTDOWN',
                        statusCode: 503,
                    },
                });
                return;
            }
        });
    }
    /**
     * Setup health check endpoints
     */
    setupHealthChecks() {
        // Liveness probe
        this.app.get('/health', async (request, reply) => {
            if (this.isShuttingDown) {
                reply.code(503).send({ status: 'shutting_down' });
                return;
            }
            reply.send({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
            });
        });
        // Readiness probe with dependency checks
        this.app.get('/health/ready', async (request, reply) => {
            try {
                const checks = await Promise.allSettled([
                    logger_1.performanceLogger.trackAsyncOperation(() => (0, database_1.healthCheck)(), 'database_health_check'),
                    logger_1.performanceLogger.trackAsyncOperation(() => redis_1.redisManager.healthCheck(), 'redis_health_check'),
                    logger_1.performanceLogger.trackAsyncOperation(() => Promise.resolve(SocketManager_1.socketManager.getServer() !== null), 'websocket_health_check'),
                ]);
                const dbCheck = checks[0];
                const redisCheck = checks[1];
                const websocketCheck = checks[2];
                const dbHealthy = dbCheck.status === 'fulfilled' && dbCheck.value?.status === 'healthy';
                const redisHealthy = redisCheck.status === 'fulfilled' && redisCheck.value === true;
                const websocketHealthy = websocketCheck.status === 'fulfilled' && websocketCheck.value === true;
                const isReady = dbHealthy && redisHealthy && websocketHealthy;
                if (isReady) {
                    reply.send({
                        status: 'ready',
                        timestamp: new Date().toISOString(),
                        checks: {
                            database: 'healthy',
                            redis: 'healthy',
                            websocket: 'healthy',
                        },
                        metrics: {
                            connectedUsers: SocketManager_1.socketManager.getConnectedUsersCount(),
                        },
                    });
                }
                else {
                    reply.code(503).send({
                        status: 'not_ready',
                        timestamp: new Date().toISOString(),
                        checks: {
                            database: dbHealthy ? 'healthy' : 'unhealthy',
                            redis: redisHealthy ? 'healthy' : 'unhealthy',
                            websocket: websocketHealthy ? 'healthy' : 'unhealthy',
                        },
                    });
                }
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Health check failed');
                reply.code(503).send({
                    status: 'not_ready',
                    timestamp: new Date().toISOString(),
                    error: 'Health check failed',
                });
            }
        });
        // Detailed system metrics (for monitoring)
        this.app.get('/health/metrics', async (request, reply) => {
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            reply.send({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                metrics: {
                    uptime: process.uptime(),
                    memory: {
                        rss: Math.round(memoryUsage.rss / 1024 / 1024),
                        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                        external: Math.round(memoryUsage.external / 1024 / 1024),
                    },
                    cpu: {
                        user: cpuUsage.user,
                        system: cpuUsage.system,
                    },
                    node: {
                        version: process.version,
                        platform: process.platform,
                        arch: process.arch,
                    },
                },
            });
        });
        // Redis memory monitoring endpoint
        this.app.get('/health/redis-memory', async (request, reply) => {
            try {
                const memoryStats = await RedisMemoryManager_1.redisMemoryManager.getDetailedStats();
                const memoryUsage = await RedisMemoryManager_1.redisMemoryManager.getMemoryUsage();
                reply.send({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    redis: {
                        memory: {
                            used: `${(memoryUsage.used / 1024 / 1024).toFixed(2)}MB`,
                            usagePercent: `${memoryUsage.usagePercent.toFixed(1)}%`,
                            limit: `${(memoryUsage.maxMemory / 1024 / 1024).toFixed(0)}MB`,
                            available: `${((memoryUsage.maxMemory - memoryUsage.used) / 1024 / 1024).toFixed(2)}MB`
                        },
                        keys: {
                            total: memoryUsage.keyCount,
                            byNamespace: memoryStats.keysByNamespace
                        },
                        status: memoryUsage.usagePercent > 90 ? 'critical' :
                            memoryUsage.usagePercent > 80 ? 'warning' : 'healthy'
                    }
                });
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Redis memory check failed');
                reply.code(500).send({
                    status: 'error',
                    message: 'Failed to check Redis memory usage'
                });
            }
        });
    }
    /**
     * Register application routes
     */
    async registerRoutes() {
        // API versioning
        await this.app.register((fastify, opts, next) => {
            // Authentication routes (no additional auth middleware needed)
            fastify.register(routes_1.registerAuthRoutes);
            // Main API routes (all require authentication)
            fastify.register(index_2.registerAPIRoutes);
            next();
        }, { prefix: '/api/v1' });
        // Root endpoint
        this.app.get('/', async (request, reply) => {
            reply.send({
                name: 'CEO Communication Platform API',
                version: process.env.npm_package_version || '1.0.0',
                environment: index_1.config.app.env,
                timestamp: new Date().toISOString(),
            });
        });
        logger_1.logger.debug('Routes registered successfully');
    }
    /**
     * Setup centralized error handling
     */
    setupErrorHandling() {
        // Global error handler
        this.app.setErrorHandler((error, request, reply) => {
            const requestId = request.id;
            const context = {
                requestId,
                method: request.method,
                url: request.url,
                ip: request.ip,
                userId: request.user?.userId,
                userAgent: request.headers['user-agent'],
            };
            // Handle operational errors (business logic, validation, etc.)
            if (error instanceof errors_1.BaseError) {
                logger_1.loggers.api.warn({ error: error.toJSON(), ...context }, 'Operational error occurred');
                reply.code(error.statusCode).send((0, errors_1.formatErrorResponse)(error));
                return;
            }
            // Handle Fastify validation errors
            if (error.name === 'FastifyError' && typeof error.statusCode === 'number') {
                const statusCode = error.statusCode;
                logger_1.loggers.api.warn({ error: error.message, statusCode, ...context }, 'Fastify validation error');
                reply.code(statusCode).send({
                    error: {
                        message: error.message,
                        code: 'VALIDATION_ERROR',
                        statusCode,
                    },
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            // Handle unexpected errors
            logger_1.loggers.api.error({ error: error.stack, ...context }, 'Unexpected server error');
            // Don't expose internal errors in production
            const message = index_1.config.app.isProduction ? 'An internal server error occurred' : error.message;
            reply.code(500).send({
                error: {
                    message,
                    code: 'INTERNAL_SERVER_ERROR',
                    statusCode: 500,
                },
                timestamp: new Date().toISOString(),
                ...(index_1.config.app.isDevelopment && { stack: error.stack }),
            });
        });
        // Handle 404 errors
        this.app.setNotFoundHandler((request, reply) => {
            logger_1.loggers.api.warn({
                method: request.method,
                url: request.url,
                ip: request.ip,
                userId: request.user?.userId,
            }, 'Route not found');
            reply.code(404).send({
                error: {
                    message: `Route ${request.method} ${request.url} not found`,
                    code: 'ROUTE_NOT_FOUND',
                    statusCode: 404,
                },
                timestamp: new Date().toISOString(),
            });
        });
        logger_1.logger.debug('Error handling setup complete');
    }
    /**
     * Start the server
     */
    async start() {
        try {
            const overallTimer = logger_1.startupLogger.createTimer('API Server Startup');
            const services = [];
            logger_1.startupLogger.logStep('API Server Startup');
            // Initialize database
            const dbTimer = logger_1.startupLogger.createTimer('Database');
            try {
                await (0, database_1.initializeDatabase)();
                services.push({ name: 'Database', status: true, duration: dbTimer.end() });
            }
            catch (error) {
                services.push({ name: 'Database', status: false, duration: dbTimer.end() });
                throw error;
            }
            // Initialize Redis
            const redisTimer = logger_1.startupLogger.createTimer('Redis');
            try {
                await redis_1.redisManager.initialize();
                // Start Redis memory monitoring for 25MB limit
                RedisMemoryManager_1.redisMemoryManager.startMonitoring();
                services.push({ name: 'Redis', status: true, duration: redisTimer.end() });
            }
            catch (error) {
                services.push({ name: 'Redis', status: false, duration: redisTimer.end() });
                throw error;
            }
            // Initialize WebSocket server
            const wsTimer = logger_1.startupLogger.createTimer('WebSocket Server');
            try {
                // Get the HTTP server from Fastify after it starts listening
                // We'll initialize Socket.IO after the server is listening
                services.push({ name: 'WebSocket Server', status: true, duration: wsTimer.end() });
            }
            catch (error) {
                services.push({ name: 'WebSocket Server', status: false, duration: wsTimer.end() });
                throw error;
            }
            // Run migrations
            const migrationTimer = logger_1.startupLogger.createTimer('Database Migrations');
            try {
                await (0, migrator_1.runMigrations)();
                services.push({ name: 'Database Migrations', status: true, duration: migrationTimer.end() });
            }
            catch (error) {
                services.push({ name: 'Database Migrations', status: false, duration: migrationTimer.end() });
                throw error;
            }
            // Run database seeding (only in development)
            if (index_1.config.app.isDevelopment) {
                const seedTimer = logger_1.startupLogger.createTimer('Database Seeding');
                try {
                    logger_1.logger.debug('Skipping database seeding (data already exists)');
                    services.push({ name: 'Database Seeding', status: true, duration: seedTimer.end() });
                }
                catch (error) {
                    logger_1.logger.warn({ error }, 'Database seeding failed, continuing without seed data');
                    services.push({ name: 'Database Seeding', status: false, duration: seedTimer.end() });
                }
            }
            // Initialize server
            const serverTimer = logger_1.startupLogger.createTimer('Server Configuration');
            try {
                await this.initialize();
                services.push({ name: 'Server Configuration', status: true, duration: serverTimer.end() });
            }
            catch (error) {
                services.push({ name: 'Server Configuration', status: false, duration: serverTimer.end() });
                throw error;
            }
            // Start listening
            const listenTimer = logger_1.startupLogger.createTimer('Server Listen');
            try {
                // Use Fastify's built-in listen method
                const address = await this.app.listen({
                    port: index_1.config.app.port,
                    host: index_1.config.app.host,
                });
                // Now initialize Socket.IO with Fastify's server
                this.httpServer = this.app.server;
                if (this.httpServer) {
                    await SocketManager_1.socketManager.initialize(this.httpServer);
                }
                services.push({ name: 'Server Listen', status: true, duration: listenTimer.end() });
                // Log startup summary
                const totalDuration = overallTimer.end();
                services.push({ name: 'Total Startup Time', status: true, duration: totalDuration });
                logger_1.startupLogger.logSummary(services);
                logger_1.logger.info({
                    address,
                    port: index_1.config.app.port,
                    host: index_1.config.app.host,
                    environment: index_1.config.app.env,
                }, '🚀 API server running');
            }
            catch (error) {
                services.push({ name: 'Server Listen', status: false, duration: listenTimer.end() });
                throw error;
            }
            // Setup graceful shutdown
            this.setupGracefulShutdown();
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to start API server');
            throw error;
        }
    }
    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            logger_1.logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');
            this.isShuttingDown = true;
            try {
                // Stop accepting new connections
                await this.app.close();
                logger_1.logger.info('Server closed successfully');
                // Close WebSocket server
                logger_1.logger.info('Closing WebSocket server...');
                await SocketManager_1.socketManager.close();
                // Close Redis connections
                logger_1.logger.info('Closing Redis connections...');
                RedisMemoryManager_1.redisMemoryManager.stopMonitoring();
                await redis_1.redisManager.close();
                // Close HTTP server
                if (this.httpServer) {
                    this.httpServer.close();
                }
                // Exit process
                process.exit(0);
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Error during graceful shutdown');
                process.exit(1);
            }
        };
        // Handle different shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger_1.logger.fatal({ error }, 'Uncaught exception occurred');
            process.exit(1);
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.logger.fatal({ reason, promise }, 'Unhandled promise rejection');
            process.exit(1);
        });
    }
    /**
     * Get Fastify instance for testing
     */
    getApp() {
        return this.app;
    }
}
exports.APIServer = APIServer;
exports.server = new APIServer();
// Start server if this file is run directly
if (require.main === module) {
    console.log('Starting server directly...');
    exports.server.start().then(() => {
        console.log('Server started successfully, keeping process alive...');
        // Keep the process alive
        setInterval(() => {
            console.log('Server is running...', new Date().toISOString());
        }, 30000); // Log every 30 seconds
    }).catch((error) => {
        logger_1.logger.fatal({ error }, 'Failed to start server');
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map