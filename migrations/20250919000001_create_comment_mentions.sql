-- Create Comment Mentions table
-- Support for user tagging in comments

CREATE TABLE IF NOT EXISTS comment_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES task_comments(id),
    mentioned_user_id UUID NOT NULL REFERENCES users(id),
    mentioned_by_id UUID NOT NULL REFERENCES users(id),
    
    -- Mention metadata
    mention_text VARCHAR(100), -- The actual @mention text used
    position_start INTEGER, -- Start position in comment content
    position_end INTEGER, -- End position in comment content
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(comment_id, mentioned_user_id) -- Prevent duplicate mentions in same comment
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment_id ON comment_mentions(comment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user_id ON comment_mentions(mentioned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_mentions_created_at ON comment_mentions(created_at DESC) WHERE deleted_at IS NULL;

-- Function to process comment mentions
CREATE OR REPLACE FUNCTION process_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
    task_assignees UUID[];
    mention_pattern TEXT := '@[a-zA-Z0-9._-]+';
    mention_text TEXT;
    mentioned_user_id UUID;
    mention_start INTEGER;
    mention_end INTEGER;
BEGIN
    -- Get task assignees for validation
    SELECT assigned_to INTO task_assignees
    FROM tasks t
    JOIN task_comments tc ON t.id = tc.task_id
    WHERE tc.id = NEW.id;
    
    -- Extract all @mentions from comment content
    FOR mention_text IN
        SELECT word FROM regexp_split_to_table(NEW.content, '\s+') AS word
        WHERE word ~ mention_pattern
    LOOP
        -- Remove @ symbol and try to find user
        SELECT u.id INTO mentioned_user_id
        FROM users u
        WHERE u.email = LOWER(TRIM(SUBSTRING(mention_text FROM 2))) 
           OR u.name ILIKE '%' || TRIM(SUBSTRING(mention_text FROM 2)) || '%';
        
        -- Only create mention if user exists and is assigned to the task
        IF mentioned_user_id IS NOT NULL AND mentioned_user_id = ANY(task_assignees) THEN
            -- Find position in text
            mention_start := POSITION(mention_text IN NEW.content);
            mention_end := mention_start + LENGTH(mention_text) - 1;
            
            -- Insert mention record
            INSERT INTO comment_mentions (
                comment_id, 
                mentioned_user_id, 
                mentioned_by_id,
                mention_text,
                position_start,
                position_end
            ) VALUES (
                NEW.id,
                mentioned_user_id,
                NEW.author_id,
                mention_text,
                mention_start,
                mention_end
            ) ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to process mentions when comment is created
CREATE TRIGGER trigger_process_comment_mentions
    AFTER INSERT ON task_comments
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NULL)
    EXECUTE FUNCTION process_comment_mentions();

-- View for comment mentions with user information
CREATE VIEW comment_mentions_view AS
SELECT 
    cm.id,
    cm.comment_id,
    cm.mentioned_user_id,
    mu.name as mentioned_user_name,
    mu.email as mentioned_user_email,
    cm.mentioned_by_id,
    mby.name as mentioned_by_name,
    mby.email as mentioned_by_email,
    cm.mention_text,
    cm.position_start,
    cm.position_end,
    cm.created_at,
    tc.content as comment_content,
    tc.task_id
FROM comment_mentions cm
JOIN users mu ON cm.mentioned_user_id = mu.id
JOIN users mby ON cm.mentioned_by_id = mby.id
JOIN task_comments tc ON cm.comment_id = tc.id
WHERE cm.deleted_at IS NULL
  AND tc.deleted_at IS NULL
ORDER BY cm.created_at DESC;

-- Comments
COMMENT ON TABLE comment_mentions IS 'User mentions/tags in task comments';
COMMENT ON COLUMN comment_mentions.mention_text IS 'The actual @mention text used in the comment';
COMMENT ON FUNCTION process_comment_mentions() IS 'Automatically processes @mentions when comments are created';
COMMENT ON VIEW comment_mentions_view IS 'Comment mentions with user information for easy querying';