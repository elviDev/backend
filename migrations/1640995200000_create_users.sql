-- Create Users table with enterprise features
-- Foundation for all user management and authentication

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Role-based access control
    role VARCHAR(50) NOT NULL CHECK (role IN ('ceo', 'manager', 'staff')),
    
    -- User profile information
    avatar_url VARCHAR(500),
    phone VARCHAR(50),
    department VARCHAR(100),
    job_title VARCHAR(100),
    
    -- Internationalization and preferences
    language_preference VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(100) DEFAULT 'UTC',
    
    -- Notification preferences (JSONB for flexibility)
    notification_settings JSONB DEFAULT '{
        "push_notifications": true,
        "email_notifications": true,
        "sms_notifications": false,
        "voice_command_confirmations": true,
        "real_time_updates": true,
        "quiet_hours": {
            "enabled": false,
            "start": "22:00",
            "end": "08:00"
        }
    }',
    
    -- Security and session management
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    email_verification_token VARCHAR(255),
    email_verified BOOLEAN DEFAULT false,
    
    -- Activity tracking
    last_active TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    
    -- Voice processing preferences (for Phase 2)
    voice_settings JSONB DEFAULT '{
        "enabled": true,
        "language": "en-US",
        "voice_training_completed": false,
        "wake_word_enabled": false,
        "processing_speed": "normal",
        "confirmation_required": true
    }',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Full-text search index for user search
CREATE INDEX IF NOT EXISTS idx_users_search ON users USING gin(to_tsvector('english', name || ' ' || email || ' ' || COALESCE(department, '') || ' ' || COALESCE(job_title, ''))) WHERE deleted_at IS NULL;

-- Notification settings search (for advanced notification routing)
CREATE INDEX IF NOT EXISTS idx_users_notification_settings ON users USING gin(notification_settings) WHERE deleted_at IS NULL;

-- Constraint to ensure CEO is unique (business rule)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_ceo ON users(role) WHERE role = 'ceo' AND deleted_at IS NULL;

-- Security constraint: prevent password reset token reuse
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to automatically update updated_at and version
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function for soft delete
CREATE OR REPLACE FUNCTION soft_delete_user()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET deleted_at = NOW(), deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.id)
    WHERE id = OLD.id;
    RETURN NULL; -- Prevent actual delete
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for soft delete protection
DROP TRIGGER IF EXISTS trigger_users_soft_delete ON users;
CREATE TRIGGER trigger_users_soft_delete
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_user();

-- Security function to hash passwords (for stored procedures)
CREATE OR REPLACE FUNCTION hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
    -- This will be handled by the application layer using bcrypt
    -- This function is a placeholder for future stored procedure needs
    RAISE EXCEPTION 'Password hashing must be done by application layer';
END;
$$ LANGUAGE 'plpgsql';

-- Utility view for active users (excluding soft-deleted)
CREATE OR REPLACE VIEW active_users AS
SELECT 
    id,
    email,
    name,
    role,
    avatar_url,
    phone,
    department,
    job_title,
    language_preference,
    timezone,
    notification_settings,
    voice_settings,
    last_active,
    last_login,
    login_count,
    email_verified,
    created_at,
    updated_at,
    version
FROM users 
WHERE deleted_at IS NULL;

-- Utility view for user statistics (for analytics)
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE role = 'ceo') as ceo_count,
    COUNT(*) FILTER (WHERE role = 'manager') as manager_count,
    COUNT(*) FILTER (WHERE role = 'staff') as staff_count,
    COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '24 hours') as active_24h,
    COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days') as active_7d,
    COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
    AVG(login_count) as avg_login_count
FROM active_users;

-- Add foreign key constraints after table creation to avoid circular dependency
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_created_by') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_created_by 
            FOREIGN KEY (created_by) REFERENCES users(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_deleted_by') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_deleted_by 
            FOREIGN KEY (deleted_by) REFERENCES users(id);
    END IF;
END $$;

COMMENT ON TABLE users IS 'Core user management table with enterprise features for CEO communication platform';
COMMENT ON COLUMN users.notification_settings IS 'JSONB field storing user-specific notification preferences for all channels';
COMMENT ON COLUMN users.voice_settings IS 'JSONB field storing voice processing preferences and training data';
COMMENT ON COLUMN users.version IS 'Optimistic locking version for concurrent updates';
COMMENT ON VIEW active_users IS 'Active users view excluding soft-deleted records';
COMMENT ON VIEW user_stats IS 'User statistics for dashboard and analytics';