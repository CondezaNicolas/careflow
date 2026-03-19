DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'external_calendar_event_id'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN external_calendar_event_id TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_sync_status'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_sync_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_sync_attempts'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_sync_attempts INT NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_last_error'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_last_error TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_last_attempt_at'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_last_attempt_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_next_retry_at'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_next_retry_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_last_synced_at'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_last_synced_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments'
      AND column_name = 'calendar_sync_updated_at'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD COLUMN calendar_sync_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduling_appointments_calendar_sync_status_check'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD CONSTRAINT scheduling_appointments_calendar_sync_status_check
      CHECK (calendar_sync_status IN ('pending', 'synced', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scheduling_appointments_calendar_sync_retry_idx
  ON scheduling_appointments (tenant_id, calendar_sync_status, calendar_next_retry_at);
