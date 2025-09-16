/**
 * Custom error classes for the CEO Communication Platform
 * Provides structured error handling with proper HTTP status codes
 */
export declare abstract class BaseError extends Error {
    readonly context?: Record<string, unknown> | undefined;
    abstract readonly statusCode: number;
    abstract readonly code: string;
    abstract readonly isOperational: boolean;
    constructor(message: string, context?: Record<string, unknown> | undefined);
    toJSON(): {
        name: string;
        message: string;
        statusCode: number;
        code: string;
        context: Record<string, unknown> | undefined;
        stack: string | undefined;
    };
}
export declare class AuthenticationError extends BaseError {
    readonly statusCode = 401;
    readonly code = "AUTHENTICATION_FAILED";
    readonly isOperational = true;
}
export declare class AuthorizationError extends BaseError {
    readonly statusCode = 403;
    readonly code = "AUTHORIZATION_FAILED";
    readonly isOperational = true;
}
export declare class TokenExpiredError extends BaseError {
    readonly statusCode = 401;
    readonly code = "TOKEN_EXPIRED";
    readonly isOperational = true;
}
export declare class InvalidTokenError extends BaseError {
    readonly statusCode = 401;
    readonly code = "INVALID_TOKEN";
    readonly isOperational = true;
}
export declare class ValidationError extends BaseError {
    readonly validationErrors: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>;
    readonly statusCode = 400;
    readonly code = "VALIDATION_ERROR";
    readonly isOperational = true;
    constructor(message: string, validationErrors: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>, context?: Record<string, unknown>);
    toJSON(): {
        validationErrors: {
            field: string;
            message: string;
            value?: unknown;
        }[];
        name: string;
        message: string;
        statusCode: number;
        code: string;
        context: Record<string, unknown> | undefined;
        stack: string | undefined;
    };
}
export declare class NotFoundError extends BaseError {
    readonly statusCode = 404;
    readonly code = "RESOURCE_NOT_FOUND";
    readonly isOperational = true;
}
export declare class ConflictError extends BaseError {
    readonly statusCode = 409;
    readonly code = "RESOURCE_CONFLICT";
    readonly isOperational = true;
}
export declare class DuplicateResourceError extends BaseError {
    readonly statusCode = 409;
    readonly code = "DUPLICATE_RESOURCE";
    readonly isOperational = true;
}
export declare class RateLimitError extends BaseError {
    readonly retryAfter: number;
    readonly statusCode = 429;
    readonly code = "RATE_LIMIT_EXCEEDED";
    readonly isOperational = true;
    constructor(message: string, retryAfter: number, context?: Record<string, unknown>);
    toJSON(): {
        retryAfter: number;
        name: string;
        message: string;
        statusCode: number;
        code: string;
        context: Record<string, unknown> | undefined;
        stack: string | undefined;
    };
}
export declare class DatabaseError extends BaseError {
    readonly statusCode = 500;
    readonly code = "DATABASE_ERROR";
    readonly isOperational = true;
}
export declare class DatabaseConnectionError extends BaseError {
    readonly statusCode = 503;
    readonly code = "DATABASE_CONNECTION_ERROR";
    readonly isOperational = true;
}
export declare class TransactionError extends BaseError {
    readonly statusCode = 500;
    readonly code = "TRANSACTION_ERROR";
    readonly isOperational = true;
}
export declare class ExternalServiceError extends BaseError {
    readonly service: string;
    readonly originalError?: Error | undefined;
    readonly statusCode = 502;
    readonly code = "EXTERNAL_SERVICE_ERROR";
    readonly isOperational = true;
    constructor(message: string, service: string, originalError?: Error | undefined, context?: Record<string, unknown>);
    toJSON(): {
        service: string;
        originalError: string | undefined;
        name: string;
        message: string;
        statusCode: number;
        code: string;
        context: Record<string, unknown> | undefined;
        stack: string | undefined;
    };
}
export declare class ConfigurationError extends BaseError {
    readonly statusCode = 500;
    readonly code = "CONFIGURATION_ERROR";
    readonly isOperational = false;
}
export declare class CacheError extends BaseError {
    readonly statusCode = 500;
    readonly code = "CACHE_ERROR";
    readonly isOperational = true;
}
export declare class WebSocketError extends BaseError {
    readonly statusCode = 500;
    readonly code = "WEBSOCKET_ERROR";
    readonly isOperational = true;
}
export declare class VoiceProcessingError extends BaseError {
    readonly statusCode = 422;
    readonly code = "VOICE_PROCESSING_ERROR";
    readonly isOperational = true;
}
export declare class SpeechRecognitionError extends BaseError {
    readonly statusCode = 422;
    readonly code = "SPEECH_RECOGNITION_ERROR";
    readonly isOperational = true;
}
export declare class CommandExecutionError extends BaseError {
    readonly statusCode = 422;
    readonly code = "COMMAND_EXECUTION_ERROR";
    readonly isOperational = true;
}
export declare class CommandValidationError extends BaseError {
    readonly statusCode = 400;
    readonly code = "COMMAND_VALIDATION_ERROR";
    readonly isOperational = true;
}
export declare class BusinessLogicError extends BaseError {
    readonly statusCode = 422;
    readonly code = "BUSINESS_LOGIC_ERROR";
    readonly isOperational = true;
}
export declare class InsufficientPermissionsError extends BaseError {
    readonly statusCode = 403;
    readonly code = "INSUFFICIENT_PERMISSIONS";
    readonly isOperational = true;
}
export declare const isOperationalError: (error: Error) => boolean;
export declare const isAuthenticationError: (error: Error) => boolean;
export declare const isDatabaseError: (error: Error) => boolean;
export declare const createErrorContext: (req?: {
    user?: {
        id: string;
        email: string;
        role: string;
    };
    ip?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
}) => Record<string, unknown>;
export declare const formatErrorResponse: (error: BaseError) => {
    error: {
        service?: string | undefined;
        retryAfter?: number | undefined;
        validationErrors?: {
            field: string;
            message: string;
            value?: unknown;
        }[] | undefined;
        name: string;
        message: string;
        code: string;
        statusCode: number;
    };
    timestamp: string;
};
//# sourceMappingURL=errors.d.ts.map