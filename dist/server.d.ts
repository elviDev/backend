import { FastifyInstance } from 'fastify';
import { authenticate, optionalAuthenticate } from './auth/middleware';
import { TokenPayload } from './auth/jwt';
/**
 * High-Performance Fastify Server
 * Enterprise-grade API infrastructure with comprehensive monitoring
 */
declare class APIServer {
    private app;
    private httpServer;
    private isShuttingDown;
    constructor();
    /**
     * Initialize server with all plugins and routes
     */
    initialize(): Promise<void>;
    /**
     * Register core Fastify plugins
     */
    private registerCorePlugins;
    /**
     * Register security plugins
     */
    private registerSecurityPlugins;
    /**
     * Register validation and serialization plugins
     */
    private registerValidationPlugins;
    /**
     * Setup middleware and hooks
     */
    private setupMiddleware;
    /**
     * Setup global hooks
     */
    private setupGlobalHooks;
    /**
     * Setup health check endpoints
     */
    private setupHealthChecks;
    /**
     * Register application routes
     */
    private registerRoutes;
    /**
     * Setup centralized error handling
     */
    private setupErrorHandling;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Setup graceful shutdown handlers
     */
    private setupGracefulShutdown;
    /**
     * Get Fastify instance for testing
     */
    getApp(): FastifyInstance;
}
declare module 'fastify' {
    interface FastifyRequest {
        startTime?: number;
        user?: TokenPayload & {
            isAuthenticated: boolean;
            id: string;
        };
    }
    interface FastifyInstance {
        authenticate: typeof authenticate;
        optionalAuthenticate: typeof optionalAuthenticate;
    }
}
export { APIServer };
export declare const server: APIServer;
//# sourceMappingURL=server.d.ts.map