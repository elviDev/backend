import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface FileEntity extends BaseEntity {
    filename: string;
    original_name: string;
    mime_type: string;
    size: number;
    url: string;
    download_url?: string;
    thumbnail_url?: string;
    uploaded_by: string;
    channel_id?: string;
    task_id?: string;
    message_id?: string;
    file_path: string;
    storage_provider: 'local' | 'aws_s3' | 'gcs' | 'azure';
    storage_key: string;
    checksum: string;
    metadata: Record<string, any>;
    access_count: number;
    last_accessed_at?: Date;
    virus_scan_status: 'pending' | 'clean' | 'infected' | 'error';
    virus_scan_result?: Record<string, any>;
    expires_at?: Date;
    is_public: boolean;
    download_count: number;
}
export interface CreateFileData {
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    downloadUrl?: string;
    thumbnailUrl?: string;
    uploadedBy: string;
    channelId?: string;
    taskId?: string;
    messageId?: string;
    filePath: string;
    storageProvider?: FileEntity['storage_provider'];
    storageKey: string;
    checksum: string;
    metadata?: Record<string, any>;
    isPublic?: boolean;
    expiresAt?: Date;
}
export interface FileWithUploader extends FileEntity {
    uploader_name: string;
    uploader_email: string;
    uploader_avatar?: string;
    channel_name?: string;
    task_title?: string;
}
declare class FileRepository extends BaseRepository<FileEntity> {
    constructor();
    /**
     * Create new file record with validation
     */
    createFile(fileData: CreateFileData, client?: DatabaseClient): Promise<FileEntity>;
    /**
     * Find files by channel
     */
    findChannelFiles(channelId: string, filters?: {
        fileType?: string;
        uploadedBy?: string;
        search?: string;
        after?: Date;
        before?: Date;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<FileWithUploader[]>;
    /**
     * Get channel file count
     */
    getChannelFileCount(channelId: string, filters?: {
        fileType?: string;
        uploadedBy?: string;
        search?: string;
        after?: Date;
        before?: Date;
    }, client?: DatabaseClient): Promise<number>;
    /**
     * Find files by task
     */
    findTaskFiles(taskId: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<FileWithUploader[]>;
    /**
     * Find files by user
     */
    findUserFiles(userId: string, filters?: {
        channelId?: string;
        taskId?: string;
        fileType?: string;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<FileWithUploader[]>;
    /**
     * Search files by name or content
     */
    searchFiles(searchTerm: string, options?: {
        userId?: string;
        channelId?: string;
        taskId?: string;
        fileType?: string;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<FileWithUploader[]>;
    /**
     * Update file access tracking
     */
    recordFileAccess(fileId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Update file download count
     */
    recordFileDownload(fileId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Update virus scan status
     */
    updateVirusScanStatus(fileId: string, status: FileEntity['virus_scan_status'], result?: Record<string, any>, client?: DatabaseClient): Promise<boolean>;
    /**
     * Get file statistics
     */
    getFileStats(client?: DatabaseClient): Promise<{
        totalFiles: number;
        totalSize: number;
        filesByType: Record<string, number>;
        filesByProvider: Record<string, number>;
        virusScannedFiles: number;
        infectedFiles: number;
        mostDownloadedFiles: Array<{
            id: string;
            filename: string;
            downloadCount: number;
        }>;
    }>;
    /**
     * Clean up expired files
     */
    cleanupExpiredFiles(client?: DatabaseClient): Promise<number>;
    /**
     * Get allowed mime types
     */
    private getAllowedMimeTypes;
    /**
     * Check if mime type is allowed
     */
    isMimeTypeAllowed(mimeType: string): boolean;
    /**
     * Get file category from mime type
     */
    getFileCategory(mimeType: string): string;
}
export default FileRepository;
//# sourceMappingURL=FileRepository.d.ts.map