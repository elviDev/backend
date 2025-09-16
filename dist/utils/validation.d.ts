import { Static, TSchema } from '@sinclair/typebox';
/**
 * Common validation schemas and utilities
 * TypeBox schemas for request/response validation
 */
export declare const UUIDSchema: import("@sinclair/typebox").TString;
export declare const EmailSchema: import("@sinclair/typebox").TString;
export declare const TimestampSchema: import("@sinclair/typebox").TString;
export declare const PaginationSchema: import("@sinclair/typebox").TObject<{
    limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    offset: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    sortBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sortOrder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const UserRoleSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ceo">, import("@sinclair/typebox").TLiteral<"manager">, import("@sinclair/typebox").TLiteral<"staff">]>;
export declare const UserStatusSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"active">, import("@sinclair/typebox").TLiteral<"inactive">, import("@sinclair/typebox").TLiteral<"suspended">, import("@sinclair/typebox").TLiteral<"pending">]>;
export declare const TaskPrioritySchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"urgent">, import("@sinclair/typebox").TLiteral<"critical">]>;
export declare const TaskStatusSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"pending">, import("@sinclair/typebox").TLiteral<"in_progress">, import("@sinclair/typebox").TLiteral<"review">, import("@sinclair/typebox").TLiteral<"completed">, import("@sinclair/typebox").TLiteral<"cancelled">, import("@sinclair/typebox").TLiteral<"on_hold">]>;
export declare const BusinessValueSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"critical">]>;
export declare const ChannelTypeSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"general">, import("@sinclair/typebox").TLiteral<"project">, import("@sinclair/typebox").TLiteral<"department">, import("@sinclair/typebox").TLiteral<"announcement">, import("@sinclair/typebox").TLiteral<"initiative">, import("@sinclair/typebox").TLiteral<"temporary">]>;
export declare const ChannelPrivacySchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"public">, import("@sinclair/typebox").TLiteral<"private">, import("@sinclair/typebox").TLiteral<"restricted">]>;
export declare const SuccessResponseSchema: import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TBoolean;
    message: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timestamp: import("@sinclair/typebox").TString;
}>;
export declare const ErrorResponseSchema: import("@sinclair/typebox").TObject<{
    error: import("@sinclair/typebox").TObject<{
        message: import("@sinclair/typebox").TString;
        code: import("@sinclair/typebox").TString;
        statusCode: import("@sinclair/typebox").TInteger;
        details: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            field: import("@sinclair/typebox").TString;
            message: import("@sinclair/typebox").TString;
            value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TAny>;
        }>>>;
        retryAfter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    }>;
    timestamp: import("@sinclair/typebox").TString;
}>;
export declare const PaginatedResponseSchema: <T extends TSchema>(dataSchema: T) => import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TBoolean;
    data: import("@sinclair/typebox").TArray<T>;
    pagination: import("@sinclair/typebox").TObject<{
        total: import("@sinclair/typebox").TInteger;
        limit: import("@sinclair/typebox").TInteger;
        offset: import("@sinclair/typebox").TInteger;
        hasMore: import("@sinclair/typebox").TBoolean;
    }>;
    timestamp: import("@sinclair/typebox").TString;
}>;
export declare class SchemaValidator {
    /**
     * Validate data against schema and throw ValidationError if invalid
     */
    static validate<T extends TSchema>(schema: T, data: unknown): Static<T>;
    /**
     * Check if data is valid against schema
     */
    static isValid<T extends TSchema>(schema: T, data: unknown): boolean;
    /**
     * Clean data according to schema (remove extra properties)
     */
    static clean<T extends TSchema>(schema: T, data: unknown): Static<T>;
    /**
     * Apply default values from schema
     */
    static withDefaults<T extends TSchema>(schema: T, data: unknown): Static<T>;
}
export declare const CustomValidators: {
    /**
     * Validate password strength
     */
    password: (password: string) => boolean;
    /**
     * Validate phone number format
     */
    phoneNumber: (phone: string) => boolean;
    /**
     * Validate URL format
     */
    url: (url: string) => boolean;
    /**
     * Validate slug format (for channels, etc.)
     */
    slug: (slug: string) => boolean;
    /**
     * Validate color hex code
     */
    hexColor: (color: string) => boolean;
};
export declare const validateRequest: <T extends TSchema>(schema: T) => (data: unknown) => Static<T>;
export declare const ValidationPatterns: {
    StrongPasswordSchema: import("@sinclair/typebox").TString;
    PhoneNumberSchema: import("@sinclair/typebox").TString;
    UrlSchema: import("@sinclair/typebox").TString;
    SlugSchema: import("@sinclair/typebox").TString;
    HexColorSchema: import("@sinclair/typebox").TString;
    TagSchema: import("@sinclair/typebox").TString;
    NameSchema: import("@sinclair/typebox").TString;
};
export type ValidationPattern = keyof typeof ValidationPatterns;
//# sourceMappingURL=validation.d.ts.map