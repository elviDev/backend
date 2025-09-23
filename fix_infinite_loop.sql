-- Fix infinite loop in thread statistics trigger
-- This script updates the trigger function to prevent recursive calls

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