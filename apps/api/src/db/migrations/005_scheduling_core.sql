CREATE TABLE IF NOT EXISTS scheduling_availability_windows (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  specialist_id TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS scheduling_availability_tenant_specialist_idx
  ON scheduling_availability_windows (tenant_id, specialist_id, start_at);

CREATE TABLE IF NOT EXISTS scheduling_appointments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  specialist_id TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS scheduling_appointments_tenant_specialist_idx
  ON scheduling_appointments (tenant_id, specialist_id, start_at);

CREATE TABLE IF NOT EXISTS scheduling_idempotency_keys (
  tenant_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, operation, idempotency_key)
);
