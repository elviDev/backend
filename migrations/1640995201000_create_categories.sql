-- Create Categories table for channel organization
-- Supports hierarchical organization structure

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Visual customization
    color VARCHAR(7) CHECK (color ~ '^#[0-9A-Fa-f]{6}$'), -- Hex color validation
    icon VARCHAR(100), -- Icon identifier (e.g., 'marketing', 'finance', 'development')
    
    -- Hierarchy support
    parent_id UUID,
    sort_order INTEGER DEFAULT 0,
    
    -- Priority and visibility
    priority_level INTEGER DEFAULT 1 CHECK (priority_level BETWEEN 1 AND 10),
    is_system_category BOOLEAN DEFAULT false, -- System vs user-created categories
    is_active BOOLEAN DEFAULT true,
    
    -- Access control
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'restricted', 'private')),
    allowed_roles TEXT[] DEFAULT ARRAY['ceo', 'manager', 'staff'], -- Roles that can access this category
    
    -- Metadata for extensibility
    metadata JSONB DEFAULT '{}',
    
    -- Enterprise features
    department_mapping VARCHAR(100), -- Map to organizational departments
    cost_center VARCHAR(50), -- For financial tracking
    approval_required BOOLEAN DEFAULT false, -- Whether channels in this category require approval
    
    -- Usage statistics (updated by triggers)
    channel_count INTEGER DEFAULT 0,
    active_channel_count INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_priority ON categories(priority_level DESC);
CREATE INDEX IF NOT EXISTS idx_categories_department ON categories(department_mapping) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_system ON categories(is_system_category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE deleted_at IS NULL;

-- Hierarchy queries optimization (adjacency list to nested set conversion)
CREATE INDEX IF NOT EXISTS idx_categories_hierarchy ON categories(parent_id, sort_order) WHERE deleted_at IS NULL;

-- Full-text search for category discovery
CREATE INDEX IF NOT EXISTS idx_categories_search ON categories USING gin(to_tsvector('english', name || ' ' || COALESCE(description, ''))) WHERE deleted_at IS NULL;

-- Metadata search support
CREATE INDEX IF NOT EXISTS idx_categories_metadata ON categories USING gin(metadata) WHERE deleted_at IS NULL;

-- Role-based access search
CREATE INDEX IF NOT EXISTS idx_categories_roles ON categories USING gin(allowed_roles) WHERE deleted_at IS NULL;

-- Constraint: prevent circular references in hierarchy
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_no_self_reference') THEN
        ALTER TABLE categories ADD CONSTRAINT check_no_self_reference CHECK (id != parent_id);
    END IF;
END $$;

-- Unique constraint for category names within same parent (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name_per_parent 
ON categories(LOWER(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID)) 
WHERE deleted_at IS NULL;

-- Trigger to update updated_at and version
DROP TRIGGER IF EXISTS trigger_categories_updated_at ON categories;
CREATE TRIGGER trigger_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update category statistics
CREATE OR REPLACE FUNCTION update_category_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update channel count for the category
    UPDATE categories 
    SET 
        channel_count = (
            SELECT COUNT(*) 
            FROM channels 
            WHERE category_id = COALESCE(NEW.category_id, OLD.category_id) 
            AND deleted_at IS NULL
        ),
        active_channel_count = (
            SELECT COUNT(*) 
            FROM channels 
            WHERE category_id = COALESCE(NEW.category_id, OLD.category_id) 
            AND status = 'active' 
            AND deleted_at IS NULL
        )
    WHERE id = COALESCE(NEW.category_id, OLD.category_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE 'plpgsql';

-- Function for hierarchical category path
CREATE OR REPLACE FUNCTION get_category_path(category_id UUID)
RETURNS TEXT AS $$
DECLARE
    path TEXT := '';
    current_id UUID := category_id;
    current_name TEXT;
    current_parent UUID;
    depth INTEGER := 0;
    max_depth INTEGER := 10; -- Prevent infinite loops
BEGIN
    WHILE current_id IS NOT NULL AND depth < max_depth LOOP
        SELECT name, parent_id INTO current_name, current_parent
        FROM categories 
        WHERE id = current_id AND deleted_at IS NULL;
        
        IF current_name IS NULL THEN
            EXIT;
        END IF;
        
        IF path = '' THEN
            path := current_name;
        ELSE
            path := current_name || ' > ' || path;
        END IF;
        
        current_id := current_parent;
        depth := depth + 1;
    END LOOP;
    
    RETURN path;
END;
$$ LANGUAGE 'plpgsql';

-- Function to get all subcategories (recursive)
CREATE OR REPLACE FUNCTION get_subcategories(parent_category_id UUID)
RETURNS TABLE(
    id UUID,
    name VARCHAR(100),
    level INTEGER
) AS $$
WITH RECURSIVE subcategories AS (
    -- Base case: direct children
    SELECT c.id, c.name, 1 as level
    FROM categories c
    WHERE c.parent_id = parent_category_id 
    AND c.deleted_at IS NULL
    
    UNION ALL
    
    -- Recursive case: children of children
    SELECT c.id, c.name, sc.level + 1
    FROM categories c
    JOIN subcategories sc ON c.parent_id = sc.id
    WHERE c.deleted_at IS NULL
    AND sc.level < 10 -- Prevent infinite recursion
)
SELECT * FROM subcategories ORDER BY level, name;
$$ LANGUAGE 'sql';

-- Soft delete function
CREATE OR REPLACE FUNCTION soft_delete_category()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if category has active channels
    IF EXISTS(
        SELECT 1 FROM channels 
        WHERE category_id = OLD.id 
        AND deleted_at IS NULL 
        AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Cannot delete category with active channels';
    END IF;
    
    -- Soft delete the category
    UPDATE categories 
    SET deleted_at = NOW(), deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.created_by)
    WHERE id = OLD.id;
    
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for soft delete protection
DROP TRIGGER IF EXISTS trigger_categories_soft_delete ON categories;
CREATE TRIGGER trigger_categories_soft_delete
    BEFORE DELETE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_category();

-- Create system default categories
INSERT INTO categories (id, name, description, color, icon, is_system_category, priority_level, created_by) 
SELECT 
    gen_random_uuid(),
    'General',
    'General communication and announcements',
    '#6B7280',
    'chat',
    true,
    10,
    u.id
FROM users u WHERE u.role = 'ceo' AND u.deleted_at IS NULL LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, name, description, color, icon, is_system_category, priority_level, created_by) 
SELECT 
    gen_random_uuid(),
    'Projects',
    'Project-specific communication channels',
    '#3B82F6',
    'folder',
    true,
    9,
    u.id
FROM users u WHERE u.role = 'ceo' AND u.deleted_at IS NULL LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, name, description, color, icon, is_system_category, priority_level, created_by) 
SELECT 
    gen_random_uuid(),
    'Departments',
    'Department-based communication',
    '#10B981',
    'building',
    true,
    8,
    u.id
FROM users u WHERE u.role = 'ceo' AND u.deleted_at IS NULL LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, name, description, color, icon, is_system_category, priority_level, created_by) 
SELECT 
    gen_random_uuid(),
    'Urgent',
    'High-priority and urgent communications',
    '#EF4444',
    'alert',
    true,
    10,
    u.id
