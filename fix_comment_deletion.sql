-- Fix for comment deletion issue
-- This script removes the CASCADE constraint from comment_mentions table
-- and allows the application to handle soft deletes properly

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE comment_mentions 
DROP CONSTRAINT comment_mentions_comment_id_fkey;

-- Step 2: Re-add the foreign key constraint without CASCADE
ALTER TABLE comment_mentions 
ADD CONSTRAINT comment_mentions_comment_id_fkey 
FOREIGN KEY (comment_id) REFERENCES task_comments(id);

-- Verification: Check that the constraint is properly set
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'comment_mentions'
  AND kcu.column_name = 'comment_id';