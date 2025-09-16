/**
 * Authentication and Authorization Middleware Tests
 * Tests for JWT middleware, rate limiting, and security features
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { authenticate, authorize, optionalAuthenticate, auditLog } from '../../src/auth/middleware';
import { jwtService } from '../../src/auth/jwt';
import { 
  createTestUser, 
  createMockRequest, 
  createMockReply, 
  validateSuccessCriteria, 
  measureExecutionTime 
} from '../setup';

describe('Authentication Middleware', () => {
  let testUser: any;
  let mockRequest: any;
  let mockReply: any;
  let validTokens: any;

  beforeEach(async () => {
    testUser = createTestUser({
      id: 'auth-test-user',
      email: 'auth@test.com',
      role: 'staff',
      name: 'Auth Test User',
    });

    validTokens = await jwtService.generateTokens(testUser);
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    it('should authenticate valid bearer token', async () => {
      mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;

      const { duration } = await measureExecutionTime(async () => {
        await authenticate(mockRequest, mockReply);
      });

      // Authentication should be fast
      validateSuccessCriteria.realTimeUpdate(duration);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user.userId).toBe(testUser.id);
      expect(mockRequest.user.email).toBe(testUser.email);
      expect(mockRequest.user.role).toBe(testUser.role);
      expect(mockRequest.user.isAuthenticated).toBe(true);
    });

    it('should reject request without authorization header', async () => {
      // No authorization header
      delete mockRequest.headers.authorization;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Authentication required',
            code: 'AUTHENTICATION_REQUIRED',
            statusCode: 401,
          }),
        })
      );
    });

    it('should reject malformed authorization header', async () => {
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

        await authenticate(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'INVALID_TOKEN_FORMAT',
            }),
          })
        );
      }
    });

    it('should reject expired tokens', async () => {
      // Create expired token (this would need a helper to create expired tokens)
      const expiredToken = 'expired.jwt.token';
      mockRequest.headers.authorization = `Bearer ${expiredToken}`;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOKEN_EXPIRED',
          }),
        })
      );
    });

    it('should handle authentication errors gracefully', async () => {
      mockRequest.headers.authorization = 'Bearer invalid.token.here';

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_TOKEN',
          }),
        })
      );
    });
  });

  describe('optionalAuthenticate middleware', () => {
    it('should authenticate when valid token is provided', async () => {
      mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;

      await optionalAuthenticate(mockRequest, mockReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user.isAuthenticated).toBe(true);
    });

    it('should continue without authentication when no token provided', async () => {
      delete mockRequest.headers.authorization;

      await optionalAuthenticate(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should continue without authentication for invalid tokens', async () => {
      mockRequest.headers.authorization = 'Bearer invalid.token';

      await optionalAuthenticate(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('authorize middleware', () => {
    beforeEach(async () => {
      mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;
      await authenticate(mockRequest, mockReply);
      mockReply.code.mockClear();
      mockReply.send.mockClear();
    });

    it('should authorize user with required permissions', async () => {
      const staffUser = createTestUser({ role: 'staff' });
      mockRequest.user = {
        ...staffUser,
        permissions: ['tasks:read', 'channels:read'],
        isAuthenticated: true,
      };

      const authorizeMiddleware = authorize('tasks:read');
      await authorizeMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject user without required permissions', async () => {
      mockRequest.user = {
        ...testUser,
        permissions: ['tasks:read'],
        isAuthenticated: true,
      };

      const authorizeMiddleware = authorize('users:admin');
      await authorizeMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INSUFFICIENT_PERMISSIONS',
          }),
        })
      );
    });

    it('should handle CEO role with wildcard permissions', async () => {
      const ceoUser = createTestUser({ role: 'ceo' });
      mockRequest.user = {
        ...ceoUser,
        permissions: ['*'], // CEO has all permissions
        isAuthenticated: true,
      };

      const authorizeMiddleware = authorize('users:admin', 'channels:delete');
      await authorizeMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests', async () => {
      delete mockRequest.user; // No authenticated user

      const authorizeMiddleware = authorize('tasks:read');
      await authorizeMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'AUTHENTICATION_REQUIRED',
          }),
        })
      );
    });

    it('should handle multiple required permissions', async () => {
      mockRequest.user = {
        ...testUser,
        permissions: ['tasks:read', 'tasks:write', 'channels:read'],
        isAuthenticated: true,
      };

      const authorizeMiddleware = authorize('tasks:read', 'tasks:write');
      await authorizeMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('audit logging', () => {
    it('should log authentication events', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;

      await authenticate(mockRequest, mockReply);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth_success',
          userId: testUser.id,
          email: testUser.email,
        })
      );

      logSpy.mockRestore();
    });

    it('should log authorization failures', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockRequest.user = {
        ...testUser,
        permissions: ['limited:access'],
        isAuthenticated: true,
      };

      const authorizeMiddleware = authorize(['admin:access']);
      await authorizeMiddleware(mockRequest, mockReply);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'authorization_denied',
          userId: testUser.id,
          requiredPermissions: ['admin:access'],
        })
      );

      logSpy.mockRestore();
    });

    it('should log security violations', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockRequest.headers.authorization = 'Bearer malicious.token.attempt';

      await authenticate(mockRequest, mockReply);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'security_violation',
          type: 'invalid_token',
          ip: mockRequest.ip,
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('performance requirements', () => {
    it('should meet authentication performance benchmarks', async () => {
      mockRequest.headers.authorization = `Bearer ${validTokens.accessToken}`;

      const { duration } = await measureExecutionTime(async () => {
        const promises = Array.from({ length: 100 }, () =>
          authenticate(createMockRequest({
            headers: { authorization: `Bearer ${validTokens.accessToken}` }
          }), createMockReply())
        );
        await Promise.all(promises);
      });

      // 100 authentications should complete in under 500ms
      expect(duration).toBeLessThan(500);
    });

    it('should meet real-time update requirements for authorization', async () => {
      mockRequest.user = {
        ...testUser,
        permissions: ['tasks:read', 'channels:read'],
        isAuthenticated: true,
      };

      const { duration } = await measureExecutionTime(async () => {
        const authorizeMiddleware = authorize(['tasks:read']);
        await authorizeMiddleware(mockRequest, mockReply);
      });

      // Authorization should be under 100ms for real-time requirements
      validateSuccessCriteria.realTimeUpdate(duration);
    });
  });

  describe('security edge cases', () => {
    it('should handle JWT header manipulation attempts', async () => {
      const maliciousTokens = [
        'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJhZG1pbiJ9.', // None algorithm
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.malicious', // Manipulated payload
      ];

      for (const token of maliciousTokens) {
        mockRequest.headers.authorization = token;
        mockReply.code.mockClear();
        mockReply.send.mockClear();

        await authenticate(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: expect.stringMatching(/INVALID_TOKEN|SECURITY_VIOLATION/),
            }),
          })
        );
      }
    });

    it('should prevent privilege escalation attempts', async () => {
      // User with staff role trying to access admin endpoints
      const staffUser = createTestUser({ role: 'staff' });
      mockRequest.user = {
        ...staffUser,
        permissions: ['tasks:read', 'channels:read'],
        isAuthenticated: true,
      };

      const adminMiddleware = authorize(['users:admin', 'system:config']);
      await adminMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INSUFFICIENT_PERMISSIONS',
          }),
        })
      );
    });

    it('should rate limit authentication attempts', async () => {
      const rateLimitedRequest = createMockRequest({
        ip: '192.168.1.100', // Same IP for rate limiting
      });

      // Simulate multiple failed authentication attempts
      for (let i = 0; i < 10; i++) {
        rateLimitedRequest.headers.authorization = `Bearer invalid-token-${i}`;
        await authenticate(rateLimitedRequest, createMockReply());
      }

      // Next attempt should be rate limited
      rateLimitedRequest.headers.authorization = 'Bearer another-invalid-token';
      const rateLimitedReply = createMockReply();
      await authenticate(rateLimitedRequest, rateLimitedReply);

      expect(rateLimitedReply.code).toHaveBeenCalledWith(429);
      expect(rateLimitedReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        })
      );
    });
  });
});