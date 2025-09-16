/**
 * S3 File Manager - Phase 2 File Management System
 * Provides secure, scalable file operations with AWS S3 integration
 * 
 * Success Criteria:
 * - Upload URL generation in <2 seconds
 * - Support for files up to 100MB
 * - 99%+ S3 operation success rate
 * - Secure presigned URL generation with 15-minute expiry
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger';

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  maxFileSize: number;
  allowedFileTypes: string[];
  presignedUrlTTL: number;
}

export interface FileMetadata {
  userId: string;
  organizationId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  description?: string | undefined;
  tags?: string[] | undefined;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  downloadUrl?: string;
  key: string;
  expiresAt: Date;
  fileId: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string | undefined;
  recommendations?: string[] | undefined;
}

export class S3FileManager {
  private client: S3Client;
  private config: S3Config;
  private performanceMetrics: number[] = [];
  
  constructor(config?: Partial<S3Config>) {
    this.config = {
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET_NAME || 'ceo-platform-files',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedFileTypes: [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.mp4', '.mov', '.avi', '.mkv',
        '.mp3', '.wav', '.flac',
        '.zip', '.rar', '.7z',
        '.txt', '.csv', '.json', '.xml'
      ],
      presignedUrlTTL: 900, // 15 minutes
      ...config
    };
    
    this.client = new S3Client({
      region: this.config.region,
      ...(this.config.accessKeyId && this.config.secretAccessKey && {
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        }
      }),
      requestHandler: {
        connectionTimeout: 5000,
        socketTimeout: 10000,
      },
      maxAttempts: 3,
    });
    
    logger.info('S3 File Manager initialized', {
      region: this.config.region,
      bucket: this.config.bucket,
      maxFileSize: `${Math.round(this.config.maxFileSize / (1024 * 1024))}MB`,
      allowedTypes: this.config.allowedFileTypes.length
    });
  }
  
  /**
   * Generate presigned upload URL with comprehensive validation
   * Target: <2 second generation time
   */
  async generatePresignedUploadUrl(
    fileName: string,
    contentType: string,
    fileSize: number,
    metadata: FileMetadata
  ): Promise<PresignedUploadResult> {
    const startTime = performance.now();
    
    try {
      // Validate file before generating URL
      const validation = this.validateFile(fileName, contentType, fileSize);
      if (!validation.valid) {
        throw new Error(`File validation failed: ${validation.error}`);
      }
      
      // Generate unique file key
      const fileId = this.generateFileId();
      const key = this.generateFileKey(fileId, fileName, metadata.userId, metadata.organizationId);
      
      // Create PUT command with metadata
      const putCommand = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize,
        Metadata: {
          userId: metadata.userId,
          organizationId: metadata.organizationId,
          originalName: fileName,
          uploadedAt: metadata.uploadedAt,
          description: metadata.description || '',
          tags: metadata.tags ? JSON.stringify(metadata.tags) : '',
          fileId
        },
        ServerSideEncryption: 'AES256', // Enable encryption
        StorageClass: 'STANDARD_IA' // Cost-optimized storage
      });
      
      // Generate presigned upload URL
      const uploadUrl = await getSignedUrl(this.client, putCommand, {
        expiresIn: this.config.presignedUrlTTL
      });
      
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      // Log performance warning if target exceeded
      if (processingTime > 2000) {
        logger.warn('Presigned URL generation exceeded 2 second target', {
          processingTime: `${processingTime.toFixed(2)}ms`,
          fileName,
          fileSize
        });
      }
      
      const result: PresignedUploadResult = {
        uploadUrl,
        key,
        fileId,
        expiresAt: new Date(Date.now() + this.config.presignedUrlTTL * 1000)
      };
      
      logger.info('Presigned upload URL generated successfully', {
        fileId,
        fileName,
        fileSize: `${Math.round(fileSize / 1024)}KB`,
        processingTime: `${processingTime.toFixed(2)}ms`,
        expiresIn: `${this.config.presignedUrlTTL}s`
      });
      
      return result;
      
    } catch (error: any) {
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      logger.error('Failed to generate presigned upload URL', {
        error: error.message,
        fileName,
        fileSize,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }
  }
  
  /**
   * Generate presigned download URL for file access
   */
  async generatePresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const startTime = performance.now();
    
    try {
      // Verify file exists
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      await this.client.send(headCommand);
      
      // Generate download URL
      const getCommand = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const downloadUrl = await getSignedUrl(this.client, getCommand, {
        expiresIn
      });
      
      const processingTime = performance.now() - startTime;
      
      logger.debug('Presigned download URL generated', {
        key,
        processingTime: `${processingTime.toFixed(2)}ms`,
        expiresIn: `${expiresIn}s`
      });
      
      return downloadUrl;
      
    } catch (error: any) {
      logger.error('Failed to generate presigned download URL', {
        error: error.message,
        key
      });
      
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }
  
  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      await this.client.send(deleteCommand);
      
      logger.info('File deleted from S3', { key });
      return true;
      
    } catch (error: any) {
      logger.error('Failed to delete file from S3', {
        error: error.message,
        key
      });
      
      return false;
    }
  }
  
  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<FileMetadata | null> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const response = await this.client.send(headCommand);
      
      if (!response.Metadata) {
        return null;
      }
      
      const metadata: FileMetadata = {
        userId: response.Metadata.userId || '',
        organizationId: response.Metadata.organizationId || '',
        originalName: response.Metadata.originalName || '',
        contentType: response.ContentType || '',
        size: response.ContentLength || 0,
        uploadedAt: response.Metadata.uploadedAt || new Date().toISOString(),
        description: response.Metadata.description || undefined,
        tags: response.Metadata.tags ? JSON.parse(response.Metadata.tags) : undefined
      };
      
      return metadata;
      
    } catch (error: any) {
      logger.error('Failed to get file metadata', {
        error: error.message,
        key
      });
      
      return null;
    }
  }
  
  /**
   * Validate file against security and size constraints
   */
  validateFile(fileName: string, contentType: string, fileSize: number): FileValidationResult {
    const recommendations: string[] = [];
    
    // File size validation
    if (fileSize <= 0) {
      return {
        valid: false,
        error: 'File size must be greater than 0'
      };
    }
    
    if (fileSize > this.config.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${Math.round(this.config.maxFileSize / (1024 * 1024))}MB`
      };
    }
    
    // File type validation
    const fileExtension = fileName.toLowerCase().split('.').pop();
    if (!fileExtension) {
      return {
        valid: false,
        error: 'File must have a valid extension'
      };
    }
    
    const fullExtension = `.${fileExtension}`;
    if (!this.config.allowedFileTypes.includes(fullExtension)) {
      return {
        valid: false,
        error: `File type '${fullExtension}' is not allowed`,
        recommendations: [
          `Allowed types: ${this.config.allowedFileTypes.join(', ')}`,
          'Consider converting to an allowed format',
          'Contact administrator for additional file type support'
        ]
      };
    }
    
    // Content type validation
    if (!contentType || contentType === 'application/octet-stream') {
      recommendations.push('Consider specifying a more specific content type');
    }
    
    // File name security validation
    if (this.containsUnsafeCharacters(fileName)) {
      return {
        valid: false,
        error: 'File name contains unsafe characters',
        recommendations: [
          'Remove special characters like <>:"|?*',
          'Use only letters, numbers, hyphens, and underscores',
          'Avoid extremely long file names'
        ]
      };
    }
    
    // Size recommendations
    if (fileSize > 50 * 1024 * 1024) { // 50MB
      recommendations.push('Large files may take longer to upload and process');
    }
    
    return {
      valid: true,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
  }
  
  /**
   * Get performance statistics for monitoring
   */
  getPerformanceStats(): {
    averageGenerationTime: number;
    p95GenerationTime: number;
    p99GenerationTime: number;
    totalOperations: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageGenerationTime: 0,
        p95GenerationTime: 0,
        p99GenerationTime: 0,
        totalOperations: 0
      };
    }
    
    const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
    const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    return {
      averageGenerationTime: Math.round(average * 100) / 100,
      p95GenerationTime: Math.round(p95 * 100) / 100,
      p99GenerationTime: Math.round(p99 * 100) / 100,
      totalOperations: this.performanceMetrics.length
    };
  }
  
  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      // Test S3 connectivity with a simple head request
      const testKey = 'health-check-test';
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: testKey
      });
      
      const startTime = performance.now();
      
      try {
        await this.client.send(headCommand);
      } catch (error: any) {
        // Expect 404 for non-existent test file - this means S3 is reachable
        if (error.name !== 'NotFound') {
          throw error;
        }
      }
      
      const responseTime = performance.now() - startTime;
      const stats = this.getPerformanceStats();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Check performance degradation
      if (stats.averageGenerationTime > 3000 || responseTime > 5000) {
        status = 'unhealthy';
      } else if (stats.averageGenerationTime > 2000 || responseTime > 2000) {
        status = 'degraded';
      }
      
      return {
        status,
        details: {
          s3ResponseTime: Math.round(responseTime),
          averageGenerationTime: stats.averageGenerationTime,
          totalOperations: stats.totalOperations,
          bucket: this.config.bucket,
          region: this.config.region
        }
      };
      
    } catch (error: any) {
      logger.error('S3 health check failed', { error: error.message });
      
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          bucket: this.config.bucket,
          region: this.config.region
        }
      };
    }
  }
  
  private generateFileId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `file_${timestamp}_${random}`;
  }
  
  private generateFileKey(fileId: string, originalName: string, userId: string, organizationId: string): string {
    const sanitizedName = this.sanitizeFileName(originalName);
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    return `organizations/${organizationId}/users/${userId}/${year}/${month}/${fileId}_${sanitizedName}`;
  }
  
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace unsafe characters with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .substring(0, 100); // Limit length
  }
  
  private containsUnsafeCharacters(fileName: string): boolean {
    const unsafePattern = /[<>:"|?*\x00-\x1f]/;
    return unsafePattern.test(fileName) || fileName.length > 255;
  }
  
  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}