CREATE TABLE IF NOT EXISTS clinical_encounters (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  author_professional_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR started_at <= ended_at)
);

CREATE INDEX IF NOT EXISTS clinical_encounters_tenant_patient_started_idx
  ON clinical_encounters (tenant_id, patient_id, started_at DESC);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  encounter_id UUID NOT NULL REFERENCES clinical_encounters(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  author_professional_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  subjective TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  vitals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  medications_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  antecedentes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinical_notes_tenant_patient_created_idx
  ON clinical_notes (tenant_id, patient_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinical_notes_visibility_check'
  ) THEN
    ALTER TABLE clinical_notes
      ADD CONSTRAINT clinical_notes_visibility_check
      CHECK (visibility IN ('internal', 'patient_shared'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS clinical_note_attachments (
  note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS clinical_note_attachments_tenant_note_idx
  ON clinical_note_attachments (tenant_id, note_id);
