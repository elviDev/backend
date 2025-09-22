import { Type, Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ValidationError } from './errors';

/**
 * Common validation schemas and utilities
 * TypeBox schemas for request/response validation
 */

// Base schemas
export const UUIDSchema = Type.String({
  format: 'uuid',
  description: 'UUID v4 string'
});

export const EmailSchema = Type.String({
  format: 'email',
  maxLength: 255,
  description: 'Valid email address'
});

export const TimestampSchema = Type.String({
  format: 'date-time',
  description: 'ISO 8601 timestamp'
});

export const PaginationSchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' }))
});

// User-related schemas
export const UserRoleSchema = Type.Union([
  Type.Literal('ceo'),
  Type.Literal('manager'),
  Type.Literal('staff')
]);

export const UserStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('inactive'),
  Type.Literal('suspended'),
  Type.Literal('pending')
]);

// Task-related schemas
export const TaskPrioritySchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('urgent'),
  Type.Literal('critical')
]);

export const TaskStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('in_progress'),
  Type.Literal('in-progress'), // Frontend format (will be normalized to in_progress)
  Type.Literal('review'),
  Type.Literal('completed'),
  Type.Literal('cancelled'),
  Type.Literal('on_hold'),
  Type.Literal('on-hold') // Frontend format (will be normalized to on_hold)
]);

export const BusinessValueSchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical')
]);

// Channel-related schemas
export const ChannelTypeSchema = Type.Union([
  Type.Literal('general'),
  Type.Literal('project'),
  Type.Literal('department'),
  Type.Literal('announcement'),
  Type.Literal('initiative'),
  Type.Literal('temporary')
]);

export const ChannelPrivacySchema = Type.Union([
  Type.Literal('public'),
  Type.Literal('private'),
  Type.Literal('restricted')
]);

// Common response schemas
export const SuccessResponseSchema = Type.Object({
  success: Type.Boolean({ default: true }),
  message: Type.Optional(Type.String()),
  timestamp: TimestampSchema
});

export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    message: Type.String(),
    code: Type.String(),
    statusCode: Type.Integer(),
    details: Type.Optional(Type.Array(Type.Object({
      field: Type.String(),
      message: Type.String(),
      value: Type.Optional(Type.Any())
    }))),
    retryAfter: Type.Optional(Type.Integer())
  }),
  timestamp: TimestampSchema
});

export const PaginatedResponseSchema = <T extends TSchema>(dataSchema: T) => Type.Object({
  success: Type.Boolean({ default: true }),
  data: Type.Array(dataSchema),
  pagination: Type.Object({
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer(),
    hasMore: Type.Boolean()
  }),
  timestamp: TimestampSchema
});

// Validation utilities
export class SchemaValidator {
  /**
   * Validate data against schema and throw ValidationError if invalid
   */
  static validate<T extends TSchema>(schema: T, data: unknown): Static<T> {
    const errors = [...Value.Errors(schema, data)];
    
    if (errors.length > 0) {
      const validationErrors = errors.map(error => ({
        field: error.path.replace('/', '.').replace(/^\./, '') || 'root',
        message: error.message,
        value: error.value
      }));

      throw new ValidationError(
        'Validation failed',
        validationErrors
      );
    }

    return data as Static<T>;
  }

  /**
   * Check if data is valid against schema
   */
  static isValid<T extends TSchema>(schema: T, data: unknown): boolean {
    return Value.Check(schema, data);
  }

  /**
   * Clean data according to schema (remove extra properties)
   */
  static clean<T extends TSchema>(schema: T, data: unknown): Static<T> {
    return (Value as any).Clean(schema, data) as Static<T>;
  }

  /**
   * Apply default values from schema
   */
  static withDefaults<T extends TSchema>(schema: T, data: unknown): Static<T> {
    return (Value as any).Default(schema, data) as Static<T>;
  }
}

// Custom validators
export const CustomValidators = {
  /**
   * Validate password strength
   */
  password: (password: string): boolean => {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false;
    return true;
  },

  /**
   * Validate phone number format
   */
  phoneNumber: (phone: string): boolean => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  },

  /**
   * Validate URL format
   */
  url: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate slug format (for channels, etc.)
   */
  slug: (slug: string): boolean => {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return slugRegex.test(slug) && slug.length >= 2 && slug.length <= 50;
  },

  /**
   * Validate color hex code
   */
  hexColor: (color: string): boolean => {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
  }
};

// Request validation middleware factory
export const validateRequest = <T extends TSchema>(schema: T) => {
  return (data: unknown) => {
    return SchemaValidator.validate(schema, data);
  };
};

// Common validation patterns
export const ValidationPatterns = {
  // Strong password requirements
  StrongPasswordSchema: Type.String({
    minLength: 8,
    maxLength: 128,
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]',
    description: 'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character'
  }),

  // Phone number schema
  PhoneNumberSchema: Type.String({
    pattern: '^\\+?[1-9]\\d{1,14}$',
    description: 'Valid international phone number'
  }),

  // URL schema
  UrlSchema: Type.String({
    format: 'uri',
    maxLength: 2048,
    description: 'Valid HTTP(S) URL'
  }),

  // Slug schema (for channels, etc.)
  SlugSchema: Type.String({
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    minLength: 2,
    maxLength: 50,
    description: 'Valid slug (lowercase letters, numbers, and hyphens)'
  }),

  // Hex color schema
  HexColorSchema: Type.String({
    pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
    description: 'Valid hex color code'
  }),

  // Tag schema
  TagSchema: Type.String({
    minLength: 1,
    maxLength: 50,
    pattern: '^[a-zA-Z0-9_-]+$',
    description: 'Valid tag name'
  }),

  // Name schema (for users, channels, etc.)
  NameSchema: Type.String({
    minLength: 1,
    maxLength: 255,
    pattern: '^[^\\s]+(\\s+[^\\s]+)*$', // No leading/trailing whitespace, no double spaces
    description: 'Valid name (no leading/trailing spaces)'
  })
};

export type ValidationPattern = keyof typeof ValidationPatterns;