"use strict";
/**
 * Basic Integration Tests
 * Simple tests to verify core functionality works
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const jwt_1 = require("../../src/auth/jwt");
const setup_1 = require("../setup");
(0, globals_1.describe)('Basic Integration Tests', () => {
    (0, globals_1.describe)('JWT Service', () => {
        (0, globals_1.it)('should generate and verify tokens', async () => {
            const testUser = (0, setup_1.createTestUser)();
            // Generate tokens
            const tokens = await jwt_1.jwtService.generateTokens(testUser);
            (0, globals_1.expect)(tokens.accessToken).toBeDefined();
            (0, globals_1.expect)(tokens.refreshToken).toBeDefined();
            // Verify access token
            const payload = await jwt_1.jwtService.verifyAccessToken(tokens.accessToken);
            (0, globals_1.expect)(payload.userId).toBe(testUser.id);
            (0, globals_1.expect)(payload.email).toBe(testUser.email);
            (0, globals_1.expect)(payload.role).toBe(testUser.role);
        });
    });
    (0, globals_1.describe)('Performance Benchmarks', () => {
        (0, globals_1.it)('should meet token generation performance requirements', async () => {
            const testUser = (0, setup_1.createTestUser)();
            const start = Date.now();
            await jwt_1.jwtService.generateTokens(testUser);
            const duration = Date.now() - start;
            // Should complete in under 100ms
            (0, globals_1.expect)(duration).toBeLessThan(100);
        });
        (0, globals_1.it)('should meet token verification performance requirements', async () => {
            const testUser = (0, setup_1.createTestUser)();
            const tokens = await jwt_1.jwtService.generateTokens(testUser);
            const start = Date.now();
            await jwt_1.jwtService.verifyAccessToken(tokens.accessToken);
            const duration = Date.now() - start;
            // Should complete in under 50ms
            (0, globals_1.expect)(duration).toBeLessThan(50);
        });
    });
});
//# sourceMappingURL=basic.test.js.map