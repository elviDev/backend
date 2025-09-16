import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtService, TokenPayload, PERMISSIONS } from './jwt';
import { userRepository } from '@db/index';
import { logger, securityLogger } from '@utils/logger';
import { AuthenticationError, AuthorizationError, RateLimitError } from '@utils/errors';

/**
 * Authentication and Authorization middleware for Fastify
 * Enterprise-grade security with rate limiting and audit logging
 */

// Extend Fastify request to include user context
declare module 'fastify' {
  interface FastifyRequest {
    user?:
      | (TokenPayload & {
          isAuthenticated: boolean;
          id: string; // Alias for userId for compatibility
        })
      | undefined;
  }
}

/**
 * Rate limiting store (in production, use Redis)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

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
export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      securityLogger.logAuthEvent('missing_token', {
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
        path: request.url,
        method: request.method,
      });

      throw new AuthenticationError('Access token required');
    }

    // Verify token
    const payload = await jwtService.verifyAccessToken(token);

    // Additional security: verify user still exists and is active
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      securityLogger.logSecurityViolation('token_user_not_found', {
        userId: payload.userId,
        ip: request.ip,
      });

      throw new AuthenticationError('User account not found');
    }

    if (user.deleted_at) {
      securityLogger.logSecurityViolation('deleted_user_token', {
        userId: payload.userId,
        ip: request.ip,
      });

      throw new AuthenticationError('User account has been deactivated');
    }

    // Update user's last active timestamp (async, don't wait)
    userRepository.updateLastActive(payload.userId).catch((error) => {
      logger.warn?.({ error, userId: payload.userId }, 'Failed to update last active timestamp');
    });

    // Attach user to request
    request.user = {
      ...payload,
      isAuthenticated: true,
      id: payload.userId, // Add id alias for compatibility
    };

    securityLogger.logAuthEvent('authentication_success', {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      ip: request.ip,
      path: request.url,
      method: request.method,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    logger.error({ error }, 'Authentication middleware error');
    throw new AuthenticationError('Authentication failed');
  }
};

/**
 * Optional authentication middleware - doesn't throw if no token
 */
export const optionalAuthenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    await authenticate(request, reply);
  } catch (error) {
    // Don't throw, just log the attempt
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Optional authentication failed'
    );
    request.user = undefined;
  }
};

/**
 * Authorization middleware factory - checks permissions
 */
export const authorize = (...requiredPermissions: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user || !request.user.isAuthenticated) {
      throw new AuthenticationError('Authentication required for this resource');
    }

    const hasPermission =
      requiredPermissions.length === 0 ||
      jwtService.hasAnyPermission(request.user, requiredPermissions);

    if (!hasPermission) {
      securityLogger.logAuthzEvent('access_denied', {
        userId: request.user.userId,
        requiredPermissions,
        userPermissions: request.user.permissions,
        resource: request.url,
        action: request.method,
        ip: request.ip,
      });

      throw new AuthorizationError(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
      );
    }

    securityLogger.logAuthzEvent('access_granted', {
      userId: request.user.userId,
      resource: request.url,
      action: request.method,
      ip: request.ip,
    });
  };
};

/**
 * Role-based authorization middleware
 */
export const authorizeRoles = (...allowedRoles: Array<'ceo' | 'manager' | 'staff'>) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user || !request.user.isAuthenticated) {
      throw new AuthenticationError('Authentication required for this resource');
    }

    if (!allowedRoles.includes(request.user.role)) {
      securityLogger.logAuthzEvent('access_denied', {
        userId: request.user.userId,
        userRole: request.user.role,
        allowedRoles,
        resource: request.url,
        action: request.method,
        ip: request.ip,
      });

      throw new AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }

    securityLogger.logAuthzEvent('access_granted', {
      userId: request.user.userId,
      resource: request.url,
      action: request.method,
      ip: request.ip,
    });
  };
};

/**
 * CEO-only middleware
 */
export const requireCEO = authorizeRoles('ceo');

/**
 * Manager or CEO middleware
 */
