-- Create Voice Commands, Task Dependencies, and Relationship tables
-- Foundation for Phase 2 voice processing and Phase 3 complex relationships

-- Voice Commands table (Phase 2 preparation)
CREATE TABLE IF NOT EXISTS voice_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Command source
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Voice processing pipeline
    transcript TEXT NOT NULL,
    processed_transcript TEXT, -- Cleaned and corrected transcript
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    language_detected VARCHAR(10) DEFAULT 'en-US',
    
    -- AI processing results
    intent_analysis JSONB DEFAULT '{}', -- AI-analyzed intent and entities
    actions_planned JSONB DEFAULT '[]', -- Array of planned actions
    actions_executed JSONB DEFAULT '[]', -- Array of executed actions with results
    
    -- Execution tracking
    execution_status VARCHAR(20) DEFAULT 'pending' CHECK (execution_status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    processing_time_ms INTEGER,
    
    -- Context and environment
    context JSONB DEFAULT '{}', -- Command context (current channel, active tasks, etc.)
    device_info JSONB DEFAULT '{}', -- Device and environment information
    
    -- Audio metadata
    audio_file_url VARCHAR(500), -- URL to stored audio file
    audio_duration_ms INTEGER,
    audio_quality_score DECIMAL(3,2),
    
    -- Error handling and debugging
    error_details JSONB DEFAULT NULL,
    debug_info JSONB DEFAULT '{}',
    retry_count INTEGER DEFAULT 0,
    
    -- Performance and analytics
    user_satisfaction_score INTEGER CHECK (user_satisfaction_score BETWEEN 1 AND 5),
    correction_applied BOOLEAN DEFAULT false,
    correction_text TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes for voice commands
CREATE INDEX IF NOT EXISTS idx_voice_commands_user_id ON voice_commands(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_commands_status ON voice_commands(execution_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_commands_language ON voice_commands(language_detected) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_commands_processing_time ON voice_commands(processing_time_ms) WHERE processing_time_ms IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_commands_confidence ON voice_commands(confidence_score DESC) WHERE deleted_at IS NULL;

-- Full-text search on transcripts (removed due to IMMUTABLE requirement)
-- CREATE INDEX IF NOT EXISTS idx_voice_commands_transcript ON voice_commands USING gin(to_tsvector('english', transcript || ' ' || COALESCE(processed_transcript, ''))) WHERE deleted_at IS NULL;

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_voice_commands_satisfaction ON voice_commands(user_satisfaction_score) WHERE user_satisfaction_score IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_commands_failed ON voice_commands(execution_status, error_details) WHERE execution_status = 'failed' AND deleted_at IS NULL;

-- Task Dependencies table (Phase 3 preparation)
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Dependency relationship
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Dependency type and strength
    dependency_type VARCHAR(20) NOT NULL CHECK (dependency_type IN ('blocks', 'requires', 'follows', 'parallel', 'optional')),
    dependency_strength VARCHAR(20) DEFAULT 'strong' CHECK (dependency_strength IN ('weak', 'medium', 'strong', 'critical')),
    
    -- Scheduling impact
    lag_time_hours INTEGER DEFAULT 0, -- Time delay between tasks
    lead_time_hours INTEGER DEFAULT 0, -- Time buffer before dependent task
    
    -- Dependency metadata
    description TEXT,
    business_reason TEXT, -- Why this dependency exists
    
    -- Voice creation tracking (Phase 2)
    voice_created BOOLEAN DEFAULT false,
    voice_command_id UUID REFERENCES voice_commands(id),
    
    -- AI suggestions (Phase 4)
    ai_suggested BOOLEAN DEFAULT false,
    ai_confidence DECIMAL(3,2),
    
    -- Status and validation
    is_active BOOLEAN DEFAULT true,
    validation_status VARCHAR(20) DEFAULT 'valid' CHECK (validation_status IN ('valid', 'invalid', 'warning', 'needs_review')),
    validation_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Unique constraint to prevent duplicate dependencies
    UNIQUE(task_id, depends_on_task_id)
);

-- Performance indexes for task dependencies
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_dependencies_type ON task_dependencies(dependency_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_dependencies_active ON task_dependencies(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_dependencies_voice ON task_dependencies(voice_created) WHERE voice_created = true AND deleted_at IS NULL;

-- Composite index for dependency resolution
CREATE INDEX IF NOT EXISTS idx_task_dependencies_resolution ON task_dependencies(depends_on_task_id, dependency_type, is_active) WHERE deleted_at IS NULL;

-- Channel Relationships table (Phase 3 preparation)
CREATE TABLE IF NOT EXISTS channel_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationship definition
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    related_channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    
    -- Relationship type
    relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN ('parent_child', 'collaborative', 'sequential', 'competitive', 'shared_resource', 'mirror')),
    
    -- Relationship properties
    relationship_strength VARCHAR(20) DEFAULT 'medium' CHECK (relationship_strength IN ('weak', 'medium', 'strong')),
    is_bidirectional BOOLEAN DEFAULT true,
    
    -- Data sharing and permissions
    share_members BOOLEAN DEFAULT false,
    share_tasks BOOLEAN DEFAULT false,
    share_files BOOLEAN DEFAULT false,
    permission_inheritance VARCHAR(20) DEFAULT 'none' CHECK (permission_inheritance IN ('none', 'read', 'write', 'admin')),
    
    -- Automation rules
    sync_settings JSONB DEFAULT '{}',
    auto_actions JSONB DEFAULT '[]',
    
    -- Voice creation tracking
    voice_created BOOLEAN DEFAULT false,
    voice_command_id UUID REFERENCES voice_commands(id),
    
    -- Status and metadata
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Prevent self-reference and duplicate relationships
    CHECK (channel_id != related_channel_id),
    UNIQUE(channel_id, related_channel_id, relationship_type)
);

-- Performance indexes for channel relationships
CREATE INDEX IF NOT EXISTS idx_channel_relationships_channel ON channel_relationships(channel_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_relationships_related ON channel_relationships(related_channel_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_relationships_type ON channel_relationships(relationship_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_relationships_active ON channel_relationships(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_relationships_bidirectional ON channel_relationships(is_bidirectional) WHERE is_bidirectional = true AND deleted_at IS NULL;

-- Shared Resources table (Phase 1 foundation, expanded in later phases)
CREATE TABLE IF NOT EXISTS shared_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Resource identification
    name VARCHAR(300) NOT NULL,
    description TEXT,
    
    -- Resource type and content
    resource_type VARCHAR(30) NOT NULL CHECK (resource_type IN ('document', 'link', 'image', 'video', 'template', 'dataset', 'code', 'other')),
    mime_type VARCHAR(100),
    file_size BIGINT,
    
    -- Content storage
    content_url VARCHAR(500), -- URL to stored content (S3, etc.)
    content_data JSONB DEFAULT NULL, -- Inline content for small resources
    preview_url VARCHAR(500), -- Preview/thumbnail URL
    
    -- Access control
    visibility VARCHAR(20) DEFAULT 'channel' CHECK (visibility IN ('private', 'channel', 'organization', 'public')),
    access_permissions JSONB DEFAULT '{"read": true, "write": false, "delete": false}',
    
    -- Version control
    version_number VARCHAR(20) DEFAULT '1.0',
    parent_resource_id UUID,
    is_latest_version BOOLEAN DEFAULT true,
    
    -- Usage tracking
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    
    -- AI and automation features (Phase 4)
    ai_tags VARCHAR(50)[] DEFAULT '{}',
    ai_summary TEXT,
    search_keywords VARCHAR(100)[] DEFAULT '{}',
    
    -- Integration and metadata
    external_id VARCHAR(100), -- ID in external system
    source_system VARCHAR(50), -- Where it came from
    metadata JSONB DEFAULT '{}',
    tags VARCHAR(50)[] DEFAULT '{}',
    
    -- Voice integration
    voice_uploaded BOOLEAN DEFAULT false,
    voice_command_id UUID REFERENCES voice_commands(id),
    
    -- Audit fields
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes for shared resources
CREATE INDEX IF NOT EXISTS idx_shared_resources_name ON shared_resources(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_type ON shared_resources(resource_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_uploaded_by ON shared_resources(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_visibility ON shared_resources(visibility) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_latest ON shared_resources(is_latest_version) WHERE is_latest_version = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_parent ON shared_resources(parent_resource_id) WHERE parent_resource_id IS NOT NULL AND deleted_at IS NULL;

-- Full-text search (removed due to IMMUTABLE requirement)
-- CREATE INDEX IF NOT EXISTS idx_shared_resources_search ON shared_resources USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || array_to_string(tags, ' '))) WHERE deleted_at IS NULL;

-- Tags and AI features
CREATE INDEX IF NOT EXISTS idx_shared_resources_tags ON shared_resources USING gin(tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_resources_ai_tags ON shared_resources USING gin(ai_tags) WHERE deleted_at IS NULL;

-- Resource Links table (connects resources to entities)
CREATE TABLE IF NOT EXISTS resource_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link definition
    resource_id UUID NOT NULL REFERENCES shared_resources(id) ON DELETE CASCADE,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('channel', 'task', 'message', 'user', 'category')),
    entity_id UUID NOT NULL, -- Polymorphic reference
    
    -- Link properties
    link_type VARCHAR(30) DEFAULT 'attachment' CHECK (link_type IN ('attachment', 'reference', 'template', 'requirement', 'example', 'background')),
    is_required BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    
    -- Access and permissions
    inherited_permissions BOOLEAN DEFAULT true,
    custom_permissions JSONB DEFAULT NULL,
    
    -- Metadata and context
    link_context TEXT, -- Why this resource is linked
    metadata JSONB DEFAULT '{}',
    
    -- Voice creation tracking
    voice_created BOOLEAN DEFAULT false,
    voice_command_id UUID REFERENCES voice_commands(id),
    
    -- Audit fields
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    -- Unique constraint to prevent duplicate links
    UNIQUE(resource_id, entity_type, entity_id)
);

-- Performance indexes for resource links
CREATE INDEX IF NOT EXISTS idx_resource_links_resource ON resource_links(resource_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resource_links_entity ON resource_links(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resource_links_type ON resource_links(link_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resource_links_required ON resource_links(is_required) WHERE is_required = true AND deleted_at IS NULL;

-- Update triggers for all new tables
CREATE TRIGGER trigger_voice_commands_updated_at
    BEFORE UPDATE ON voice_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_task_dependencies_updated_at
    BEFORE UPDATE ON task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_channel_relationships_updated_at
    BEFORE UPDATE ON channel_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_shared_resources_updated_at
    BEFORE UPDATE ON shared_resources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_resource_links_updated_at
    BEFORE UPDATE ON resource_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Functions for dependency management
CREATE OR REPLACE FUNCTION check_circular_dependency(
    new_task_id UUID,
    new_depends_on_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    current_task UUID := new_depends_on_id;
    visited_tasks UUID[] := ARRAY[]::UUID[];
    depth INTEGER := 0;
    max_depth INTEGER := 20;
BEGIN
    -- Traverse dependency chain to detect cycles
    WHILE current_task IS NOT NULL AND depth < max_depth LOOP
        -- Check if we've seen this task before (cycle detected)
        IF current_task = ANY(visited_tasks) OR current_task = new_task_id THEN
            RETURN true; -- Circular dependency detected
        END IF;
        
        -- Add current task to visited list
        visited_tasks := array_append(visited_tasks, current_task);
        
        -- Get next task in dependency chain
        SELECT depends_on_task_id INTO current_task
        FROM task_dependencies
        WHERE task_id = current_task 
        AND is_active = true 
        AND deleted_at IS NULL
        LIMIT 1;
        
        depth := depth + 1;
    END LOOP;
    
    RETURN false; -- No circular dependency
END;
$$ LANGUAGE 'plpgsql';

-- Function to validate task dependency before insert/update
CREATE OR REPLACE FUNCTION validate_task_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent circular dependencies
    IF check_circular_dependency(NEW.task_id, NEW.depends_on_task_id) THEN
        RAISE EXCEPTION 'Circular dependency detected between tasks % and %', NEW.task_id, NEW.depends_on_task_id;
    END IF;
    
    -- Prevent self-dependency
    IF NEW.task_id = NEW.depends_on_task_id THEN
        RAISE EXCEPTION 'Task cannot depend on itself';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to validate dependencies
CREATE TRIGGER trigger_validate_task_dependency
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_dependency();

-- Soft delete functions
CREATE OR REPLACE FUNCTION soft_delete_voice_command()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE voice_commands 
    SET deleted_at = NOW(), deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.user_id)
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Additional soft delete functions for other tables...
CREATE OR REPLACE FUNCTION soft_delete_generic()
RETURNS TRIGGER AS $$
DECLARE
    user_id_field UUID;
BEGIN
    -- Try to find a user ID field for audit trail
    user_id_field := COALESCE(
        OLD.created_by, 
        OLD.user_id, 
        OLD.uploaded_by,
        current_setting('app.current_user_id', true)::UUID
    );
    
    EXECUTE format('UPDATE %I SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', TG_TABLE_NAME) 
    USING user_id_field, OLD.id;
    
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Apply soft delete triggers
CREATE TRIGGER trigger_voice_commands_soft_delete
    BEFORE DELETE ON voice_commands
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_voice_command();

CREATE TRIGGER trigger_task_dependencies_soft_delete
    BEFORE DELETE ON task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_generic();

CREATE TRIGGER trigger_channel_relationships_soft_delete
    BEFORE DELETE ON channel_relationships
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_generic();

CREATE TRIGGER trigger_shared_resources_soft_delete
    BEFORE DELETE ON shared_resources
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_generic();

CREATE TRIGGER trigger_resource_links_soft_delete
    BEFORE DELETE ON resource_links
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_generic();

-- Utility views
CREATE VIEW voice_command_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_commands,
    COUNT(*) FILTER (WHERE execution_status = 'completed') as successful_commands,
    COUNT(*) FILTER (WHERE execution_status = 'failed') as failed_commands,
    AVG(processing_time_ms) as avg_processing_time,
    AVG(confidence_score) as avg_confidence,
    COUNT(DISTINCT user_id) as unique_users
FROM voice_commands
WHERE deleted_at IS NULL
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

CREATE VIEW task_dependency_graph AS
SELECT 
    td.task_id,
    t.title as task_title,
    td.depends_on_task_id,
    dt.title as depends_on_title,
    td.dependency_type,
    td.dependency_strength,
    td.is_active,
    c.name as channel_name
FROM task_dependencies td
JOIN tasks t ON td.task_id = t.id
JOIN tasks dt ON td.depends_on_task_id = dt.id
LEFT JOIN channels c ON t.channel_id = c.id
WHERE td.deleted_at IS NULL
AND td.is_active = true
AND t.deleted_at IS NULL
AND dt.deleted_at IS NULL;

COMMENT ON TABLE voice_commands IS 'Voice command processing pipeline with AI integration';
COMMENT ON TABLE task_dependencies IS 'Task dependency management with circular reference prevention';
COMMENT ON TABLE channel_relationships IS 'Complex channel relationships for organizational structure';
-- Add self-referencing foreign key constraint for shared_resources after table creation
ALTER TABLE shared_resources ADD CONSTRAINT fk_shared_resources_parent_resource_id 
    FOREIGN KEY (parent_resource_id) REFERENCES shared_resources(id);

COMMENT ON TABLE shared_resources IS 'Shared resource management with version control';
COMMENT ON TABLE resource_links IS 'Polymorphic links between resources and entities';
COMMENT ON FUNCTION check_circular_dependency(UUID, UUID) IS 'Detect circular dependencies in task relationships';
COMMENT ON VIEW voice_command_analytics IS 'Analytics for voice command performance and usage';
COMMENT ON VIEW task_dependency_graph IS 'Visual representation of task dependencies';