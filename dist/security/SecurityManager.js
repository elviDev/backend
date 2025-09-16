"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityManager = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_1 = require("../utils/logger");
class SecurityManager extends events_1.EventEmitter {
    config;
    securityEvents = [];
    rateLimits = new Map();
    suspiciousActivities = new Map();
    encryptionKey;
    maxAuditLogSize = 10000;
    cleanupTimer;
    constructor(config) {
        super();
        this.config = config;
        this.encryptionKey = crypto_1.default.randomBytes(32);
        this.startCleanupTimer();
        logger_1.logger.info('Security Manager initialized', {
            rateLimitWindow: `${config.rateLimiting.windowMs / 1000}s`,
            maxRequests: config.rateLimiting.maxRequests,
            auditLogging: config.auditLogging.enabled,
        });
    }
    /**
     * Authenticate user with JWT token
     */
    async authenticateToken(token) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.config.jwtSecret);
            const authToken = {
                userId: decoded.userId,
                organizationId: decoded.organizationId,
                permissions: decoded.permissions || [],
                sessionId: decoded.sessionId,
                issuedAt: decoded.iat * 1000,
                expiresAt: decoded.exp * 1000,
                deviceId: decoded.deviceId,
                ipAddress: decoded.ipAddress,
            };
            // Check if token is expired
            if (authToken.expiresAt < Date.now()) {
                await this.logSecurityEvent({
                    type: 'authentication',
                    severity: 'medium',
                    userId: authToken.userId,
                    organizationId: authToken.organizationId,
                    action: 'token_expired',
                    details: {
                        sessionId: authToken.sessionId,
                        expiredAt: authToken.expiresAt,
                    },
                });
                return null;
            }
            const processingTime = perf_hooks_1.performance.now() - startTime;
            await this.logSecurityEvent({
                type: 'authentication',
                severity: 'low',
                userId: authToken.userId,
                organizationId: authToken.organizationId,
                action: 'token_validated',
                details: {
                    sessionId: authToken.sessionId,
                    processingTime: `${processingTime.toFixed(2)}ms`,
                },
            });
            return authToken;
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            await this.logSecurityEvent({
                type: 'authentication',
                severity: 'high',
                action: 'token_validation_failed',
                details: {
                    error: error.message,
                    processingTime: `${processingTime.toFixed(2)}ms`,
                },
            });
            logger_1.logger.warn('Token authentication failed', {
                error: error.message,
                processingTime: `${processingTime.toFixed(2)}ms`,
            });
            return null;
        }
    }
    /**
     * Generate JWT token for authenticated user
     */
    async generateToken(userId, organizationId, permissions, sessionId, deviceId, ipAddress) {
        const payload = {
            userId,
            organizationId,
            permissions,
            sessionId,
            deviceId,
            ipAddress,
        };
        const token = jsonwebtoken_1.default.sign(payload, this.config.jwtSecret, {
            expiresIn: this.config.jwtExpiresIn,
            issuer: 'ceo-platform',
            audience: organizationId,
        });
        await this.logSecurityEvent({
            type: 'authentication',
            severity: 'low',
            userId,
            organizationId,
            action: 'token_generated',
            details: {
                sessionId,
                deviceId,
                ipAddress,
                permissions: permissions.length,
            },
        });
        return token;
    }
    /**
     * Authorize voice command execution
     */
    async authorizeVoiceCommand(userId, organizationId, commandType, permissions, commandData) {
        const commandId = `cmd_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        try {
            // Check required permissions for command type
            const requiredPermissions = this.getRequiredPermissions(commandType, commandData);
            const hasPermissions = requiredPermissions.every((perm) => permissions.includes(perm));
            if (!hasPermissions) {
                await this.logSecurityEvent({
                    type: 'authorization',
                    severity: 'medium',
                    userId,
                    organizationId,
                    action: 'voice_command_denied',
                    details: {
                        commandId,
                        commandType,
                        requiredPermissions,
                        userPermissions: permissions,
                        reason: 'insufficient_permissions',
                    },
                });
                return {
                    commandId,
                    userId,
                    organizationId,
                    commandType,
                    permissions,
                    sensitiveDataMask: false,
                    approved: false,
                    reason: 'Insufficient permissions',
                };
            }
            // Check for sensitive data that needs masking
            const sensitiveDataMask = this.containsSensitiveData(commandData);
            // Check rate limits
            const rateLimitResult = await this.checkRateLimit(userId, 'voice_command');
            if (!rateLimitResult.allowed) {
                await this.logSecurityEvent({
                    type: 'rate_limit',
                    severity: 'medium',
                    userId,
                    organizationId,
                    action: 'voice_command_rate_limited',
                    details: {
                        commandId,
                        commandType,
                        remaining: rateLimitResult.remaining,
                        retryAfter: rateLimitResult.retryAfter,
                    },
                });
                return {
                    commandId,
                    userId,
                    organizationId,
                    commandType,
                    permissions,
                    sensitiveDataMask,
                    approved: false,
                    reason: 'Rate limit exceeded',
                };
            }
            await this.logSecurityEvent({
                type: 'authorization',
                severity: 'low',
                userId,
                organizationId,
                action: 'voice_command_authorized',
                details: {
                    commandId,
                    commandType,
                    sensitiveDataMask,
                    permissions: permissions.length,
                },
            });
            return {
                commandId,
                userId,
                organizationId,
                commandType,
                permissions,
                sensitiveDataMask,
                approved: true,
            };
        }
        catch (error) {
            await this.logSecurityEvent({
                type: 'authorization',
                severity: 'high',
                userId,
                organizationId,
                action: 'voice_command_authorization_error',
                details: {
                    commandId,
                    commandType,
                    error: error.message,
                },
            });
            return {
                commandId,
                userId,
                organizationId,
                commandType,
                permissions,
                sensitiveDataMask: false,
                approved: false,
                reason: 'Authorization error',
            };
        }
    }
    /**
     * Get required permissions for command type
     */
    getRequiredPermissions(commandType, commandData) {
        const permissionMap = {
            create_task: ['tasks:write'],
            update_task: ['tasks:write'],
            delete_task: ['tasks:delete'],
            read_task: ['tasks:read'],
            create_channel: ['channels:write'],
            update_channel: ['channels:write'],
            delete_channel: ['channels:delete'],
            join_channel: ['channels:join'],
            upload_file: ['files:write'],
            share_file: ['files:share'],
            delete_file: ['files:delete'],
            download_file: ['files:read'],
            send_message: ['messages:write'],
            read_messages: ['messages:read'],
            admin_command: ['admin:all'],
        };
        // Add context-specific permissions
        const basePermissions = permissionMap[commandType] || ['general:execute'];
        // Check if command affects other users' data
        if (commandData.affectedUsers && commandData.affectedUsers.length > 0) {
            basePermissions.push('users:affect_others');
        }
        // Check if command involves sensitive operations
        if (commandData.sensitiveOperation) {
            basePermissions.push('sensitive:execute');
        }
        return basePermissions;
    }
    /**
     * Check if command data contains sensitive information
     */
    containsSensitiveData(data) {
        const sensitiveKeys = [
            'password',
            'token',
            'secret',
            'key',
            'credentials',
            'ssn',
            'social',
            'credit',
            'card',
            'account',
            'bank',
        ];
        const dataString = JSON.stringify(data).toLowerCase();
        return sensitiveKeys.some((key) => dataString.includes(key));
    }
    /**
     * Check rate limits for user actions
     */
    async checkRateLimit(userId, action) {
        const key = `${userId}:${action}`;
        const now = Date.now();
        const windowStart = now - this.config.rateLimiting.windowMs;
        const current = this.rateLimits.get(key) || {
            count: 0,
            resetTime: now + this.config.rateLimiting.windowMs,
        };
        // Reset if window has expired
        if (now >= current.resetTime) {
            current.count = 0;
            current.resetTime = now + this.config.rateLimiting.windowMs;
        }
        const allowed = current.count < this.config.rateLimiting.maxRequests;
        if (allowed) {
            current.count++;
            this.rateLimits.set(key, current);
        }
        const result = {
            allowed,
            remaining: Math.max(0, this.config.rateLimiting.maxRequests - current.count),
            resetTime: current.resetTime,
        };
        if (!allowed) {
            result.retryAfter = current.resetTime - now;
            // Track suspicious activity
            await this.trackSuspiciousActivity(userId, 'rate_limit_exceeded', {
                action,
                count: current.count,
                limit: this.config.rateLimiting.maxRequests,
            });
        }
        return result;
    }
    /**
     * Sanitize and validate input data
     */
    validateAndSanitizeInput(input, schema) {
        const errors = [];
        const sanitized = {};
        try {
            for (const [field, rules] of Object.entries(schema)) {
                const value = input[field];
                // Required field validation
                if (rules.required && (value === undefined || value === null || value === '')) {
                    errors.push(`${field} is required`);
                    continue;
                }
                // Skip further validation if field is optional and not provided
                if (!rules.required && (value === undefined || value === null)) {
                    continue;
                }
                // Type validation
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`${field} must be of type ${rules.type}`);
                    continue;
                }
                // String validation
                if (rules.type === 'string' && typeof value === 'string') {
                    let sanitizedValue = value;
                    // Trim whitespace
                    sanitizedValue = sanitizedValue.trim();
                    // Length validation
                    if (rules.minLength && sanitizedValue.length < rules.minLength) {
                        errors.push(`${field} must be at least ${rules.minLength} characters`);
                        continue;
                    }
                    if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
                        errors.push(`${field} must not exceed ${rules.maxLength} characters`);
                        continue;
                    }
                    // Pattern validation
                    if (rules.pattern && !new RegExp(rules.pattern).test(sanitizedValue)) {
                        errors.push(`${field} format is invalid`);
                        continue;
                    }
                    // HTML/Script injection prevention
                    sanitizedValue = this.sanitizeString(sanitizedValue);
                    sanitized[field] = sanitizedValue;
                }
                else {
                    sanitized[field] = value;
                }
            }
            if (errors.length > 0) {
                return { valid: false, errors };
            }
            return { valid: true, sanitized };
        }
        catch (error) {
            logger_1.logger.error('Input validation error', { error: error.message });
            return { valid: false, errors: ['Validation error occurred'] };
        }
    }
    /**
     * Sanitize string to prevent injection attacks
     */
    sanitizeString(input) {
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocols
            .replace(/on\w+\s*=/gi, '') // Remove event handlers
            .replace(/script/gi, 'sc_ript') // Neutralize script tags
            .replace(/eval\s*\(/gi, 'ev_al(') // Neutralize eval calls
            .trim();
    }
    /**
     * Track suspicious activity
     */
    async trackSuspiciousActivity(userId, activityType, details) {
        const key = `${userId}:${activityType}`;
        const now = Date.now();
        const activity = this.suspiciousActivities.get(key) || {
            count: 0,
            firstSeen: now,
        };
        activity.count++;
        this.suspiciousActivities.set(key, activity);
        // Log as security event if threshold exceeded
        if (activity.count > 5) {
            await this.logSecurityEvent({
                type: 'suspicious_activity',
                severity: 'high',
                userId,
                action: 'repeated_suspicious_activity',
                details: {
                    activityType,
                    count: activity.count,
                    firstSeen: activity.firstSeen,
                    duration: now - activity.firstSeen,
                    ...details,
                },
            });
        }
    }
    /**
     * Encrypt sensitive data
     */
    encryptSensitiveData(data) {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipher(this.config.encryption.algorithm, this.encryptionKey);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return {
            encrypted,
            iv: iv.toString('hex'),
        };
    }
    /**
     * Decrypt sensitive data
     */
    decryptSensitiveData(encrypted, iv) {
        const decipher = crypto_1.default.createDecipher(this.config.encryption.algorithm, this.encryptionKey);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /**
     * Hash password securely
     */
    async hashPassword(password) {
        return await bcryptjs_1.default.hash(password, this.config.bcryptSaltRounds);
    }
    /**
     * Verify password against hash
     */
    async verifyPassword(password, hash) {
        return await bcryptjs_1.default.compare(password, hash);
    }
    /**
     * Log security event
     */
    async logSecurityEvent(event) {
        if (!this.config.auditLogging.enabled) {
            return;
        }
        const securityEvent = {
            eventId: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: event.type || 'authentication',
            severity: event.severity || 'low',
            userId: event.userId ?? '',
            organizationId: event.organizationId ?? '',
            action: event.action || 'unknown',
            resource: event.resource ?? '',
            ipAddress: event.ipAddress ?? '',
            userAgent: event.userAgent ?? '',
            timestamp: new Date().toISOString(),
            details: event.details || {},
        };
        // Add to in-memory log
        this.securityEvents.push(securityEvent);
        // Trim log if too large
        if (this.securityEvents.length > this.maxAuditLogSize) {
            this.securityEvents.shift();
        }
        // Log based on severity and configuration
        const shouldLog = this.config.auditLogging.logLevel === 'all' ||
            (this.config.auditLogging.logLevel === 'security' &&
                ['medium', 'high', 'critical'].includes(securityEvent.severity)) ||
            (this.config.auditLogging.logLevel === 'critical' &&
                ['critical'].includes(securityEvent.severity));
        if (shouldLog) {
            logger_1.logger.info('Security event logged', {
                eventId: securityEvent.eventId,
                type: securityEvent.type,
                severity: securityEvent.severity,
                action: securityEvent.action,
                userId: securityEvent.userId,
                organizationId: securityEvent.organizationId,
            });
        }
        this.emit('security_event', securityEvent);
    }
    /**
     * Get security events for audit
     */
    getSecurityEvents(filters) {
        let events = [...this.securityEvents];
        if (filters) {
            if (filters.userId) {
                events = events.filter((e) => e.userId === filters.userId);
            }
            if (filters.organizationId) {
                events = events.filter((e) => e.organizationId === filters.organizationId);
            }
            if (filters.type) {
                events = events.filter((e) => e.type === filters.type);
            }
            if (filters.severity) {
                events = events.filter((e) => e.severity === filters.severity);
            }
            if (filters.limit) {
                events = events.slice(-filters.limit);
            }
        }
        return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    /**
     * Get security metrics
     */
    getSecurityMetrics() {
        const eventsByType = {};
        const eventsBySeverity = {};
        let rateLimitViolations = 0;
        for (const event of this.securityEvents) {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
            if (event.type === 'rate_limit') {
                rateLimitViolations++;
            }
        }
        return {
            totalEvents: this.securityEvents.length,
            eventsByType,
            eventsBySeverity,
            suspiciousActivities: this.suspiciousActivities.size,
            rateLimitViolations,
        };
    }
    /**
     * Start cleanup timer for old data
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldData();
        }, 3600000); // Every hour
    }
    /**
     * Cleanup old rate limit and suspicious activity data
     */
    cleanupOldData() {
        const now = Date.now();
        const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
        // Cleanup old rate limits
        let cleanedRateLimits = 0;
        for (const [key, data] of this.rateLimits.entries()) {
            if (data.resetTime < now) {
                this.rateLimits.delete(key);
                cleanedRateLimits++;
            }
        }
        // Cleanup old suspicious activities
        let cleanedActivities = 0;
        for (const [key, activity] of this.suspiciousActivities.entries()) {
            if (activity.firstSeen < cutoffTime) {
                this.suspiciousActivities.delete(key);
                cleanedActivities++;
            }
        }
        if (cleanedRateLimits > 0 || cleanedActivities > 0) {
            logger_1.logger.debug('Security data cleanup completed', {
                cleanedRateLimits,
                cleanedActivities,
            });
        }
    }
    /**
     * Destroy and cleanup
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.removeAllListeners();
        logger_1.logger.info('Security Manager destroyed');
    }
}
exports.SecurityManager = SecurityManager;
//# sourceMappingURL=SecurityManager.js.map