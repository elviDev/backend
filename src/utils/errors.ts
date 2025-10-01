/**
 * Custom error classes for the CEO Communication Platform
 * Provides structured error handling with proper HTTP status codes
 */

export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  abstract readonly isOperational: boolean;
  
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
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

// Authentication and Authorization Errors
export class AuthenticationError extends BaseError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_FAILED';
  readonly isOperational = true;
}

export class AuthorizationError extends BaseError {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_FAILED';
  readonly isOperational = true;
}

export class TokenExpiredError extends BaseError {
  readonly statusCode = 401;
  readonly code = 'TOKEN_EXPIRED';
  readonly isOperational = true;
}

export class InvalidTokenError extends BaseError {
  readonly statusCode = 401;
  readonly code = 'INVALID_TOKEN';
  readonly isOperational = true;
}

// Validation Errors
export class ValidationError extends BaseError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly validationErrors: Array<{
      field: string;
      message: string;
      value?: unknown;
    }>,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.validationErrors = validationErrors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

// Resource Errors
export class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly isOperational = true;
}

export class ConflictError extends BaseError {
  readonly statusCode = 409;
  readonly code = 'RESOURCE_CONFLICT';
  readonly isOperational = true;
}

export class DuplicateResourceError extends BaseError {
  readonly statusCode = 409;
  readonly code = 'DUPLICATE_RESOURCE';
  readonly isOperational = true;
}

// Rate Limiting Errors
export class RateLimitError extends BaseError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly retryAfter: number,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

// Database Errors
export class DatabaseError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'DATABASE_ERROR';
  readonly isOperational = true;
  
  constructor(
    message: string,
    context?: Record<string, unknown> & { isTimeout?: boolean }
  ) {
    super(message, context);
  }
  
  get isTimeout(): boolean {
    return (this.context as any)?.isTimeout === true;
  }
  
  get userFriendlyMessage(): string {
    if (this.isTimeout) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }
    return 'An unexpected error occurred. Please try again.';
  }
}

export class DatabaseConnectionError extends BaseError {
  readonly statusCode = 503;
  readonly code = 'DATABASE_CONNECTION_ERROR';
  readonly isOperational = true;
  
  get userFriendlyMessage(): string {
    return 'Service temporarily unavailable. Please try again in a moment.';
  }
}

export class TransactionError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'TRANSACTION_ERROR';
  readonly isOperational = true;
}

// External Service Errors
export class ExternalServiceError extends BaseError {
  readonly statusCode = 502;
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly service: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      service: this.service,
      originalError: this.originalError?.message,
    };
  }
}

// Configuration Errors
export class ConfigurationError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'CONFIGURATION_ERROR';
  readonly isOperational = false; // Non-operational - requires restart/fix
}

// Cache Errors
export class CacheError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'CACHE_ERROR';
  readonly isOperational = true;
}

// WebSocket Errors
export class WebSocketError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'WEBSOCKET_ERROR';
  readonly isOperational = true;
}

// Voice Processing Errors (for Phase 2)
export class VoiceProcessingError extends BaseError {
  readonly statusCode = 422;
  readonly code = 'VOICE_PROCESSING_ERROR';
  readonly isOperational = true;
}

export class SpeechRecognitionError extends BaseError {
  readonly statusCode = 422;
  readonly code = 'SPEECH_RECOGNITION_ERROR';
  readonly isOperational = true;
}

// Command Execution Errors (for Phase 3)
export class CommandExecutionError extends BaseError {
  readonly statusCode = 422;
  readonly code = 'COMMAND_EXECUTION_ERROR';
  readonly isOperational = true;
}

export class CommandValidationError extends BaseError {
  readonly statusCode = 400;
  readonly code = 'COMMAND_VALIDATION_ERROR';
  readonly isOperational = true;
}

// Business Logic Errors
export class BusinessLogicError extends BaseError {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly isOperational = true;
}

export class InsufficientPermissionsError extends BaseError {
  readonly statusCode = 403;
  readonly code = 'INSUFFICIENT_PERMISSIONS';
  readonly isOperational = true;
}

// Utility functions for error handling
export const isOperationalError = (error: Error): boolean => {
  return error instanceof BaseError && error.isOperational;
};

export const isAuthenticationError = (error: Error): boolean => {
  return error instanceof AuthenticationError || 
         error instanceof AuthorizationError ||
         error instanceof TokenExpiredError ||
         error instanceof InvalidTokenError;
};

export const isDatabaseError = (error: Error): boolean => {
  return error instanceof DatabaseError || 
         error instanceof DatabaseConnectionError ||
         error instanceof TransactionError;
};

// Error context helpers
export const createErrorContext = (
  req?: { 
    user?: { id: string; email: string; role: string };
    ip?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
  }
): Record<string, unknown> => {
  if (!req) return {};

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

// Error response formatter
export const formatErrorResponse = (error: BaseError) => {
  // Get user-friendly message for database errors
  const getUserFriendlyMessage = (err: BaseError): string => {
    if (err instanceof DatabaseError || err instanceof DatabaseConnectionError) {
      return (err as any).userFriendlyMessage || err.message;
    }
    return err.message;
  };

  return {
    error: {
      name: error.name,
      message: getUserFriendlyMessage(error),
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
      ...(error instanceof DatabaseError && error.isTimeout && {
        isRetryable: true,
        recommendedDelay: 2000 // 2 seconds
      }),
    },
    timestamp: new Date().toISOString(),
  };
};