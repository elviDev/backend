-- Increase token column lengths to accommodate JWT tokens
-- JWT tokens are typically 300-500 characters, much longer than VARCHAR(255)

-- Increase email verification token column length
ALTER TABLE users ALTER COLUMN email_verification_token TYPE TEXT;

-- Increase password reset token column length  
ALTER TABLE users ALTER COLUMN password_reset_token TYPE TEXT;

-- Update the unique constraint for password reset tokens
DROP INDEX IF EXISTS idx_users_password_reset_token;
CREATE UNIQUE INDEX idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

COMMENT ON COLUMN users.email_verification_token IS 'JWT token for email verification (TEXT to accommodate full JWT length)';
COMMENT ON COLUMN users.password_reset_token IS 'Token for password reset (TEXT to accommodate various token formats)';