"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = exports.requireTaskCommentAccess = exports.requireChannelMembership = exports.requireChannelAccess = exports.requireResourceOwnership = exports.apiRateLimit = exports.voiceRateLimit = exports.authRateLimit = exports.rateLimit = exports.authorizeVoiceCommands = exports.requireManagerOrCEO = exports.requireCEO = exports.authorizeRoles = exports.authorize = exports.optionalAuthenticate = exports.authenticate = void 0;
const jwt_1 = require("./jwt");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
/**
 * Rate limiting store (in production, use Redis)
 */
const rateLimitStore = new Map();
/**
 * Clean up expired rate limit entries
 */
const cleanupRateLimit = () => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetTime) {
            rateLimitStore.delete(key);
        }
    }
};
// Cleanup every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);
/**
 * Authentication middleware - validates JWT tokens
 */
const authenticate = async (request, reply) => {
    try {
        const authHeader = request.headers.authorization;
        const token = jwt_1.jwtService.extractTokenFromHeader(authHeader);
        if (!token) {
            logger_1.securityLogger.logAuthEvent('missing_token', {
                ip: request.ip,
                userAgent: request.headers['user-agent'] ?? '',
                path: request.url,
                method: request.method,
            });
            throw new errors_1.AuthenticationError('Access token required');
        }
        // Verify token
        const payload = await jwt_1.jwtService.verifyAccessToken(token);
        // Additional security: verify user still exists and is active
        const user = await index_1.userRepository.findById(payload.userId);
        if (!user) {
            logger_1.securityLogger.logSecurityViolation('token_user_not_found', {
                userId: payload.userId,
                ip: request.ip,
            });
            throw new errors_1.AuthenticationError('User account not found');
        }
        if (user.deleted_at) {
            logger_1.securityLogger.logSecurityViolation('deleted_user_token', {
                userId: payload.userId,
                ip: request.ip,
            });
            throw new errors_1.AuthenticationError('User account has been deactivated');
        }
        // Update user's last active timestamp (async, don't wait)
        index_1.userRepository.updateLastActive(payload.userId).catch((error) => {
            logger_1.logger.warn?.({ error, userId: payload.userId }, 'Failed to update last active timestamp');
        });
        // Attach user to request
        request.user = {
            ...payload,
            isAuthenticated: true,
            id: payload.userId, // Add id alias for compatibility
        };
        logger_1.securityLogger.logAuthEvent('authentication_success', {
            userId: payload.userId,
            email: payload.email,
            role: payload.role,
            ip: request.ip,
            path: request.url,
            method: request.method,
        });
    }
    catch (error) {
        if (error instanceof errors_1.AuthenticationError) {
            throw error;
        }
        logger_1.logger.error({ error }, 'Authentication middleware error');
        throw new errors_1.AuthenticationError('Authentication failed');
    }
};
exports.authenticate = authenticate;
/**
 * Optional authentication middleware - doesn't throw if no token
 */
const optionalAuthenticate = async (request, reply) => {
    try {
        await (0, exports.authenticate)(request, reply);
    }
    catch (error) {
        // Don't throw, just log the attempt
        logger_1.logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Optional authentication failed');
        request.user = undefined;
    }
};
exports.optionalAuthenticate = optionalAuthenticate;
/**
 * Authorization middleware factory - checks permissions
 */
