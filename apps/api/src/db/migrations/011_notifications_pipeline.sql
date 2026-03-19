DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'outbox_events'
      AND column_name = 'tenant_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE outbox_events
      ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_recipients (
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  email TEXT,
  whatsapp_phone TEXT,
  email_consent BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_consent BOOLEAN NOT NULL DEFAULT FALSE,
  appointment_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  exam_ready_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  exam_delivered_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, patient_id)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY,
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  provider_message_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outbox_event_id, channel)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_deliveries_channel_check'
  ) THEN
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_channel_check
      CHECK (channel IN ('email', 'whatsapp'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_deliveries_status_check'
  ) THEN
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_status_check
      CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id UUID PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_outbox_status_idx
  ON notification_deliveries (outbox_event_id, status);

CREATE INDEX IF NOT EXISTS notification_deliveries_retry_idx
  ON notification_deliveries (tenant_id, status, next_retry_at);

CREATE INDEX IF NOT EXISTS notification_attempts_delivery_idx
  ON notification_delivery_attempts (delivery_id, attempt_number DESC);
