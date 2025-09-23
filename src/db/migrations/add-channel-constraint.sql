-- Migration: Add NOT NULL constraint to tasks.channel_id
-- Every task MUST belong to a channel

BEGIN;

-- First, update any existing tasks without channel_id to belong to a default channel
-- (This should not happen in a well-managed system, but just in case)

-- Create a default channel if it doesn't exist
INSERT INTO channels (id, name, description, created_by, members, channel_type, created_at, updated_at, version)
SELECT
  gen_random_uuid(),
  'General Tasks',
  'Default channel for tasks without assigned channels',
  (SELECT id FROM users LIMIT 1),
  ARRAY(SELECT id FROM users LIMIT 10),
  'public',
  NOW(),
  NOW(),
  1
WHERE NOT EXISTS (SELECT 1 FROM channels WHERE name = 'General Tasks')
ON CONFLICT DO NOTHING;

-- Update any tasks without channel_id to use the default channel
UPDATE tasks
SET channel_id = (SELECT id FROM channels WHERE name = 'General Tasks' LIMIT 1)
WHERE channel_id IS NULL;

-- Now add the NOT NULL constraint
ALTER TABLE tasks
ALTER COLUMN channel_id SET NOT NULL;

-- Add a comment to document the constraint
COMMENT ON COLUMN tasks.channel_id IS 'REQUIRED: Every task must belong to a channel. Tasks cannot exist without a channel assignment.';

COMMIT;