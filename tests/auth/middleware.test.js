"use strict";
/**
 * Authentication and Authorization Middleware Tests
 * Tests for JWT middleware, rate limiting, and security features
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const middleware_1 = require("../../src/auth/middleware");
const jwt_1 = require("../../src/auth/jwt");
const setup_1 = require("../setup");
(0, globals_1.describe)('Authentication Middleware', () => {
    let testUser;
    let mockRequest;
    let mockReply;
    let validTokens;
    (0, globals_1.beforeEach)(async () => {
        testUser = (0, setup_1.createTestUser)({
            id: 'auth-test-user',
            email: 'auth@test.com',
            role: 'staff',
            name: 'Auth Test User',
        });
        validTokens = await jwt_1.jwtService.generateTokens(testUser);
        mockRequest = (0, setup_1.createMockRequest)();
        mockReply = (0, setup_1.createMockReply)();
    });
    (0, globals_1.afterEach)(() => {
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.describe)('authenticate middleware', () => {
        (0, globals_1.it)('should authenticate valid bearer token', async () => {
            mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                await (0, middleware_1.authenticate)(mockRequest, mockReply);
            });
            // Authentication should be fast
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
            (0, globals_1.expect)(mockRequest.user).toBeDefined();
            (0, globals_1.expect)(mockRequest.user.userId).toBe(testUser.id);
            (0, globals_1.expect)(mockRequest.user.email).toBe(testUser.email);
            (0, globals_1.expect)(mockRequest.user.role).toBe(testUser.role);
            (0, globals_1.expect)(mockRequest.user.isAuthenticated).toBe(true);
        });
        (0, globals_1.it)('should reject request without authorization header', async () => {
            // No authorization header
            delete mockRequest.headers.authorization;
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    message: 'Authentication required',
                    code: 'AUTHENTICATION_REQUIRED',
                    statusCode: 401,
                }),
            }));
        });
        (0, globals_1.it)('should reject malformed authorization header', async () => {
            const malformedHeaders = [
                'InvalidFormat', // No Bearer prefix
                'Bearer', // No token
                'Bearer ', // Empty token
                'Basic dGVzdDp0ZXN0', // Wrong auth type
            ];
            for (const authHeader of malformedHeaders) {
                mockRequest.headers.authorization = authHeader;
                mockReply.code.mockClear();
                mockReply.send.mockClear();
                await (0, middleware_1.authenticate)(mockRequest, mockReply);
                (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
                (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                    error: globals_1.expect.objectContaining({
                        code: 'INVALID_TOKEN_FORMAT',
                    }),
                }));
            }
        });
        (0, globals_1.it)('should reject expired tokens', async () => {
            // Create expired token (this would need a helper to create expired tokens)
            const expiredToken = 'expired.jwt.token';
            mockRequest.headers.authorization = `Bearer ${expiredToken}`;
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'TOKEN_EXPIRED',
                }),
            }));
        });
        (0, globals_1.it)('should handle authentication errors gracefully', async () => {
            mockRequest.headers.authorization = 'Bearer invalid.token.here';
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'INVALID_TOKEN',
                }),
            }));
        });
    });
    (0, globals_1.describe)('optionalAuthenticate middleware', () => {
        (0, globals_1.it)('should authenticate when valid token is provided', async () => {
            mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
            await (0, middleware_1.optionalAuthenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockRequest.user).toBeDefined();
            (0, globals_1.expect)(mockRequest.user.isAuthenticated).toBe(true);
        });
        (0, globals_1.it)('should continue without authentication when no token provided', async () => {
            delete mockRequest.headers.authorization;
            await (0, middleware_1.optionalAuthenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockRequest.user).toBeUndefined();
            (0, globals_1.expect)(mockReply.code).not.toHaveBeenCalled();
            (0, globals_1.expect)(mockReply.send).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should continue without authentication for invalid tokens', async () => {
            mockRequest.headers.authorization = 'Bearer invalid.token';
            await (0, middleware_1.optionalAuthenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(mockRequest.user).toBeUndefined();
            (0, globals_1.expect)(mockReply.code).not.toHaveBeenCalled();
            (0, globals_1.expect)(mockReply.send).not.toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('authorize middleware', () => {
        (0, globals_1.beforeEach)(async () => {
            mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            mockReply.code.mockClear();
            mockReply.send.mockClear();
        });
        (0, globals_1.it)('should authorize user with required permissions', async () => {
            const staffUser = (0, setup_1.createTestUser)({ role: 'staff' });
            mockRequest.user = {
                ...staffUser,
                permissions: ['tasks:read', 'channels:read'],
                isAuthenticated: true,
            };
            const authorizeMiddleware = (0, middleware_1.authorize)('tasks:read');
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).not.toHaveBeenCalled();
            (0, globals_1.expect)(mockReply.send).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should reject user without required permissions', async () => {
            mockRequest.user = {
                ...testUser,
                permissions: ['tasks:read'],
                isAuthenticated: true,
            };
            const authorizeMiddleware = (0, middleware_1.authorize)('users:admin');
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(403);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'INSUFFICIENT_PERMISSIONS',
                }),
            }));
        });
        (0, globals_1.it)('should handle CEO role with wildcard permissions', async () => {
            const ceoUser = (0, setup_1.createTestUser)({ role: 'ceo' });
            mockRequest.user = {
                ...ceoUser,
                permissions: ['*'], // CEO has all permissions
                isAuthenticated: true,
            };
            const authorizeMiddleware = (0, middleware_1.authorize)('users:admin', 'channels:delete');
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).not.toHaveBeenCalled();
            (0, globals_1.expect)(mockReply.send).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should reject unauthenticated requests', async () => {
            delete mockRequest.user; // No authenticated user
            const authorizeMiddleware = (0, middleware_1.authorize)('tasks:read');
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'AUTHENTICATION_REQUIRED',
                }),
            }));
        });
        (0, globals_1.it)('should handle multiple required permissions', async () => {
            mockRequest.user = {
                ...testUser,
                permissions: ['tasks:read', 'tasks:write', 'channels:read'],
                isAuthenticated: true,
            };
            const authorizeMiddleware = (0, middleware_1.authorize)('tasks:read', 'tasks:write');
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).not.toHaveBeenCalled();
            (0, globals_1.expect)(mockReply.send).not.toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('audit logging', () => {
        (0, globals_1.it)('should log authentication events', async () => {
            const logSpy = globals_1.jest.spyOn(console, 'log').mockImplementation(() => { });
            mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(logSpy).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                event: 'auth_success',
                userId: testUser.id,
                email: testUser.email,
            }));
            logSpy.mockRestore();
        });
        (0, globals_1.it)('should log authorization failures', async () => {
            const logSpy = globals_1.jest.spyOn(console, 'log').mockImplementation(() => { });
            mockRequest.user = {
                ...testUser,
                permissions: ['limited:access'],
                isAuthenticated: true,
            };
            const authorizeMiddleware = (0, middleware_1.authorize)(['admin:access']);
            await authorizeMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(logSpy).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                event: 'authorization_denied',
                userId: testUser.id,
                requiredPermissions: ['admin:access'],
            }));
            logSpy.mockRestore();
        });
        (0, globals_1.it)('should log security violations', async () => {
            const logSpy = globals_1.jest.spyOn(console, 'log').mockImplementation(() => { });
            mockRequest.headers.authorization = 'Bearer malicious.token.attempt';
            await (0, middleware_1.authenticate)(mockRequest, mockReply);
            (0, globals_1.expect)(logSpy).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                event: 'security_violation',
                type: 'invalid_token',
                ip: mockRequest.ip,
            }));
            logSpy.mockRestore();
        });
    });
    (0, globals_1.describe)('performance requirements', () => {
        (0, globals_1.it)('should meet authentication performance benchmarks', async () => {
            mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = Array.from({ length: 100 }, () => (0, middleware_1.authenticate)((0, setup_1.createMockRequest)({
                    headers: { authorization: `Bearer ${validTokens.accessToken}` }
                }), (0, setup_1.createMockReply)()));
                await Promise.all(promises);
            });
            // 100 authentications should complete in under 500ms
            (0, globals_1.expect)(duration).toBeLessThan(500);
        });
        (0, globals_1.it)('should meet real-time update requirements for authorization', async () => {
            mockRequest.user = {
                ...testUser,
                permissions: ['tasks:read', 'channels:read'],
                isAuthenticated: true,
            };
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const authorizeMiddleware = (0, middleware_1.authorize)(['tasks:read']);
                await authorizeMiddleware(mockRequest, mockReply);
            });
            // Authorization should be under 100ms for real-time requirements
            setup_1.validateSuccessCriteria.realTimeUpdate(duration);
        });
    });
    (0, globals_1.describe)('security edge cases', () => {
        (0, globals_1.it)('should handle JWT header manipulation attempts', async () => {
            const maliciousTokens = [
                'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJhZG1pbiJ9.', // None algorithm
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.malicious', // Manipulated payload
            ];
            for (const token of maliciousTokens) {
                mockRequest.headers.authorization = token;
                mockReply.code.mockClear();
                mockReply.send.mockClear();
                await (0, middleware_1.authenticate)(mockRequest, mockReply);
                (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(401);
                (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                    error: globals_1.expect.objectContaining({
                        code: globals_1.expect.stringMatching(/INVALID_TOKEN|SECURITY_VIOLATION/),
                    }),
                }));
            }
        });
        (0, globals_1.it)('should prevent privilege escalation attempts', async () => {
            // User with staff role trying to access admin endpoints
            const staffUser = (0, setup_1.createTestUser)({ role: 'staff' });
            mockRequest.user = {
                ...staffUser,
                permissions: ['tasks:read', 'channels:read'],
                isAuthenticated: true,
            };
            const adminMiddleware = (0, middleware_1.authorize)(['users:admin', 'system:config']);
            await adminMiddleware(mockRequest, mockReply);
            (0, globals_1.expect)(mockReply.code).toHaveBeenCalledWith(403);
            (0, globals_1.expect)(mockReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'INSUFFICIENT_PERMISSIONS',
                }),
            }));
        });
        (0, globals_1.it)('should rate limit authentication attempts', async () => {
            const rateLimitedRequest = (0, setup_1.createMockRequest)({
                ip: '192.168.1.100', // Same IP for rate limiting
            });
            // Simulate multiple failed authentication attempts
            for (let i = 0; i < 10; i++) {
                rateLimitedRequest.headers.authorization = `Bearer invalid-token-${i}`;
                await (0, middleware_1.authenticate)(rateLimitedRequest, (0, setup_1.createMockReply)());
            }
            // Next attempt should be rate limited
            rateLimitedRequest.headers.authorization = 'Bearer another-invalid-token';
            const rateLimitedReply = (0, setup_1.createMockReply)();
            await (0, middleware_1.authenticate)(rateLimitedRequest, rateLimitedReply);
            (0, globals_1.expect)(rateLimitedReply.code).toHaveBeenCalledWith(429);
            (0, globals_1.expect)(rateLimitedReply.send).toHaveBeenCalledWith(globals_1.expect.objectContaining({
                error: globals_1.expect.objectContaining({
                    code: 'RATE_LIMIT_EXCEEDED',
                }),
            }));
        });
    });
});
//# sourceMappingURL=middleware.test.js.map