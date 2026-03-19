CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_attempts (
  id UUID PRIMARY KEY,
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id),
  attempt_number INT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_dead_letters (
  id UUID PRIMARY KEY,
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id),
  reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
