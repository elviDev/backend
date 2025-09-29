"use strict";
/**
 * Image Validation Utilities
 * Provides comprehensive image validation for profile pictures
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.profilePictureValidator = exports.ImageValidator = void 0;
class ImageValidator {
    options;
    DEFAULT_OPTIONS = {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxWidth: 2048,
        maxHeight: 2048,
        minWidth: 50,
        minHeight: 50,
        allowedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        requireSquareAspect: false,
        maxAspectRatio: 3.0, // 3:1 ratio maximum
    };
    constructor(options = {}) {
        this.options = options;
        this.options = { ...this.DEFAULT_OPTIONS, ...options };
    }
    /**
     * Validate image file for profile picture usage
     */
    validateImage(fileName, contentType, fileSize, buffer) {
        const warnings = [];
        const recommendations = [];
        // 1. Basic file validation
        const basicValidation = this.validateBasicFileProperties(fileName, contentType, fileSize);
        if (!basicValidation.valid) {
            return basicValidation;
        }
        // 2. File extension validation
        const extensionValidation = this.validateFileExtension(fileName);
        if (!extensionValidation.valid) {
            return extensionValidation;
        }
        // 3. MIME type validation
        const mimeValidation = this.validateMimeType(contentType);
        if (!mimeValidation.valid) {
            return mimeValidation;
        }
        // 4. File size validation
        const sizeValidation = this.validateFileSize(fileSize);
        if (!sizeValidation.valid) {
            return sizeValidation;
        }
        if (sizeValidation.warnings) {
            warnings.push(...sizeValidation.warnings);
        }
        if (sizeValidation.recommendations) {
            recommendations.push(...sizeValidation.recommendations);
        }
        // 5. Security validation
        const securityValidation = this.validateFileSecurity(fileName, buffer);
        if (!securityValidation.valid) {
            return securityValidation;
        }
        if (securityValidation.warnings) {
            warnings.push(...securityValidation.warnings);
        }
        // 6. Performance recommendations
        const performanceRecommendations = this.getPerformanceRecommendations(fileSize, contentType);
        recommendations.push(...performanceRecommendations);
        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined,
            recommendations: recommendations.length > 0 ? recommendations : undefined,
        };
    }
    /**
     * Get optimal image settings recommendations
     */
    getOptimalImageRecommendations(currentFileSize, contentType) {
        const recommendations = [];
        // Size recommendations
        if (currentFileSize > 2 * 1024 * 1024) { // > 2MB
            recommendations.push('Consider compressing the image to reduce loading times');
            recommendations.push('Images over 2MB may cause slower page loads');
        }
        if (currentFileSize > 1 * 1024 * 1024) { // > 1MB
            recommendations.push('Optimize image compression for better performance');
        }
        // Format recommendations
        if (contentType === 'image/png' && currentFileSize > 500 * 1024) {
            recommendations.push('Consider converting PNG to JPEG for smaller file size (if transparency not needed)');
        }
        if (contentType === 'image/gif') {
            recommendations.push('Consider using JPEG or WebP format for better compression');
        }
        if (!contentType.includes('webp')) {
            recommendations.push('WebP format provides better compression than JPEG/PNG');
        }
        // Quality recommendations
        recommendations.push('For profile pictures, 85% JPEG quality typically provides best size/quality balance');
        recommendations.push('Recommended dimensions: 400x400px for optimal display across devices');
        return recommendations;
    }
    /**
     * Validate basic file properties
     */
    validateBasicFileProperties(fileName, contentType, fileSize) {
        if (!fileName || fileName.trim() === '') {
            return {
                valid: false,
                error: 'File name is required'
            };
        }
        if (!contentType || contentType.trim() === '') {
            return {
                valid: false,
                error: 'Content type is required'
            };
        }
        if (fileSize <= 0) {
            return {
                valid: false,
                error: 'File size must be greater than 0'
            };
        }
        if (fileName.length > 255) {
            return {
                valid: false,
                error: 'File name is too long (maximum 255 characters)'
            };
        }
        return { valid: true };
    }
    /**
     * Validate file extension
     */
    validateFileExtension(fileName) {
        const extension = fileName.toLowerCase().split('.').pop();
        if (!extension) {
            return {
                valid: false,
                error: 'File must have a valid extension'
            };
        }
        const fullExtension = `.${extension}`;
        if (!this.options.allowedExtensions?.includes(fullExtension)) {
            return {
                valid: false,
                error: `File extension '${fullExtension}' is not allowed for profile pictures`,
                recommendations: [
                    `Allowed extensions: ${this.options.allowedExtensions?.join(', ')}`,
                    'Convert your image to JPEG, PNG, or WebP format'
                ]
            };
        }
        return { valid: true };
    }
    /**
     * Validate MIME type
     */
    validateMimeType(contentType) {
        if (!contentType.startsWith('image/')) {
            return {
                valid: false,
                error: 'File must be an image'
            };
        }
        if (!this.options.allowedFormats?.includes(contentType.toLowerCase())) {
            return {
                valid: false,
                error: `Image format '${contentType}' is not allowed for profile pictures`,
                recommendations: [
                    `Allowed formats: ${this.options.allowedFormats?.join(', ')}`,
                    'Use JPEG, PNG, or WebP format'
                ]
            };
        }
        return { valid: true };
    }
    /**
     * Validate file size
     */
    validateFileSize(fileSize) {
        const warnings = [];
        const recommendations = [];
        if (this.options.maxFileSize && fileSize > this.options.maxFileSize) {
            return {
                valid: false,
                error: `File size exceeds maximum allowed size of ${this.formatFileSize(this.options.maxFileSize)}`,
                recommendations: [
                    'Compress your image to reduce file size',
                    'Use image optimization tools',
                    'Consider using JPEG format for smaller file sizes'
                ]
            };
        }
        // Warnings and recommendations for large files
        if (fileSize > 2 * 1024 * 1024) { // 2MB
            warnings.push('Large file size may affect loading performance');
            recommendations.push('Consider compressing the image for better performance');
        }
        if (fileSize > 1 * 1024 * 1024) { // 1MB
            recommendations.push('Image could be optimized for faster loading');
        }
        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined,
            recommendations: recommendations.length > 0 ? recommendations : undefined
        };
    }
    /**
     * Validate file security
     */
    validateFileSecurity(fileName, buffer) {
        const warnings = [];
        // Check for suspicious file names
        if (this.containsSuspiciousPatterns(fileName)) {
            return {
                valid: false,
                error: 'File name contains potentially unsafe characters or patterns'
            };
        }
        // Basic buffer validation if provided
        if (buffer) {
            // Check for minimum file size (avoid empty or corrupted files)
            if (buffer.length < 100) { // Very small files are likely corrupted
                return {
                    valid: false,
                    error: 'File appears to be corrupted or too small'
                };
            }
            // Check for common image file signatures
            const isValidImageBuffer = this.validateImageFileSignature(buffer);
            if (!isValidImageBuffer) {
                warnings.push('File content may not match the expected image format');
            }
        }
        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
    /**
     * Check for suspicious file name patterns
     */
    containsSuspiciousPatterns(fileName) {
        const suspiciousPatterns = [
            /\.(exe|bat|cmd|sh|php|asp|jsp|js|html|htm)$/i, // Executable extensions
            /[<>:"|?*\x00-\x1f]/, // Invalid filename characters
            /\.\./, // Path traversal
            /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i, // Reserved names in Windows
        ];
        return suspiciousPatterns.some(pattern => pattern.test(fileName));
    }
    /**
     * Validate image file signature (magic bytes)
     */
    validateImageFileSignature(buffer) {
        if (buffer.length < 4)
            return false;
        // Check common image file signatures
        const signatures = [
            // JPEG
            { bytes: [0xFF, 0xD8, 0xFF], offset: 0 },
            // PNG
            { bytes: [0x89, 0x50, 0x4E, 0x47], offset: 0 },
            // GIF87a
            { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 },
            // GIF89a
            { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 },
            // WebP
            { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
        ];
        return signatures.some(sig => {
            if (buffer.length < sig.offset + sig.bytes.length)
                return false;
            return sig.bytes.every((byte, index) => buffer[sig.offset + index] === byte);
        });
    }
    /**
     * Get performance recommendations
     */
    getPerformanceRecommendations(fileSize, contentType) {
        const recommendations = [];
        if (fileSize > 1024 * 1024) { // > 1MB
            recommendations.push('Large images may slow down page loading');
        }
        if (contentType === 'image/png' && fileSize > 500 * 1024) { // PNG > 500KB
            recommendations.push('PNG images can often be compressed more efficiently as JPEG');
        }
        if (!contentType.includes('webp')) {
            recommendations.push('WebP format typically provides 25-30% better compression than JPEG');
        }
        return recommendations;
    }
    /**
     * Format file size for human reading
     */
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0)
            return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = (bytes / Math.pow(1024, i)).toFixed(1);
        return `${size} ${sizes[i]}`;
    }
}
exports.ImageValidator = ImageValidator;
// Default validator instance for profile pictures
exports.profilePictureValidator = new ImageValidator({
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxWidth: 2048,
    maxHeight: 2048,
    minWidth: 50,
    minHeight: 50,
    allowedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    requireSquareAspect: false,
    maxAspectRatio: 5.0, // Allow panoramic profile images
});
//# sourceMappingURL=imageValidation.js.map