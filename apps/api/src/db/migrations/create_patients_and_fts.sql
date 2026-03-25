-- Migration: Create patients table and add FTS support
-- Description: Creates patients table and adds full-text search capability to users, patients, appointments, and audit events

-- ============================================
-- 1. Create patients table
-- ============================================
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS patients_tenant_id_idx
  ON patients (tenant_id);

-- ============================================
-- 2. Add FTS columns to existing tables
-- ============================================

-- Add search_vector to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE users ADD COLUMN search_vector TSVECTOR;
  END IF;
END $$;

-- Add search_vector to patients table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE patients ADD COLUMN search_vector TSVECTOR;
  END IF;
END $$;

-- Add search_vector to scheduling_appointments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'scheduling_appointments' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE scheduling_appointments ADD COLUMN search_vector TSVECTOR;
  END IF;
END $$;

-- Add search_vector to domain_audit_events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'domain_audit_events' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE domain_audit_events ADD COLUMN search_vector TSVECTOR;
  END IF;
END $$;

-- ============================================
-- 3. Create GIN indexes on search_vector columns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_search
  ON users USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_patients_search
  ON patients USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_scheduling_appointments_search
  ON scheduling_appointments USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_domain_audit_events_search
  ON domain_audit_events USING GIN (search_vector);

-- ============================================
-- 4. Create trigger function for search vector updates
-- ============================================
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  -- Dynamic update based on column names passed as parameters
  -- The trigger will call this with appropriate column concatenation
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.search_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Create triggers for each table
-- ============================================

-- Users table triggers (email is searchable)
CREATE OR REPLACE FUNCTION trigger_users_search_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_search_insert ON users;
CREATE TRIGGER trigger_users_search_insert
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_users_search_update();

DROP TRIGGER IF EXISTS trigger_users_search_update ON users;
CREATE TRIGGER trigger_users_search_update
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_users_search_update();

-- Patients table triggers (first_name, last_name, email are searchable)
CREATE OR REPLACE FUNCTION trigger_patients_search_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.first_name, '') || ' ' ||
    COALESCE(NEW.last_name, '') || ' ' ||
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_patients_search_insert ON patients;
CREATE TRIGGER trigger_patients_search_insert
  BEFORE INSERT ON patients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_patients_search_update();

DROP TRIGGER IF EXISTS trigger_patients_search_update ON patients;
CREATE TRIGGER trigger_patients_search_update
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_patients_search_update();

-- Scheduling appointments table triggers (patient_id, specialist_id are searchable)
CREATE OR REPLACE FUNCTION trigger_scheduling_appointments_search_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.patient_id::text, '') || ' ' ||
    COALESCE(NEW.specialist_id::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scheduling_appointments_search_insert ON scheduling_appointments;
CREATE TRIGGER trigger_scheduling_appointments_search_insert
  BEFORE INSERT ON scheduling_appointments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_scheduling_appointments_search_update();

DROP TRIGGER IF EXISTS trigger_scheduling_appointments_search_update ON scheduling_appointments;
CREATE TRIGGER trigger_scheduling_appointments_search_update
  BEFORE UPDATE ON scheduling_appointments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_scheduling_appointments_search_update();

-- Domain audit events table triggers (action, entity_type, metadata_json are searchable)
CREATE OR REPLACE FUNCTION trigger_domain_audit_events_search_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.action, '') || ' ' ||
    COALESCE(NEW.entity_type, '') || ' ' ||
    COALESCE(NEW.metadata_json::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_domain_audit_events_search_insert ON domain_audit_events;
CREATE TRIGGER trigger_domain_audit_events_search_insert
  BEFORE INSERT ON domain_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_domain_audit_events_search_update();

DROP TRIGGER IF EXISTS trigger_domain_audit_events_search_update ON domain_audit_events;
CREATE TRIGGER trigger_domain_audit_events_search_update
  BEFORE UPDATE ON domain_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_domain_audit_events_search_update();

-- ============================================
-- DOWN Migration (Rollback)
-- ============================================

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_users_search_insert ON users;
DROP TRIGGER IF EXISTS trigger_users_search_update ON users;
DROP TRIGGER IF EXISTS trigger_patients_search_insert ON patients;
DROP TRIGGER IF EXISTS trigger_patients_search_update ON patients;
DROP TRIGGER IF EXISTS trigger_scheduling_appointments_search_insert ON scheduling_appointments;
DROP TRIGGER IF EXISTS trigger_scheduling_appointments_search_update ON scheduling_appointments;
DROP TRIGGER IF EXISTS trigger_domain_audit_events_search_insert ON domain_audit_events;
DROP TRIGGER IF EXISTS trigger_domain_audit_events_search_update ON domain_audit_events;

-- Drop GIN indexes
DROP INDEX IF EXISTS idx_users_search;
DROP INDEX IF EXISTS idx_patients_search;
DROP INDEX IF EXISTS idx_scheduling_appointments_search;
DROP INDEX IF EXISTS idx_domain_audit_events_search;

-- Drop search_vector columns
ALTER TABLE users DROP COLUMN IF EXISTS search_vector;
ALTER TABLE patients DROP COLUMN IF EXISTS search_vector;
ALTER TABLE scheduling_appointments DROP COLUMN IF EXISTS search_vector;
ALTER TABLE domain_audit_events DROP COLUMN IF EXISTS search_vector;

-- Drop trigger functions
DROP FUNCTION IF EXISTS trigger_users_search_update() CASCADE;
DROP FUNCTION IF EXISTS trigger_patients_search_update() CASCADE;
DROP FUNCTION IF EXISTS trigger_scheduling_appointments_search_update() CASCADE;
DROP FUNCTION IF EXISTS trigger_domain_audit_events_search_update() CASCADE;

-- Drop patients table
DROP TABLE IF EXISTS patients CASCADE;
