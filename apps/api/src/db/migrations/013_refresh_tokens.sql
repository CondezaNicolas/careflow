-- Add password_hash column to users table (if not exists via migration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  replaced_by_token UUID NULL
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx ON auth_refresh_tokens(family);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_token_hash_idx ON auth_refresh_tokens(token_hash);