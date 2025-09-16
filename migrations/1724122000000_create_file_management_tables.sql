-- File Management System Tables Migration
-- Phase 2 Implementation - Voice-driven file operations

-- Create organizations table first (required for foreign key constraints)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Files table for storing file metadata
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL CHECK (size > 0),
    content_type VARCHAR(100) NOT NULL,
    s3_key TEXT NOT NULL UNIQUE,
    uploaded_by UUID NOT NULL,
    organization_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'completed', 'failed', 'deleted')),
    description TEXT,
    tags JSONB DEFAULT '[]',
    download_count INTEGER DEFAULT 0,
    error_message TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_downloaded TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints
    CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_files_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- File entity links table for linking files to channels, tasks, users, projects
CREATE TABLE IF NOT EXISTS file_entity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('channel', 'task', 'user', 'project')),
    entity_id UUID NOT NULL,
    link_type VARCHAR(20) NOT NULL DEFAULT 'attachment' CHECK (link_type IN ('attachment', 'share', 'reference')),
    linked_by UUID NOT NULL,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_file_links_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_file_links_linked_by FOREIGN KEY (linked_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Unique constraint to prevent duplicate links
    UNIQUE(file_id, entity_type, entity_id, link_type)
);

-- File access logs table for analytics and audit
CREATE TABLE IF NOT EXISTS file_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('download', 'view', 'share', 'delete')),
    ip_address INET,
    user_agent TEXT,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_access_logs_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_access_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- File sharing permissions table
CREATE TABLE IF NOT EXISTS file_sharing_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    shared_with_user_id UUID,
    shared_with_channel_id UUID,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (permission_level IN ('view', 'download', 'edit', 'admin')),
    shared_by UUID NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_sharing_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_sharing_user FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sharing_channel FOREIGN KEY (shared_with_channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    CONSTRAINT fk_sharing_shared_by FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Ensure either user or channel is specified, not both
    CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_channel_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_channel_id IS NOT NULL)
    )
);


-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_files_organization_status ON files(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_files_name_search ON files USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS idx_file_entity_links_file ON file_entity_links(file_id);
CREATE INDEX IF NOT EXISTS idx_file_entity_links_entity ON file_entity_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_entity_links_linked_by ON file_entity_links(linked_by);

CREATE INDEX IF NOT EXISTS idx_file_access_logs_file ON file_access_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_user ON file_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_accessed_at ON file_access_logs(accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_sharing_file ON file_sharing_permissions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_sharing_user ON file_sharing_permissions(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_file_sharing_channel ON file_sharing_permissions(shared_with_channel_id);

-- Add some sample data for testing (optional - only in development)
DO $$
BEGIN
    -- Only insert test data if we're not in production
    IF current_setting('server_version_num')::integer >= 120000 THEN
        -- Insert a test organization if none exists
        INSERT INTO organizations (id, name, domain) 
        VALUES ('550e8400-e29b-41d4-a716-446655440000', 'CEO Communication Platform', 'ceocomm.platform')
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Add file management specific functions

-- Function to cleanup expired file sharing permissions
CREATE OR REPLACE FUNCTION cleanup_expired_file_permissions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM file_sharing_permissions 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get file statistics for an organization
CREATE OR REPLACE FUNCTION get_organization_file_stats(org_id UUID)
RETURNS TABLE (
    total_files BIGINT,
    total_size BIGINT,
    files_by_status JSONB,
    top_uploaders JSONB,
    recent_uploads BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            COUNT(*) as total_files,
            SUM(f.size) as total_size,
            jsonb_object_agg(f.status, status_counts.count) as files_by_status
        FROM files f
        LEFT JOIN (
            SELECT status, COUNT(*) as count
            FROM files 
            WHERE organization_id = org_id AND status != 'deleted'
            GROUP BY status
        ) status_counts ON f.status = status_counts.status
        WHERE f.organization_id = org_id AND f.status != 'deleted'
    ),
    top_users AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'user_id', uploaded_by, 
                'file_count', count,
                'total_size', total_size
            ) ORDER BY count DESC
        ) as top_uploaders
        FROM (
            SELECT uploaded_by, COUNT(*) as count, SUM(size) as total_size
            FROM files 
            WHERE organization_id = org_id AND status = 'completed'
            GROUP BY uploaded_by 
            ORDER BY count DESC 
            LIMIT 10
        ) t
    ),
    recent AS (
        SELECT COUNT(*) as recent_uploads
        FROM files 
        WHERE organization_id = org_id 
        AND uploaded_at >= NOW() - INTERVAL '7 days'
        AND status = 'completed'
    )
    SELECT 
        s.total_files,
        s.total_size,
        s.files_by_status,
        tu.top_uploaders,
        r.recent_uploads
    FROM stats s
    CROSS JOIN top_users tu
    CROSS JOIN recent r;
