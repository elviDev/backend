-- Create Messages and Notifications tables
-- Real-time communication and notification system

-- Messages table for channel communication
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Message context
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE, -- Optional task-specific messages
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Message content
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'file', 'system', 'command_result', 'ai_response')),
    
    -- Voice message support (Phase 2)
    voice_data JSONB DEFAULT NULL, -- Voice message metadata (duration, transcription, etc.)
    transcription TEXT, -- Auto-transcribed text from voice
    
    -- File attachments
    attachments JSONB DEFAULT '[]', -- Array of file attachments with metadata
    
    -- Message relationships
    reply_to UUID, -- Thread support
    thread_root UUID, -- Root message of thread
    
    -- Message state
    is_edited BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    is_announcement BOOLEAN DEFAULT false,
    
    -- Reactions and interactions
    reactions JSONB DEFAULT '{}', -- Emoji reactions with user counts
    mentions UUID[] DEFAULT '{}', -- Array of mentioned user IDs
    
    -- AI and automation features (Phase 3-4)
    ai_generated BOOLEAN DEFAULT false,
    ai_context JSONB DEFAULT NULL, -- AI processing context
    command_execution_id UUID, -- Link to command execution for command results
    
    -- Metadata and customization
    metadata JSONB DEFAULT '{}',
    formatting JSONB DEFAULT '{}', -- Rich text formatting information
    
    -- Audit and tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id, created_at DESC) WHERE deleted_at IS NULL AND task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to) WHERE deleted_at IS NULL AND reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_thread_root ON messages(thread_root, created_at ASC) WHERE deleted_at IS NULL AND thread_root IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Full-text search for message content (removed due to IMMUTABLE requirement)
-- CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING gin(to_tsvector('english', content || ' ' || COALESCE(transcription, ''))) WHERE deleted_at IS NULL;

-- Mentions and reactions indexes
CREATE INDEX IF NOT EXISTS idx_messages_mentions ON messages USING gin(mentions) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reactions ON messages USING gin(reactions) WHERE deleted_at IS NULL;

-- AI and voice message indexes
CREATE INDEX IF NOT EXISTS idx_messages_ai_generated ON messages(ai_generated) WHERE ai_generated = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_voice ON messages(message_type) WHERE message_type = 'voice' AND deleted_at IS NULL;

-- Pinned and announcement messages
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id, is_pinned) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_announcements ON messages(channel_id, is_announcement) WHERE is_announcement = true AND deleted_at IS NULL;

-- Notifications table for multi-channel notification system
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Notification target
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Notification content
    title VARCHAR(200) NOT NULL,
    content TEXT,
    
    -- Notification classification
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'task_assigned', 'task_updated', 'task_completed', 'task_overdue',
        'channel_invite', 'channel_message', 'channel_mention',
        'deadline_reminder', 'meeting_reminder',
        'voice_command_result', 'ai_suggestion',
        'system_alert', 'security_alert',
        'custom'
    )),
    
    -- Context and references
    entity_type VARCHAR(20) CHECK (entity_type IN ('task', 'channel', 'message', 'user', 'system')),
    entity_id UUID, -- Reference to the related entity
    
    -- Priority and urgency
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical')),
    urgency_score INTEGER DEFAULT 5 CHECK (urgency_score BETWEEN 1 AND 10),
    
    -- Delivery channels
    delivery_channels JSONB DEFAULT '{
        "push": true,
        "email": false,
        "sms": false,
        "in_app": true,
        "websocket": true
    }',
    
    -- Delivery tracking
    delivery_status JSONB DEFAULT '{
        "push": {"sent": false, "delivered": false, "opened": false},
        "email": {"sent": false, "delivered": false, "opened": false},
        "sms": {"sent": false, "delivered": false},
        "in_app": {"seen": false, "read": false},
        "websocket": {"sent": false, "acknowledged": false}
    }',
    
    -- Scheduling and timing
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Interaction tracking
    read_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    action_taken_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery attempts and retries
    delivery_attempts INTEGER DEFAULT 0,
    max_delivery_attempts INTEGER DEFAULT 3,
    last_delivery_attempt TIMESTAMP WITH TIME ZONE,
    
    -- Grouping and batching
    group_key VARCHAR(100), -- For batching similar notifications
    batch_id UUID, -- For bulk operations
    
    -- Customization and metadata
    metadata JSONB DEFAULT '{}',
    action_buttons JSONB DEFAULT '[]', -- Action buttons for rich notifications
    deep_link_url VARCHAR(500), -- Deep link for mobile apps
    
    -- AI and personalization (Phase 4)
    personalization_data JSONB DEFAULT '{}',
    ai_optimized BOOLEAN DEFAULT false,
    send_time_optimized BOOLEAN DEFAULT false,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id)
);

