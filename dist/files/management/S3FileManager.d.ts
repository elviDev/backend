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
export declare class S3FileManager {
    private client;
    private config;
    private performanceMetrics;
    constructor(config?: Partial<S3Config>);
    /**
     * Generate presigned upload URL with comprehensive validation
     * Target: <2 second generation time
     */
    generatePresignedUploadUrl(fileName: string, contentType: string, fileSize: number, metadata: FileMetadata): Promise<PresignedUploadResult>;
    /**
     * Generate presigned download URL for file access
     */
    generatePresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
    /**
     * Delete file from S3
     */
    deleteFile(key: string): Promise<boolean>;
    /**
     * Get file metadata from S3
     */
    getFileMetadata(key: string): Promise<FileMetadata | null>;
    /**
     * Validate file against security and size constraints
     */
    validateFile(fileName: string, contentType: string, fileSize: number): FileValidationResult;
    /**
     * Get performance statistics for monitoring
     */
    getPerformanceStats(): {
        averageGenerationTime: number;
        p95GenerationTime: number;
        p99GenerationTime: number;
        totalOperations: number;
    };
    /**
     * Get service health status
     */
    getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: Record<string, any>;
    }>;
    private generateFileId;
    private generateFileKey;
    private sanitizeFileName;
    private containsUnsafeCharacters;
    private recordPerformance;
}
//# sourceMappingURL=S3FileManager.d.ts.map