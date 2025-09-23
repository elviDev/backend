-- Migration: Create threading and reactions system
-- Date: 2025-09-22

-- Add threading columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS thread_root_id UUID REFERENCES messages(id),
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id),
ADD COLUMN IF NOT EXISTS is_thread_root BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

-- Create index for thread queries
CREATE INDEX IF NOT EXISTS idx_messages_thread_root_id ON messages(thread_root_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_thread_root ON messages(is_thread_root);

-- Create thread_statistics table for thread metadata and performance
CREATE TABLE IF NOT EXISTS thread_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_root_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reply_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    last_reply_at TIMESTAMP,
    last_reply_by_id UUID REFERENCES users(id),
    participants JSONB DEFAULT '[]'::jsonb, -- Array of user IDs who participated
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(thread_root_id)
);

-- Create indexes for thread_statistics
CREATE INDEX IF NOT EXISTS idx_thread_stats_thread_root_id ON thread_statistics(thread_root_id);
CREATE INDEX IF NOT EXISTS idx_thread_stats_last_reply_at ON thread_statistics(last_reply_at);

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for message_reactions
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_emoji ON message_reactions(emoji);

-- Create function to update thread statistics
CREATE OR REPLACE FUNCTION update_thread_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process if this is a thread reply (has thread_root_id)
    -- AND this is not an update to is_thread_root to prevent infinite loops
    IF NEW.thread_root_id IS NOT NULL AND 
       (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_thread_root = NEW.is_thread_root)) THEN
        -- Insert or update thread statistics
        INSERT INTO thread_statistics (
            thread_root_id, 
            reply_count, 
            participant_count,
            last_reply_at,
            last_reply_by_id,
            participants
        )
        SELECT 
            NEW.thread_root_id,
            COUNT(*) as reply_count,
            COUNT(DISTINCT user_id) as participant_count,
            MAX(created_at) as last_reply_at,
            (SELECT user_id FROM messages WHERE thread_root_id = NEW.thread_root_id ORDER BY created_at DESC LIMIT 1) as last_reply_by_id,
            jsonb_agg(DISTINCT user_id) as participants
        FROM messages 
        WHERE thread_root_id = NEW.thread_root_id 
          AND deleted_at IS NULL
        ON CONFLICT (thread_root_id) 
        DO UPDATE SET
            reply_count = EXCLUDED.reply_count,
            participant_count = EXCLUDED.participant_count,
            last_reply_at = EXCLUDED.last_reply_at,
            last_reply_by_id = EXCLUDED.last_reply_by_id,
            participants = EXCLUDED.participants,
            updated_at = NOW();
            
        -- Mark the root message as a thread root (only if not already marked)
        UPDATE messages 
        SET is_thread_root = TRUE 
        WHERE id = NEW.thread_root_id AND is_thread_root = FALSE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic thread statistics update
DROP TRIGGER IF EXISTS trigger_update_thread_statistics ON messages;
CREATE TRIGGER trigger_update_thread_statistics
    AFTER INSERT OR UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_statistics();

-- Create function to clean up thread statistics on message deletion
CREATE OR REPLACE FUNCTION cleanup_thread_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- If a thread root message is deleted, clean up its statistics
    IF OLD.is_thread_root = TRUE THEN
        DELETE FROM thread_statistics WHERE thread_root_id = OLD.id;
    END IF;
    
    -- If a thread reply is deleted, update statistics
    IF OLD.thread_root_id IS NOT NULL THEN
        -- Update thread statistics
        UPDATE thread_statistics 
        SET 
            reply_count = (
                SELECT COUNT(*) 
                FROM messages 
                WHERE thread_root_id = OLD.thread_root_id 
                  AND deleted_at IS NULL
            ),
            participant_count = (
                SELECT COUNT(DISTINCT user_id) 
                FROM messages 
                WHERE thread_root_id = OLD.thread_root_id 
                  AND deleted_at IS NULL
            ),
            last_reply_at = (
                SELECT MAX(created_at) 
                FROM messages 
                WHERE thread_root_id = OLD.thread_root_id 
                  AND deleted_at IS NULL
            ),
            last_reply_by_id = (
                SELECT user_id 
                FROM messages 
                WHERE thread_root_id = OLD.thread_root_id 
                  AND deleted_at IS NULL 
                ORDER BY created_at DESC 
                LIMIT 1
            ),
            participants = (
                SELECT jsonb_agg(DISTINCT user_id) 
                FROM messages 
                WHERE thread_root_id = OLD.thread_root_id 
                  AND deleted_at IS NULL
            ),
            updated_at = NOW()
        WHERE thread_root_id = OLD.thread_root_id;
        
        -- If no more replies, mark root as not a thread root
        IF (SELECT COUNT(*) FROM messages WHERE thread_root_id = OLD.thread_root_id AND deleted_at IS NULL) = 0 THEN
            UPDATE messages SET is_thread_root = FALSE WHERE id = OLD.thread_root_id;
            DELETE FROM thread_statistics WHERE thread_root_id = OLD.thread_root_id;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for thread cleanup on message deletion
DROP TRIGGER IF EXISTS trigger_cleanup_thread_statistics ON messages;
CREATE TRIGGER trigger_cleanup_thread_statistics
    AFTER UPDATE OF deleted_at ON messages
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    EXECUTE FUNCTION cleanup_thread_statistics();

-- Add trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_thread_statistics_updated_at ON thread_statistics;
CREATE TRIGGER trigger_thread_statistics_updated_at
    BEFORE UPDATE ON thread_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();