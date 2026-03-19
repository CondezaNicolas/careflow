CREATE TABLE IF NOT EXISTS assistant_tool_audit_logs (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  is_write_action BOOLEAN NOT NULL,
  confirmation_required BOOLEAN NOT NULL,
  confirmation_provided BOOLEAN NOT NULL,
  confirmation_token TEXT,
  outcome TEXT NOT NULL,
  request_json JSONB NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assistant_tool_audit_logs_tenant_created_idx
  ON assistant_tool_audit_logs (tenant_id, created_at DESC);
