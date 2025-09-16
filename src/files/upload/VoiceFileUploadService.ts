/**
 * Voice File Upload Service - Phase 2 Voice-Driven File Operations
 * Integrates voice commands with file upload workflow
 *
 * Success Criteria:
 * - End-to-end voice upload in <5 seconds
 * - Automatic entity linking based on command context
 * - Upload confirmation to user
 * - Real-time notifications to affected channels
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { S3FileManager, FileMetadata } from '../management/S3FileManager';
import { FileMetadataManager, FileStatus } from '../management/FileMetadataManager';
import { logger } from '../../utils/logger';
import { UserContext } from '../../voice/types';

export interface VoiceFileUploadRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  userContext: UserContext;
  description?: string;
  targetChannels?: string[];
  targetTasks?: string[];
  targetUsers?: string[];
  tags?: string[];
}

export interface VoiceFileUploadResult {
  success: boolean;
  uploadUrl?: string;
  fileId?: string;
  downloadUrl?: string | undefined;
  expiresAt?: Date;
  linkedEntities?: {
    channels: string[];
    tasks: string[];
    users: string[];
  };
  processingTime: number;
  error?: string;
}

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: FileStatus;
  uploadSpeed?: number | undefined; // bytes per second
  eta?: number | undefined; // seconds remaining
  error?: string | undefined;
}

export class VoiceFileUploadService extends EventEmitter {
  private s3Manager: S3FileManager;
  private metadataManager: FileMetadataManager;
  private activeUploads: Map<string, FileUploadProgress> = new Map();
  private performanceMetrics: number[] = [];

  constructor() {
    super();

    this.s3Manager = new S3FileManager({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      presignedUrlTTL: 900, // 15 minutes
      allowedFileTypes: [
        // Documents
        '.pdf',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.ppt',
        '.pptx',
        '.txt',
        '.csv',
        '.json',
        '.xml',
        '.rtf',
        // Images
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.svg',
        '.bmp',
        // Media
        '.mp4',
        '.mov',
        '.avi',
        '.mkv',
        '.webm',
        '.mp3',
        '.wav',
        '.flac',
        '.aac',
        '.ogg',
        // Archives
        '.zip',
        '.rar',
        '.7z',
        '.tar',
        '.gz',
        // Design files
        '.psd',
        '.ai',
        '.sketch',
        '.fig',
      ],
    });

    this.metadataManager = new FileMetadataManager();

    logger.info('Voice File Upload Service initialized');
  }

  /**
   * Initiate voice-driven file upload workflow
   * Target: Complete workflow in <5 seconds
   */
  async initiateVoiceUpload(request: VoiceFileUploadRequest): Promise<VoiceFileUploadResult> {
    const startTime = performance.now();
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info('Starting voice file upload', {
      uploadId,
      fileName: request.fileName,
      fileSize: `${Math.round(request.fileSize / 1024)}KB`,
      userId: request.userContext.userId,
      targetChannels: request.targetChannels?.length || 0,
      targetTasks: request.targetTasks?.length || 0,
    });

    try {
      // Step 1: Validate file and user permissions (Target: <100ms)
      const validationStart = performance.now();
      await this.validateUploadRequest(request);
      const validationTime = performance.now() - validationStart;

      // Step 2: Create file metadata record (Target: <200ms)
      const metadataStart = performance.now();
      const s3Key = this.generateS3Key(request.fileName, request.userContext);

      const fileRecord = await this.metadataManager.createFileRecord(
        request.fileName,
        request.fileName,
        request.fileSize,
        request.contentType,
        s3Key,
        request.userContext.userId,
        request.userContext.organizationId,
        request.description,
        request.tags || []
      );

      const metadataTime = performance.now() - metadataStart;

      // Step 3: Generate S3 presigned upload URL (Target: <2000ms)
      const urlGenerationStart = performance.now();

      const fileMetadata: FileMetadata = {
        userId: request.userContext.userId,
        organizationId: request.userContext.organizationId,
        originalName: request.fileName,
        contentType: request.contentType,
        size: request.fileSize,
        uploadedAt: new Date().toISOString(),
        description: request.description ?? '',
        tags: request.tags,
      };

      const uploadResult = await this.s3Manager.generatePresignedUploadUrl(
        request.fileName,
        request.contentType,
        request.fileSize,
        fileMetadata
      );

      const urlGenerationTime = performance.now() - urlGenerationStart;

      // Step 4: Link file to entities (Target: <500ms)
      const linkingStart = performance.now();

      const linkedEntities = {
        channels: [] as string[],
        tasks: [] as string[],
        users: [] as string[],
      };

      // Link to channels
      if (request.targetChannels && request.targetChannels.length > 0) {
        for (const channelId of request.targetChannels) {
          await this.metadataManager.linkFileToEntity(
            fileRecord.id,
            'channel',
            channelId,
            'attachment',
            request.userContext.userId
          );
          linkedEntities.channels.push(channelId);
        }
      }

      // Link to tasks
      if (request.targetTasks && request.targetTasks.length > 0) {
        for (const taskId of request.targetTasks) {
          await this.metadataManager.linkFileToEntity(
            fileRecord.id,
            'task',
            taskId,
            'attachment',
            request.userContext.userId
          );
          linkedEntities.tasks.push(taskId);
        }
      }

      // Link to users (for sharing)
      if (request.targetUsers && request.targetUsers.length > 0) {
        for (const userId of request.targetUsers) {
          await this.metadataManager.linkFileToEntity(
            fileRecord.id,
            'user',
            userId,
            'share',
            request.userContext.userId
          );
          linkedEntities.users.push(userId);
        }
      }

      const linkingTime = performance.now() - linkingStart;

      // Step 5: Initialize upload progress tracking
      const uploadProgress: FileUploadProgress = {
        fileId: fileRecord.id,
        fileName: request.fileName,
        progress: 0,
        status: FileStatus.UPLOADING,
        uploadSpeed: 0,
        eta: Math.ceil(request.fileSize / 1000000), // Rough estimate: 1MB/sec
      };

      this.activeUploads.set(fileRecord.id, uploadProgress);

      // Update file status to uploading
      await this.metadataManager.updateFileStatus(fileRecord.id, FileStatus.UPLOADING);

      const totalTime = performance.now() - startTime;
      this.recordPerformance(totalTime);

      // Check performance target
      if (totalTime > 5000) {
        logger.warn('Voice upload initiation exceeded 5 second target', {
          uploadId,
          totalTime: `${totalTime.toFixed(2)}ms`,
          breakdown: {
            validation: `${validationTime.toFixed(2)}ms`,
            metadata: `${metadataTime.toFixed(2)}ms`,
            urlGeneration: `${urlGenerationTime.toFixed(2)}ms`,
            linking: `${linkingTime.toFixed(2)}ms`,
          },
        });
      }

      // Emit upload initiated event
      this.emit('upload_initiated', {
        uploadId,
        fileId: fileRecord.id,
        fileName: request.fileName,
        userId: request.userContext.userId,
        linkedEntities,
        processingTime: totalTime,
      });

      // Generate download URL for immediate access after upload
      const downloadUrl = await this.s3Manager
        .generatePresignedDownloadUrl(
          uploadResult.key,
          3600 // 1 hour
        )
        .catch(() => undefined); // Don't fail if download URL generation fails

      logger.info('Voice file upload initiated successfully', {
        uploadId,
        fileId: fileRecord.id,
        fileName: request.fileName,
        uploadUrl: uploadResult.uploadUrl ? 'generated' : 'failed',
        downloadUrl: downloadUrl ? 'generated' : 'not_generated',
        linkedEntities,
        totalTime: `${totalTime.toFixed(2)}ms`,
      });

      const result: VoiceFileUploadResult = {
        success: true,
        uploadUrl: uploadResult.uploadUrl,
        fileId: fileRecord.id,
        downloadUrl,
        expiresAt: uploadResult.expiresAt,
        linkedEntities,
        processingTime: totalTime,
      };

      // Schedule upload timeout check
      this.scheduleUploadTimeoutCheck(fileRecord.id, 30 * 60 * 1000); // 30 minutes

      return result;
    } catch (error: any) {
      const totalTime = performance.now() - startTime;
      this.recordPerformance(totalTime);

      logger.error('Voice file upload initiation failed', {
        uploadId,
        error: error.message,
        fileName: request.fileName,
        userId: request.userContext.userId,
        totalTime: `${totalTime.toFixed(2)}ms`,
      });

      this.emit('upload_failed', {
        uploadId,
        fileName: request.fileName,
        userId: request.userContext.userId,
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
   * Handle upload completion notification (typically from S3 webhook or polling)
   */
  async handleUploadCompletion(fileId: string, success: boolean, error?: string): Promise<void> {
    const uploadProgress = this.activeUploads.get(fileId);

    if (!uploadProgress) {
      logger.warn('Upload completion received for unknown file', { fileId });
      return;
    }

    try {
      if (success) {
        // Update file status to completed
        await this.metadataManager.updateFileStatus(fileId, FileStatus.COMPLETED);

        uploadProgress.progress = 100;
        uploadProgress.status = FileStatus.COMPLETED;

        logger.info('File upload completed successfully', {
          fileId,
          fileName: uploadProgress.fileName,
        });

        this.emit('upload_completed', {
          fileId,
          fileName: uploadProgress.fileName,
          status: 'success',
        });

        // Send notifications to linked entities
        await this.sendUploadNotifications(fileId);
      } else {
        // Update file status to failed
        await this.metadataManager.updateFileStatus(fileId, FileStatus.FAILED, error);

        uploadProgress.status = FileStatus.FAILED;
        uploadProgress.error = error;

        logger.error('File upload failed', {
          fileId,
          fileName: uploadProgress.fileName,
          error,
        });

        this.emit('upload_failed', {
          fileId,
          fileName: uploadProgress.fileName,
          error,
        });
      }
    } catch (dbError: any) {
      logger.error('Failed to update upload completion status', {
        fileId,
        error: dbError.message,
      });
    } finally {
      // Clean up tracking
      setTimeout(() => {
        this.activeUploads.delete(fileId);
      }, 60000); // Keep for 1 minute for final status checks
    }
  }

  /**
   * Get upload progress for a file
   */
  getUploadProgress(fileId: string): FileUploadProgress | null {
    return this.activeUploads.get(fileId) || null;
  }

  /**
   * Get all active uploads for monitoring
   */
  getActiveUploads(): FileUploadProgress[] {
    return Array.from(this.activeUploads.values());
  }

  /**
   * Cancel an active upload
   */
  async cancelUpload(fileId: string, userId: string): Promise<boolean> {
    const uploadProgress = this.activeUploads.get(fileId);

    if (!uploadProgress) {
      return false;
    }

    try {
      // Update file status to failed
      await this.metadataManager.updateFileStatus(
        fileId,
        FileStatus.FAILED,
        'Upload cancelled by user'
      );

      uploadProgress.status = FileStatus.FAILED;
      uploadProgress.error = 'Cancelled by user';

      logger.info('File upload cancelled', {
        fileId,
        fileName: uploadProgress.fileName,
        userId,
      });

      this.emit('upload_cancelled', {
        fileId,
        fileName: uploadProgress.fileName,
        userId,
      });

      // Remove from active uploads
      this.activeUploads.delete(fileId);

      return true;
    } catch (error: any) {
      logger.error('Failed to cancel upload', {
        fileId,
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Get service performance statistics
   */
  getPerformanceStats(): {
    averageInitiationTime: number;
    p95InitiationTime: number;
    p99InitiationTime: number;
    totalUploadsInitiated: number;
    activeUploadsCount: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageInitiationTime: 0,
        p95InitiationTime: 0,
        p99InitiationTime: 0,
        totalUploadsInitiated: 0,
        activeUploadsCount: this.activeUploads.size,
      };
    }

    const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
    const average =
      this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    return {
      averageInitiationTime: Math.round(average * 100) / 100,
      p95InitiationTime: Math.round(p95 * 100) / 100,
      p99InitiationTime: Math.round(p99 * 100) / 100,
      totalUploadsInitiated: this.performanceMetrics.length,
      activeUploadsCount: this.activeUploads.size,
    };
  }

  private async validateUploadRequest(request: VoiceFileUploadRequest): Promise<void> {
    // Validate file
    const validation = this.s3Manager.validateFile(
      request.fileName,
      request.contentType,
      request.fileSize
    );

    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.error}`);
    }

    // Check user permissions (basic validation)
    if (!request.userContext.userId || !request.userContext.organizationId) {
      throw new Error('Invalid user context for file upload');
    }

    // Validate entity targets exist (simplified - in real implementation would check database)
    if (request.targetChannels && request.targetChannels.some((id) => !id || id.trim() === '')) {
      throw new Error('Invalid channel ID in target channels');
    }

    if (request.targetTasks && request.targetTasks.some((id) => !id || id.trim() === '')) {
      throw new Error('Invalid task ID in target tasks');
    }
  }

  private generateS3Key(fileName: string, userContext: UserContext): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    return `organizations/${userContext.organizationId}/users/${userContext.userId}/${year}/${month}/${timestamp}_${randomId}_${sanitizedName}`;
  }

  private scheduleUploadTimeoutCheck(fileId: string, timeoutMs: number): void {
    setTimeout(async () => {
      const uploadProgress = this.activeUploads.get(fileId);

      if (uploadProgress && uploadProgress.status === FileStatus.UPLOADING) {
        logger.warn('Upload timeout - marking as failed', {
          fileId,
          fileName: uploadProgress.fileName,
          timeoutMs,
        });

        await this.handleUploadCompletion(fileId, false, 'Upload timeout');
      }
    }, timeoutMs);
  }

  private async sendUploadNotifications(fileId: string): Promise<void> {
    try {
      const fileRecord = await this.metadataManager.getFileRecord(fileId);

      if (!fileRecord) {
        logger.warn('Cannot send notifications for unknown file', { fileId });
        return;
      }

      // Get linked entities
      const linkedChannels = await this.metadataManager.getFilesForEntity('channel', fileId);
      const linkedTasks = await this.metadataManager.getFilesForEntity('task', fileId);

      // Emit notification events (to be handled by notification system)
      this.emit('file_upload_notification', {
        fileId,
        fileName: fileRecord.name,
        uploadedBy: fileRecord.uploadedBy,
        organizationId: fileRecord.organizationId,
        linkedChannels: linkedChannels.map((f) => ({ id: f.id, name: f.name })),
        linkedTasks: linkedTasks.map((f) => ({ id: f.id, name: f.name })),
        fileSize: fileRecord.size,
        contentType: fileRecord.contentType,
      });

      logger.debug('Upload notifications sent', {
        fileId,
        fileName: fileRecord.name,
        channelCount: linkedChannels.length,
        taskCount: linkedTasks.length,
      });
    } catch (error: any) {
      logger.error('Failed to send upload notifications', {
        fileId,
        error: error.message,
      });
    }
  }

  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);

    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}
