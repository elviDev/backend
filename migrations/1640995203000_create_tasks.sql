-- Create Tasks table - Advanced task management with dependencies
-- Core entity for work assignment and tracking

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    
    -- Task organization
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    parent_task_id UUID, -- For subtasks
    
    -- Assignment and ownership
    created_by UUID NOT NULL REFERENCES users(id),
    assigned_to UUID[] DEFAULT '{}', -- Array of user IDs for multi-assignment
    owned_by UUID REFERENCES users(id), -- Primary assignee/owner
    
    -- Task classification
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'completed', 'cancelled', 'on_hold')),
    task_type VARCHAR(50) DEFAULT 'general' CHECK (task_type IN ('general', 'project', 'maintenance', 'emergency', 'research', 'approval')),
    
    -- Complexity and estimation
    complexity INTEGER DEFAULT 1 CHECK (complexity BETWEEN 1 AND 10),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2) DEFAULT 0,
    story_points INTEGER,
    
    -- Time management
    due_date TIMESTAMP WITH TIME ZONE,
    start_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Progress tracking
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    
    -- Task metadata and customization
    tags VARCHAR(50)[] DEFAULT '{}',
    labels JSONB DEFAULT '{}', -- Flexible key-value labels
    custom_fields JSONB DEFAULT '{}', -- Organization-specific fields
    
    -- Voice command integration (Phase 2)
    voice_created BOOLEAN DEFAULT false,
    voice_command_id UUID, -- Reference to voice command that created this task
    voice_instructions TEXT, -- Original voice instruction for context
    
    -- AI and automation features (Phase 3-4)
    ai_generated BOOLEAN DEFAULT false,
    ai_suggestions JSONB DEFAULT '{}', -- AI suggestions for optimization
    automation_rules JSONB DEFAULT '{}', -- Automated actions and triggers
    
    -- Collaboration features
    watchers UUID[] DEFAULT '{}', -- Users who want notifications
    comments_count INTEGER DEFAULT 0,
    attachments_count INTEGER DEFAULT 0,
    
    -- Business context
    business_value VARCHAR(20) DEFAULT 'medium' CHECK (business_value IN ('low', 'medium', 'high', 'critical')),
    cost_center VARCHAR(50),
    budget_impact DECIMAL(10,2),
    
    -- Quality assurance
    acceptance_criteria TEXT,
    definition_of_done TEXT,
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
    
    -- Integration and external references
    external_references JSONB DEFAULT '{}', -- Links to external systems
    integrations JSONB DEFAULT '{
        "calendar_event": null,
        "email_thread": null,
        "document_links": [],
        "meeting_recordings": []
    }',
    
    -- Recurrence (for recurring tasks)
    recurrence_pattern JSONB DEFAULT NULL, -- Cron-like pattern for recurring tasks
    recurrence_parent_id UUID, -- Parent task for recurring instances
    is_recurring BOOLEAN DEFAULT false,
    
    -- Audit and tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tasks_title ON tasks(title) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON tasks(channel_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_owned_by ON tasks(owned_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at) WHERE deleted_at IS NULL AND completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_last_activity ON tasks(last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- Multi-assignment queries (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks USING gin(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_watchers ON tasks USING gin(watchers) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin(tags) WHERE deleted_at IS NULL;

-- Full-text search index (removed for now due to IMMUTABLE requirement)
-- CREATE INDEX IF NOT EXISTS idx_tasks_search ON tasks USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || array_to_string(tags, ' '))) WHERE deleted_at IS NULL;

-- JSONB indexes for metadata
CREATE INDEX IF NOT EXISTS idx_tasks_labels ON tasks USING gin(labels) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_custom_fields ON tasks USING gin(custom_fields) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_ai_suggestions ON tasks USING gin(ai_suggestions) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_external_refs ON tasks USING gin(external_references) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_channel_status ON tasks(channel_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks USING gin(assigned_to) WHERE status IN ('pending', 'in_progress') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority_due_date ON tasks(priority, due_date) WHERE deleted_at IS NULL;
-- Overdue tasks index (removed NOW() function as it's not immutable for index predicates)
-- CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(due_date) WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled') AND deleted_at IS NULL;

-- Voice integration indexes (for Phase 2)
CREATE INDEX IF NOT EXISTS idx_tasks_voice_created ON tasks(voice_created) WHERE voice_created = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_voice_command_id ON tasks(voice_command_id) WHERE voice_command_id IS NOT NULL AND deleted_at IS NULL;

-- Recurrence indexes
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(is_recurring) WHERE is_recurring = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_parent ON tasks(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL AND deleted_at IS NULL;

-- Constraint: subtasks cannot have subtasks beyond certain depth
CREATE OR REPLACE FUNCTION check_task_depth()
RETURNS TRIGGER AS $$
DECLARE
    depth INTEGER := 0;
    current_parent UUID := NEW.parent_task_id;
    max_depth INTEGER := 5; -- Maximum nesting depth
BEGIN
    -- Check task nesting depth
    WHILE current_parent IS NOT NULL AND depth < max_depth LOOP
        SELECT parent_task_id INTO current_parent
        FROM tasks 
        WHERE id = current_parent AND deleted_at IS NULL;
        
        depth := depth + 1;
    END LOOP;
    
    IF depth >= max_depth THEN
        RAISE EXCEPTION 'Task nesting depth exceeds maximum allowed (%))', max_depth;
    END IF;
    
    -- Prevent self-reference
    IF NEW.id = NEW.parent_task_id THEN
        RAISE EXCEPTION 'Task cannot be its own parent';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to validate task hierarchy
CREATE TRIGGER trigger_tasks_validate_hierarchy
    BEFORE INSERT OR UPDATE OF parent_task_id ON tasks
    FOR EACH ROW
    WHEN (NEW.parent_task_id IS NOT NULL)
    EXECUTE FUNCTION check_task_depth();

-- Function to update task progress and completion
CREATE OR REPLACE FUNCTION update_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-complete when progress reaches 100%
    IF NEW.progress_percentage = 100 AND NEW.status != 'completed' THEN
        NEW.status := 'completed';
        NEW.completed_at := NOW();
    END IF;
    
    -- Reset completion when moving away from completed status
    IF NEW.status != 'completed' AND OLD.status = 'completed' THEN
        NEW.completed_at := NULL;
        IF NEW.progress_percentage = 100 THEN
            NEW.progress_percentage := 90; -- Slightly less than complete
        END IF;
    END IF;
    
    -- Update last activity
    NEW.last_activity_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for task completion logic
CREATE TRIGGER trigger_tasks_completion
    BEFORE UPDATE OF progress_percentage, status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_completion();

-- Trigger to update updated_at and version
CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to assign task to users
CREATE OR REPLACE FUNCTION assign_task(
    task_id UUID,
    user_ids UUID[],
    assigned_by UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_assignees UUID[];
    new_assignees UUID[];
    user_id UUID;
BEGIN
    -- Get current assignees
    SELECT assigned_to INTO current_assignees
    FROM tasks 
    WHERE id = task_id AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;
    
    -- Combine current and new assignees (remove duplicates)
    new_assignees := current_assignees;
    FOREACH user_id IN ARRAY user_ids LOOP
        IF NOT (user_id = ANY(new_assignees)) THEN
            new_assignees := array_append(new_assignees, user_id);
        END IF;
    END LOOP;
    
    -- Update the task
    UPDATE tasks 
    SET 
        assigned_to = new_assignees,
        last_activity_at = NOW(),
        -- Set primary owner to first assignee if not set
        owned_by = COALESCE(owned_by, new_assignees[1])
    WHERE id = task_id;
    
    -- Log assignment (could be extended to an audit table)
    INSERT INTO task_assignment_history (task_id, user_ids, action, performed_by, performed_at)
    VALUES (task_id, user_ids, 'assigned', COALESCE(assigned_by, user_ids[1]), NOW())
    ON CONFLICT DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE 'plpgsql';

-- Function to unassign users from task
CREATE OR REPLACE FUNCTION unassign_task(
    task_id UUID,
    user_ids UUID[],
    unassigned_by UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_assignees UUID[];
    new_assignees UUID[];
    user_id UUID;
BEGIN
    -- Get current assignees
    SELECT assigned_to INTO current_assignees
    FROM tasks 
    WHERE id = task_id AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;
    
    -- Remove specified users
    new_assignees := current_assignees;
    FOREACH user_id IN ARRAY user_ids LOOP
        new_assignees := array_remove(new_assignees, user_id);
    END LOOP;
    
    -- Update the task
    UPDATE tasks 
    SET 
        assigned_to = new_assignees,
        last_activity_at = NOW(),
        -- Clear owned_by if owner was unassigned
        owned_by = CASE 
            WHEN owned_by = ANY(user_ids) THEN new_assignees[1]
            ELSE owned_by 
        END
    WHERE id = task_id;
    
    -- Log unassignment
    INSERT INTO task_assignment_history (task_id, user_ids, action, performed_by, performed_at)
    VALUES (task_id, user_ids, 'unassigned', COALESCE(unassigned_by, user_ids[1]), NOW())
    ON CONFLICT DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE 'plpgsql';

-- Function to get user's tasks with filters
CREATE OR REPLACE FUNCTION get_user_tasks(
    user_id UUID,
    task_status VARCHAR(20)[] DEFAULT NULL,
    include_watching BOOLEAN DEFAULT true
) RETURNS TABLE(
    task_id UUID,
    title VARCHAR(300),
    priority VARCHAR(20),
    status VARCHAR(20),
    due_date TIMESTAMP WITH TIME ZONE,
    channel_name VARCHAR(200),
    is_assigned BOOLEAN,
    is_watching BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.priority,
        t.status,
        t.due_date,
        c.name as channel_name,
        (user_id = ANY(t.assigned_to)) as is_assigned,
        (user_id = ANY(t.watchers)) as is_watching
    FROM tasks t
    LEFT JOIN channels c ON t.channel_id = c.id
    WHERE t.deleted_at IS NULL
    AND (
        user_id = ANY(t.assigned_to) OR 
        (include_watching AND user_id = ANY(t.watchers))
    )
    AND (task_status IS NULL OR t.status = ANY(task_status))
    ORDER BY 
        CASE t.priority 
            WHEN 'critical' THEN 5 
            WHEN 'urgent' THEN 4 
            WHEN 'high' THEN 3 
            WHEN 'medium' THEN 2 
            ELSE 1 
        END DESC,
        t.due_date ASC NULLS LAST,
        t.created_at DESC;
END;
$$ LANGUAGE 'plpgsql';

-- Function to get task hierarchy (parent and children) - TEMPORARILY DISABLED
-- CREATE OR REPLACE FUNCTION get_task_hierarchy(root_task_id UUID)
-- RETURNS TABLE(
--     task_id UUID,
--     title VARCHAR(300),
--     parent_id UUID,
--     level INTEGER,
--     path TEXT
-- ) AS $$
-- WITH RECURSIVE task_tree AS (
--     -- Root task
--     SELECT 
--         id as task_id,
--         title,
--         parent_task_id as parent_id,
--         0 as level,
--         title::TEXT as path
--     FROM tasks
--     WHERE id = root_task_id AND deleted_at IS NULL
--     
--     UNION ALL
--     
--     -- Child tasks
--     SELECT 
--         t.id,
--         t.title,
--         t.parent_task_id,
--         tt.level + 1,
--         (tt.path || ' > ' || t.title)::TEXT
--     FROM tasks t
--     JOIN task_tree tt ON t.parent_task_id = tt.task_id
--     WHERE t.deleted_at IS NULL
--     AND tt.level < 10 -- Prevent infinite recursion
-- )
-- SELECT * FROM task_tree ORDER BY level, title;
-- $$ LANGUAGE 'sql';

-- Soft delete function
CREATE OR REPLACE FUNCTION soft_delete_task()
RETURNS TRIGGER AS $$
BEGIN
    -- Also soft delete subtasks
    UPDATE tasks 
    SET 
        deleted_at = NOW(), 
        deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.owned_by),
        status = 'cancelled'
    WHERE parent_task_id = OLD.id AND deleted_at IS NULL;
    
    -- Soft delete the main task
    UPDATE tasks 
    SET 
        deleted_at = NOW(), 
        deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.owned_by),
        status = 'cancelled'
    WHERE id = OLD.id;
    
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for soft delete protection
CREATE TRIGGER trigger_tasks_soft_delete
    BEFORE DELETE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_task();

-- Create task assignment history table
CREATE TABLE IF NOT EXISTS task_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    user_ids UUID[] NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('assigned', 'unassigned', 'reassigned')),
    performed_by UUID NOT NULL REFERENCES users(id),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_task_assignment_history_task ON task_assignment_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignment_history_performed_at ON task_assignment_history(performed_at DESC);

-- Utility views
CREATE VIEW active_tasks AS
SELECT 
    t.id,
    t.title,
    t.description,
    t.channel_id,
    c.name as channel_name,
    t.priority,
    t.status,
    t.progress_percentage,
    t.due_date,
    t.owned_by,
    owner.name as owner_name,
    array_length(t.assigned_to, 1) as assignee_count,
    t.complexity,
    t.estimated_hours,
    t.actual_hours,
    t.tags,
    t.voice_created,
    t.created_at,
    t.updated_at,
    t.last_activity_at
FROM tasks t
LEFT JOIN channels c ON t.channel_id = c.id
LEFT JOIN users owner ON t.owned_by = owner.id
WHERE t.deleted_at IS NULL;

-- Overdue tasks view
CREATE VIEW overdue_tasks AS
SELECT 
    t.id,
    t.title,
    t.channel_id,
    c.name as channel_name,
    t.priority,
    t.due_date,
    t.owned_by,
    owner.name as owner_name,
    t.assigned_to,
    (NOW() - t.due_date) as overdue_duration,
    t.progress_percentage
FROM tasks t
LEFT JOIN channels c ON t.channel_id = c.id  
LEFT JOIN users owner ON t.owned_by = owner.id
WHERE t.deleted_at IS NULL
AND t.due_date < NOW()
AND t.status NOT IN ('completed', 'cancelled')
ORDER BY t.due_date ASC;

-- Task statistics view
CREATE VIEW task_statistics AS
SELECT 
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
    COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled')) as overdue_tasks,
    COUNT(*) FILTER (WHERE voice_created = true) as voice_created_tasks,
    AVG(actual_hours) FILTER (WHERE actual_hours > 0) as avg_completion_hours,
    AVG(progress_percentage) as avg_progress_percentage
FROM active_tasks;

-- Add self-referencing foreign key constraints after table creation
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_parent_task_id 
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE tasks ADD CONSTRAINT fk_tasks_recurrence_parent_id 
    FOREIGN KEY (recurrence_parent_id) REFERENCES tasks(id);

COMMENT ON TABLE tasks IS 'Advanced task management with multi-assignment, hierarchy, and voice integration';
COMMENT ON COLUMN tasks.assigned_to IS 'Array of user IDs for multi-assignment support';
COMMENT ON COLUMN tasks.voice_created IS 'Flag indicating task was created via voice command';
COMMENT ON COLUMN tasks.ai_suggestions IS 'JSONB field for AI-generated optimization suggestions';
COMMENT ON COLUMN tasks.recurrence_pattern IS 'JSONB field for recurring task patterns';
COMMENT ON FUNCTION assign_task(UUID, UUID[], UUID) IS 'Assign multiple users to a task with audit trail';
COMMENT ON FUNCTION get_user_tasks(UUID, VARCHAR(20)[], BOOLEAN) IS 'Get filtered tasks for a specific user';
-- COMMENT ON FUNCTION get_task_hierarchy(UUID) IS 'Get complete task hierarchy starting from root task';
COMMENT ON VIEW active_tasks IS 'Active tasks with channel and owner information';
COMMENT ON VIEW overdue_tasks IS 'Tasks that are past their due date and not completed';
COMMENT ON VIEW task_statistics IS 'Aggregate statistics for task management dashboard';