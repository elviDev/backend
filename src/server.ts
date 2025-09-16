import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config/index';
import { initializeDatabase, healthCheck as dbHealthCheck } from './config/database';
import { redisManager } from './config/redis';
import { redisMemoryManager } from './services/RedisMemoryManager';
import { socketManager } from './websocket/SocketManager';
import { logger, performanceLogger, loggers, startupLogger } from './utils/logger';
import {
  BaseError,
  formatErrorResponse,
  isOperationalError,
  ConfigurationError,
} from './utils/errors';
import { authenticate, optionalAuthenticate } from './auth/middleware';
import { registerAuthRoutes } from './auth/routes';
import { registerAPIRoutes } from './api/index';
import { runMigrations } from './db/migrator';
import { createServer } from 'http';
import { TokenPayload } from './auth/jwt';

/**
 * High-Performance Fastify Server
 * Enterprise-grade API infrastructure with comprehensive monitoring
 */

class APIServer {
  private app: FastifyInstance;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = Fastify({
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
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing API server...');

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

      logger.info('API server initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize API server');
      throw error;
    }
  }

  /**
   * Register core Fastify plugins
   */
  private async registerCorePlugins(): Promise<void> {
    // CORS support
    await this.app.register(import('@fastify/cors'), {
      origin: config.api.cors.origin,
      credentials: config.api.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    });

    // Helmet for security headers
    await this.app.register(import('@fastify/helmet'), {
      ...(config.app.isProduction ? {} : { contentSecurityPolicy: false }),
      crossOriginEmbedderPolicy: false,
    });

    // Request/Response compression - temporarily disabled for debugging
    // await this.app.register(import('@fastify/compress'), {
    //   global: true,
    //   encodings: ['gzip', 'deflate'],
    //   threshold: 1024,
    // });

    // Rate limiting (global)
    await this.app.register(import('@fastify/rate-limit'), {
      max: config.api.rateLimit.max,
      timeWindow: config.api.rateLimit.timeWindow,
      skipOnError: true,
      keyGenerator: (request: FastifyRequest) => {
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
    await this.app.register(import('@fastify/multipart'), {
      limits: {
        fieldNameSize: 100,
        fieldSize: 1048576, // 1MB
        fields: 10,
        fileSize: 10485760, // 10MB
        files: 5,
      },
    });

    // Static file servingeb printenv
    await this.app.register(import('@fastify/static'), {
      root: require('path').join(__dirname, '..', 'public'),
      prefix: '/public/',
    });

    // Swagger/OpenAPI documentation
    await this.app.register(import('@fastify/swagger'), {
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
            url: config.app.isDevelopment ? 'http://localhost:3001' : 'https://api.ceoplatform.com',
            description: config.app.isDevelopment ? 'Development server' : 'Production server'
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
    await this.app.register(import('@fastify/swagger-ui'), {
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

    logger.debug('Core plugins registered');
  }

  /**
   * Register security plugins
   */
  private async registerSecurityPlugins(): Promise<void> {
    // JWT authentication decorator
    this.app.decorate('authenticate', authenticate);
    this.app.decorate('optionalAuthenticate', optionalAuthenticate);

    logger.debug('Security plugins registered');
  }

  /**
   * Register validation and serialization plugins
   */
  private async registerValidationPlugins(): Promise<void> {
    // Type providers for better TypeScript support
    this.app.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema) {
        // Add response serialization optimization
        routeOptions.serializerCompiler = ({ schema }) => {
          return (data: unknown) => JSON.stringify(data);
        };

        // Add validation error handler
        routeOptions.validatorCompiler = ({ schema }) => {
          return (data: unknown) => {
            // Custom validation logic can be added here
            return { value: data };
          };
        };
      }
    });

    logger.debug('Validation plugins registered');
  }

  /**
   * Setup middleware and hooks
   */
  private async setupMiddleware(): Promise<void> {
    // Performance monitoring middleware
    this.app.addHook('onRequest', async (request, reply) => {
      request.startTime = Date.now();
    });

    this.app.addHook('onSend', async (request, reply, payload) => {
      const duration = Date.now() - (request.startTime || 0);

      loggers.performance.info(
        {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          duration,
          userId: request.user?.userId,
          ip: request.ip,
        },
        'API Request'
      );

      // Log slow requests
      if (duration > 2000) {
        // 2 seconds threshold
        loggers.performance.warn?.(
          {
            method: request.method,
            url: request.url,
            duration,
            userId: request.user?.userId,
          },
          'Slow API request detected'
        );
      }

      return payload;
    });

    // Request ID logging
    this.app.addHook('preHandler', async (request, reply) => {
      loggers.api.info(
        {
          requestId: request.id,
          method: request.method,
          url: request.url,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          userId: request.user?.userId,
        },
        'Incoming request'
      );
    });

    logger.debug('Middleware setup complete');
  }

  /**
   * Setup global hooks
   */
  private setupGlobalHooks(): void {
    // Graceful shutdown handling
    this.app.addHook('onClose', async () => {
      this.isShuttingDown = true;
      logger.info('Server shutting down gracefully...');
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
  private setupHealthChecks(): void {
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
          performanceLogger.trackAsyncOperation(() => dbHealthCheck(), 'database_health_check'),
          performanceLogger.trackAsyncOperation(
            () => redisManager.healthCheck(),
            'redis_health_check'
          ),
          performanceLogger.trackAsyncOperation(
            () => Promise.resolve(socketManager.getServer() !== null),
            'websocket_health_check'
          ),
        ]);

        const dbCheck = checks[0];
        const redisCheck = checks[1];
        const websocketCheck = checks[2];

        const dbHealthy = dbCheck.status === 'fulfilled' && dbCheck.value?.status === 'healthy';
        const redisHealthy = redisCheck.status === 'fulfilled' && redisCheck.value === true;
        const websocketHealthy =
          websocketCheck.status === 'fulfilled' && websocketCheck.value === true;
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
              connectedUsers: socketManager.getConnectedUsersCount(),
            },
          });
        } else {
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
      } catch (error) {
        logger.error({ error }, 'Health check failed');
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
        const memoryStats = await redisMemoryManager.getDetailedStats();
        const memoryUsage = await redisMemoryManager.getMemoryUsage();
        
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
      } catch (error) {
        logger.error({ error }, 'Redis memory check failed');
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
  private async registerRoutes(): Promise<void> {
    // API versioning
    await this.app.register(
      (fastify, opts, next) => {
        // Authentication routes (no additional auth middleware needed)
        fastify.register(registerAuthRoutes);

        // Main API routes (all require authentication)
        fastify.register(registerAPIRoutes);

        next();
      },
      { prefix: '/api/v1' }
    );

    // Root endpoint
    this.app.get('/', async (request, reply) => {
      reply.send({
        name: 'CEO Communication Platform API',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.app.env,
        timestamp: new Date().toISOString(),
      });
    });

    logger.debug('Routes registered successfully');
  }

  /**
   * Setup centralized error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
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
      if (error instanceof BaseError) {
        loggers.api.warn({ error: error.toJSON(), ...context }, 'Operational error occurred');

        reply.code(error.statusCode).send(formatErrorResponse(error));
        return;
      }

      // Handle Fastify validation errors
      if (error.name === 'FastifyError' && typeof (error as any).statusCode === 'number') {
        const statusCode = (error as any).statusCode;
        loggers.api.warn(
          { error: error.message, statusCode, ...context },
          'Fastify validation error'
        );

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
      loggers.api.error({ error: error.stack, ...context }, 'Unexpected server error');

      // Don't expose internal errors in production
      const message = config.app.isProduction ? 'An internal server error occurred' : error.message;

      reply.code(500).send({
        error: {
          message,
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
        },
        timestamp: new Date().toISOString(),
        ...(config.app.isDevelopment && { stack: error.stack }),
      });
    });

    // Handle 404 errors
    this.app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
      loggers.api.warn(
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
          userId: request.user?.userId,
        },
        'Route not found'
      );

      reply.code(404).send({
        error: {
          message: `Route ${request.method} ${request.url} not found`,
          code: 'ROUTE_NOT_FOUND',
          statusCode: 404,
        },
        timestamp: new Date().toISOString(),
      });
    });

    logger.debug('Error handling setup complete');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      const overallTimer = startupLogger.createTimer('API Server Startup');
      const services: Array<{ name: string; status: boolean; duration?: number }> = [];

      startupLogger.logStep('API Server Startup');

      // Initialize database
      const dbTimer = startupLogger.createTimer('Database');
      try {
        await initializeDatabase();
        services.push({ name: 'Database', status: true, duration: dbTimer.end() });
      } catch (error) {
        services.push({ name: 'Database', status: false, duration: dbTimer.end() });
        throw error;
      }

      // Initialize Redis
      const redisTimer = startupLogger.createTimer('Redis');
      try {
        await redisManager.initialize();
        
        // Start Redis memory monitoring for 25MB limit
        redisMemoryManager.startMonitoring();
        
        services.push({ name: 'Redis', status: true, duration: redisTimer.end() });
      } catch (error) {
        services.push({ name: 'Redis', status: false, duration: redisTimer.end() });
        throw error;
      }

      // Initialize WebSocket server
      const wsTimer = startupLogger.createTimer('WebSocket Server');
      try {
        // Get the HTTP server from Fastify after it starts listening
        // We'll initialize Socket.IO after the server is listening
        services.push({ name: 'WebSocket Server', status: true, duration: wsTimer.end() });
      } catch (error) {
        services.push({ name: 'WebSocket Server', status: false, duration: wsTimer.end() });
        throw error;
      }

      // Run migrations
      const migrationTimer = startupLogger.createTimer('Database Migrations');
      try {
        await runMigrations();
        services.push({ name: 'Database Migrations', status: true, duration: migrationTimer.end() });
      } catch (error) {
        services.push({ name: 'Database Migrations', status: false, duration: migrationTimer.end() });
        throw error;
      }

      // Run database seeding (only in development)
      if (config.app.isDevelopment) {
        const seedTimer = startupLogger.createTimer('Database Seeding');
        try {
          logger.debug('Skipping database seeding (data already exists)');
          services.push({ name: 'Database Seeding', status: true, duration: seedTimer.end() });
        } catch (error) {
          logger.warn({ error }, 'Database seeding failed, continuing without seed data');
          services.push({ name: 'Database Seeding', status: false, duration: seedTimer.end() });
        }
      }

      // Initialize server
      const serverTimer = startupLogger.createTimer('Server Configuration');
      try {
        await this.initialize();
        services.push({ name: 'Server Configuration', status: true, duration: serverTimer.end() });
      } catch (error) {
        services.push({ name: 'Server Configuration', status: false, duration: serverTimer.end() });
        throw error;
      }

      // Start listening
      const listenTimer = startupLogger.createTimer('Server Listen');
      try {
        // Use Fastify's built-in listen method
        const address = await this.app.listen({
          port: config.app.port,
          host: config.app.host,
        });

        // Now initialize Socket.IO with Fastify's server
        this.httpServer = this.app.server;
        if (this.httpServer) {
          await socketManager.initialize(this.httpServer);
        }

        services.push({ name: 'Server Listen', status: true, duration: listenTimer.end() });

        // Log startup summary
        const totalDuration = overallTimer.end();
        services.push({ name: 'Total Startup Time', status: true, duration: totalDuration });
        startupLogger.logSummary(services);

        logger.info(
          {
            address,
            port: config.app.port,
            host: config.app.host,
            environment: config.app.env,
          },
          '🚀 API server running'
        );
      } catch (error) {
        services.push({ name: 'Server Listen', status: false, duration: listenTimer.end() });
        throw error;
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error({ error }, 'Failed to start API server');
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');

      this.isShuttingDown = true;

      try {
        // Stop accepting new connections
        await this.app.close();
        logger.info('Server closed successfully');

        // Close WebSocket server
        logger.info('Closing WebSocket server...');
        await socketManager.close();

        // Close Redis connections
        logger.info('Closing Redis connections...');
        redisMemoryManager.stopMonitoring();
        await redisManager.close();

        // Close HTTP server
        if (this.httpServer) {
          this.httpServer.close();
        }

        // Exit process
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.fatal({ error }, 'Uncaught exception occurred');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      logger.fatal({ reason, promise }, 'Unhandled promise rejection');
      process.exit(1);
    });
  }

  /**
   * Get Fastify instance for testing
   */
  getApp(): FastifyInstance {
    return this.app;
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
    user?: TokenPayload & {
      isAuthenticated: boolean;
      id: string; // Alias for userId for compatibility
    };
  }

  interface FastifyInstance {
    authenticate: typeof authenticate;
    optionalAuthenticate: typeof optionalAuthenticate;
  }
}

// Export server class and create instance
export { APIServer };
export const server = new APIServer();

// Start server if this file is run directly
if (require.main === module) {
  console.log('Starting server directly...');
  server.start().then(() => {
    console.log('Server started successfully, keeping process alive...');
    // Keep the process alive
    setInterval(() => {
      console.log('Server is running...', new Date().toISOString());
    }, 30000); // Log every 30 seconds
  }).catch((error) => {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  });
}
