/**
 * Security Manager - Phase 2 Security & Authentication
 * Comprehensive security layer for voice command processing
 *
 * Success Criteria:
 * - Voice command authentication and authorization
 * - Rate limiting and abuse prevention
 * - Audit logging for security events
 * - Input sanitization and validation
 */
import { EventEmitter } from 'events';
export interface SecurityConfig {
    jwtSecret: string;
    jwtExpiresIn: string;
    bcryptSaltRounds: number;
    rateLimiting: {
        windowMs: number;
        maxRequests: number;
        skipSuccessfulRequests: boolean;
    };
    encryption: {
        algorithm: string;
        keyLength: number;
    };
    auditLogging: {
        enabled: boolean;
        logLevel: 'all' | 'security' | 'critical';
    };
}
export interface AuthToken {
    userId: string;
    organizationId: string;
    permissions: string[];
    sessionId: string;
    issuedAt: number;
    expiresAt: number;
    deviceId?: string;
    ipAddress?: string;
}
export interface SecurityEvent {
    eventId: string;
    type: 'authentication' | 'authorization' | 'rate_limit' | 'validation' | 'suspicious_activity';
    severity: 'low' | 'medium' | 'high' | 'critical';
    userId?: string;
    organizationId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    timestamp: string;
    details: Record<string, any>;
}
export interface VoiceCommandSecurity {
    commandId: string;
    userId: string;
    organizationId: string;
    commandType: string;
    permissions: string[];
    sensitiveDataMask: boolean;
    approved: boolean;
    reason?: string;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}
export declare class SecurityManager extends EventEmitter {
    private config;
    private securityEvents;
    private rateLimits;
    private suspiciousActivities;
    private encryptionKey;
    private readonly maxAuditLogSize;
    private cleanupTimer?;
    constructor(config: SecurityConfig);
    /**
     * Authenticate user with JWT token
     */
    authenticateToken(token: string): Promise<AuthToken | null>;
    /**
     * Generate JWT token for authenticated user
     */
    generateToken(userId: string, organizationId: string, permissions: string[], sessionId: string, deviceId?: string, ipAddress?: string): Promise<string>;
    /**
     * Authorize voice command execution
     */
    authorizeVoiceCommand(userId: string, organizationId: string, commandType: string, permissions: string[], commandData: Record<string, any>): Promise<VoiceCommandSecurity>;
    /**
     * Get required permissions for command type
     */
    private getRequiredPermissions;
    /**
     * Check if command data contains sensitive information
     */
    private containsSensitiveData;
    /**
     * Check rate limits for user actions
     */
    checkRateLimit(userId: string, action: string): Promise<RateLimitResult>;
    /**
     * Sanitize and validate input data
     */
    validateAndSanitizeInput(input: any, schema: Record<string, any>): {
        valid: boolean;
        sanitized?: any;
        errors?: string[];
    };
    /**
     * Sanitize string to prevent injection attacks
     */
    private sanitizeString;
    /**
     * Track suspicious activity
     */
    private trackSuspiciousActivity;
    /**
     * Encrypt sensitive data
     */
    encryptSensitiveData(data: string): {
        encrypted: string;
        iv: string;
    };
    /**
     * Decrypt sensitive data
     */
    decryptSensitiveData(encrypted: string, iv: string): string;
    /**
     * Hash password securely
     */
    hashPassword(password: string): Promise<string>;
    /**
     * Verify password against hash
     */
    verifyPassword(password: string, hash: string): Promise<boolean>;
    /**
     * Log security event
     */
    private logSecurityEvent;
    /**
     * Get security events for audit
     */
    getSecurityEvents(filters?: {
        userId?: string;
        organizationId?: string;
        type?: string;
        severity?: string;
        limit?: number;
    }): SecurityEvent[];
    /**
     * Get security metrics
     */
    getSecurityMetrics(): {
        totalEvents: number;
        eventsByType: Record<string, number>;
        eventsBySeverity: Record<string, number>;
        suspiciousActivities: number;
        rateLimitViolations: number;
    };
    /**
     * Start cleanup timer for old data
     */
    private startCleanupTimer;
    /**
     * Cleanup old rate limit and suspicious activity data
     */
    private cleanupOldData;
    /**
     * Destroy and cleanup
     */
    destroy(): void;
}
//# sourceMappingURL=SecurityManager.d.ts.map