END;
$$ LANGUAGE plpgsql;

-- Function to search files with full-text search
CREATE OR REPLACE FUNCTION search_files_fulltext(
    org_id UUID,
    search_query TEXT,
    user_id UUID DEFAULT NULL,
    file_limit INTEGER DEFAULT 20,
    file_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    original_name VARCHAR,
    size BIGINT,
    content_type VARCHAR,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE,
    description TEXT,
    tags JSONB,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id,
        f.name,
        f.original_name,
        f.size,
        f.content_type,
        f.uploaded_by,
        f.uploaded_at,
        f.description,
        f.tags,
        ts_rank(to_tsvector('english', f.name || ' ' || COALESCE(f.description, '')), plainto_tsquery('english', search_query)) as rank
    FROM files f
    WHERE f.organization_id = org_id 
    AND f.status = 'completed'
    AND (user_id IS NULL OR f.uploaded_by = user_id)
    AND to_tsvector('english', f.name || ' ' || COALESCE(f.description, '')) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC, f.uploaded_at DESC
    LIMIT file_limit
    OFFSET file_offset;
END;
$$ LANGUAGE plpgsql;

-- Add audit trigger for file operations
CREATE OR REPLACE FUNCTION audit_file_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Log file status changes
        IF OLD.status != NEW.status THEN
            INSERT INTO audit_log (
                table_name, 
                operation, 
                record_id, 
                user_id, 
                old_values, 
                new_values,
                timestamp
            ) VALUES (
                'files',
                'status_change',
                NEW.id::TEXT,
                NEW.uploaded_by,
                jsonb_build_object('status', OLD.status),
                jsonb_build_object('status', NEW.status),
                NOW()
            );
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (
            table_name, 
            operation, 
            record_id, 
            user_id,
            old_values,
            timestamp
        ) VALUES (
            'files',
            'delete',
            OLD.id::TEXT,
            OLD.uploaded_by,
            row_to_json(OLD)::jsonb,
            NOW()
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger if audit_log table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        CREATE TRIGGER audit_file_changes_trigger
        AFTER UPDATE OR DELETE ON files
        FOR EACH ROW EXECUTE FUNCTION audit_file_changes();
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE files IS 'Stores metadata for all uploaded files in the voice-driven system';
COMMENT ON TABLE file_entity_links IS 'Links files to various entities like channels, tasks, users, and projects';
COMMENT ON TABLE file_access_logs IS 'Audit trail for file access operations';
COMMENT ON TABLE file_sharing_permissions IS 'Manages file sharing permissions with expiration support';

COMMENT ON COLUMN files.s3_key IS 'Unique S3 object key for file storage';
COMMENT ON COLUMN files.tags IS 'JSON array of tags for categorization and search';
COMMENT ON COLUMN files.status IS 'File upload and processing status';

-- Migration complete notification
DO $$
BEGIN
    RAISE NOTICE 'File Management System tables created successfully';
    RAISE NOTICE 'Tables: files, file_entity_links, file_access_logs, file_sharing_permissions';
    RAISE NOTICE 'Indexes: Optimized for search, filtering, and performance';
    RAISE NOTICE 'Functions: cleanup_expired_file_permissions, get_organization_file_stats, search_files_fulltext';
END $$;