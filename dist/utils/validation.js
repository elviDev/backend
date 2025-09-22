"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationPatterns = exports.validateRequest = exports.CustomValidators = exports.SchemaValidator = exports.PaginatedResponseSchema = exports.ErrorResponseSchema = exports.SuccessResponseSchema = exports.ChannelPrivacySchema = exports.ChannelTypeSchema = exports.BusinessValueSchema = exports.TaskStatusSchema = exports.TaskPrioritySchema = exports.UserStatusSchema = exports.UserRoleSchema = exports.PaginationSchema = exports.TimestampSchema = exports.EmailSchema = exports.UUIDSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const value_1 = require("@sinclair/typebox/value");
const errors_1 = require("./errors");
/**
 * Common validation schemas and utilities
 * TypeBox schemas for request/response validation
 */
// Base schemas
exports.UUIDSchema = typebox_1.Type.String({
    format: 'uuid',
    description: 'UUID v4 string'
});
exports.EmailSchema = typebox_1.Type.String({
    format: 'email',
    maxLength: 255,
    description: 'Valid email address'
});
exports.TimestampSchema = typebox_1.Type.String({
    format: 'date-time',
    description: 'ISO 8601 timestamp'
});
exports.PaginationSchema = typebox_1.Type.Object({
    limit: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    offset: typebox_1.Type.Optional(typebox_1.Type.Integer({ minimum: 0, default: 0 })),
    sortBy: typebox_1.Type.Optional(typebox_1.Type.String()),
    sortOrder: typebox_1.Type.Optional(typebox_1.Type.Union([typebox_1.Type.Literal('asc'), typebox_1.Type.Literal('desc')], { default: 'desc' }))
});
// User-related schemas
exports.UserRoleSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('ceo'),
    typebox_1.Type.Literal('manager'),
    typebox_1.Type.Literal('staff')
]);
exports.UserStatusSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('active'),
    typebox_1.Type.Literal('inactive'),
    typebox_1.Type.Literal('suspended'),
    typebox_1.Type.Literal('pending')
]);
// Task-related schemas
exports.TaskPrioritySchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('low'),
    typebox_1.Type.Literal('medium'),
    typebox_1.Type.Literal('high'),
    typebox_1.Type.Literal('urgent'),
    typebox_1.Type.Literal('critical')
]);
exports.TaskStatusSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('pending'),
    typebox_1.Type.Literal('in_progress'),
    typebox_1.Type.Literal('in-progress'), // Frontend format (will be normalized to in_progress)
    typebox_1.Type.Literal('review'),
    typebox_1.Type.Literal('completed'),
    typebox_1.Type.Literal('cancelled'),
    typebox_1.Type.Literal('on_hold'),
    typebox_1.Type.Literal('on-hold') // Frontend format (will be normalized to on_hold)
]);
exports.BusinessValueSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('low'),
    typebox_1.Type.Literal('medium'),
    typebox_1.Type.Literal('high'),
    typebox_1.Type.Literal('critical')
]);
// Channel-related schemas
exports.ChannelTypeSchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('general'),
    typebox_1.Type.Literal('project'),
    typebox_1.Type.Literal('department'),
    typebox_1.Type.Literal('announcement'),
    typebox_1.Type.Literal('initiative'),
    typebox_1.Type.Literal('temporary')
]);
exports.ChannelPrivacySchema = typebox_1.Type.Union([
    typebox_1.Type.Literal('public'),
    typebox_1.Type.Literal('private'),
    typebox_1.Type.Literal('restricted')
]);
// Common response schemas
exports.SuccessResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Boolean({ default: true }),
    message: typebox_1.Type.Optional(typebox_1.Type.String()),
    timestamp: exports.TimestampSchema
});
exports.ErrorResponseSchema = typebox_1.Type.Object({
    error: typebox_1.Type.Object({
        message: typebox_1.Type.String(),
        code: typebox_1.Type.String(),
        statusCode: typebox_1.Type.Integer(),
        details: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            field: typebox_1.Type.String(),
            message: typebox_1.Type.String(),
            value: typebox_1.Type.Optional(typebox_1.Type.Any())
        }))),
        retryAfter: typebox_1.Type.Optional(typebox_1.Type.Integer())
    }),
    timestamp: exports.TimestampSchema
});
const PaginatedResponseSchema = (dataSchema) => typebox_1.Type.Object({
    success: typebox_1.Type.Boolean({ default: true }),
    data: typebox_1.Type.Array(dataSchema),
    pagination: typebox_1.Type.Object({
        total: typebox_1.Type.Integer(),
        limit: typebox_1.Type.Integer(),
        offset: typebox_1.Type.Integer(),
        hasMore: typebox_1.Type.Boolean()
    }),
    timestamp: exports.TimestampSchema
});
exports.PaginatedResponseSchema = PaginatedResponseSchema;
// Validation utilities
class SchemaValidator {
    /**
     * Validate data against schema and throw ValidationError if invalid
     */
    static validate(schema, data) {
        const errors = [...value_1.Value.Errors(schema, data)];
        if (errors.length > 0) {
            const validationErrors = errors.map(error => ({
                field: error.path.replace('/', '.').replace(/^\./, '') || 'root',
                message: error.message,
                value: error.value
            }));
            throw new errors_1.ValidationError('Validation failed', validationErrors);
        }
        return data;
    }
    /**
     * Check if data is valid against schema
     */
    static isValid(schema, data) {
        return value_1.Value.Check(schema, data);
    }
    /**
     * Clean data according to schema (remove extra properties)
     */
    static clean(schema, data) {
        return value_1.Value.Clean(schema, data);
    }
    /**
     * Apply default values from schema
     */
    static withDefaults(schema, data) {
        return value_1.Value.Default(schema, data);
    }
}
exports.SchemaValidator = SchemaValidator;
// Custom validators
exports.CustomValidators = {
    /**
     * Validate password strength
     */
    password: (password) => {
        if (password.length < 8)
            return false;
        if (!/[A-Z]/.test(password))
            return false;
        if (!/[a-z]/.test(password))
            return false;
        if (!/[0-9]/.test(password))
            return false;
        if (!/[^A-Za-z0-9]/.test(password))
            return false;
        return true;
    },
    /**
     * Validate phone number format
     */
    phoneNumber: (phone) => {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
    },
    /**
     * Validate URL format
     */
    url: (url) => {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    },
    /**
     * Validate slug format (for channels, etc.)
     */
    slug: (slug) => {
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        return slugRegex.test(slug) && slug.length >= 2 && slug.length <= 50;
    },
    /**
     * Validate color hex code
     */
    hexColor: (color) => {
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        return hexRegex.test(color);
    }
};
// Request validation middleware factory
const validateRequest = (schema) => {
    return (data) => {
        return SchemaValidator.validate(schema, data);
    };
};
exports.validateRequest = validateRequest;
// Common validation patterns
exports.ValidationPatterns = {
    // Strong password requirements
    StrongPasswordSchema: typebox_1.Type.String({
        minLength: 8,
        maxLength: 128,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]',
        description: 'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character'
    }),
    // Phone number schema
    PhoneNumberSchema: typebox_1.Type.String({
        pattern: '^\\+?[1-9]\\d{1,14}$',
        description: 'Valid international phone number'
    }),
    // URL schema
    UrlSchema: typebox_1.Type.String({
        format: 'uri',
        maxLength: 2048,
        description: 'Valid HTTP(S) URL'
    }),
    // Slug schema (for channels, etc.)
    SlugSchema: typebox_1.Type.String({
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 2,
        maxLength: 50,
        description: 'Valid slug (lowercase letters, numbers, and hyphens)'
    }),
    // Hex color schema
    HexColorSchema: typebox_1.Type.String({
        pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
        description: 'Valid hex color code'
    }),
    // Tag schema
    TagSchema: typebox_1.Type.String({
        minLength: 1,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9_-]+$',
        description: 'Valid tag name'
    }),
    // Name schema (for users, channels, etc.)
    NameSchema: typebox_1.Type.String({
        minLength: 1,
        maxLength: 255,
        pattern: '^[^\\s]+(\\s+[^\\s]+)*$', // No leading/trailing whitespace, no double spaces
        description: 'Valid name (no leading/trailing spaces)'
    })
};
//# sourceMappingURL=validation.js.map