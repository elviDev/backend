/**
 * File Metadata Manager - Phase 2 File Management System
 * Manages file metadata in database with entity linking capabilities
 *
 * Success Criteria:
 * - File record creation before upload
 * - Status tracking (pending, uploading, completed, failed)
 * - Entity linking (channels, tasks, users)
 * - Metadata indexing for fast search
 */
export interface FileRecord {
    id: string;
    name: string;
    originalName: string;
    size: number;
    contentType: string;
    s3Key: string;
    uploadedBy: string;
    organizationId: string;
    status: FileStatus;
    description?: string;
    tags: string[];
    uploadedAt: Date;
    updatedAt: Date;
    downloadCount: number;
    lastDownloaded?: Date;
}
export declare enum FileStatus {
    PENDING = "pending",
    UPLOADING = "uploading",
    COMPLETED = "completed",
    FAILED = "failed",
    DELETED = "deleted"
}
export interface FileEntityLink {
    fileId: string;
    entityType: 'channel' | 'task' | 'user' | 'project';
    entityId: string;
    linkType: 'attachment' | 'share' | 'reference';
    linkedBy: string;
    linkedAt: Date;
}
export interface FileSearchQuery {
    organizationId: string;
    userId?: string;
    name?: string;
    contentType?: string;
    tags?: string[];
    entityType?: string;
    entityId?: string;
    status?: FileStatus;
    uploadedAfter?: Date;
    uploadedBefore?: Date;
    limit?: number;
    offset?: number;
}
export interface FileSearchResult {
    files: FileRecord[];
    totalCount: number;
    hasMore: boolean;
}
export declare class FileMetadataManager {
    private db;
    private performanceMetrics;
    constructor();
    /**
     * Create file record before upload process
     * Target: <200ms creation time
     */
    createFileRecord(name: string, originalName: string, size: number, contentType: string, s3Key: string, uploadedBy: string, organizationId: string, description?: string, tags?: string[]): Promise<FileRecord>;
    /**
     * Update file status during upload lifecycle
     */
    updateFileStatus(fileId: string, status: FileStatus, error?: string): Promise<boolean>;
    /**
     * Link file to entity (channel, task, user, project)
     */
    linkFileToEntity(fileId: string, entityType: FileEntityLink['entityType'], entityId: string, linkType: FileEntityLink["linkType"] | undefined, linkedBy: string): Promise<boolean>;
    /**
     * Remove file-entity link
     */
    unlinkFileFromEntity(fileId: string, entityType: FileEntityLink['entityType'], entityId: string, linkType?: FileEntityLink['linkType']): Promise<boolean>;
    /**
     * Get file record by ID
     */
    getFileRecord(fileId: string): Promise<FileRecord | null>;
    /**
     * Search files with advanced filtering
     */
    searchFiles(query: FileSearchQuery): Promise<FileSearchResult>;
    /**
     * Get files linked to a specific entity
     */
    getFilesForEntity(entityType: FileEntityLink['entityType'], entityId: string, linkType?: FileEntityLink['linkType']): Promise<FileRecord[]>;
    /**
     * Increment download counter for analytics
     */
    recordDownload(fileId: string): Promise<void>;
    /**
     * Soft delete file record
     */
    deleteFileRecord(fileId: string): Promise<boolean>;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        averageQueryTime: number;
        p95QueryTime: number;
        totalQueries: number;
    };
    private recordPerformance;
}
//# sourceMappingURL=FileMetadataManager.d.ts.map