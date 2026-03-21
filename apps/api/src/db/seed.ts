import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { hash } from "bcrypt";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://lia:lia@localhost:5433/lia_clinic";

  console.log("🌱 Running database seed...");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Run base seed (roles, tenants, demo users)
    const seedPath = join(process.cwd(), "src/db/seed.sql");
    const sql = readFileSync(seedPath, "utf-8");
    await pool.query(sql);
    console.log("✅ Base seed completed");

    // Create admin user with hashed password
    const adminPassword = await hash("Admin123!", 12);
    const adminId = "30000000-0000-0000-0000-000000000001";
    const devTenantId = "20000000-0000-0000-0000-000000000099";
    const adminRoleId = "00000000-0000-0000-0000-000000000001";

    // Insert admin user (upsert)
    await pool.query(
      `INSERT INTO users (id, tenant_id, role_id, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = $5`,
      [adminId, devTenantId, adminRoleId, "admin@lia.local", adminPassword]
    );
    // Create clinician user
    const clinicianPassword = await hash("Clinician123!", 12);
    const clinicianId = "30000000-0000-0000-0000-000000000002";

    await pool.query(
      `INSERT INTO users (id, tenant_id, role_id, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = $5`,
      [
        clinicianId,
        devTenantId,
        "00000000-0000-0000-0000-000000000002",
        "clinician@lia.local",
        clinicianPassword
      ]
    );
    // Create receptionist user
    const receptionistPassword = await hash("Receptionist123!", 12);
    const receptionistId = "30000000-0000-0000-0000-000000000003";

    await pool.query(
      `INSERT INTO users (id, tenant_id, role_id, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = $5`,
      [
        receptionistId,
        devTenantId,
        "00000000-0000-0000-0000-000000000003",
        "receptionist@lia.local",
        receptionistPassword
      ]
    );
    // Create patient user
    const patientPassword = await hash("Patient123!", 12);
    const patientId = "30000000-0000-0000-0000-000000000004";

    await pool.query(
      `INSERT INTO users (id, tenant_id, role_id, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = $5`,
      [
        patientId,
        devTenantId,
        "00000000-0000-0000-0000-000000000004",
        "patient@lia.local",
        patientPassword
      ]
    );
    console.log("✅ Demo users seeded successfully");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
