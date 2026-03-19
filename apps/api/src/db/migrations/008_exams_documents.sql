CREATE TABLE IF NOT EXISTS clinical_exams (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  requested_by_professional_id TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinical_exams_tenant_patient_created_idx
  ON clinical_exams (tenant_id, patient_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinical_exams_status_check'
  ) THEN
    ALTER TABLE clinical_exams
      ADD CONSTRAINT clinical_exams_status_check
      CHECK (status IN ('pending', 'ready', 'delivered'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinical_exams_status_timestamps_check'
  ) THEN
    ALTER TABLE clinical_exams
      ADD CONSTRAINT clinical_exams_status_timestamps_check
      CHECK (
        (ready_at IS NULL OR status IN ('ready', 'delivered'))
        AND (delivered_at IS NULL OR status = 'delivered')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS clinical_exam_attachments (
  exam_id UUID NOT NULL REFERENCES clinical_exams(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS clinical_exam_attachments_tenant_exam_idx
  ON clinical_exam_attachments (tenant_id, exam_id);
