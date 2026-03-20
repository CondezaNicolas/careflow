ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE users
SET email = LOWER(BTRIM(email)),
    updated_at = COALESCE(updated_at, NOW())
WHERE email <> LOWER(BTRIM(email))
   OR updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_id_tenant_idx ON users (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_idx ON users ((LOWER(email)));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_email_normalized_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_normalized_check
      CHECK (email = LOWER(BTRIM(email)));
  END IF;
END $$;

ALTER TABLE auth_refresh_tokens
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE auth_refresh_tokens tokens
SET tenant_id = users.tenant_id
FROM users
WHERE tokens.user_id = users.id
  AND tokens.tenant_id IS NULL;

ALTER TABLE auth_refresh_tokens
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_refresh_tokens_tenant_fk'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD CONSTRAINT auth_refresh_tokens_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_refresh_tokens_user_tenant_fk'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD CONSTRAINT auth_refresh_tokens_user_tenant_fk
      FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_refresh_tokens_replaced_by_token_fk'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD CONSTRAINT auth_refresh_tokens_replaced_by_token_fk
      FOREIGN KEY (replaced_by_token) REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_refresh_tokens_expiry_check'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD CONSTRAINT auth_refresh_tokens_expiry_check
      CHECK (expires_at > created_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_tenant_user_active_idx
  ON auth_refresh_tokens (tenant_id, user_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_tenant_family_active_idx
  ON auth_refresh_tokens (tenant_id, family, created_at DESC)
  WHERE revoked_at IS NULL;
