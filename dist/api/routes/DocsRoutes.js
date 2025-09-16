"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocsRoutes = void 0;
/**
 * Documentation Routes - Swagger/OpenAPI Integration
 * Provides interactive API documentation via Swagger UI
 */
const registerDocsRoutes = async (fastify) => {
    // The Swagger UI will be available at /docs
    // All route schemas are automatically collected by @fastify/swagger
    /**
     * Redirect root docs to Swagger UI
     */
    fastify.get('/docs', async (request, reply) => {
        reply.redirect('/docs/');
    });
    /**
     * API Health Status endpoint with OpenAPI schema
     */
    fastify.get('/health/api', {
        schema: {
            tags: ['Health'],
            summary: 'API Health Status',
            description: 'Get detailed API health status with features and endpoints',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'healthy' },
                        version: { type: 'string', example: '1.0.0' },
                        environment: { type: 'string', example: 'development' },
                        features: {
                            type: 'object',
                            properties: {
                                authentication: { type: 'string', example: 'enabled' },
                                websockets: { type: 'string', example: 'enabled' },
                                caching: { type: 'string', example: 'enabled' },
                                rateLimit: { type: 'string', example: 'enabled' },
                                voiceCommands: { type: 'string', example: 'ready' },
                                analytics: { type: 'string', example: 'ready' },
                            }
                        },
                        endpoints: {
                            type: 'object',
                            properties: {
                                auth: { type: 'string', example: '/api/v1/auth/*' },
                                users: { type: 'string', example: '/api/v1/users/*' },
                                channels: { type: 'string', example: '/api/v1/channels/*' },
                                tasks: { type: 'string', example: '/api/v1/tasks/*' },
                                docs: { type: 'string', example: '/docs' },
                            }
                        },
                        timestamp: { type: 'string', format: 'date-time' },
                    }
                }
            }
        }
    }, async (request, reply) => {
        reply.send({
            status: 'healthy',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            features: {
                authentication: 'enabled',
                websockets: 'enabled',
                caching: 'enabled',
                rateLimit: 'enabled',
                voiceCommands: 'ready',
                analytics: 'ready',
            },
            endpoints: {
                auth: '/api/v1/auth/*',
                users: '/api/v1/users/*',
                channels: '/api/v1/channels/*',
                tasks: '/api/v1/tasks/*',
                docs: '/docs',
            },
            timestamp: new Date().toISOString(),
        });
    });
};
exports.registerDocsRoutes = registerDocsRoutes;
//# sourceMappingURL=DocsRoutes.js.map