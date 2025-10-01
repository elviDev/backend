/**
 * Image Validation Utilities
 * Provides comprehensive image validation for profile pictures
 */
export interface ImageValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
    recommendations?: string[];
    metadata?: {
        dimensions?: {
            width: number;
            height: number;
        };
        format?: string;
        colorSpace?: string;
        quality?: number;
    };
}
export interface ImageValidationOptions {
    maxFileSize?: number;
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
    allowedFormats?: string[];
    allowedExtensions?: string[];
    requireSquareAspect?: boolean;
    maxAspectRatio?: number;
}
export declare class ImageValidator {
    private options;
    private readonly DEFAULT_OPTIONS;
    constructor(options?: ImageValidationOptions);
    /**
     * Validate image file for profile picture usage
     */
    validateImage(fileName: string, contentType: string, fileSize: number, buffer?: Buffer): ImageValidationResult;
    /**
     * Get optimal image settings recommendations
     */
    getOptimalImageRecommendations(currentFileSize: number, contentType: string): string[];
    /**
     * Validate basic file properties
     */
    private validateBasicFileProperties;
    /**
     * Validate file extension
     */
    private validateFileExtension;
    /**
     * Validate MIME type
     */
    private validateMimeType;
    /**
     * Validate file size
     */
    private validateFileSize;
    /**
     * Validate file security
     */
    private validateFileSecurity;
    /**
     * Check for suspicious file name patterns
     */
    private containsSuspiciousPatterns;
    /**
     * Validate image file signature (magic bytes)
     */
    private validateImageFileSignature;
    /**
     * Get performance recommendations
     */
    private getPerformanceRecommendations;
    /**
     * Format file size for human reading
     */
    private formatFileSize;
}
export declare const profilePictureValidator: ImageValidator;
export type { ImageValidationOptions, ImageValidationResult };
//# sourceMappingURL=imageValidation.d.ts.map