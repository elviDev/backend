"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.PERMISSIONS = exports.jwtService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("@config/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Role-based permissions mapping
 */
const ROLE_PERMISSIONS = {
    ceo: [
        // Wildcard permission - CEO has access to everything
        '*'
    ],
    manager: [
        // Channel management within scope
        'channels:create', 'channels:read', 'channels:update',
        'channels:manage_members',
        // Task management
        'tasks:create', 'tasks:read', 'tasks:update',
        'tasks:assign', 'tasks:manage_dependencies',
        // Limited user management
        'users:read', 'users:update_profile',
        // Voice features (limited)
        'voice:commands',
        // Analytics (read-only)
        'analytics:read'
    ],
    staff: [
        // Basic channel access
        'channels:read', 'channels:participate',
        // Task participation
        'tasks:read', 'tasks:update_own', 'tasks:comment',
        // Profile management
        'users:read_own', 'users:update_own_profile',
        // No voice commands (CEO-only feature)
    ]
};
exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
/**
 * Generate cryptographically secure session ID
 */
const generateSessionId = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
/**
 * Convert time string to seconds
 */
const parseTimeToSeconds = (timeStr) => {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));
    switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return value;
    }
};
/**
 * JWT service class
 */
class JWTService {
    accessTokenSecret;
    refreshTokenSecret;
    accessTokenExpiry;
    refreshTokenExpiry;
    constructor() {
        this.accessTokenSecret = index_1.config.jwt.secret;
        this.refreshTokenSecret = index_1.config.jwt.refreshSecret;
        this.accessTokenExpiry = index_1.config.jwt.expiresIn;
        this.refreshTokenExpiry = index_1.config.jwt.refreshExpiresIn;
    }
    /**
     * Generate access and refresh token pair
     */
    async generateTokens(user) {
        const sessionId = generateSessionId();
        const permissions = ROLE_PERMISSIONS[user.role] || [];
        const basePayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            permissions,
            sessionId
        };
        // Generate access token
        const accessToken = jsonwebtoken_1.default.sign({ ...basePayload, type: 'access' }, this.accessTokenSecret, {
            expiresIn: this.accessTokenExpiry,
            issuer: 'ceo-platform',
            audience: 'ceo-platform-api',
            subject: user.id
        });
        // Generate refresh token
        const refreshToken = jsonwebtoken_1.default.sign({ ...basePayload, type: 'refresh' }, this.refreshTokenSecret, {
            expiresIn: this.refreshTokenExpiry,
            issuer: 'ceo-platform',
            audience: 'ceo-platform-api',
            subject: user.id
        });
        const expiresIn = parseTimeToSeconds(this.accessTokenExpiry);
        const refreshExpiresIn = parseTimeToSeconds(this.refreshTokenExpiry);
        logger_1.securityLogger.logAuthEvent('token_generated', {
            userId: user.id,
            email: user.email,
            role: user.role,
            sessionId,
            expiresIn,
            refreshExpiresIn
        });
        return {
            accessToken,
            refreshToken,
            expiresIn,
            refreshExpiresIn
        };
    }
    /**
     * Verify and decode access token
     */
    async verifyAccessToken(token) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, this.accessTokenSecret, {
                issuer: 'ceo-platform',
                audience: 'ceo-platform-api'
            });
            if (payload.type !== 'access') {
                throw new errors_1.InvalidTokenError('Token type mismatch - expected access token');
            }
            return payload;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new errors_1.TokenExpiredError('Access token has expired');
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new errors_1.InvalidTokenError(`Invalid access token: ${error.message}`);
            }
            else {
                logger_1.logger.error({ error }, 'Unexpected error verifying access token');
                throw new errors_1.AuthenticationError('Token verification failed');
            }
        }
    }
    /**
     * Verify and decode refresh token
     */
    async verifyRefreshToken(token) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, this.refreshTokenSecret, {
                issuer: 'ceo-platform',
                audience: 'ceo-platform-api'
            });
            if (payload.type !== 'refresh') {
                throw new errors_1.InvalidTokenError('Token type mismatch - expected refresh token');
            }
            return payload;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                logger_1.securityLogger.logAuthEvent('refresh_token_expired', {
                    error: error.message
                });
                throw new errors_1.TokenExpiredError('Refresh token has expired');
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                logger_1.securityLogger.logSecurityViolation('invalid_refresh_token', {
                    error: error.message,
                    token: token.substring(0, 20) + '...'
                });
                throw new errors_1.InvalidTokenError(`Invalid refresh token: ${error.message}`);
            }
            else {
                logger_1.logger.error({ error }, 'Unexpected error verifying refresh token');
                throw new errors_1.AuthenticationError('Refresh token verification failed');
            }
        }
    }
    /**
     * Refresh access token using refresh token
     */
    async refreshTokens(refreshToken) {
        const payload = await this.verifyRefreshToken(refreshToken);
        // Generate new token pair with same user data
        const user = {
            id: payload.userId,
            email: payload.email,
            role: payload.role,
            name: payload.name
        };
        const newTokens = await this.generateTokens(user);
        logger_1.securityLogger.logAuthEvent('token_refreshed', {
            userId: payload.userId,
            email: payload.email,
            oldSessionId: payload.sessionId,
            newSessionId: 'generated' // New session ID is in the new tokens
        });
        return newTokens;
    }
    /**
     * Decode token without verification (for debugging)
     */
    decodeToken(token) {
        try {
            const payload = jsonwebtoken_1.default.decode(token);
            return payload;
        }
        catch (error) {
            logger_1.logger.warn({ error }, 'Failed to decode token');
            return null;
        }
    }
    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader || typeof authHeader !== 'string') {
            return null;
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        return parts[1] || null;
    }
    /**
     * Check if user has required permission
     */
    hasPermission(payload, requiredPermission) {
        // Check for wildcard permission first (CEO has all permissions)
        if (payload.permissions.includes('*')) {
            return true;
        }
        return payload.permissions.includes(requiredPermission);
    }
    /**
     * Check if user has any of the required permissions
     */
    hasAnyPermission(payload, requiredPermissions) {
        // Check for wildcard permission first (CEO has all permissions)
        if (payload.permissions.includes('*')) {
            return true;
        }
        return requiredPermissions.some(permission => payload.permissions.includes(permission));
    }
    /**
     * Check if user has all required permissions
     */
    hasAllPermissions(payload, requiredPermissions) {
        // Check for wildcard permission first (CEO has all permissions)
        if (payload.permissions.includes('*')) {
            return true;
        }
        return requiredPermissions.every(permission => payload.permissions.includes(permission));
    }
    /**
     * Get token expiration date
     */
    getTokenExpiration(token) {
        const payload = this.decodeToken(token);
        if (!payload || !payload.exp) {
            return null;
        }
        return new Date(payload.exp * 1000);
    }
    /**
     * Check if token is expired
     */
    isTokenExpired(token) {
        const expiration = this.getTokenExpiration(token);
        if (!expiration) {
            return true;
        }
        return expiration.getTime() < Date.now();
    }
    /**
     * Generate password reset token (separate from auth tokens)
     */
    generatePasswordResetToken(userId) {
        return jsonwebtoken_1.default.sign({ userId, type: 'password_reset' }, this.accessTokenSecret + userId, // Include user ID in secret for security
        { expiresIn: '1h' });
    }
    /**
     * Verify password reset token
     */
    verifyPasswordResetToken(token, userId) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, this.accessTokenSecret + userId);
            return payload.userId === userId && payload.type === 'password_reset';
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Generate email verification token
     */
    generateEmailVerificationToken(userId, email) {
        return jsonwebtoken_1.default.sign({ userId, email, type: 'email_verification' }, this.accessTokenSecret + email, { expiresIn: '24h' });
    }
    /**
     * Verify email verification token
     */
    verifyEmailVerificationToken(token, email) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, this.accessTokenSecret + email);
            if (payload.email === email && payload.type === 'email_verification') {
                return { userId: payload.userId };
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
}
// Export singleton instance
exports.jwtService = new JWTService();
exports.default = exports.jwtService;
// Export permission constants
exports.PERMISSIONS = {
    // Channel permissions
    CHANNELS_CREATE: 'channels:create',
    CHANNELS_READ: 'channels:read',
    CHANNELS_UPDATE: 'channels:update',
    CHANNELS_DELETE: 'channels:delete',
    CHANNELS_MANAGE_MEMBERS: 'channels:manage_members',
    CHANNELS_ARCHIVE: 'channels:archive',
    // Task permissions
    TASKS_CREATE: 'tasks:create',
    TASKS_READ: 'tasks:read',
    TASKS_UPDATE: 'tasks:update',
    TASKS_DELETE: 'tasks:delete',
    TASKS_ASSIGN: 'tasks:assign',
    TASKS_MANAGE_DEPENDENCIES: 'tasks:manage_dependencies',
    // User permissions
    USERS_CREATE: 'users:create',
    USERS_READ: 'users:read',
    USERS_UPDATE: 'users:update',
    USERS_DELETE: 'users:delete',
    USERS_MANAGE_ROLES: 'users:manage_roles',
    // Voice permissions
    VOICE_COMMANDS: 'voice:commands',
    VOICE_TRANSCRIBE: 'voice:transcribe',
    VOICE_PROCESS: 'voice:process',
    // System permissions
    SYSTEM_ADMIN: 'system:admin',
    ANALYTICS_READ: 'analytics:read',
};
//# sourceMappingURL=jwt.js.map