const authorize = (...requiredPermissions) => {
    return async (request, reply) => {
        if (!request.user || !request.user.isAuthenticated) {
            throw new errors_1.AuthenticationError('Authentication required for this resource');
        }
        const hasPermission = requiredPermissions.length === 0 ||
            jwt_1.jwtService.hasAnyPermission(request.user, requiredPermissions);
        if (!hasPermission) {
            logger_1.securityLogger.logAuthzEvent('access_denied', {
                userId: request.user.userId,
                requiredPermissions,
                userPermissions: request.user.permissions,
                resource: request.url,
                action: request.method,
                ip: request.ip,
            });
            throw new errors_1.AuthorizationError(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`);
        }
        logger_1.securityLogger.logAuthzEvent('access_granted', {
            userId: request.user.userId,
            resource: request.url,
            action: request.method,
            ip: request.ip,
        });
    };
};
exports.authorize = authorize;
/**
 * Role-based authorization middleware
 */
const authorizeRoles = (...allowedRoles) => {
    return async (request, reply) => {
        if (!request.user || !request.user.isAuthenticated) {
            throw new errors_1.AuthenticationError('Authentication required for this resource');
        }
        if (!allowedRoles.includes(request.user.role)) {
            logger_1.securityLogger.logAuthzEvent('access_denied', {
                userId: request.user.userId,
                userRole: request.user.role,
                allowedRoles,
                resource: request.url,
                action: request.method,
                ip: request.ip,
            });
            throw new errors_1.AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
        }
        logger_1.securityLogger.logAuthzEvent('access_granted', {
            userId: request.user.userId,
            resource: request.url,
            action: request.method,
            ip: request.ip,
        });
    };
};
exports.authorizeRoles = authorizeRoles;
/**
 * CEO-only middleware
 */
exports.requireCEO = (0, exports.authorizeRoles)('ceo');
/**
 * Manager or CEO middleware
 */
exports.requireManagerOrCEO = (0, exports.authorizeRoles)('ceo', 'manager');
/**
 * Voice commands authorization (CEO only feature)
 */
exports.authorizeVoiceCommands = (0, exports.authorize)(jwt_1.PERMISSIONS.VOICE_COMMANDS);
/**
 * Rate limiting middleware
 */
const rateLimit = (options) => {
    const { maxRequests, windowMs, keyGenerator = (req) => req.ip, skipSuccessful = false, skipFailedRequests = false, } = options;
    return async (request, reply) => {
        const key = keyGenerator(request);
        const now = Date.now();
        const resetTime = now + windowMs;
        let rateLimitInfo = rateLimitStore.get(key);
        if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
            rateLimitInfo = { count: 0, resetTime };
            rateLimitStore.set(key, rateLimitInfo);
        }
        rateLimitInfo.count++;
        if (rateLimitInfo.count > maxRequests) {
            logger_1.securityLogger.logSecurityViolation('rate_limit_exceeded', {
                key,
                ip: request.ip,
                path: request.url,
                count: rateLimitInfo.count,
                maxRequests,
                userId: request.user?.userId,
            });
            const retryAfter = Math.ceil((rateLimitInfo.resetTime - now) / 1000);
            reply.header('Retry-After', retryAfter.toString());
            reply.header('X-RateLimit-Limit', maxRequests.toString());
            reply.header('X-RateLimit-Remaining', '0');
            reply.header('X-RateLimit-Reset', Math.ceil(rateLimitInfo.resetTime / 1000).toString());
            throw new errors_1.RateLimitError('Rate limit exceeded. Too many requests.', retryAfter, {
                maxRequests,
                windowMs,
                currentCount: rateLimitInfo.count,
            });
        }
        // Set rate limit headers
        const remaining = Math.max(0, maxRequests - rateLimitInfo.count);
        reply.header('X-RateLimit-Limit', maxRequests.toString());
        reply.header('X-RateLimit-Remaining', remaining.toString());
        reply.header('X-RateLimit-Reset', Math.ceil(rateLimitInfo.resetTime / 1000).toString());
    };
};
exports.rateLimit = rateLimit;
/**
 * Strict rate limiting for authentication endpoints
 */
exports.authRateLimit = (0, exports.rateLimit)({
    maxRequests: 5, // 5 attempts
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyGenerator: (req) => `auth:${req.ip}`,
});
/**
 * Voice processing rate limiting
 */
exports.voiceRateLimit = (0, exports.rateLimit)({
    maxRequests: 60, // 60 commands per hour
    windowMs: 60 * 60 * 1000, // 1 hour
    keyGenerator: (req) => `voice:${req.user?.userId || req.ip}`,
});
/**
 * API rate limiting for general endpoints
 */
exports.apiRateLimit = (0, exports.rateLimit)({
    maxRequests: 1000, // 1000 requests per hour
    windowMs: 60 * 60 * 1000, // 1 hour
    keyGenerator: (req) => `api:${req.user?.userId || req.ip}`,
});
/**
 * Resource ownership middleware - ensures user can only access their own resources
 */
const requireResourceOwnership = (userIdParam = 'userId') => {
    return async (request, reply) => {
        if (!request.user || !request.user.isAuthenticated) {
            throw new errors_1.AuthenticationError('Authentication required');
        }
        // CEO can access any resource
        if (request.user.role === 'ceo') {
            return;
        }
        const requestedUserId = request.params[userIdParam];
        if (!requestedUserId) {
            throw new errors_1.AuthorizationError('Resource user ID not specified');
        }
        if (request.user.userId !== requestedUserId) {
            logger_1.securityLogger.logAuthzEvent('access_denied', {
                userId: request.user.userId,
                requestedUserId,
                resource: request.url,
                action: request.method,
                ip: request.ip,
                reason: 'resource_ownership_violation',
            });
            throw new errors_1.AuthorizationError('You can only access your own resources');
        }
    };
};
exports.requireResourceOwnership = requireResourceOwnership;
/**
 * Channel membership middleware - ensures user has access to channel
 */
const requireChannelAccess = async (request, reply) => {
    if (!request.user || !request.user.isAuthenticated) {
        throw new errors_1.AuthenticationError('Authentication required');
    }
    // Check for channel ID in different parameter names used in routes
    const channelId = request.params.channelId ||
        request.params.id ||
        request.body?.channelId;
    if (!channelId) {
        throw new errors_1.AuthorizationError('Channel ID not specified');
    }
    // CEO can access any channel
    if (request.user.role === 'ceo') {
        return;
    }
    try {
        const { channelRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
        const hasAccess = await channelRepository.canUserAccess(channelId, request.user.userId, request.user.role);
        if (!hasAccess) {
            logger_1.securityLogger.logAuthzEvent('access_denied', {
                userId: request.user.userId,
                channelId,
                resource: request.url,
                action: request.method,
                ip: request.ip,
                reason: 'channel_access_denied',
            });
            throw new errors_1.AuthorizationError('You do not have access to this channel');
        }
    }
    catch (error) {
        if (error instanceof errors_1.AuthorizationError) {
            throw error;
        }
        logger_1.logger.error({ error, channelId, userId: request.user.userId }, 'Error checking channel access');
        throw new errors_1.AuthorizationError('Unable to verify channel access');
    }
};
exports.requireChannelAccess = requireChannelAccess;
/**
 * Require channel membership for sending messages
 * More restrictive than requireChannelAccess - only members can send messages
 */
const requireChannelMembership = async (request, reply) => {
    if (!request.user || !request.user.isAuthenticated) {
        throw new errors_1.AuthenticationError('Authentication required');
    }
    // Check for channel ID in different parameter names used in routes
    const channelId = request.params.channelId ||
        request.params.id ||
        request.body?.channelId;
    if (!channelId) {
        throw new errors_1.AuthorizationError('Channel ID not specified');
    }
    try {
        const { channelRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
        const channel = await channelRepository.findById(channelId);
        if (!channel) {
            throw new errors_1.AuthorizationError('Channel not found');
        }
        // CEO can send messages to any channel (as they are usually added to all channels)
        if (request.user.role === 'ceo') {
            return;
        }
        // Creator can always send messages
        if (channel.created_by === request.user.userId) {
            return;
        }
        // Check if user is explicitly a member
        if (!channel.members || !channel.members.includes(request.user.userId)) {
            logger_1.securityLogger.logAuthzEvent('access_denied', {
                userId: request.user.userId,
                channelId,
                resource: request.url,
                action: request.method,
                ip: request.ip,
                reason: 'not_channel_member',
            });
            throw new errors_1.AuthorizationError('Only channel members can send messages to this channel');
        }
        logger_1.securityLogger.logAuthzEvent('access_granted', {
            userId: request.user.userId,
            channelId,
            resource: request.url,
            action: request.method,
            ip: request.ip,
            reason: 'channel_member',
        });
    }
    catch (error) {
        if (error instanceof errors_1.AuthorizationError) {
            throw error;
        }
        logger_1.logger.error({ error, channelId, userId: request.user.userId }, 'Error checking channel membership');
        throw new errors_1.AuthorizationError('Channel membership verification failed');
    }
};
exports.requireChannelMembership = requireChannelMembership;
/**
 * Task comment authorization middleware - ensures only task assignees and owner can comment
 */
const requireTaskCommentAccess = async (request, reply) => {
    if (!request.user || !request.user.isAuthenticated) {
        throw new errors_1.AuthenticationError('Authentication required for this resource');
    }
    // CEO can comment on any task
    if (request.user.role === 'ceo') {
        return;
    }
    // Get task ID from parameters
    const taskId = request.params.taskId;
    if (!taskId) {
        throw new errors_1.AuthorizationError('Task ID not specified');
    }
    try {
        const { taskRepository } = await Promise.resolve().then(() => __importStar(require('@db/index')));
        const task = await taskRepository.findById(taskId);
        if (!task) {
            throw new errors_1.AuthorizationError('Task not found');
        }
        // Check if user is the task owner
        if (task.created_by === request.user.userId) {
            return;
        }
        // Check if user is assigned to the task
        if (task.assigned_to && task.assigned_to.includes(request.user.userId)) {
            return;
        }
        // If user is neither owner nor assignee, deny access
        logger_1.securityLogger.logAuthzEvent('access_denied', {
            userId: request.user.userId,
            taskId,
            resource: request.url,
            action: request.method,
            ip: request.ip,
            reason: 'not_task_owner_or_assignee',
        });
        throw new errors_1.AuthorizationError('Only task owner and assignees can comment on this task');
    }
    catch (error) {
        if (error instanceof errors_1.AuthorizationError) {
            throw error;
        }
        logger_1.logger.error({ error, taskId, userId: request.user.userId }, 'Error checking task comment access');
        throw new errors_1.AuthorizationError('Unable to verify task comment access');
    }
};
exports.requireTaskCommentAccess = requireTaskCommentAccess;
/**
 * Audit logging middleware - logs all requests for security audit
 */
const auditLog = async (request, reply) => {
    const startTime = Date.now();
    // Log request
    logger_1.logger.info({
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        userId: request.user?.userId,
        userRole: request.user?.role,
        timestamp: new Date().toISOString(),
    }, 'API Request');
    // Log response when request completes
    request.server.addHook('onSend', async (request, reply, payload) => {
        const duration = Date.now() - startTime;
        logger_1.logger.info({
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            duration,
            userId: request.user?.userId,
            timestamp: new Date().toISOString(),
        }, 'API Response');
        return payload;
    });
};
exports.auditLog = auditLog;
//# sourceMappingURL=middleware.js.map