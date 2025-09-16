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

import { performance } from 'perf_hooks';
import { DatabaseManager } from '../../db';
import { logger } from '../../utils/logger';

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

export enum FileStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETED = 'deleted'
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

export class FileMetadataManager {
  private db: DatabaseManager;
  private performanceMetrics: number[] = [];
  
  constructor() {
    this.db = DatabaseManager.getInstance();
    logger.info('File Metadata Manager initialized');
  }
  
  /**
   * Create file record before upload process
   * Target: <200ms creation time
   */
  async createFileRecord(
    name: string,
    originalName: string,
    size: number,
    contentType: string,
    s3Key: string,
    uploadedBy: string,
    organizationId: string,
    description?: string,
    tags: string[] = []
  ): Promise<FileRecord> {
    const startTime = performance.now();
    
    try {
      const result = await this.db.query(`
        INSERT INTO files (
          name, original_name, size, content_type, s3_key,
          uploaded_by, organization_id, status, description, 
          tags, uploaded_at, updated_at, download_count
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
          NOW(), NOW(), 0
        )
        RETURNING 
          id, name, original_name as "originalName", size, content_type as "contentType",
          s3_key as "s3Key", uploaded_by as "uploadedBy", organization_id as "organizationId",
          status, description, tags, uploaded_at as "uploadedAt", 
          updated_at as "updatedAt", download_count as "downloadCount"
      `, [
        name, originalName, size, contentType, s3Key,
        uploadedBy, organizationId, FileStatus.PENDING,
        description, JSON.stringify(tags)
      ]);
      
      const fileRecord = result.rows[0] as FileRecord;
      
      // Parse JSON tags back to array
      fileRecord.tags = typeof fileRecord.tags === 'string' 
        ? JSON.parse(fileRecord.tags as any) 
        : fileRecord.tags;
      
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      logger.info('File record created successfully', {
        fileId: fileRecord.id,
        name: fileRecord.name,
        size: `${Math.round(fileRecord.size / 1024)}KB`,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      return fileRecord;
      
    } catch (error: any) {
      const processingTime = performance.now() - startTime;
      this.recordPerformance(processingTime);
      
      logger.error('Failed to create file record', {
        error: error.message,
        name,
        uploadedBy,
        organizationId,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      throw new Error(`Failed to create file record: ${error.message}`);
    }
  }
  
  /**
   * Update file status during upload lifecycle
   */
  async updateFileStatus(fileId: string, status: FileStatus, error?: string): Promise<boolean> {
    const startTime = performance.now();
    
    try {
      let query = `
        UPDATE files 
        SET status = $2, updated_at = NOW()
      `;
      
      const params = [fileId, status];
      
      if (error && status === FileStatus.FAILED) {
        query += `, error_message = $3`;
        params.push(error);
      }
      
      query += ` WHERE id = $1 RETURNING id`;
      
      const result = await this.db.query(query, params);
      
      if (result.rowCount === 0) {
        logger.warn('File not found for status update', { fileId, status });
        return false;
      }
      
      const processingTime = performance.now() - startTime;
      
      logger.debug('File status updated', {
        fileId,
        status,
        processingTime: `${processingTime.toFixed(2)}ms`,
        error: error ? error.substring(0, 100) : undefined
      });
      
      return true;
      
    } catch (dbError: any) {
      logger.error('Failed to update file status', {
        error: dbError.message,
        fileId,
        status
      });
      
      return false;
    }
  }
  
  /**
   * Link file to entity (channel, task, user, project)
   */
  async linkFileToEntity(
    fileId: string,
    entityType: FileEntityLink['entityType'],
    entityId: string,
    linkType: FileEntityLink['linkType'] = 'attachment',
    linkedBy: string
  ): Promise<boolean> {
    const startTime = performance.now();
    
    try {
      await this.db.query(`
        INSERT INTO file_entity_links (
          file_id, entity_type, entity_id, link_type, linked_by, linked_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (file_id, entity_type, entity_id, link_type) 
        DO UPDATE SET 
          linked_by = EXCLUDED.linked_by,
          linked_at = EXCLUDED.linked_at
      `, [fileId, entityType, entityId, linkType, linkedBy]);
      
      const processingTime = performance.now() - startTime;
      
      logger.info('File linked to entity', {
        fileId,
        entityType,
        entityId,
        linkType,
        linkedBy,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      return true;
      
    } catch (error: any) {
      logger.error('Failed to link file to entity', {
        error: error.message,
        fileId,
        entityType,
        entityId,
        linkType
      });
      
      return false;
    }
  }
  
  /**
   * Remove file-entity link
   */
  async unlinkFileFromEntity(
    fileId: string,
    entityType: FileEntityLink['entityType'],
    entityId: string,
    linkType?: FileEntityLink['linkType']
  ): Promise<boolean> {
    try {
      let query = `
        DELETE FROM file_entity_links 
        WHERE file_id = $1 AND entity_type = $2 AND entity_id = $3
      `;
      const params = [fileId, entityType, entityId];
      
      if (linkType) {
        query += ` AND link_type = $4`;
        params.push(linkType);
      }
      
      const result = await this.db.query(query, params);
      
      logger.info('File unlinked from entity', {
        fileId,
        entityType,
        entityId,
        linkType,
        removedLinks: result.rowCount
      });
      
      return result.rowCount > 0;
      
    } catch (error: any) {
      logger.error('Failed to unlink file from entity', {
        error: error.message,
        fileId,
        entityType,
        entityId
      });
      
      return false;
    }
  }
  
  /**
   * Get file record by ID
   */
  async getFileRecord(fileId: string): Promise<FileRecord | null> {
    try {
      const result = await this.db.query(`
        SELECT 
          id, name, original_name as "originalName", size, content_type as "contentType",
          s3_key as "s3Key", uploaded_by as "uploadedBy", organization_id as "organizationId",
          status, description, tags, uploaded_at as "uploadedAt", 
          updated_at as "updatedAt", download_count as "downloadCount",
          last_downloaded as "lastDownloaded"
        FROM files 
        WHERE id = $1 AND status != $2
      `, [fileId, FileStatus.DELETED]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const fileRecord = result.rows[0] as FileRecord;
      
      // Parse JSON tags
      fileRecord.tags = typeof fileRecord.tags === 'string' 
        ? JSON.parse(fileRecord.tags as any) 
        : fileRecord.tags || [];
      
      return fileRecord;
      
    } catch (error: any) {
      logger.error('Failed to get file record', {
        error: error.message,
        fileId
      });
      
      return null;
    }
  }
  
  /**
   * Search files with advanced filtering
   */
  async searchFiles(query: FileSearchQuery): Promise<FileSearchResult> {
    const startTime = performance.now();
    
    try {
      const limit = query.limit || 20;
      const offset = query.offset || 0;
      
      // Build dynamic WHERE clause
      const conditions: string[] = ['f.organization_id = $1', 'f.status != $2'];
      const params: any[] = [query.organizationId, FileStatus.DELETED];
      let paramIndex = 3;
      
      if (query.userId) {
        conditions.push(`f.uploaded_by = $${paramIndex}`);
        params.push(query.userId);
        paramIndex++;
      }
      
      if (query.name) {
        conditions.push(`(f.name ILIKE $${paramIndex} OR f.original_name ILIKE $${paramIndex})`);
        params.push(`%${query.name}%`);
        paramIndex++;
      }
      
      if (query.contentType) {
        conditions.push(`f.content_type ILIKE $${paramIndex}`);
        params.push(`%${query.contentType}%`);
        paramIndex++;
      }
      
      if (query.status) {
        conditions.push(`f.status = $${paramIndex}`);
        params.push(query.status);
        paramIndex++;
      }
      
      if (query.tags && query.tags.length > 0) {
        conditions.push(`f.tags::jsonb ?| $${paramIndex}`);
        params.push(query.tags);
        paramIndex++;
      }
      
      if (query.uploadedAfter) {
        conditions.push(`f.uploaded_at >= $${paramIndex}`);
        params.push(query.uploadedAfter);
        paramIndex++;
      }
      
      if (query.uploadedBefore) {
        conditions.push(`f.uploaded_at <= $${paramIndex}`);
        params.push(query.uploadedBefore);
        paramIndex++;
      }
      
      // Add entity filter if specified
      let joinClause = '';
      if (query.entityType && query.entityId) {
        joinClause = `
          INNER JOIN file_entity_links fel ON f.id = fel.file_id 
            AND fel.entity_type = $${paramIndex} 
            AND fel.entity_id = $${paramIndex + 1}
        `;
        params.push(query.entityType, query.entityId);
        paramIndex += 2;
      }
      
      const whereClause = conditions.join(' AND ');
      
      // Count total results
      const countQuery = `
        SELECT COUNT(DISTINCT f.id) as total
        FROM files f ${joinClause}
        WHERE ${whereClause}
      `;
      
      const countResult = await this.db.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].total);
      
      // Get paginated results
      const dataQuery = `
        SELECT DISTINCT
          f.id, f.name, f.original_name as "originalName", f.size, 
          f.content_type as "contentType", f.s3_key as "s3Key",
          f.uploaded_by as "uploadedBy", f.organization_id as "organizationId",
          f.status, f.description, f.tags, f.uploaded_at as "uploadedAt", 
          f.updated_at as "updatedAt", f.download_count as "downloadCount",
          f.last_downloaded as "lastDownloaded"
        FROM files f ${joinClause}
        WHERE ${whereClause}
        ORDER BY f.uploaded_at DESC, f.id DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      params.push(limit, offset);
      
      const dataResult = await this.db.query(dataQuery, params);
      
      // Parse tags for each file
      const files: FileRecord[] = dataResult.rows.map((row: any) => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
      }));
      
      const processingTime = performance.now() - startTime;
      
      logger.debug('File search completed', {
        totalFound: totalCount,
        returnedCount: files.length,
        processingTime: `${processingTime.toFixed(2)}ms`,
        query: {
          organizationId: query.organizationId,
          userId: query.userId,
          name: query.name,
          entityType: query.entityType,
          entityId: query.entityId
        }
      });
      
      return {
        files,
        totalCount,
        hasMore: offset + files.length < totalCount
      };
      
    } catch (error: any) {
      logger.error('File search failed', {
        error: error.message,
        query
      });
      
      return {
        files: [],
        totalCount: 0,
        hasMore: false
      };
    }
  }
  
  /**
   * Get files linked to a specific entity
   */
  async getFilesForEntity(
    entityType: FileEntityLink['entityType'],
    entityId: string,
    linkType?: FileEntityLink['linkType']
  ): Promise<FileRecord[]> {
    try {
      let query = `
        SELECT 
          f.id, f.name, f.original_name as "originalName", f.size, 
          f.content_type as "contentType", f.s3_key as "s3Key",
          f.uploaded_by as "uploadedBy", f.organization_id as "organizationId",
          f.status, f.description, f.tags, f.uploaded_at as "uploadedAt", 
          f.updated_at as "updatedAt", f.download_count as "downloadCount",
          f.last_downloaded as "lastDownloaded"
        FROM files f
        INNER JOIN file_entity_links fel ON f.id = fel.file_id
        WHERE fel.entity_type = $1 AND fel.entity_id = $2 
          AND f.status = $3
      `;
      
      const params = [entityType, entityId, FileStatus.COMPLETED];
      
      if (linkType) {
        query += ` AND fel.link_type = $4`;
        params.push(linkType);
      }
      
      query += ` ORDER BY fel.linked_at DESC`;
      
      const result = await this.db.query(query, params);
      
      // Parse tags for each file
      const files: FileRecord[] = result.rows.map((row: any) => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
      }));
      
      return files;
      
    } catch (error: any) {
      logger.error('Failed to get files for entity', {
        error: error.message,
        entityType,
        entityId,
        linkType
      });
      
      return [];
    }
  }
  
  /**
   * Increment download counter for analytics
   */
  async recordDownload(fileId: string): Promise<void> {
    try {
      await this.db.query(`
        UPDATE files 
        SET download_count = download_count + 1, last_downloaded = NOW()
        WHERE id = $1
      `, [fileId]);
      
    } catch (error: any) {
      logger.warn('Failed to record download', {
        error: error.message,
        fileId
      });
    }
  }
  
  /**
   * Soft delete file record
   */
  async deleteFileRecord(fileId: string): Promise<boolean> {
    try {
      const result = await this.db.query(`
        UPDATE files 
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [fileId, FileStatus.DELETED]);
      
      if (result.rowCount > 0) {
        // Also remove entity links
        await this.db.query(`
          DELETE FROM file_entity_links WHERE file_id = $1
        `, [fileId]);
        
        logger.info('File record deleted', { fileId });
        return true;
      }
      
      return false;
      
    } catch (error: any) {
      logger.error('Failed to delete file record', {
        error: error.message,
        fileId
      });
      
      return false;
    }
  }
  
  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    averageQueryTime: number;
    p95QueryTime: number;
    totalQueries: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageQueryTime: 0,
        p95QueryTime: 0,
        totalQueries: 0
      };
    }
    
    const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
    const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    
    return {
      averageQueryTime: Math.round(average * 100) / 100,
      p95QueryTime: Math.round(p95 * 100) / 100,
      totalQueries: this.performanceMetrics.length
    };
  }
  
  private recordPerformance(time: number): void {
    this.performanceMetrics.push(time);
    
    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }
  }
}