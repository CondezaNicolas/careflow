-- Roles
INSERT INTO roles (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'clinician'),
  ('00000000-0000-0000-0000-000000000003', 'receptionist'),
  ('00000000-0000-0000-0000-000000000004', 'patient')
ON CONFLICT (name) DO NOTHING;

-- Demo tenant
INSERT INTO tenants (id, slug, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'tenant-demo', 'Demo Clinic')
ON CONFLICT (slug) DO NOTHING;

-- Dev tenant (used by dev-login in AuthService - note: tenant_id in sessions is TEXT)
INSERT INTO tenants (id, slug, name) VALUES
  ('20000000-0000-0000-0000-000000000099', 'dev-tenant', 'Development Clinic')
ON CONFLICT (slug) DO NOTHING;

-- Note: dev users are NOT inserted into users table because createDevSession()
-- bypasses the users table and writes directly to auth_principal_sessions
-- The session store uses hardcoded strings like 'dev-admin-user' as userId

-- Demo users
INSERT INTO users (id, tenant_id, role_id, email, password_hash, updated_at) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@demo.local',
    '$2b$12$ie73kCS58kg7v5JOAR8SWeY/1z5YV.huy3Ha0Oxel18NTwl/tsh2K',
    NOW()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'clinician@demo.local',
    '$2b$12$lXsPSPNuZAJhU/dA3OCA1u1UweASsm5CHgLdt3BUyz2sJKBNI/qAG',
    NOW()
  )
ON CONFLICT (tenant_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    updated_at = EXCLUDED.updated_at;
