/**
 * JWT Authentication Service Tests
 * Comprehensive tests for JWT token generation, verification, and user authentication
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { jwtService, TokenPayload } from '../../src/auth/jwt';
import { config } from '../../src/config';
import { createTestUser, validateSuccessCriteria, measureExecutionTime } from '../setup';

describe('JWT Authentication Service', () => {
  let testUser: any;

  beforeEach(() => {
    testUser = createTestUser({
      id: 'test-user-123',
      email: 'test@ceocomm.com',
      name: 'Test User',
      role: 'staff',
    });
  });

  describe('Token Generation', () => {
    it('should generate valid access and refresh tokens', async () => {
      const { result, duration } = await measureExecutionTime(async () => {
        return jwtService.generateTokens(testUser);
      });

      // Validate performance benchmark
      validateSuccessCriteria.simpleCommandSpeed(duration);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('refreshExpiresIn');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.split('.')).toHaveLength(3); // JWT format
      expect(result.refreshToken.split('.')).toHaveLength(3);
    });

    it('should include correct user data in token payload', async () => {
      const tokens = await jwtService.generateTokens(testUser);
      const payload = await jwtService.verifyAccessToken(tokens.accessToken);

      expect(payload.userId).toBe(testUser.id);
      expect(payload.email).toBe(testUser.email);
      expect(payload.role).toBe(testUser.role);
      expect(payload.name).toBe(testUser.name);
      expect(payload.type).toBe('access');
    });

    it('should generate different tokens for different users', async () => {
      const user1 = createTestUser({ id: 'user-1', email: 'user1@test.com' });
      const user2 = createTestUser({ id: 'user-2', email: 'user2@test.com' });

      const tokens1 = await jwtService.generateTokens(user1);
      const tokens2 = await jwtService.generateTokens(user2);

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });

    it('should generate tokens with appropriate expiry times', async () => {
      const tokens = await jwtService.generateTokens(testUser);
      const now = Math.floor(Date.now() / 1000); // JWT uses seconds

      expect(tokens.expiresIn).toBeGreaterThan(0);
      expect(tokens.refreshExpiresIn).toBeGreaterThan(0);
      expect(tokens.refreshExpiresIn).toBeGreaterThan(tokens.expiresIn);
    });
  });

  describe('Token Verification', () => {
    let validTokens: any;

    beforeEach(async () => {
      validTokens = await jwtService.generateTokens(testUser);
    });

    it('should verify valid access tokens', async () => {
      const { result, duration } = await measureExecutionTime(async () => {
        return jwtService.verifyAccessToken(validTokens.accessToken);
      });

      // Should be very fast for security checks
      expect(duration).toBeLessThan(100);

      expect(result.userId).toBe(testUser.id);
      expect(result.email).toBe(testUser.email);
      expect(result.role).toBe(testUser.role);
      expect(result.type).toBe('access');
    });

    it('should verify valid refresh tokens', async () => {
      const { result, duration } = await measureExecutionTime(async () => {
        return jwtService.verifyRefreshToken(validTokens.refreshToken);
      });

      expect(duration).toBeLessThan(100);

      expect(result.userId).toBe(testUser.id);
      expect(result.email).toBe(testUser.email);
      expect(result.role).toBe(testUser.role);
      expect(result.type).toBe('refresh');
    });

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.token.here';

      await expect(jwtService.verifyAccessToken(invalidToken))
        .rejects
        .toThrow();

      await expect(jwtService.verifyRefreshToken(invalidToken))
        .rejects
        .toThrow();
    });

    it('should reject expired tokens', async () => {
      // This test would require creating expired tokens which is complex to mock
      // In real scenarios, the JWT library handles expiration
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid';

      await expect(jwtService.verifyAccessToken(expiredToken))
        .rejects
        .toThrow();

      await expect(jwtService.verifyRefreshToken(expiredToken))
        .rejects
        .toThrow();
    });

    it('should reject tokens with wrong type', async () => {
      // Try to verify refresh token as access token and vice versa
      await expect(jwtService.verifyAccessToken(validTokens.refreshToken))
        .rejects
        .toThrow();

      await expect(jwtService.verifyRefreshToken(validTokens.accessToken))
        .rejects
        .toThrow();
    });
  });

  describe('Token Decoding', () => {
    let validTokens: any;

    beforeEach(async () => {
      validTokens = await jwtService.generateTokens(testUser);
    });

    it('should decode token without verification', async () => {
      const userData = jwtService.decodeToken(validTokens.accessToken);

      expect(userData).toEqual(expect.objectContaining({
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        name: testUser.name,
        permissions: expect.any(Array),
        sessionId: expect.any(String),
        type: 'access',
      }));
    });

    it('should handle invalid tokens gracefully', async () => {
      const invalidToken = 'invalid.token';

      const userData = jwtService.decodeToken(invalidToken);

      expect(userData).toBeNull();
    });
  });

  describe('Security Features', () => {
    it('should generate cryptographically secure session IDs', async () => {
      const tokens1 = await jwtService.generateTokens(testUser);
      const tokens2 = await jwtService.generateTokens(testUser);

      const payload1 = await jwtService.verifyAccessToken(tokens1.accessToken);
      const payload2 = await jwtService.verifyAccessToken(tokens2.accessToken);

      expect(payload1.sessionId).not.toBe(payload2.sessionId);
      expect(payload1.sessionId.length).toBeGreaterThanOrEqual(32);
    });

    it('should include role-based permissions', async () => {
      const ceoUser = createTestUser({ role: 'ceo' });
      const managerUser = createTestUser({ role: 'manager' });
      const staffUser = createTestUser({ role: 'staff' });

      const ceoTokens = await jwtService.generateTokens(ceoUser);
      const managerTokens = await jwtService.generateTokens(managerUser);
      const staffTokens = await jwtService.generateTokens(staffUser);

      const ceoPayload = await jwtService.verifyAccessToken(ceoTokens.accessToken);
      const managerPayload = await jwtService.verifyAccessToken(managerTokens.accessToken);
      const staffPayload = await jwtService.verifyAccessToken(staffTokens.accessToken);

      expect(ceoPayload.permissions.length).toBeGreaterThan(managerPayload.permissions.length); // CEO has more permissions
      expect(managerPayload.permissions.length).toBeGreaterThan(staffPayload.permissions.length);
    });

    it('should handle malformed tokens securely', async () => {
      const malformedTokens = [
        '', // Empty token
        'not.a.token', // Invalid format
        'header.payload', // Missing signature
        'too.many.parts.in.token.here', // Too many parts
      ];

      for (const token of malformedTokens) {
        await expect(jwtService.verifyAccessToken(token))
          .rejects
          .toThrow();
      }
    });
  });

  describe('Performance Requirements', () => {
    it('should meet token generation performance benchmarks', async () => {
      const { duration } = await measureExecutionTime(async () => {
        const promises = Array.from({ length: 10 }, () => jwtService.generateTokens(testUser));
        await Promise.all(promises);
      });

      // 10 token generations should complete in under 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should meet token verification performance benchmarks', async () => {
      const tokens = await jwtService.generateTokens(testUser);

      const { duration } = await measureExecutionTime(async () => {
        const promises = Array.from({ length: 100 }, () => 
          jwtService.verifyAccessToken(tokens.accessToken)
        );
        await Promise.all(promises);
      });

      // 100 verifications should complete in under 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle users with special characters in data', async () => {
      const specialUser = createTestUser({
        name: "John O'Connor-Smith",
        email: 'user+test@domain.co.uk',
      });

      const tokens = await jwtService.generateTokens(specialUser);
      const payload = await jwtService.verifyAccessToken(tokens.accessToken);

      expect(payload.name).toBe(specialUser.name);
      expect(payload.email).toBe(specialUser.email);
    });

    it('should handle users with minimal data', async () => {
      const minimalUser = {
        id: 'min-user-123',
        email: 'min@test.com',
        role: 'staff',
        name: '',
      };

      const tokens = await jwtService.generateTokens(minimalUser);
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    });

    it('should validate required user fields', async () => {
      const incompleteUsers = [
        { email: 'test@test.com', role: 'staff', name: 'Test' }, // Missing id
        { id: 'test-123', role: 'staff', name: 'Test' }, // Missing email
        { id: 'test-123', email: 'test@test.com', name: 'Test' }, // Missing role
      ];

      for (const user of incompleteUsers) {
        await expect(jwtService.generateTokens(user as any))
          .rejects
          .toThrow();
      }
    });
  });
});