FROM users u WHERE u.role = 'ceo' AND u.deleted_at IS NULL LIMIT 1
ON CONFLICT DO NOTHING;

-- Utility views
CREATE OR REPLACE VIEW active_categories AS
SELECT 
    id,
    name,
    description,
    color,
    icon,
    parent_id,
    sort_order,
    priority_level,
    visibility,
    allowed_roles,
    department_mapping,
    channel_count,
    active_channel_count,
    get_category_path(id) as full_path,
    created_at,
    updated_at,
    version
FROM categories 
WHERE deleted_at IS NULL AND is_active = true;

-- Category hierarchy view (for tree display)
CREATE OR REPLACE VIEW category_hierarchy AS
WITH RECURSIVE hierarchy AS (
    -- Root categories
    SELECT 
        id, name, parent_id, sort_order, priority_level,
        0 as depth, 
        name::TEXT as path,
        ARRAY[sort_order] as sort_path
    FROM categories
    WHERE parent_id IS NULL AND deleted_at IS NULL
    
    UNION ALL
    
    -- Child categories
    SELECT 
        c.id, c.name, c.parent_id, c.sort_order, c.priority_level,
        h.depth + 1,
        (h.path || ' > ' || c.name)::TEXT,
        h.sort_path || c.sort_order
    FROM categories c
    JOIN hierarchy h ON c.parent_id = h.id
    WHERE c.deleted_at IS NULL
)
SELECT * FROM hierarchy ORDER BY sort_path;

-- Add self-referencing foreign key constraint after table creation
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_parent_id') THEN
        ALTER TABLE categories ADD CONSTRAINT fk_categories_parent_id 
            FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT;
    END IF;
END $$;

COMMENT ON TABLE categories IS 'Hierarchical category system for organizing channels and communication';
COMMENT ON COLUMN categories.metadata IS 'JSONB field for extensible category properties';
COMMENT ON COLUMN categories.allowed_roles IS 'Array of user roles allowed to access this category';
COMMENT ON FUNCTION get_category_path(UUID) IS 'Returns full hierarchical path for a category';
COMMENT ON FUNCTION get_subcategories(UUID) IS 'Returns all subcategories recursively';
COMMENT ON VIEW active_categories IS 'Active categories with computed full paths';
COMMENT ON VIEW category_hierarchy IS 'Hierarchical view of all categories for tree display';