export const requireManagerOrCEO = authorizeRoles('ceo', 'manager');

/**
 * Voice commands authorization (CEO only feature)
 */
export const authorizeVoiceCommands = authorize(PERMISSIONS.VOICE_COMMANDS);

/**
 * Rate limiting middleware
 */
export const rateLimit = (options: {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessful?: boolean;
  skipFailedRequests?: boolean;
}) => {
  const {
    maxRequests,
    windowMs,
    keyGenerator = (req) => req.ip,
    skipSuccessful = false,
    skipFailedRequests = false,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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
      securityLogger.logSecurityViolation('rate_limit_exceeded', {
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

      throw new RateLimitError('Rate limit exceeded. Too many requests.', retryAfter, {
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

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  maxRequests: 5, // 5 attempts
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (req) => `auth:${req.ip}`,
});

/**
 * Voice processing rate limiting
 */
export const voiceRateLimit = rateLimit({
  maxRequests: 60, // 60 commands per hour
  windowMs: 60 * 60 * 1000, // 1 hour
  keyGenerator: (req) => `voice:${req.user?.userId || req.ip}`,
});

/**
 * API rate limiting for general endpoints
 */
export const apiRateLimit = rateLimit({
  maxRequests: 1000, // 1000 requests per hour
  windowMs: 60 * 60 * 1000, // 1 hour
  keyGenerator: (req) => `api:${req.user?.userId || req.ip}`,
});

/**
 * Resource ownership middleware - ensures user can only access their own resources
 */
export const requireResourceOwnership = (userIdParam: string = 'userId') => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user || !request.user.isAuthenticated) {
      throw new AuthenticationError('Authentication required');
    }

    // CEO can access any resource
    if (request.user.role === 'ceo') {
      return;
    }

    const requestedUserId = (request.params as any)[userIdParam];

    if (!requestedUserId) {
      throw new AuthorizationError('Resource user ID not specified');
    }

    if (request.user.userId !== requestedUserId) {
      securityLogger.logAuthzEvent('access_denied', {
        userId: request.user.userId,
        requestedUserId,
        resource: request.url,
        action: request.method,
        ip: request.ip,
        reason: 'resource_ownership_violation',
      });

      throw new AuthorizationError('You can only access your own resources');
    }
  };
};

/**
 * Channel membership middleware - ensures user has access to channel
 */
export const requireChannelAccess = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  if (!request.user || !request.user.isAuthenticated) {
    throw new AuthenticationError('Authentication required');
  }

  // Check for channel ID in different parameter names used in routes
  const channelId = (request.params as any).channelId || 
                   (request.params as any).id || 
                   (request.body as any)?.channelId;

  if (!channelId) {
    throw new AuthorizationError('Channel ID not specified');
  }

  // CEO can access any channel
  if (request.user.role === 'ceo') {
    return;
  }

  try {
    const { channelRepository } = await import('@db/index');
    const hasAccess = await channelRepository.canUserAccess(
      channelId,
      request.user.userId,
      request.user.role
    );

    if (!hasAccess) {
      securityLogger.logAuthzEvent('access_denied', {
        userId: request.user.userId,
        channelId,
        resource: request.url,
        action: request.method,
        ip: request.ip,
        reason: 'channel_access_denied',
      });

      throw new AuthorizationError('You do not have access to this channel');
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }

    logger.error(
      { error, channelId, userId: request.user.userId },
      'Error checking channel access'
    );
    throw new AuthorizationError('Unable to verify channel access');
  }
};

/**
 * Audit logging middleware - logs all requests for security audit
 */
export const auditLog = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const startTime = Date.now();

  // Log request
  logger.info(
    {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: request.user?.userId,
      userRole: request.user?.role,
      timestamp: new Date().toISOString(),
    },
    'API Request'
  );

  // Log response when request completes
  request.server.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;

    logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        userId: request.user?.userId,
        timestamp: new Date().toISOString(),
      },
      'API Response'
    );

    return payload;
  });
};
