-- Create Task Comments table
-- Support for task discussion and collaboration

CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    
    -- Comment metadata
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    edited_by UUID REFERENCES users(id),
    
    -- Threading support for future (optional)
    parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id),
    
    CONSTRAINT check_content_not_empty CHECK (LENGTH(TRIM(content)) > 0),
    CONSTRAINT check_not_self_edit CHECK (author_id != edited_by OR edited_by IS NULL)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_author_id ON task_comments(author_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_parent_id ON task_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;

-- Trigger to update updated_at timestamp
CREATE TRIGGER trigger_task_comments_updated_at
    BEFORE UPDATE ON task_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update task comments count
CREATE OR REPLACE FUNCTION update_task_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment comment count
        UPDATE tasks 
        SET comments_count = comments_count + 1,
            last_activity_at = NOW()
        WHERE id = NEW.task_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement comment count
        UPDATE tasks 
        SET comments_count = GREATEST(comments_count - 1, 0),
            last_activity_at = NOW()
        WHERE id = OLD.task_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Triggers to maintain comment count
CREATE TRIGGER trigger_task_comments_count_insert
    AFTER INSERT ON task_comments
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NULL)
    EXECUTE FUNCTION update_task_comments_count();

CREATE TRIGGER trigger_task_comments_count_delete
    AFTER UPDATE OF deleted_at ON task_comments
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION update_task_comments_count();

-- Trigger to handle comment editing metadata
CREATE OR REPLACE FUNCTION handle_comment_edit()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if content changed
    IF OLD.content != NEW.content THEN
        NEW.is_edited = true;
        NEW.edited_at = NOW();
        NEW.updated_at = NOW();
        
        -- Set edited_by to current user if available
        BEGIN
            NEW.edited_by = current_setting('app.current_user_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            -- If current_user_id is not set, leave edited_by as provided
            NULL;
        END;
        
        -- Update task activity
        UPDATE tasks 
        SET last_activity_at = NOW()
        WHERE id = NEW.task_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trigger_task_comments_edit_metadata
    BEFORE UPDATE OF content ON task_comments
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL)
    EXECUTE FUNCTION handle_comment_edit();

-- Function for soft delete
CREATE OR REPLACE FUNCTION soft_delete_comment()
RETURNS TRIGGER AS $$
BEGIN
    -- Soft delete instead of hard delete
    UPDATE task_comments 
    SET 
        deleted_at = NOW(),
        deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.author_id)
    WHERE id = OLD.id;
    
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for soft delete protection
CREATE TRIGGER trigger_task_comments_soft_delete
    BEFORE DELETE ON task_comments
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_comment();

-- View for active comments with author information
CREATE VIEW active_task_comments AS
SELECT 
    tc.id,
    tc.task_id,
    tc.author_id,
    u.name as author_name,
    u.email as author_email,
    tc.content,
    tc.is_edited,
    tc.edited_at,
    tc.edited_by,
    editor.name as edited_by_name,
    tc.parent_comment_id,
    tc.created_at,
    tc.updated_at
FROM task_comments tc
JOIN users u ON tc.author_id = u.id
LEFT JOIN users editor ON tc.edited_by = editor.id
WHERE tc.deleted_at IS NULL
ORDER BY tc.created_at DESC;

-- Comments on tables and functions
COMMENT ON TABLE task_comments IS 'Comments on tasks for discussion and collaboration';
COMMENT ON COLUMN task_comments.parent_comment_id IS 'For threading support in future versions';
COMMENT ON COLUMN task_comments.is_edited IS 'Flag to indicate if comment has been modified';
COMMENT ON FUNCTION update_task_comments_count() IS 'Maintains accurate comment count on tasks table';
COMMENT ON FUNCTION handle_comment_edit() IS 'Tracks comment edit metadata and updates task activity';
COMMENT ON VIEW active_task_comments IS 'Active comments with author information for easy querying';