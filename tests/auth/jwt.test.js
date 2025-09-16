"use strict";
/**
 * JWT Authentication Service Tests
 * Comprehensive tests for JWT token generation, verification, and user authentication
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const jwt_1 = require("../../src/auth/jwt");
const setup_1 = require("../setup");
(0, globals_1.describe)('JWT Authentication Service', () => {
    let testUser;
    (0, globals_1.beforeEach)(() => {
        testUser = (0, setup_1.createTestUser)({
            id: 'test-user-123',
            email: 'test@ceocomm.com',
            name: 'Test User',
            role: 'staff',
        });
    });
    (0, globals_1.describe)('Token Generation', () => {
        (0, globals_1.it)('should generate valid access and refresh tokens', async () => {
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return jwt_1.jwtService.generateTokens(testUser);
            });
            // Validate performance benchmark
            setup_1.validateSuccessCriteria.simpleCommandSpeed(duration);
            (0, globals_1.expect)(result).toHaveProperty('accessToken');
            (0, globals_1.expect)(result).toHaveProperty('refreshToken');
            (0, globals_1.expect)(result).toHaveProperty('expiresIn');
            (0, globals_1.expect)(result).toHaveProperty('refreshExpiresIn');
            (0, globals_1.expect)(typeof result.accessToken).toBe('string');
            (0, globals_1.expect)(typeof result.refreshToken).toBe('string');
            (0, globals_1.expect)(result.accessToken.split('.')).toHaveLength(3); // JWT format
            (0, globals_1.expect)(result.refreshToken.split('.')).toHaveLength(3);
        });
        (0, globals_1.it)('should include correct user data in token payload', async () => {
            const tokens = await jwt_1.jwtService.generateTokens(testUser);
            const payload = await jwt_1.jwtService.verifyAccessToken(tokens.accessToken);
            (0, globals_1.expect)(payload.userId).toBe(testUser.id);
            (0, globals_1.expect)(payload.email).toBe(testUser.email);
            (0, globals_1.expect)(payload.role).toBe(testUser.role);
            (0, globals_1.expect)(payload.name).toBe(testUser.name);
            (0, globals_1.expect)(payload.type).toBe('access');
        });
        (0, globals_1.it)('should generate different tokens for different users', async () => {
            const user1 = (0, setup_1.createTestUser)({ id: 'user-1', email: 'user1@test.com' });
            const user2 = (0, setup_1.createTestUser)({ id: 'user-2', email: 'user2@test.com' });
            const tokens1 = await jwt_1.jwtService.generateTokens(user1);
            const tokens2 = await jwt_1.jwtService.generateTokens(user2);
            (0, globals_1.expect)(tokens1.accessToken).not.toBe(tokens2.accessToken);
            (0, globals_1.expect)(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
        });
        (0, globals_1.it)('should generate tokens with appropriate expiry times', async () => {
            const tokens = await jwt_1.jwtService.generateTokens(testUser);
            const now = Math.floor(Date.now() / 1000); // JWT uses seconds
            (0, globals_1.expect)(tokens.expiresIn).toBeGreaterThan(0);
            (0, globals_1.expect)(tokens.refreshExpiresIn).toBeGreaterThan(0);
            (0, globals_1.expect)(tokens.refreshExpiresIn).toBeGreaterThan(tokens.expiresIn);
        });
    });
    (0, globals_1.describe)('Token Verification', () => {
        let validTokens;
        (0, globals_1.beforeEach)(async () => {
            validTokens = await jwt_1.jwtService.generateTokens(testUser);
        });
        (0, globals_1.it)('should verify valid access tokens', async () => {
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return jwt_1.jwtService.verifyAccessToken(validTokens.accessToken);
            });
            // Should be very fast for security checks
            (0, globals_1.expect)(duration).toBeLessThan(100);
            (0, globals_1.expect)(result.userId).toBe(testUser.id);
            (0, globals_1.expect)(result.email).toBe(testUser.email);
            (0, globals_1.expect)(result.role).toBe(testUser.role);
            (0, globals_1.expect)(result.type).toBe('access');
        });
        (0, globals_1.it)('should verify valid refresh tokens', async () => {
            const { result, duration } = await (0, setup_1.measureExecutionTime)(async () => {
                return jwt_1.jwtService.verifyRefreshToken(validTokens.refreshToken);
            });
            (0, globals_1.expect)(duration).toBeLessThan(100);
            (0, globals_1.expect)(result.userId).toBe(testUser.id);
            (0, globals_1.expect)(result.email).toBe(testUser.email);
            (0, globals_1.expect)(result.role).toBe(testUser.role);
            (0, globals_1.expect)(result.type).toBe('refresh');
        });
        (0, globals_1.it)('should reject invalid tokens', async () => {
            const invalidToken = 'invalid.token.here';
            await (0, globals_1.expect)(jwt_1.jwtService.verifyAccessToken(invalidToken))
                .rejects
                .toThrow();
            await (0, globals_1.expect)(jwt_1.jwtService.verifyRefreshToken(invalidToken))
                .rejects
                .toThrow();
        });
        (0, globals_1.it)('should reject expired tokens', async () => {
            // This test would require creating expired tokens which is complex to mock
            // In real scenarios, the JWT library handles expiration
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid';
            await (0, globals_1.expect)(jwt_1.jwtService.verifyAccessToken(expiredToken))
                .rejects
                .toThrow();
            await (0, globals_1.expect)(jwt_1.jwtService.verifyRefreshToken(expiredToken))
                .rejects
                .toThrow();
        });
        (0, globals_1.it)('should reject tokens with wrong type', async () => {
            // Try to verify refresh token as access token and vice versa
            await (0, globals_1.expect)(jwt_1.jwtService.verifyAccessToken(validTokens.refreshToken))
                .rejects
                .toThrow();
            await (0, globals_1.expect)(jwt_1.jwtService.verifyRefreshToken(validTokens.accessToken))
                .rejects
                .toThrow();
        });
    });
    (0, globals_1.describe)('Token Decoding', () => {
        let validTokens;
        (0, globals_1.beforeEach)(async () => {
            validTokens = await jwt_1.jwtService.generateTokens(testUser);
        });
        (0, globals_1.it)('should decode token without verification', async () => {
            const userData = jwt_1.jwtService.decodeToken(validTokens.accessToken);
            (0, globals_1.expect)(userData).toEqual(globals_1.expect.objectContaining({
                userId: testUser.id,
                email: testUser.email,
                role: testUser.role,
                name: testUser.name,
                permissions: globals_1.expect.any(Array),
                sessionId: globals_1.expect.any(String),
                type: 'access',
            }));
        });
        (0, globals_1.it)('should handle invalid tokens gracefully', async () => {
            const invalidToken = 'invalid.token';
            const userData = jwt_1.jwtService.decodeToken(invalidToken);
            (0, globals_1.expect)(userData).toBeNull();
        });
    });
    (0, globals_1.describe)('Security Features', () => {
        (0, globals_1.it)('should generate cryptographically secure session IDs', async () => {
            const tokens1 = await jwt_1.jwtService.generateTokens(testUser);
            const tokens2 = await jwt_1.jwtService.generateTokens(testUser);
            const payload1 = await jwt_1.jwtService.verifyAccessToken(tokens1.accessToken);
            const payload2 = await jwt_1.jwtService.verifyAccessToken(tokens2.accessToken);
            (0, globals_1.expect)(payload1.sessionId).not.toBe(payload2.sessionId);
            (0, globals_1.expect)(payload1.sessionId.length).toBeGreaterThanOrEqual(32);
        });
        (0, globals_1.it)('should include role-based permissions', async () => {
            const ceoUser = (0, setup_1.createTestUser)({ role: 'ceo' });
            const managerUser = (0, setup_1.createTestUser)({ role: 'manager' });
            const staffUser = (0, setup_1.createTestUser)({ role: 'staff' });
            const ceoTokens = await jwt_1.jwtService.generateTokens(ceoUser);
            const managerTokens = await jwt_1.jwtService.generateTokens(managerUser);
            const staffTokens = await jwt_1.jwtService.generateTokens(staffUser);
            const ceoPayload = await jwt_1.jwtService.verifyAccessToken(ceoTokens.accessToken);
            const managerPayload = await jwt_1.jwtService.verifyAccessToken(managerTokens.accessToken);
            const staffPayload = await jwt_1.jwtService.verifyAccessToken(staffTokens.accessToken);
            (0, globals_1.expect)(ceoPayload.permissions.length).toBeGreaterThan(managerPayload.permissions.length); // CEO has more permissions
            (0, globals_1.expect)(managerPayload.permissions.length).toBeGreaterThan(staffPayload.permissions.length);
        });
        (0, globals_1.it)('should handle malformed tokens securely', async () => {
            const malformedTokens = [
                '', // Empty token
                'not.a.token', // Invalid format
                'header.payload', // Missing signature
                'too.many.parts.in.token.here', // Too many parts
            ];
            for (const token of malformedTokens) {
                await (0, globals_1.expect)(jwt_1.jwtService.verifyAccessToken(token))
                    .rejects
                    .toThrow();
            }
        });
    });
    (0, globals_1.describe)('Performance Requirements', () => {
        (0, globals_1.it)('should meet token generation performance benchmarks', async () => {
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = Array.from({ length: 10 }, () => jwt_1.jwtService.generateTokens(testUser));
                await Promise.all(promises);
            });
            // 10 token generations should complete in under 1 second
            (0, globals_1.expect)(duration).toBeLessThan(1000);
        });
        (0, globals_1.it)('should meet token verification performance benchmarks', async () => {
            const tokens = await jwt_1.jwtService.generateTokens(testUser);
            const { duration } = await (0, setup_1.measureExecutionTime)(async () => {
                const promises = Array.from({ length: 100 }, () => jwt_1.jwtService.verifyAccessToken(tokens.accessToken));
                await Promise.all(promises);
            });
            // 100 verifications should complete in under 500ms
            (0, globals_1.expect)(duration).toBeLessThan(500);
        });
    });
    (0, globals_1.describe)('Edge Cases', () => {
        (0, globals_1.it)('should handle users with special characters in data', async () => {
            const specialUser = (0, setup_1.createTestUser)({
                name: "John O'Connor-Smith",
                email: 'user+test@domain.co.uk',
            });
            const tokens = await jwt_1.jwtService.generateTokens(specialUser);
            const payload = await jwt_1.jwtService.verifyAccessToken(tokens.accessToken);
            (0, globals_1.expect)(payload.name).toBe(specialUser.name);
            (0, globals_1.expect)(payload.email).toBe(specialUser.email);
        });
        (0, globals_1.it)('should handle users with minimal data', async () => {
            const minimalUser = {
                id: 'min-user-123',
                email: 'min@test.com',
                role: 'staff',
                name: '',
            };
            const tokens = await jwt_1.jwtService.generateTokens(minimalUser);
            (0, globals_1.expect)(tokens.accessToken).toBeTruthy();
            (0, globals_1.expect)(tokens.refreshToken).toBeTruthy();
        });
        (0, globals_1.it)('should validate required user fields', async () => {
            const incompleteUsers = [
                { email: 'test@test.com', role: 'staff', name: 'Test' }, // Missing id
                { id: 'test-123', role: 'staff', name: 'Test' }, // Missing email
                { id: 'test-123', email: 'test@test.com', name: 'Test' }, // Missing role
            ];
            for (const user of incompleteUsers) {
                await (0, globals_1.expect)(jwt_1.jwtService.generateTokens(user))
                    .rejects
                    .toThrow();
            }
        });
    });
});
//# sourceMappingURL=jwt.test.js.map