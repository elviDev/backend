import { FastifyRequest, FastifyReply } from 'fastify';
import { TokenPayload } from './jwt';
/**
 * Authentication and Authorization middleware for Fastify
 * Enterprise-grade security with rate limiting and audit logging
 */
declare module 'fastify' {
    interface FastifyRequest {
        user?: (TokenPayload & {
            isAuthenticated: boolean;
            id: string;
        }) | undefined;
    }
}
/**
 * Authentication middleware - validates JWT tokens
 */
export declare const authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Optional authentication middleware - doesn't throw if no token
 */
export declare const optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Authorization middleware factory - checks permissions
 */
export declare const authorize: (...requiredPermissions: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Role-based authorization middleware
 */
export declare const authorizeRoles: (...allowedRoles: Array<"ceo" | "manager" | "staff">) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * CEO-only middleware
 */
export declare const requireCEO: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Manager or CEO middleware
 */
export declare const requireManagerOrCEO: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Voice commands authorization (CEO only feature)
 */
export declare const authorizeVoiceCommands: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Rate limiting middleware
 */
export declare const rateLimit: (options: {
    maxRequests: number;
    windowMs: number;
    keyGenerator?: (request: FastifyRequest) => string;
    skipSuccessful?: boolean;
    skipFailedRequests?: boolean;
}) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Strict rate limiting for authentication endpoints
 */
export declare const authRateLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Voice processing rate limiting
 */
export declare const voiceRateLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * API rate limiting for general endpoints
 */
export declare const apiRateLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Resource ownership middleware - ensures user can only access their own resources
 */
export declare const requireResourceOwnership: (userIdParam?: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Channel membership middleware - ensures user has access to channel
 */
export declare const requireChannelAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Require channel membership for sending messages
 * More restrictive than requireChannelAccess - only members can send messages
 */
export declare const requireChannelMembership: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Task comment authorization middleware - ensures only task assignees and owner can comment
 */
export declare const requireTaskCommentAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Audit logging middleware - logs all requests for security audit
 */
export declare const auditLog: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=middleware.d.ts.map