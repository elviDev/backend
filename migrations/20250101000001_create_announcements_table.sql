-- Create announcements table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE announcements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error', 'feature', 'maintenance')),
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    target_audience VARCHAR(20) NOT NULL CHECK (target_audience IN ('all', 'admins', 'developers', 'designers', 'managers')),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    action_button_text VARCHAR(50),
    action_button_url TEXT,
    image_url TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published BOOLEAN DEFAULT false,
    read_by JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Create indexes for better query performance
CREATE INDEX idx_announcements_created_by ON announcements(created_by);
CREATE INDEX idx_announcements_type ON announcements(type);
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcements_target_audience ON announcements(target_audience);
CREATE INDEX idx_announcements_published ON announcements(published);
CREATE INDEX idx_announcements_scheduled_for ON announcements(scheduled_for);
CREATE INDEX idx_announcements_expires_at ON announcements(expires_at);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);
CREATE INDEX idx_announcements_deleted_at ON announcements(deleted_at);

-- Create a composite index for user-specific queries
CREATE INDEX idx_announcements_user_relevant ON announcements(published, target_audience, expires_at, scheduled_for) 
WHERE deleted_at IS NULL;

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_announcements_updated_at();

-- Add comments for documentation
COMMENT ON TABLE announcements IS 'System-wide announcements that can be targeted to specific user roles';
COMMENT ON COLUMN announcements.id IS 'Unique identifier for the announcement';
COMMENT ON COLUMN announcements.title IS 'Title of the announcement (max 200 chars)';
COMMENT ON COLUMN announcements.content IS 'Full content/message of the announcement';
COMMENT ON COLUMN announcements.type IS 'Type of announcement: info, warning, success, error, feature, maintenance';
COMMENT ON COLUMN announcements.priority IS 'Priority level: low, medium, high, critical';
COMMENT ON COLUMN announcements.target_audience IS 'Who should see this announcement: all, admins, developers, designers, managers';
COMMENT ON COLUMN announcements.scheduled_for IS 'When the announcement should become visible (NULL = immediate)';
COMMENT ON COLUMN announcements.expires_at IS 'When the announcement should stop being visible (NULL = never expires)';
COMMENT ON COLUMN announcements.action_button_text IS 'Optional action button text';
COMMENT ON COLUMN announcements.action_button_url IS 'Optional action button URL';
COMMENT ON COLUMN announcements.image_url IS 'Optional image URL for the announcement';
COMMENT ON COLUMN announcements.created_by IS 'User ID who created the announcement (typically CEO)';
COMMENT ON COLUMN announcements.published IS 'Whether the announcement is published and visible';
COMMENT ON COLUMN announcements.read_by IS 'JSON array of user IDs who have read this announcement';
COMMENT ON COLUMN announcements.version IS 'Version number for optimistic locking';
COMMENT ON COLUMN announcements.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN announcements.deleted_by IS 'User ID who deleted the announcement';