-- Create Activities table for activity feed and notifications
-- Foundation for user activity tracking and notifications

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References to related entities
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Activity classification
    activity_type VARCHAR(30) NOT NULL CHECK (activity_type IN (
        'message', 'task_created', 'task_updated', 'task_completed', 'task_assigned',
        'member_joined', 'member_left', 'file_uploaded', 'channel_updated', 
        'channel_created', 'reaction_added', 'mention', 'voice_command', 'ai_response'
    )),
    
    -- Activity content
    title VARCHAR(300) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Read tracking
    read_by UUID[] DEFAULT '{}', -- Array of user IDs who have read this activity
    
    -- Priority and categorization
    priority VARCHAR(10) DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
    category VARCHAR(10) DEFAULT 'system' CHECK (category IN ('task', 'channel', 'system', 'social')),
    
    -- Entity references (polymorphic)
    referenced_entity_id UUID,
    referenced_entity_type VARCHAR(20) CHECK (referenced_entity_type IN ('task', 'message', 'channel', 'user', 'file')),
    
    -- Compatibility fields for API routes
    type VARCHAR(30) GENERATED ALWAYS AS (activity_type) STORED,
    related_id UUID GENERATED ALWAYS AS (referenced_entity_id) STORED,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes for activities
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_channel_id ON activities(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_task_id ON activities(task_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_priority ON activities(priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_user_channel ON activities(user_id, channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_type_channel ON activities(activity_type, channel_id, created_at DESC) WHERE deleted_at IS NULL;

-- Index for read tracking queries
CREATE INDEX IF NOT EXISTS idx_activities_read_by ON activities USING gin(read_by) WHERE deleted_at IS NULL;

-- Update trigger for activities (drop if exists first)
DROP TRIGGER IF EXISTS trigger_activities_updated_at ON activities;
CREATE TRIGGER trigger_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Soft delete trigger for activities (drop if exists first)
DROP TRIGGER IF EXISTS trigger_activities_soft_delete ON activities;
CREATE TRIGGER trigger_activities_soft_delete
    BEFORE DELETE ON activities
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_generic();

COMMENT ON TABLE activities IS 'Activity feed and notifications for user actions';
COMMENT ON COLUMN activities.activity_type IS 'Type of activity that occurred';
COMMENT ON COLUMN activities.read_by IS 'Array of user IDs who have read this activity';
COMMENT ON COLUMN activities.metadata IS 'Additional activity-specific data';
COMMENT ON COLUMN activities.priority IS 'Activity priority for notification purposes';
COMMENT ON COLUMN activities.category IS 'Activity category for filtering and organization';