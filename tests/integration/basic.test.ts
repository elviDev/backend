/**
 * Basic Integration Tests
 * Simple tests to verify core functionality works
 */

import { describe, it, expect } from '@jest/globals';
import { jwtService } from '../../src/auth/jwt';
import { createTestUser } from '../setup';

describe('Basic Integration Tests', () => {
  describe('JWT Service', () => {
    it('should generate and verify tokens', async () => {
      const testUser = createTestUser();
      
      // Generate tokens
      const tokens = await jwtService.generateTokens(testUser);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      
      // Verify access token
      const payload = await jwtService.verifyAccessToken(tokens.accessToken);
      expect(payload.userId).toBe(testUser.id);
      expect(payload.email).toBe(testUser.email);
      expect(payload.role).toBe(testUser.role);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet token generation performance requirements', async () => {
      const testUser = createTestUser();
      
      const start = Date.now();
      await jwtService.generateTokens(testUser);
      const duration = Date.now() - start;
      
      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should meet token verification performance requirements', async () => {
      const testUser = createTestUser();
      const tokens = await jwtService.generateTokens(testUser);
      
      const start = Date.now();
      await jwtService.verifyAccessToken(tokens.accessToken);
      const duration = Date.now() - start;
      
      // Should complete in under 50ms
      expect(duration).toBeLessThan(50);
    });
  });
});