"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceFileUploadService = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const S3FileManager_1 = require("../management/S3FileManager");
const FileMetadataManager_1 = require("../management/FileMetadataManager");
const logger_1 = require("../../utils/logger");
class VoiceFileUploadService extends events_1.EventEmitter {
    s3Manager;
    metadataManager;
    activeUploads = new Map();
    performanceMetrics = [];
    constructor() {
        super();
        this.s3Manager = new S3FileManager_1.S3FileManager({
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
        this.metadataManager = new FileMetadataManager_1.FileMetadataManager();
        logger_1.logger.info('Voice File Upload Service initialized');
    }
    /**
     * Initiate voice-driven file upload workflow
     * Target: Complete workflow in <5 seconds
     */
    async initiateVoiceUpload(request) {
        const startTime = perf_hooks_1.performance.now();
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        logger_1.logger.info('Starting voice file upload', {
            uploadId,
            fileName: request.fileName,
            fileSize: `${Math.round(request.fileSize / 1024)}KB`,
            userId: request.userContext.userId,
            targetChannels: request.targetChannels?.length || 0,
            targetTasks: request.targetTasks?.length || 0,
        });
        try {
            // Step 1: Validate file and user permissions (Target: <100ms)
            const validationStart = perf_hooks_1.performance.now();
            await this.validateUploadRequest(request);
            const validationTime = perf_hooks_1.performance.now() - validationStart;
            // Step 2: Create file metadata record (Target: <200ms)
            const metadataStart = perf_hooks_1.performance.now();
            const s3Key = this.generateS3Key(request.fileName, request.userContext);
            const fileRecord = await this.metadataManager.createFileRecord(request.fileName, request.fileName, request.fileSize, request.contentType, s3Key, request.userContext.userId, request.userContext.organizationId, request.description, request.tags || []);
            const metadataTime = perf_hooks_1.performance.now() - metadataStart;
            // Step 3: Generate S3 presigned upload URL (Target: <2000ms)
            const urlGenerationStart = perf_hooks_1.performance.now();
            const fileMetadata = {
                userId: request.userContext.userId,
                organizationId: request.userContext.organizationId,
                originalName: request.fileName,
                contentType: request.contentType,
                size: request.fileSize,
                uploadedAt: new Date().toISOString(),
                description: request.description ?? '',
                tags: request.tags,
            };
            const uploadResult = await this.s3Manager.generatePresignedUploadUrl(request.fileName, request.contentType, request.fileSize, fileMetadata);
            const urlGenerationTime = perf_hooks_1.performance.now() - urlGenerationStart;
            // Step 4: Link file to entities (Target: <500ms)
            const linkingStart = perf_hooks_1.performance.now();
            const linkedEntities = {
                channels: [],
                tasks: [],
                users: [],
            };
            // Link to channels
            if (request.targetChannels && request.targetChannels.length > 0) {
                for (const channelId of request.targetChannels) {
                    await this.metadataManager.linkFileToEntity(fileRecord.id, 'channel', channelId, 'attachment', request.userContext.userId);
                    linkedEntities.channels.push(channelId);
                }
            }
            // Link to tasks
            if (request.targetTasks && request.targetTasks.length > 0) {
                for (const taskId of request.targetTasks) {
                    await this.metadataManager.linkFileToEntity(fileRecord.id, 'task', taskId, 'attachment', request.userContext.userId);
                    linkedEntities.tasks.push(taskId);
                }
            }
            // Link to users (for sharing)
            if (request.targetUsers && request.targetUsers.length > 0) {
                for (const userId of request.targetUsers) {
                    await this.metadataManager.linkFileToEntity(fileRecord.id, 'user', userId, 'share', request.userContext.userId);
                    linkedEntities.users.push(userId);
                }
            }
            const linkingTime = perf_hooks_1.performance.now() - linkingStart;
            // Step 5: Initialize upload progress tracking
            const uploadProgress = {
                fileId: fileRecord.id,
                fileName: request.fileName,
                progress: 0,
                status: FileMetadataManager_1.FileStatus.UPLOADING,
                uploadSpeed: 0,
                eta: Math.ceil(request.fileSize / 1000000), // Rough estimate: 1MB/sec
            };
            this.activeUploads.set(fileRecord.id, uploadProgress);
            // Update file status to uploading
            await this.metadataManager.updateFileStatus(fileRecord.id, FileMetadataManager_1.FileStatus.UPLOADING);
            const totalTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(totalTime);
            // Check performance target
            if (totalTime > 5000) {
                logger_1.logger.warn('Voice upload initiation exceeded 5 second target', {
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
                .generatePresignedDownloadUrl(uploadResult.key, 3600 // 1 hour
            )
                .catch(() => undefined); // Don't fail if download URL generation fails
            logger_1.logger.info('Voice file upload initiated successfully', {
                uploadId,
                fileId: fileRecord.id,
                fileName: request.fileName,
                uploadUrl: uploadResult.uploadUrl ? 'generated' : 'failed',
                downloadUrl: downloadUrl ? 'generated' : 'not_generated',
                linkedEntities,
                totalTime: `${totalTime.toFixed(2)}ms`,
            });
            const result = {
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
        }
        catch (error) {
            const totalTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(totalTime);
            logger_1.logger.error('Voice file upload initiation failed', {
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
    async handleUploadCompletion(fileId, success, error) {
        const uploadProgress = this.activeUploads.get(fileId);
        if (!uploadProgress) {
            logger_1.logger.warn('Upload completion received for unknown file', { fileId });
            return;
        }
        try {
            if (success) {
                // Update file status to completed
                await this.metadataManager.updateFileStatus(fileId, FileMetadataManager_1.FileStatus.COMPLETED);
                uploadProgress.progress = 100;
                uploadProgress.status = FileMetadataManager_1.FileStatus.COMPLETED;
                logger_1.logger.info('File upload completed successfully', {
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
            }
            else {
                // Update file status to failed
                await this.metadataManager.updateFileStatus(fileId, FileMetadataManager_1.FileStatus.FAILED, error);
                uploadProgress.status = FileMetadataManager_1.FileStatus.FAILED;
                uploadProgress.error = error;
                logger_1.logger.error('File upload failed', {
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
        }
        catch (dbError) {
            logger_1.logger.error('Failed to update upload completion status', {
                fileId,
                error: dbError.message,
            });
        }
        finally {
            // Clean up tracking
            setTimeout(() => {
                this.activeUploads.delete(fileId);
            }, 60000); // Keep for 1 minute for final status checks
        }
    }
    /**
     * Get upload progress for a file
     */
    getUploadProgress(fileId) {
        return this.activeUploads.get(fileId) || null;
    }
    /**
     * Get all active uploads for monitoring
     */
    getActiveUploads() {
        return Array.from(this.activeUploads.values());
    }
    /**
     * Cancel an active upload
     */
    async cancelUpload(fileId, userId) {
        const uploadProgress = this.activeUploads.get(fileId);
        if (!uploadProgress) {
            return false;
        }
        try {
            // Update file status to failed
            await this.metadataManager.updateFileStatus(fileId, FileMetadataManager_1.FileStatus.FAILED, 'Upload cancelled by user');
            uploadProgress.status = FileMetadataManager_1.FileStatus.FAILED;
            uploadProgress.error = 'Cancelled by user';
            logger_1.logger.info('File upload cancelled', {
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
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel upload', {
                fileId,
                error: error.message,
            });
            return false;
        }
    }
    /**
     * Get service performance statistics
     */
    getPerformanceStats() {
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
        const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
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
    async validateUploadRequest(request) {
        // Validate file
        const validation = this.s3Manager.validateFile(request.fileName, request.contentType, request.fileSize);
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
    generateS3Key(fileName, userContext) {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        return `organizations/${userContext.organizationId}/users/${userContext.userId}/${year}/${month}/${timestamp}_${randomId}_${sanitizedName}`;
    }
    scheduleUploadTimeoutCheck(fileId, timeoutMs) {
        setTimeout(async () => {
            const uploadProgress = this.activeUploads.get(fileId);
            if (uploadProgress && uploadProgress.status === FileMetadataManager_1.FileStatus.UPLOADING) {
                logger_1.logger.warn('Upload timeout - marking as failed', {
                    fileId,
                    fileName: uploadProgress.fileName,
                    timeoutMs,
                });
                await this.handleUploadCompletion(fileId, false, 'Upload timeout');
            }
        }, timeoutMs);
    }
    async sendUploadNotifications(fileId) {
        try {
            const fileRecord = await this.metadataManager.getFileRecord(fileId);
            if (!fileRecord) {
                logger_1.logger.warn('Cannot send notifications for unknown file', { fileId });
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
            logger_1.logger.debug('Upload notifications sent', {
                fileId,
                fileName: fileRecord.name,
                channelCount: linkedChannels.length,
                taskCount: linkedTasks.length,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to send upload notifications', {
                fileId,
                error: error.message,
            });
        }
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
}
exports.VoiceFileUploadService = VoiceFileUploadService;
//# sourceMappingURL=VoiceFileUploadService.js.map