-- Performance indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority, urgency_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(group_key, user_id) WHERE group_key IS NOT NULL AND deleted_at IS NULL;

-- Delivery status queries (removed NOW() function)
-- CREATE INDEX IF NOT EXISTS idx_notifications_pending_delivery ON notifications(scheduled_for) WHERE sent_at IS NULL AND scheduled_for <= NOW() AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_failed_delivery ON notifications(delivery_attempts, last_delivery_attempt) WHERE delivery_attempts < max_delivery_attempts AND deleted_at IS NULL;

-- Expiration cleanup (removed NOW() function)
-- CREATE INDEX IF NOT EXISTS idx_notifications_expired ON notifications(expires_at) WHERE expires_at IS NOT NULL AND expires_at < NOW();

-- Update triggers for messages
CREATE TRIGGER trigger_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update triggers for notifications  
CREATE TRIGGER trigger_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    user_id UUID,
    title VARCHAR(200),
    content TEXT,
    notification_type VARCHAR(50),
    entity_type VARCHAR(20) DEFAULT NULL,
    entity_id UUID DEFAULT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivery_channels JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    user_settings JSONB;
    default_channels JSONB;
BEGIN
    -- Get user's notification preferences
    SELECT notification_settings INTO user_settings
    FROM users 
    WHERE id = user_id AND deleted_at IS NULL;
    
    -- Set default delivery channels based on user preferences
    default_channels := COALESCE(delivery_channels, '{
        "push": true,
        "email": false,
        "sms": false,
        "in_app": true,
        "websocket": true
    }'::JSONB);
    
    -- Override with user preferences if available
    IF user_settings IS NOT NULL THEN
        default_channels := jsonb_set(
            default_channels,
            '{push}',
            COALESCE(user_settings->'push_notifications', 'true'::JSONB)
        );
        default_channels := jsonb_set(
            default_channels,
            '{email}',
            COALESCE(user_settings->'email_notifications', 'false'::JSONB)
        );
        default_channels := jsonb_set(
            default_channels,
            '{sms}',
            COALESCE(user_settings->'sms_notifications', 'false'::JSONB)
        );
    END IF;
    
    -- Insert notification
    INSERT INTO notifications (
        user_id, title, content, type, entity_type, entity_id, 
        priority, scheduled_for, delivery_channels
    ) VALUES (
        user_id, title, content, notification_type, entity_type, entity_id,
        priority, scheduled_for, default_channels
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE 'plpgsql';

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
    notification_id UUID,
    user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    notification_found BOOLEAN := false;
BEGIN
    UPDATE notifications 
    SET 
        read_at = NOW(),
        delivery_status = jsonb_set(
            delivery_status,
            '{in_app,read}',
            'true'::JSONB
        )
    WHERE id = notification_id 
    AND user_id = mark_notification_read.user_id 
    AND deleted_at IS NULL
    AND read_at IS NULL;
    
    GET DIAGNOSTICS notification_found = ROW_COUNT;
    RETURN notification_found > 0;
END;
$$ LANGUAGE 'plpgsql';

-- Function to send message with automatic notifications
CREATE OR REPLACE FUNCTION send_message(
    channel_id UUID,
    user_id UUID,
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text',
    reply_to UUID DEFAULT NULL,
    mentions UUID[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    message_id UUID;
    channel_members UUID[];
    mention_user_id UUID;
    channel_name VARCHAR(200);
BEGIN
    -- Insert the message
    INSERT INTO messages (
        channel_id, user_id, content, message_type, reply_to, mentions
    ) VALUES (
        channel_id, user_id, content, message_type, reply_to, mentions
    ) RETURNING id INTO message_id;
    
    -- Get channel info
    SELECT name, members INTO channel_name, channel_members
    FROM channels
    WHERE id = channel_id AND deleted_at IS NULL;
    
    -- Create notifications for mentions
    IF mentions IS NOT NULL AND array_length(mentions, 1) > 0 THEN
        FOREACH mention_user_id IN ARRAY mentions LOOP
            IF mention_user_id != user_id THEN -- Don't notify self
                PERFORM create_notification(
                    mention_user_id,
                    'You were mentioned in ' || channel_name,
                    'You were mentioned in a message: ' || left(content, 100) || '...',
                    'channel_mention',
                    'message',
                    message_id,
                    'high'
                );
            END IF;
        END LOOP;
    END IF;
    
    -- Update channel activity
    UPDATE channels 
    SET last_activity_at = NOW()
    WHERE id = channel_id;
    
    RETURN message_id;
END;
$$ LANGUAGE 'plpgsql';

-- Soft delete functions
CREATE OR REPLACE FUNCTION soft_delete_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE messages 
    SET deleted_at = NOW(), deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.user_id)
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION soft_delete_notification()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE notifications 
    SET deleted_at = NOW(), deleted_by = COALESCE(current_setting('app.current_user_id', true)::UUID, OLD.user_id)
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Soft delete triggers
CREATE TRIGGER trigger_messages_soft_delete
    BEFORE DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_message();

CREATE TRIGGER trigger_notifications_soft_delete
    BEFORE DELETE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete_notification();

-- Utility views
CREATE VIEW active_messages AS
SELECT 
    m.id,
    m.channel_id,
    c.name as channel_name,
    m.task_id,
    m.user_id,
    u.name as user_name,
    u.avatar_url,
    m.content,
    m.message_type,
    m.transcription,
    m.reply_to,
    m.is_edited,
    m.is_pinned,
    m.reactions,
    m.mentions,
    m.created_at,
    m.updated_at
FROM messages m
LEFT JOIN channels c ON m.channel_id = c.id
LEFT JOIN users u ON m.user_id = u.id
WHERE m.deleted_at IS NULL;

CREATE VIEW unread_notifications AS
SELECT 
    n.id,
    n.user_id,
    n.title,
    n.content,
    n.type,
    n.priority,
    n.urgency_score,
    n.entity_type,
    n.entity_id,
    n.scheduled_for,
    n.expires_at,
    n.deep_link_url,
    n.created_at,
    (NOW() - n.created_at) as age
FROM notifications n
WHERE n.deleted_at IS NULL
AND n.read_at IS NULL
AND (n.expires_at IS NULL OR n.expires_at > NOW())
ORDER BY n.urgency_score DESC, n.created_at DESC;

COMMENT ON TABLE messages IS 'Real-time messaging system with voice support and rich features';
COMMENT ON TABLE notifications IS 'Multi-channel notification system with delivery tracking';
COMMENT ON COLUMN messages.voice_data IS 'JSONB field containing voice message metadata and transcription';
-- Add self-referencing foreign key constraints for messages after table creation
ALTER TABLE messages ADD CONSTRAINT fk_messages_reply_to 
    FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE messages ADD CONSTRAINT fk_messages_thread_root 
    FOREIGN KEY (thread_root) REFERENCES messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN notifications.delivery_channels IS 'JSONB configuration for notification delivery methods';
COMMENT ON COLUMN notifications.delivery_status IS 'JSONB tracking delivery status across all channels';
COMMENT ON FUNCTION create_notification IS 'Create notification with user preference integration';
COMMENT ON FUNCTION send_message IS 'Send message with automatic mention notifications';
COMMENT ON VIEW unread_notifications IS 'Active unread notifications ordered by urgency';