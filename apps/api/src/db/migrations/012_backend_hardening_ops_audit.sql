CREATE TABLE IF NOT EXISTS domain_audit_events (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  request_id TEXT,
  trace_id TEXT,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS domain_audit_events_tenant_created_idx
  ON domain_audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS domain_audit_events_entity_idx
  ON domain_audit_events (entity_type, entity_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'domain_audit_events_source_check'
  ) THEN
    ALTER TABLE domain_audit_events
      ADD CONSTRAINT domain_audit_events_source_check
      CHECK (source IN ('api', 'assistant'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'outbox_events_status_check'
  ) THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_status_check
      CHECK (status IN ('pending', 'processed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS outbox_events_status_created_idx
  ON outbox_events (status, created_at ASC);

CREATE INDEX IF NOT EXISTS job_attempts_outbox_attempt_desc_idx
  ON job_attempts (outbox_event_id, attempt_number DESC);
