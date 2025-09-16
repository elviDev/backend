"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
class FileRepository extends BaseRepository_1.default {
    constructor() {
        super('files');
    }
    /**
     * Create new file record with validation
     */
    async createFile(fileData, client) {
        // Validate file size (100MB default max)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (fileData.size > maxSize) {
            throw new errors_1.ValidationError('File size exceeds maximum allowed size', [
                { field: 'size', message: `File size must be less than ${maxSize} bytes` },
            ]);
        }
        // Validate mime type
        const allowedTypes = this.getAllowedMimeTypes();
        if (!allowedTypes.includes(fileData.mimeType)) {
            throw new errors_1.ValidationError('Unsupported file type', [
                { field: 'mimeType', message: `File type ${fileData.mimeType} is not allowed` },
            ]);
        }
        const fileToCreate = {
            filename: fileData.filename,
            original_name: fileData.originalName,
            mime_type: fileData.mimeType,
            size: fileData.size,
            url: fileData.url,
            download_url: fileData.downloadUrl ?? '',
            thumbnail_url: fileData.thumbnailUrl ?? '',
            uploaded_by: fileData.uploadedBy,
            channel_id: fileData.channelId ?? '',
            task_id: fileData.taskId ?? '',
            message_id: fileData.messageId ?? '',
            file_path: fileData.filePath,
            storage_provider: fileData.storageProvider || 'local',
            storage_key: fileData.storageKey,
            checksum: fileData.checksum,
            metadata: fileData.metadata || {},
            access_count: 0,
            virus_scan_status: 'pending',
            is_public: fileData.isPublic || false,
            download_count: 0,
            ...(fileData.expiresAt ? { expires_at: fileData.expiresAt } : {}),
        };
        const file = await this.create(fileToCreate, client);
        logger_1.logger.info({
            fileId: file.id,
            filename: file.filename,
            size: file.size,
            uploadedBy: file.uploaded_by,
            channelId: file.channel_id,
            taskId: file.task_id,
        }, 'File created successfully');
        return file;
    }
    /**
     * Find files by channel
     */
    async findChannelFiles(channelId, filters, limit = 50, offset = 0, client) {
        let whereConditions = ['fel.entity_type = \'channel\'', 'fel.entity_id = $1', 'f.deleted_at IS NULL'];
        let params = [channelId];
        let paramIndex = 2;
        // Add filters
        if (filters?.fileType) {
            whereConditions.push(`f.mime_type LIKE $${paramIndex}`);
            params.push(`${filters.fileType}%`);
            paramIndex++;
        }
        if (filters?.uploadedBy) {
            whereConditions.push(`f.uploaded_by = $${paramIndex}`);
            params.push(filters.uploadedBy);
            paramIndex++;
        }
        if (filters?.search) {
            whereConditions.push(`(
        LOWER(f.filename) LIKE LOWER($${paramIndex}) OR 
        LOWER(f.original_name) LIKE LOWER($${paramIndex})
      )`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }
        if (filters?.after) {
            whereConditions.push(`f.uploaded_at > $${paramIndex}`);
            params.push(filters.after);
            paramIndex++;
        }
        if (filters?.before) {
            whereConditions.push(`f.uploaded_at < $${paramIndex}`);
            params.push(filters.before);
            paramIndex++;
        }
        const sql = `
      SELECT 
        f.*,
        u.name as uploader_name,
        u.email as uploader_email,
        u.avatar_url as uploader_avatar,
        c.name as channel_name,
        t.title as task_title
      FROM ${this.tableName} f
      INNER JOIN file_entity_links fel ON f.id = fel.file_id
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN channels c ON fel.entity_id = c.id AND fel.entity_type = 'channel'
      LEFT JOIN tasks t ON fel.entity_id = t.id AND fel.entity_type = 'task'
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY f.uploaded_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Get channel file count
     */
    async getChannelFileCount(channelId, filters, client) {
        let whereConditions = ['fel.entity_type = \'channel\'', 'fel.entity_id = $1', 'f.deleted_at IS NULL'];
        let params = [channelId];
        let paramIndex = 2;
        // Add filters
        if (filters?.fileType) {
            whereConditions.push(`f.mime_type LIKE $${paramIndex}`);
            params.push(`${filters.fileType}%`);
            paramIndex++;
        }
        if (filters?.uploadedBy) {
            whereConditions.push(`f.uploaded_by = $${paramIndex}`);
            params.push(filters.uploadedBy);
            paramIndex++;
        }
        if (filters?.search) {
            whereConditions.push(`(
        LOWER(f.filename) LIKE LOWER($${paramIndex}) OR 
        LOWER(f.original_name) LIKE LOWER($${paramIndex})
      )`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }
        if (filters?.after) {
            whereConditions.push(`f.uploaded_at > $${paramIndex}`);
            params.push(filters.after);
            paramIndex++;
        }
        if (filters?.before) {
            whereConditions.push(`f.uploaded_at < $${paramIndex}`);
            params.push(filters.before);
            paramIndex++;
        }
        const sql = `
      SELECT COUNT(*) as count
      FROM ${this.tableName} f
      INNER JOIN file_entity_links fel ON f.id = fel.file_id
      WHERE ${whereConditions.join(' AND ')}
    `;
        const result = await this.executeRawQuery(sql, params, client);
        return parseInt(result.rows[0]?.count || '0', 10);
    }
    /**
     * Find files by task
     */
    async findTaskFiles(taskId, limit = 50, offset = 0, client) {
        const sql = `
      SELECT 
        f.*,
        u.name as uploader_name,
        u.email as uploader_email,
        u.avatar_url as uploader_avatar,
        t.title as task_title
      FROM ${this.tableName} f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN tasks t ON f.task_id = t.id
      WHERE f.task_id = $1 AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const result = await this.executeRawQuery(sql, [taskId, limit, offset], client);
        return result.rows;
    }
    /**
     * Find files by user
     */
    async findUserFiles(userId, filters, limit = 50, offset = 0, client) {
        let whereConditions = ['f.uploaded_by = $1', 'f.deleted_at IS NULL'];
        let params = [userId];
        let paramIndex = 2;
        // Add filters
        if (filters?.channelId) {
            whereConditions.push(`f.channel_id = $${paramIndex}`);
            params.push(filters.channelId);
            paramIndex++;
        }
        if (filters?.taskId) {
            whereConditions.push(`f.task_id = $${paramIndex}`);
            params.push(filters.taskId);
            paramIndex++;
        }
        if (filters?.fileType) {
            whereConditions.push(`f.mime_type LIKE $${paramIndex}`);
            params.push(`${filters.fileType}%`);
            paramIndex++;
        }
        const sql = `
      SELECT 
        f.*,
        u.name as uploader_name,
        u.email as uploader_email,
        u.avatar_url as uploader_avatar,
        c.name as channel_name,
        t.title as task_title
      FROM ${this.tableName} f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN channels c ON f.channel_id = c.id
      LEFT JOIN tasks t ON f.task_id = t.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Search files by name or content
     */
    async searchFiles(searchTerm, options, limit = 50, offset = 0, client) {
        let whereConditions = [
            'f.deleted_at IS NULL',
            '(LOWER(f.filename) LIKE LOWER($1) OR LOWER(f.original_name) LIKE LOWER($1))',
        ];
        let params = [`%${searchTerm}%`];
        let paramIndex = 2;
        // Add filters
        if (options?.userId) {
            whereConditions.push(`f.uploaded_by = $${paramIndex}`);
            params.push(options.userId);
            paramIndex++;
        }
        if (options?.channelId) {
            whereConditions.push(`f.channel_id = $${paramIndex}`);
            params.push(options.channelId);
            paramIndex++;
        }
        if (options?.taskId) {
            whereConditions.push(`f.task_id = $${paramIndex}`);
            params.push(options.taskId);
            paramIndex++;
        }
        if (options?.fileType) {
            whereConditions.push(`f.mime_type LIKE $${paramIndex}`);
            params.push(`${options.fileType}%`);
            paramIndex++;
        }
        const sql = `
      SELECT 
        f.*,
        u.name as uploader_name,
        u.email as uploader_email,
        u.avatar_url as uploader_avatar,
        c.name as channel_name,
        t.title as task_title
      FROM ${this.tableName} f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN channels c ON f.channel_id = c.id
      LEFT JOIN tasks t ON f.task_id = t.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Update file access tracking
     */
    async recordFileAccess(fileId, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        access_count = access_count + 1,
        last_accessed_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            await this.executeRawQuery(sql, [fileId], client);
            logger_1.logger.debug({
                fileId,
            }, 'File access recorded');
        }
        catch (error) {
            logger_1.logger.error({ error, fileId }, 'Failed to record file access');
        }
    }
    /**
     * Update file download count
     */
    async recordFileDownload(fileId, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET download_count = download_count + 1
      WHERE id = $1 AND deleted_at IS NULL
    `;
        try {
            await this.executeRawQuery(sql, [fileId], client);
            logger_1.logger.debug({
                fileId,
            }, 'File download recorded');
        }
        catch (error) {
            logger_1.logger.error({ error, fileId }, 'Failed to record file download');
        }
    }
    /**
     * Update virus scan status
     */
    async updateVirusScanStatus(fileId, status, result, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        virus_scan_status = $2,
        virus_scan_result = $3
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
        try {
            const queryResult = await this.executeRawQuery(sql, [fileId, status, JSON.stringify(result || {})], client);
            if (queryResult.rowCount > 0) {
                logger_1.logger.info({
                    fileId,
                    status,
                    hasResult: !!result,
                }, 'Virus scan status updated');
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error({ error, fileId, status }, 'Failed to update virus scan status');
            return false;
        }
    }
    /**
     * Get file statistics
     */
    async getFileStats(client) {
        const statsSql = `
      SELECT 
        COUNT(*) as total_files,
        SUM(size) as total_size,
        COUNT(*) FILTER (WHERE mime_type LIKE 'image/%') as image_files,
        COUNT(*) FILTER (WHERE mime_type LIKE 'video/%') as video_files,
        COUNT(*) FILTER (WHERE mime_type LIKE 'audio/%') as audio_files,
        COUNT(*) FILTER (WHERE mime_type = 'application/pdf') as pdf_files,
        COUNT(*) FILTER (WHERE storage_provider = 'local') as local_files,
        COUNT(*) FILTER (WHERE storage_provider = 'aws_s3') as s3_files,
        COUNT(*) FILTER (WHERE virus_scan_status = 'clean') as clean_files,
        COUNT(*) FILTER (WHERE virus_scan_status = 'infected') as infected_files
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
    `;
        const topFilesSql = `
      SELECT id, filename, download_count
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
      AND download_count > 0
      ORDER BY download_count DESC
      LIMIT 10
    `;
        const [statsResult, topFilesResult] = await Promise.all([
            this.executeRawQuery(statsSql, [], client),
            this.executeRawQuery(topFilesSql, [], client),
        ]);
        const stats = statsResult.rows[0];
        return {
            totalFiles: parseInt(stats.total_files, 10),
            totalSize: parseInt(stats.total_size, 10) || 0,
            filesByType: {
                image: parseInt(stats.image_files, 10),
                video: parseInt(stats.video_files, 10),
                audio: parseInt(stats.audio_files, 10),
                pdf: parseInt(stats.pdf_files, 10),
            },
            filesByProvider: {
                local: parseInt(stats.local_files, 10),
                aws_s3: parseInt(stats.s3_files, 10),
            },
            virusScannedFiles: parseInt(stats.clean_files, 10),
            infectedFiles: parseInt(stats.infected_files, 10),
            mostDownloadedFiles: topFilesResult.rows.map((row) => ({
                id: row.id,
                filename: row.filename,
                downloadCount: parseInt(row.download_count, 10),
            })),
        };
    }
    /**
     * Clean up expired files
     */
    async cleanupExpiredFiles(client) {
        const sql = `
      UPDATE ${this.tableName}
      SET deleted_at = NOW()
      WHERE expires_at IS NOT NULL 
        AND expires_at < NOW()
        AND deleted_at IS NULL
    `;
        try {
            const result = await this.executeRawQuery(sql, [], client);
            logger_1.logger.info({
                deletedCount: result.rowCount,
            }, 'Expired files cleaned up');
            return result.rowCount;
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to clean up expired files');
            return 0;
        }
    }
    /**
     * Get allowed mime types
     */
    getAllowedMimeTypes() {
        return [
            // Images
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            'image/bmp',
            'image/tiff',
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'text/markdown',
            'application/json',
            'application/xml',
            // Archives
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/x-tar',
            'application/gzip',
            // Media
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
            'video/webm',
            'audio/mpeg',
            'audio/wav',
            'audio/mp4',
            'audio/webm',
            'audio/ogg',
            // Code files
            'text/javascript',
            'text/css',
            'text/html',
            'application/javascript',
        ];
    }
    /**
     * Check if mime type is allowed
     */
    isMimeTypeAllowed(mimeType) {
        return this.getAllowedMimeTypes().includes(mimeType);
    }
    /**
     * Get file category from mime type
     */
    getFileCategory(mimeType) {
        if (mimeType.startsWith('image/'))
            return 'image';
        if (mimeType.startsWith('video/'))
            return 'video';
        if (mimeType.startsWith('audio/'))
            return 'audio';
        if (mimeType === 'application/pdf')
            return 'document';
        if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('powerpoint'))
            return 'office';
        if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml'))
            return 'text';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar'))
            return 'archive';
        return 'other';
    }
}
exports.default = FileRepository;
//# sourceMappingURL=FileRepository.js.map