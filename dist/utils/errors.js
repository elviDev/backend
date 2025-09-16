"use strict";
/**
 * Custom error classes for the CEO Communication Platform
 * Provides structured error handling with proper HTTP status codes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatErrorResponse = exports.createErrorContext = exports.isDatabaseError = exports.isAuthenticationError = exports.isOperationalError = exports.InsufficientPermissionsError = exports.BusinessLogicError = exports.CommandValidationError = exports.CommandExecutionError = exports.SpeechRecognitionError = exports.VoiceProcessingError = exports.WebSocketError = exports.CacheError = exports.ConfigurationError = exports.ExternalServiceError = exports.TransactionError = exports.DatabaseConnectionError = exports.DatabaseError = exports.RateLimitError = exports.DuplicateResourceError = exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.InvalidTokenError = exports.TokenExpiredError = exports.AuthorizationError = exports.AuthenticationError = exports.BaseError = void 0;
class BaseError extends Error {
    context;
    constructor(message, context) {
        super(message);
        this.context = context;
        this.name = this.constructor.name;
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            code: this.code,
            context: this.context,
            stack: this.stack,
        };
    }
}
exports.BaseError = BaseError;
// Authentication and Authorization Errors
class AuthenticationError extends BaseError {
    statusCode = 401;
    code = 'AUTHENTICATION_FAILED';
    isOperational = true;
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends BaseError {
    statusCode = 403;
    code = 'AUTHORIZATION_FAILED';
    isOperational = true;
}
exports.AuthorizationError = AuthorizationError;
class TokenExpiredError extends BaseError {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    isOperational = true;
}
exports.TokenExpiredError = TokenExpiredError;
class InvalidTokenError extends BaseError {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    isOperational = true;
}
exports.InvalidTokenError = InvalidTokenError;
// Validation Errors
class ValidationError extends BaseError {
    validationErrors;
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    isOperational = true;
    constructor(message, validationErrors, context) {
        super(message, context);
        this.validationErrors = validationErrors;
        this.validationErrors = validationErrors;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            validationErrors: this.validationErrors,
        };
    }
}
exports.ValidationError = ValidationError;
// Resource Errors
class NotFoundError extends BaseError {
    statusCode = 404;
    code = 'RESOURCE_NOT_FOUND';
    isOperational = true;
}
exports.NotFoundError = NotFoundError;
class ConflictError extends BaseError {
    statusCode = 409;
    code = 'RESOURCE_CONFLICT';
    isOperational = true;
}
exports.ConflictError = ConflictError;
class DuplicateResourceError extends BaseError {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    isOperational = true;
}
exports.DuplicateResourceError = DuplicateResourceError;
// Rate Limiting Errors
class RateLimitError extends BaseError {
    retryAfter;
    statusCode = 429;
    code = 'RATE_LIMIT_EXCEEDED';
    isOperational = true;
    constructor(message, retryAfter, context) {
        super(message, context);
        this.retryAfter = retryAfter;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            retryAfter: this.retryAfter,
        };
    }
}
exports.RateLimitError = RateLimitError;
// Database Errors
class DatabaseError extends BaseError {
    statusCode = 500;
    code = 'DATABASE_ERROR';
    isOperational = true;
}
exports.DatabaseError = DatabaseError;
class DatabaseConnectionError extends BaseError {
    statusCode = 503;
    code = 'DATABASE_CONNECTION_ERROR';
    isOperational = true;
}
exports.DatabaseConnectionError = DatabaseConnectionError;
class TransactionError extends BaseError {
    statusCode = 500;
    code = 'TRANSACTION_ERROR';
    isOperational = true;
}
exports.TransactionError = TransactionError;
// External Service Errors
class ExternalServiceError extends BaseError {
    service;
    originalError;
    statusCode = 502;
    code = 'EXTERNAL_SERVICE_ERROR';
    isOperational = true;
    constructor(message, service, originalError, context) {
        super(message, context);
        this.service = service;
        this.originalError = originalError;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            service: this.service,
            originalError: this.originalError?.message,
        };
    }
}
exports.ExternalServiceError = ExternalServiceError;
// Configuration Errors
class ConfigurationError extends BaseError {
    statusCode = 500;
    code = 'CONFIGURATION_ERROR';
    isOperational = false; // Non-operational - requires restart/fix
}
exports.ConfigurationError = ConfigurationError;
// Cache Errors
class CacheError extends BaseError {
    statusCode = 500;
    code = 'CACHE_ERROR';
    isOperational = true;
}
exports.CacheError = CacheError;
// WebSocket Errors
class WebSocketError extends BaseError {
    statusCode = 500;
    code = 'WEBSOCKET_ERROR';
    isOperational = true;
}
exports.WebSocketError = WebSocketError;
// Voice Processing Errors (for Phase 2)
class VoiceProcessingError extends BaseError {
    statusCode = 422;
    code = 'VOICE_PROCESSING_ERROR';
    isOperational = true;
}
exports.VoiceProcessingError = VoiceProcessingError;
class SpeechRecognitionError extends BaseError {
    statusCode = 422;
    code = 'SPEECH_RECOGNITION_ERROR';
    isOperational = true;
}
exports.SpeechRecognitionError = SpeechRecognitionError;
// Command Execution Errors (for Phase 3)
class CommandExecutionError extends BaseError {
    statusCode = 422;
    code = 'COMMAND_EXECUTION_ERROR';
    isOperational = true;
}
exports.CommandExecutionError = CommandExecutionError;
class CommandValidationError extends BaseError {
    statusCode = 400;
    code = 'COMMAND_VALIDATION_ERROR';
    isOperational = true;
}
exports.CommandValidationError = CommandValidationError;
// Business Logic Errors
class BusinessLogicError extends BaseError {
    statusCode = 422;
    code = 'BUSINESS_LOGIC_ERROR';
    isOperational = true;
}
exports.BusinessLogicError = BusinessLogicError;
class InsufficientPermissionsError extends BaseError {
    statusCode = 403;
    code = 'INSUFFICIENT_PERMISSIONS';
    isOperational = true;
}
exports.InsufficientPermissionsError = InsufficientPermissionsError;
// Utility functions for error handling
const isOperationalError = (error) => {
    return error instanceof BaseError && error.isOperational;
};
exports.isOperationalError = isOperationalError;
const isAuthenticationError = (error) => {
    return error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof TokenExpiredError ||
        error instanceof InvalidTokenError;
};
exports.isAuthenticationError = isAuthenticationError;
const isDatabaseError = (error) => {
    return error instanceof DatabaseError ||
        error instanceof DatabaseConnectionError ||
        error instanceof TransactionError;
};
exports.isDatabaseError = isDatabaseError;
// Error context helpers
const createErrorContext = (req) => {
    if (!req)
        return {};
    return {
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        url: req.url,
        userAgent: req.headers?.['user-agent'],
        timestamp: new Date().toISOString(),
    };
};
exports.createErrorContext = createErrorContext;
// Error response formatter
const formatErrorResponse = (error) => {
    return {
        error: {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            ...(error instanceof ValidationError && {
                validationErrors: error.validationErrors
            }),
            ...(error instanceof RateLimitError && {
                retryAfter: error.retryAfter
            }),
            ...(error instanceof ExternalServiceError && {
                service: error.service
            }),
        },
        timestamp: new Date().toISOString(),
    };
};
exports.formatErrorResponse = formatErrorResponse;
//# sourceMappingURL=errors.js.map