"use strict";
/**
 * Profile Picture Upload Service
 * Specialized service for handling user profile picture uploads with image processing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePictureService = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const S3FileManager_1 = require("../management/S3FileManager");
const FileMetadataManager_1 = require("../management/FileMetadataManager");
const index_1 = require("../../db/index");
const logger_1 = require("../../utils/logger");
const imageValidation_1 = require("../../utils/imageValidation");
class ProfilePictureService extends events_1.EventEmitter {
    s3Manager;
    metadataManager;
    performanceMetrics = [];
    // Image-specific constraints
    MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for profile pictures
    ALLOWED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    constructor() {
        super();
        // Configure S3Manager specifically for profile pictures
        this.s3Manager = new S3FileManager_1.S3FileManager({
            maxFileSize: this.MAX_IMAGE_SIZE,
            allowedFileTypes: this.ALLOWED_IMAGE_TYPES,
            presignedUrlTTL: 900, // 15 minutes
        });
        this.metadataManager = new FileMetadataManager_1.FileMetadataManager();
        logger_1.logger.info('Profile Picture Service initialized', {
            maxSize: `${Math.round(this.MAX_IMAGE_SIZE / (1024 * 1024))}MB`,
            allowedTypes: this.ALLOWED_IMAGE_TYPES.length
        });
    }
    /**
     * Generate presigned URL for profile picture upload
     */
    async initiateProfilePictureUpload(request) {
        const startTime = perf_hooks_1.performance.now();
        const uploadId = `profile_upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        logger_1.logger.info('Starting profile picture upload', {
            uploadId,
            userId: request.userId,
            fileName: request.fileName,
            fileSize: `${Math.round(request.fileSize / 1024)}KB`,
        });
        try {
            // Step 1: Validate image file
            const validation = this.validateProfilePicture(request.fileName, request.contentType, request.fileSize);
            if (!validation.valid) {
                throw new Error(`Profile picture validation failed: ${validation.error}`);
            }
            // Step 2: Check user exists and has permission
            const user = await index_1.userRepository.findById(request.userId);
            if (!user) {
                throw new Error('User not found');
            }
            // Step 3: Generate S3 key for profile picture
            const s3Key = this.generateProfilePictureKey(request.userId, request.organizationId, request.fileName);
            // Step 4: Create file metadata
            const fileMetadata = {
                userId: request.userId,
                organizationId: request.organizationId,
                originalName: request.fileName,
                contentType: request.contentType,
                size: request.fileSize,
                uploadedAt: new Date().toISOString(),
                description: request.description || 'Profile Picture',
                tags: ['profile-picture', 'avatar']
            };
            // Step 5: Generate presigned upload URL
            const uploadResult = await this.s3Manager.generatePresignedUploadUrl(request.fileName, request.contentType, request.fileSize, fileMetadata);
            // Step 6: Create database record
            const fileRecord = await this.metadataManager.createFileRecord(uploadResult.fileId, request.fileName, request.fileSize, request.contentType, s3Key, request.userId, request.organizationId, request.description || 'Profile Picture', ['profile-picture', 'avatar']);
            // Step 7: Generate download URL for immediate use
            const downloadUrl = await this.s3Manager
                .generatePresignedDownloadUrl(uploadResult.key, 3600)
                .catch(() => undefined);
            const totalTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(totalTime);
            // Performance warning
            if (totalTime > 3000) {
                logger_1.logger.warn('Profile picture upload initiation exceeded 3 second target', {
                    uploadId,
                    totalTime: `${totalTime.toFixed(2)}ms`,
                });
            }
            this.emit('profile_upload_initiated', {
                uploadId,
                fileId: uploadResult.fileId,
                userId: request.userId,
                fileName: request.fileName,
                processingTime: totalTime,
            });
            logger_1.logger.info('Profile picture upload initiated successfully', {
                uploadId,
                fileId: uploadResult.fileId,
                userId: request.userId,
                fileName: request.fileName,
                s3Key,
                totalTime: `${totalTime.toFixed(2)}ms`,
            });
            return {
                success: true,
                uploadUrl: uploadResult.uploadUrl,
                downloadUrl,
                fileId: uploadResult.fileId,
                s3Key: uploadResult.key,
                expiresAt: uploadResult.expiresAt,
                processingTime: totalTime,
            };
        }
        catch (error) {
            const totalTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(totalTime);
            logger_1.logger.error('Profile picture upload initiation failed', {
                uploadId,
                error: error.message,
                userId: request.userId,
                fileName: request.fileName,
                totalTime: `${totalTime.toFixed(2)}ms`,
            });
            this.emit('profile_upload_failed', {
                uploadId,
                userId: request.userId,
                fileName: request.fileName,
                error: error.message,
                processingTime: totalTime,
            });
            return {
                success: false,
                error: error.message,
                processingTime: totalTime,
            };
        }
    }
    /**
     * Complete profile picture upload and update user record
     */
    async completeProfilePictureUpload(fileId, userId, success, error) {
        try {
            if (success) {
                // Get file record
                const fileRecord = await this.metadataManager.getFileRecord(fileId);
                if (!fileRecord) {
                    logger_1.logger.warn('Profile picture completion: file record not found', { fileId, userId });
                    return false;
                }
                // Generate permanent download URL (valid for 7 days)
                const downloadUrl = await this.s3Manager.generatePresignedDownloadUrl(fileRecord.s3Key, 7 * 24 * 3600 // 7 days
                );
                // Update user's avatar_url in database
                await index_1.userRepository.update(userId, {
                    avatar_url: downloadUrl
                });
                // Delete old profile picture if it exists
                await this.deleteOldProfilePicture(userId, fileId);
                // Update file status to completed
                await this.metadataManager.updateFileStatus(fileId, 'completed');
                logger_1.logger.info('Profile picture upload completed successfully', {
                    fileId,
                    userId,
                    fileName: fileRecord.name,
                });
                this.emit('profile_picture_updated', {
                    userId,
                    fileId,
                    downloadUrl,
                    fileName: fileRecord.name,
                });
                return true;
            }
            else {
                // Update file status to failed
                await this.metadataManager.updateFileStatus(fileId, 'failed', error);
                logger_1.logger.error('Profile picture upload failed', {
                    fileId,
                    userId,
                    error,
                });
                this.emit('profile_upload_failed', {
                    fileId,
                    userId,
                    error,
                });
                return false;
            }
        }
        catch (err) {
            logger_1.logger.error('Failed to complete profile picture upload', {
                fileId,
                userId,
                error: err.message,
            });
            return false;
        }
    }
    /**
     * Delete user's current profile picture
     */
    async deleteProfilePicture(userId) {
        try {
            // Get current profile picture files for user
            const profileFiles = await this.metadataManager.getFilesForEntity('user', userId);
            const profilePictures = profileFiles.filter(file => file.tags?.includes('profile-picture') || file.tags?.includes('avatar'));
            let deletionSuccess = true;
            for (const file of profilePictures) {
                // Delete from S3
                const s3DeleteSuccess = await this.s3Manager.deleteFile(file.s3Key);
                if (!s3DeleteSuccess) {
                    deletionSuccess = false;
                    logger_1.logger.warn('Failed to delete profile picture from S3', {
                        fileId: file.id,
                        s3Key: file.s3Key,
                        userId
                    });
                }
                // Update file status to deleted
                await this.metadataManager.updateFileStatus(file.id, 'deleted', 'Deleted by user');
            }
            // Clear user's avatar_url
            await index_1.userRepository.update(userId, {
                avatar_url: null
            });
            logger_1.logger.info('Profile picture deleted', {
                userId,
                filesDeleted: profilePictures.length,
                success: deletionSuccess
            });
            this.emit('profile_picture_deleted', {
                userId,
                filesDeleted: profilePictures.length
            });
            return deletionSuccess;
        }
        catch (error) {
            logger_1.logger.error('Failed to delete profile picture', {
                userId,
                error: error.message,
            });
            return false;
        }
    }
    /**
     * Validate profile picture file with enhanced validation
     */
    validateProfilePicture(fileName, contentType, fileSize, buffer) {
        // Use the enhanced image validator
        const validationResult = imageValidation_1.profilePictureValidator.validateImage(fileName, contentType, fileSize, buffer);
        // Convert to our interface format
        const result = {
            valid: validationResult.valid,
            error: validationResult.error,
            recommendations: validationResult.recommendations
        };
        // Add profile-specific recommendations if validation passed
        if (validationResult.valid) {
            const profileRecommendations = imageValidation_1.profilePictureValidator.getOptimalImageRecommendations(fileSize, contentType);
            if (profileRecommendations.length > 0) {
                result.recommendations = [...(result.recommendations || []), ...profileRecommendations];
            }
            // Add warnings as recommendations
            if (validationResult.warnings && validationResult.warnings.length > 0) {
                result.recommendations = [...(result.recommendations || []), ...validationResult.warnings.map(w => `Warning: ${w}`)];
            }
        }
        return result;
    }
    /**
     * Get enhanced validation with buffer analysis
     */
    validateProfilePictureWithBuffer(fileName, contentType, buffer) {
        return this.validateProfilePicture(fileName, contentType, buffer.length, buffer);
    }
    /**
     * Generate S3 key specifically for profile pictures
     */
    generateProfilePictureKey(userId, organizationId, fileName) {
        const timestamp = Date.now();
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        return `organizations/${organizationId}/users/${userId}/profile-pictures/${timestamp}_${sanitizedName}`;
    }
    /**
     * Delete old profile pictures when uploading new one
     */
    async deleteOldProfilePicture(userId, currentFileId) {
        try {
            // Find old profile pictures (excluding the current one)
            const profileFiles = await this.metadataManager.getFilesForEntity('user', userId);
            const oldProfilePictures = profileFiles.filter(file => file.id !== currentFileId &&
                (file.tags?.includes('profile-picture') || file.tags?.includes('avatar')));
            for (const oldFile of oldProfilePictures) {
                // Delete from S3 (don't throw if fails)
                await this.s3Manager.deleteFile(oldFile.s3Key).catch((error) => {
                    logger_1.logger.warn('Failed to delete old profile picture from S3', {
                        fileId: oldFile.id,
                        s3Key: oldFile.s3Key,
                        error: error.message
                    });
                });
                // Mark as deleted in database
                await this.metadataManager.updateFileStatus(oldFile.id, 'deleted', 'Replaced by new profile picture');
            }
            logger_1.logger.debug('Cleaned up old profile pictures', {
                userId,
                filesDeleted: oldProfilePictures.length
            });
        }
        catch (error) {
            logger_1.logger.warn('Failed to clean up old profile pictures', {
                userId,
                currentFileId,
                error: error.message
            });
        }
    }
    /**
     * Get service performance statistics
     */
    getPerformanceStats() {
        if (this.performanceMetrics.length === 0) {
            return {
                averageUploadTime: 0,
                totalUploads: 0
            };
        }
        const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
        return {
            averageUploadTime: Math.round(average * 100) / 100,
            totalUploads: this.performanceMetrics.length
        };
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 500 measurements
        if (this.performanceMetrics.length > 500) {
            this.performanceMetrics.shift();
        }
    }
}
exports.ProfilePictureService = ProfilePictureService;
exports.default = ProfilePictureService;
//# sourceMappingURL=ProfilePictureService.js.map