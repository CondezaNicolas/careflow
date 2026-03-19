CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduling_appointments_no_overlap'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD CONSTRAINT scheduling_appointments_no_overlap
      EXCLUDE USING gist (
        tenant_id WITH =,
        specialist_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (status = 'scheduled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduling_appointments_status_check'
  ) THEN
    ALTER TABLE scheduling_appointments
      ADD CONSTRAINT scheduling_appointments_status_check
      CHECK (status IN ('scheduled', 'canceled'));
  END IF;
END $$;
