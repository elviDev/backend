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
import { FileStatus } from '../management/FileMetadataManager';
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
    progress: number;
    status: FileStatus;
    uploadSpeed?: number | undefined;
    eta?: number | undefined;
    error?: string | undefined;
}
export declare class VoiceFileUploadService extends EventEmitter {
    private s3Manager;
    private metadataManager;
    private activeUploads;
    private performanceMetrics;
    constructor();
    /**
     * Initiate voice-driven file upload workflow
     * Target: Complete workflow in <5 seconds
     */
    initiateVoiceUpload(request: VoiceFileUploadRequest): Promise<VoiceFileUploadResult>;
    /**
     * Handle upload completion notification (typically from S3 webhook or polling)
     */
    handleUploadCompletion(fileId: string, success: boolean, error?: string): Promise<void>;
    /**
     * Get upload progress for a file
     */
    getUploadProgress(fileId: string): FileUploadProgress | null;
    /**
     * Get all active uploads for monitoring
     */
    getActiveUploads(): FileUploadProgress[];
    /**
     * Cancel an active upload
     */
    cancelUpload(fileId: string, userId: string): Promise<boolean>;
    /**
     * Get service performance statistics
     */
    getPerformanceStats(): {
        averageInitiationTime: number;
        p95InitiationTime: number;
        p99InitiationTime: number;
        totalUploadsInitiated: number;
        activeUploadsCount: number;
    };
    private validateUploadRequest;
    private generateS3Key;
    private scheduleUploadTimeoutCheck;
    private sendUploadNotifications;
    private recordPerformance;
}
//# sourceMappingURL=VoiceFileUploadService.d.ts.map