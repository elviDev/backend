/**
 * Cloudinary Profile Picture Service
 * Specialized service for handling user profile picture uploads with Cloudinary
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { userRepository } from '../../db/index';
import { logger } from '../../utils/logger';
import { profilePictureValidator } from '../../utils/imageValidation';
import { cloudinaryService } from '../../services/CloudinaryService';

export interface CloudinaryProfileUploadRequest {
  userId: string;
  organizationId?: string;
  buffer: Buffer;
  fileName: string;
  contentType: string;
  fileSize: number;
  description?: string;
}

export interface CloudinaryProfileUploadResult {
  success: boolean;
  avatarUrl?: string;
  publicId?: string;
  processingTime: number;
  error?: string;
  user?: any;
}

export interface ProfilePictureValidationResult {
  valid: boolean;
  error?: string;
  recommendations?: string[];
}

export class CloudinaryProfileService extends EventEmitter {
  private performanceMetrics: number[] = [];

  // Image-specific constraints
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for profile pictures
  private readonly ALLOWED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ];

  constructor() {
    super();

    logger.info('Cloudinary Profile Picture Service initialized', {
      maxSize: `${Math.round(this.MAX_IMAGE_SIZE / (1024 * 1024))}MB`,
      allowedTypes: this.ALLOWED_IMAGE_TYPES.length,
      cloudinaryConfigured: cloudinaryService.isServiceConfigured()
    });
  }

  /**
   * Upload profile picture directly to Cloudinary and update user
   */
  async uploadProfilePicture(request: CloudinaryProfileUploadRequest): Promise<CloudinaryProfileUploadResult> {
    const startTime = performance.now();
    const uploadId = `cloudinary_profile_upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info('Starting Cloudinary profile picture upload', {
      uploadId,
      userId: request.userId,
      fileName: request.fileName,
      fileSize: `${Math.round(request.fileSize / 1024)}KB`,
    });

    try {
      // Step 1: Validate image file
      const validation = this.validateProfilePicture(request.fileName, request.contentType, request.fileSize, request.buffer);
      if (!validation.valid) {
        throw new Error(`Profile picture validation failed: ${validation.error}`);
      }

      // Step 2: Check user exists and has permission
      const user = await userRepository.findById(request.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Step 3: Delete old profile picture from Cloudinary if exists
      if (user.avatar_url) {
        await this.deleteOldProfilePicture(user.avatar_url);
      }

      // Step 4: Upload to Cloudinary
      logger.info('Uploading to Cloudinary', { uploadId, userId: request.userId });
      const cloudinaryResult = await cloudinaryService.uploadProfilePicture(
        request.buffer,
        request.userId,
        request.organizationId
      );

      if (!cloudinaryResult.success) {
        throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
      }

      // Step 5: Update user's avatar_url in database
      const updatedUser = await userRepository.update(request.userId, {
        avatar_url: cloudinaryResult.secure_url
      });

      const totalTime = performance.now() - startTime;
      this.recordPerformance(totalTime);

      // Performance warning
      if (totalTime > 5000) {
        logger.warn('Profile picture upload exceeded 5 second target', {
          uploadId,
          totalTime: `${totalTime.toFixed(2)}ms`,
        });
      }

      this.emit('profile_picture_updated', {
        uploadId,
        userId: request.userId,
        fileName: request.fileName,
        avatarUrl: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        processingTime: totalTime,
      });

      logger.info('Profile picture uploaded to Cloudinary successfully', {
        uploadId,
        userId: request.userId,
        fileName: request.fileName,
        avatarUrl: cloudinaryResult.secure_url,
        totalTime: `${totalTime.toFixed(2)}ms`,
      });

      return {
        success: true,
        avatarUrl: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        processingTime: totalTime,
        user: {
          ...updatedUser,
          // Remove sensitive fields
          password_hash: undefined,
          reset_token: undefined,
          verification_token: undefined,
        },
      };

    } catch (error: any) {
      const totalTime = performance.now() - startTime;
      this.recordPerformance(totalTime);

      logger.error('Profile picture upload to Cloudinary failed', {
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
   * Delete user's current profile picture from Cloudinary
   */
  async deleteProfilePicture(userId: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Get current user
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Delete from Cloudinary if avatar exists
      if (user.avatar_url) {
        const publicId = cloudinaryService.extractPublicIdFromUrl(user.avatar_url);
        if (publicId) {
          const deleteResult = await cloudinaryService.deleteImage(publicId);
          if (!deleteResult.success) {
            logger.warn('Failed to delete profile picture from Cloudinary', { 
              userId,
              publicId,
              error: deleteResult.error
            });
          }
        }
      }

      // Clear user's avatar_url in database
      const updatedUser = await userRepository.update(userId, {
        avatar_url: undefined
      });

      logger.info('Profile picture deleted', {
        userId,
        hadAvatar: !!user.avatar_url
      });

      this.emit('profile_picture_deleted', {
        userId,
      });

      return {
        success: true,
        user: {
          ...updatedUser,
          // Remove sensitive fields
          password_hash: undefined,
          reset_token: undefined,
          verification_token: undefined,
        },
      };
    } catch (error: any) {
      logger.error('Failed to delete profile picture', {
        userId,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate profile picture file with enhanced validation
   */
  public validateProfilePicture(fileName: string, contentType: string, fileSize: number, buffer?: Buffer): ProfilePictureValidationResult {
    // Use the enhanced image validator
    const validationResult = profilePictureValidator.validateImage(fileName, contentType, fileSize, buffer);
    
    // Convert to our interface format
    const result: ProfilePictureValidationResult = {
      valid: validationResult.valid,
      error: validationResult.error,
      recommendations: validationResult.recommendations
    };

    // Add profile-specific recommendations if validation passed
    if (validationResult.valid) {
      const profileRecommendations = profilePictureValidator.getOptimalImageRecommendations(fileSize, contentType);
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
  public validateProfilePictureWithBuffer(fileName: string, contentType: string, buffer: Buffer): ProfilePictureValidationResult {
    return this.validateProfilePicture(fileName, contentType, buffer.length, buffer);
  }

  /**
   * Delete old profile picture from Cloudinary when uploading new one
   */
  private async deleteOldProfilePicture(avatarUrl: string): Promise<void> {
    try {
      const publicId = cloudinaryService.extractPublicIdFromUrl(avatarUrl);
      if (publicId) {
        const deleteResult = await cloudinaryService.deleteImage(publicId);
        if (deleteResult.success) {
          logger.info('Old profile picture deleted from Cloudinary', { publicId });
        } else {
          logger.warn('Failed to delete old profile picture from Cloudinary', { 
            publicId,
            error: deleteResult.error 
          });
        }
      }
    } catch (error: any) {
      logger.warn('Failed to delete old profile picture from Cloudinary', {
        avatarUrl,
        error: error.message
      });
    }
  }

  /**
   * Get service performance statistics
   */
  getPerformanceStats(): {
    averageUploadTime: number;
    totalUploads: number;
  } {
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

  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);

    // Keep only last 500 measurements
    if (this.performanceMetrics.length > 500) {
      this.performanceMetrics.shift();
    }
  }
}

export default CloudinaryProfileService;