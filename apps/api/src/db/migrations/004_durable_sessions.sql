CREATE TABLE IF NOT EXISTS auth_principal_sessions (
  session_id UUID PRIMARY KEY,
  user_subject TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_principal_sessions_tenant_idx ON auth_principal_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS auth_principal_sessions_expires_idx ON auth_principal_sessions (expires_at);
