-- Create Channels table - Core collaboration entity
-- Advanced channel system with real-time collaboration features

CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Organization and categorization
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    
    -- Channel type and behavior
    channel_type VARCHAR(50) DEFAULT 'project' CHECK (channel_type IN ('project', 'department', 'initiative', 'temporary', 'emergency', 'announcement')),
    privacy_level VARCHAR(20) DEFAULT 'public' CHECK (privacy_level IN ('public', 'private', 'restricted')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'paused', 'completed')),
    
    -- Access control and permissions
    created_by UUID NOT NULL REFERENCES users(id),
    owned_by UUID NOT NULL REFERENCES users(id), -- Can be transferred
    moderators UUID[] DEFAULT '{}', -- Array of user IDs who can moderate
    
    -- Member management
    members UUID[] DEFAULT '{}', -- Array of user IDs
    member_count INTEGER DEFAULT 0,
    max_members INTEGER DEFAULT 100,
    auto_join_roles TEXT[] DEFAULT '{}', -- Roles that auto-join this channel
    
    -- Channel behavior settings
    settings JSONB DEFAULT '{
        "allow_voice_commands": true,
        "voice_command_roles": ["ceo", "manager"],
        "allow_file_uploads": true,
        "allow_external_sharing": false,
        "message_retention_days": 90,
        "require_approval_for_join": false,
        "notification_level": "all",
        "read_receipts_enabled": true,
        "typing_indicators_enabled": true,
        "thread_replies_enabled": true,
        "message_reactions_enabled": true,
        "voice_transcription_enabled": true
    }',
    
    -- Integration settings (for Phase 2-4)
    integrations JSONB DEFAULT '{
        "calendar_integration": false,
        "email_forwarding": false,
        "webhook_urls": [],
        "ai_assistant_enabled": true,
        "auto_summary_enabled": false,
        "task_creation_enabled": true
    }',
    
    -- Analytics and activity tracking
    activity_stats JSONB DEFAULT '{
        "total_messages": 0,
        "total_files": 0,
        "total_tasks": 0,
        "last_activity": null,
        "most_active_user": null,
        "average_response_time": null,
        "peak_activity_hours": []
    }',
    
    -- Project management features
    project_info JSONB DEFAULT '{
        "start_date": null,
        "end_date": null,
        "budget": null,
        "priority": "medium",
        "tags": [],
        "milestones": [],
        "deliverables": [],
        "stakeholders": []
    }',
    
    -- Schedule and time management
    schedule JSONB DEFAULT '{
        "timezone": "UTC",
        "working_hours": {
            "monday": {"start": "09:00", "end": "17:00"},
            "tuesday": {"start": "09:00", "end": "17:00"},
            "wednesday": {"start": "09:00", "end": "17:00"},
            "thursday": {"start": "09:00", "end": "17:00"},
            "friday": {"start": "09:00", "end": "17:00"},
            "saturday": null,
            "sunday": null
        },
        "meeting_schedule": [],
        "deadline_reminders": true
    }',
    
    -- Archival and retention
    archived_at TIMESTAMP WITH TIME ZONE,
    archived_by UUID REFERENCES users(id),
    archive_reason TEXT,
    retention_until TIMESTAMP WITH TIME ZONE, -- Auto-delete date
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_category_id ON channels(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(channel_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_privacy ON channels(privacy_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON channels(created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_owned_by ON channels(owned_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_last_activity ON channels(last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels(created_at DESC);

-- Member-based queries (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_channels_members ON channels USING gin(members) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_moderators ON channels USING gin(moderators) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_auto_join_roles ON channels USING gin(auto_join_roles) WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_channels_search ON channels USING gin(to_tsvector('english', name || ' ' || COALESCE(description, ''))) WHERE deleted_at IS NULL;

-- JSONB indexes for settings and metadata
CREATE INDEX IF NOT EXISTS idx_channels_settings ON channels USING gin(settings) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_project_info ON channels USING gin(project_info) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_integrations ON channels USING gin(integrations) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_channels_category_status ON channels(category_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_type_privacy ON channels(channel_type, privacy_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channels_active_recent ON channels(last_activity_at DESC) WHERE status = 'active' AND deleted_at IS NULL;

-- Unique constraint for channel names within category (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_unique_name_per_category 
ON channels(LOWER(name), category_id) 
WHERE deleted_at IS NULL;

-- Constraint: owner must be a member
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE c.conname = 'check_owner_is_member' 
        AND t.relname = 'channels'
    ) THEN
        ALTER TABLE channels ADD CONSTRAINT check_owner_is_member 
            CHECK (owned_by = ANY(members) OR array_length(members, 1) IS NULL);
    END IF;
END $$;

-- Constraint: member count should match array length
CREATE OR REPLACE FUNCTION validate_member_count()
RETURNS TRIGGER AS $$
BEGIN
    NEW.member_count := array_length(NEW.members, 1);
    IF NEW.member_count IS NULL THEN
        NEW.member_count := 0;
    END IF;
    
    -- Check max members limit
    IF NEW.member_count > NEW.max_members THEN
        RAISE EXCEPTION 'Channel member count (%) exceeds maximum allowed (%)', NEW.member_count, NEW.max_members;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to validate and update member count
DROP TRIGGER IF EXISTS trigger_channels_validate_members ON channels;
CREATE TRIGGER trigger_channels_validate_members
    BEFORE INSERT OR UPDATE OF members ON channels
    FOR EACH ROW
    EXECUTE FUNCTION validate_member_count();

-- Trigger to update updated_at and version
DROP TRIGGER IF EXISTS trigger_channels_updated_at ON channels;
CREATE TRIGGER trigger_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update channel activity
CREATE OR REPLACE FUNCTION update_channel_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE channels 
    SET last_activity_at = NOW()
    WHERE id = NEW.channel_id;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Function to add member to channel
CREATE OR REPLACE FUNCTION add_channel_member(
    channel_id UUID,
    user_id UUID,
    added_by UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_members UUID[];
    max_allowed INTEGER;
    current_count INTEGER;
BEGIN
    -- Get current members and limits
    SELECT members, max_members INTO current_members, max_allowed
    FROM channels 
    WHERE id = channel_id AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Channel not found';
    END IF;
    
    -- Check if user is already a member
    IF user_id = ANY(current_members) THEN
        RETURN FALSE; -- Already a member
    END IF;
    
    -- Check member limit
    current_count := array_length(current_members, 1);
    IF current_count IS NULL THEN
        current_count := 0;
    END IF;
    
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Channel has reached maximum member limit';
    END IF;
    
    -- Add member
    UPDATE channels 
    SET 
        members = array_append(members, user_id),
        member_count = current_count + 1,
        last_activity_at = NOW()
    WHERE id = channel_id;
    
    -- Log the addition (could be extended to an audit table)
    INSERT INTO channel_member_history (channel_id, user_id, action, performed_by, performed_at)
    VALUES (channel_id, user_id, 'added', COALESCE(added_by, user_id), NOW())
    ON CONFLICT DO NOTHING; -- In case the table doesn't exist yet
    
    RETURN TRUE;
END;
$$ LANGUAGE 'plpgsql';

-- Function to remove member from channel
CREATE OR REPLACE FUNCTION remove_channel_member(
    channel_id UUID,
    user_id UUID,
    removed_by UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_members UUID[];
BEGIN
    -- Get current members
    SELECT members INTO current_members
    FROM channels 
    WHERE id = channel_id AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Channel not found';
    END IF;
    
    -- Check if user is a member
    IF NOT (user_id = ANY(current_members)) THEN
        RETURN FALSE; -- Not a member
    END IF;
    
    -- Remove member
    UPDATE channels 
    SET 
        members = array_remove(members, user_id),
        member_count = array_length(array_remove(members, user_id), 1),
        moderators = array_remove(moderators, user_id), -- Remove from moderators too
        last_activity_at = NOW()
    WHERE id = channel_id;
    
    -- Handle member count null case
    UPDATE channels 
    SET member_count = 0 
    WHERE id = channel_id AND member_count IS NULL;
    
    -- Log the removal
    INSERT INTO channel_member_history (channel_id, user_id, action, performed_by, performed_at)
    VALUES (channel_id, user_id, 'removed', COALESCE(removed_by, user_id), NOW())
    ON CONFLICT DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE 'plpgsql';

-- Function to check if user can access channel
CREATE OR REPLACE FUNCTION can_user_access_channel(
    channel_id UUID,
    user_id UUID,
    user_role TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    channel_privacy VARCHAR(20);
    channel_members UUID[];
    auto_join_roles TEXT[];
    channel_status VARCHAR(20);
BEGIN
    SELECT privacy_level, members, auto_join_roles, status 
    INTO channel_privacy, channel_members, auto_join_roles, channel_status
    FROM channels 
    WHERE id = channel_id AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Archived channels are read-only for members
    IF channel_status = 'archived' THEN
        RETURN user_id = ANY(channel_members);
    END IF;
    
    -- CEO can access everything
    IF user_role = 'ceo' THEN
        RETURN TRUE;
    END IF;
    
    -- Public channels are accessible to all
    IF channel_privacy = 'public' THEN
        RETURN TRUE;
    END IF;
    
    -- Private channels require membership
    IF channel_privacy = 'private' THEN
        RETURN user_id = ANY(channel_members);
    END IF;
    
    -- Restricted channels check auto-join roles or membership
    IF channel_privacy = 'restricted' THEN
        RETURN user_role = ANY(auto_join_roles) OR user_id = ANY(channel_members);
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE 'plpgsql';

-- Soft delete function
CREATE OR REPLACE FUNCTION soft_delete_channel()
RETURNS TRIGGER AS $$
BEGIN
    -- Archive the channel instead of deleting if it has significant activity
    UPDATE channels 
    SET 
        deleted_at = NOW(), 
        deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.owned_by),
        status = 'archived',
        archived_at = NOW(),
        archived_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.owned_by),
        archive_reason = 'Channel deleted'
    WHERE id = OLD.id;
    
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for soft delete protection
DROP TRIGGER IF EXISTS trigger_channels_soft_delete ON channels;
CREATE TRIGGER trigger_channels_soft_delete
    BEFORE DELETE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_channel();

-- Create channel member history table for audit trail
CREATE TABLE IF NOT EXISTS channel_member_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('added', 'removed', 'promoted', 'demoted')),
    performed_by UUID NOT NULL REFERENCES users(id),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_channel_member_history_channel ON channel_member_history(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_member_history_user ON channel_member_history(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_member_history_performed_at ON channel_member_history(performed_at DESC);

-- Utility views
CREATE OR REPLACE VIEW active_channels AS
SELECT 
    c.id,
    c.name,
    c.description,
    c.category_id,
    cat.name as category_name,
    c.channel_type,
    c.privacy_level,
    c.status,
    c.owned_by,
    owner.name as owner_name,
    c.member_count,
    c.max_members,
    c.settings,
    c.project_info,
    c.last_activity_at,
    c.created_at,
    c.updated_at
FROM channels c
LEFT JOIN categories cat ON c.category_id = cat.id
LEFT JOIN users owner ON c.owned_by = owner.id
WHERE c.deleted_at IS NULL;

-- Channel with member details view
CREATE OR REPLACE VIEW channels_with_members AS
SELECT 
    c.id,
    c.name,
    c.description,
    c.category_id,
    c.channel_type,
    c.privacy_level,
    c.status,
    c.member_count,
    ARRAY(
        SELECT json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role,
            'avatar_url', u.avatar_url
        )
        FROM users u 
        WHERE u.id = ANY(c.members) 
        AND u.deleted_at IS NULL
    ) as member_details,
    c.last_activity_at,
    c.created_at
FROM channels c
WHERE c.deleted_at IS NULL;

COMMENT ON TABLE channels IS 'Core collaboration channels with advanced real-time features';
COMMENT ON COLUMN channels.members IS 'Array of user IDs who are members of this channel';
COMMENT ON COLUMN channels.settings IS 'JSONB configuration for channel behavior and features';
COMMENT ON COLUMN channels.integrations IS 'JSONB configuration for external integrations';
COMMENT ON COLUMN channels.activity_stats IS 'JSONB tracking channel activity and analytics';
COMMENT ON FUNCTION add_channel_member(UUID, UUID, UUID) IS 'Add a user to a channel with validation';
COMMENT ON FUNCTION remove_channel_member(UUID, UUID, UUID) IS 'Remove a user from a channel';
COMMENT ON FUNCTION can_user_access_channel(UUID, UUID, TEXT) IS 'Check if user has access to channel based on privacy and role';
COMMENT ON VIEW active_channels IS 'Active channels with category and owner information';
COMMENT ON VIEW channels_with_members IS 'Channels with detailed member information for UI';