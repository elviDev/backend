/**
 * Cloudinary Service for handling image uploads
 * Provides secure image upload, transformation, and management
 */

import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger';

export interface CloudinaryUploadOptions {
  folder?: string;
  public_id?: string;
  transformation?: any[];
  overwrite?: boolean;
  resource_type?: 'image' | 'video' | 'raw' | 'auto';
  quality?: string | number;
  format?: string;
  width?: number;
  height?: number;
  crop?: 'scale' | 'fit' | 'limit' | 'fill' | 'pad' | 'crop';
}

export interface CloudinaryUploadResult {
  success: boolean;
  public_id?: string;
  secure_url?: string;
  url?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  error?: string;
}

export interface CloudinaryDeleteResult {
  success: boolean;
  error?: string;
}

export class CloudinaryService {
  private static instance: CloudinaryService;
  private isConfigured = false;

  constructor() {
    this.configure();
  }

  public static getInstance(): CloudinaryService {
    if (!CloudinaryService.instance) {
      CloudinaryService.instance = new CloudinaryService();
    }
    return CloudinaryService.instance;
  }

  private configure(): void {
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        logger.warn('Cloudinary configuration missing. Some functionality may be limited.', {
          hasCloudName: !!cloudName,
          hasApiKey: !!apiKey,
          hasApiSecret: !!apiSecret,
        });
        return;
      }

      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });

      this.isConfigured = true;
      logger.info('Cloudinary service configured successfully', {
        cloud_name: cloudName,
      });
    } catch (error) {
      logger.error('Failed to configure Cloudinary service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Upload an image buffer to Cloudinary
   */
  public async uploadImage(
    buffer: Buffer,
    options: CloudinaryUploadOptions = {}
  ): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary service not configured',
      };
    }

    try {
      const uploadOptions = {
        resource_type: 'image' as const,
        folder: options.folder || 'profile-pictures',
        quality: options.quality || 'auto:good',
        format: options.format || 'jpg',
        overwrite: options.overwrite || true,
        transformation: options.transformation || [
          {
            width: options.width || 400,
            height: options.height || 400,
            crop: options.crop || 'fill',
            gravity: 'face',
            quality: 'auto:good',
          },
        ],
        ...(options.public_id && { public_id: options.public_id }),
      };

      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(buffer);
      });

      logger.info('Image uploaded to Cloudinary successfully', {
        public_id: result.public_id,
        bytes: result.bytes,
        format: result.format,
        width: result.width,
        height: result.height,
      });

      return {
        success: true,
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      logger.error('Failed to upload image to Cloudinary', {
        error: error instanceof Error ? error.message : 'Unknown error',
        folder: options.folder,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Upload profile picture with optimized settings
   */
  public async uploadProfilePicture(
    buffer: Buffer,
    userId: string,
    organizationId?: string
  ): Promise<CloudinaryUploadResult> {
    const folder = organizationId 
      ? `organizations/${organizationId}/users/${userId}/profile-pictures`
      : `users/${userId}/profile-pictures`;

    const public_id = `profile_${userId}_${Date.now()}`;

    return this.uploadImage(buffer, {
      folder,
      public_id,
      width: 400,
      height: 400,
      crop: 'fill',
      quality: 'auto:good',
      format: 'jpg',
      transformation: [
        {
          width: 400,
          height: 400,
          crop: 'fill',
          gravity: 'face',
          quality: 'auto:good',
        },
        {
          // Create a smaller thumbnail version
          width: 100,
          height: 100,
          crop: 'fill',
          gravity: 'face',
          quality: 'auto:good',
          fetch_format: 'auto',
        },
      ],
    });
  }

  /**
   * Delete an image from Cloudinary
   */
  public async deleteImage(publicId: string): Promise<CloudinaryDeleteResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Cloudinary service not configured',
      };
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        logger.info('Image deleted from Cloudinary successfully', {
          public_id: publicId,
        });

        return {
          success: true,
        };
      } else {
        logger.warn('Failed to delete image from Cloudinary', {
          public_id: publicId,
          result: result.result,
        });

        return {
          success: false,
          error: `Delete failed: ${result.result}`,
        };
      }
    } catch (error) {
      logger.error('Error deleting image from Cloudinary', {
        error: error instanceof Error ? error.message : 'Unknown error',
        public_id: publicId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }

  /**
   * Get optimized image URL with transformations
   */
  public getOptimizedImageUrl(
    publicId: string,
    options: {
      width?: number;
      height?: number;
      crop?: string;
      quality?: string;
      format?: string;
    } = {}
  ): string {
    if (!this.isConfigured) {
      logger.warn('Cloudinary service not configured, returning placeholder');
      return 'https://via.placeholder.com/400x400?text=No+Image';
    }

    try {
      const url = cloudinary.url(publicId, {
        width: options.width || 400,
        height: options.height || 400,
        crop: options.crop || 'fill',
        quality: options.quality || 'auto:good',
        format: options.format || 'auto',
        fetch_format: 'auto',
        gravity: 'face',
        secure: true,
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate optimized image URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        public_id: publicId,
      });

      return 'https://via.placeholder.com/400x400?text=Image+Error';
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   */
  public extractPublicIdFromUrl(url: string): string | null {
    try {
      const match = url.match(/\/v\d+\/(.+?)(?:\.[^.]+)?$/);
      return match ? (match[1] || null) : null;
    } catch (error) {
      logger.error('Failed to extract public ID from URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url,
      });
      return null;
    }
  }

  /**
   * Check if Cloudinary service is properly configured
   */
  public isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Get service configuration status
   */
  public getConfigurationStatus(): {
    configured: boolean;
    cloudName?: string;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  } {
    return {
      configured: this.isConfigured,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      hasApiKey: !!process.env.CLOUDINARY_API_KEY,
      hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
    };
  }
}

// Export singleton instance
export const cloudinaryService = CloudinaryService.getInstance();