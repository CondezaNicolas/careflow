import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { hash } from "bcrypt";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://lia:lia@localhost:5433/lia_clinic";

  console.log("🌱 Running database seed...");
  console.log("📦 Database:", databaseUrl);

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
    console.log("✅ Admin user created: admin@lia.local / Admin123!");

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
    console.log("✅ Clinician user created: clinician@lia.local / Clinician123!");

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
    console.log("✅ Receptionist user created: receptionist@lia.local / Receptionist123!");

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
    console.log("✅ Patient user created: patient@lia.local / Patient123!");

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Test users:");
    console.log("   admin@lia.local / Admin123! (role: admin)");
    console.log("   clinician@lia.local / Clinician123! (role: clinician)");
    console.log("   receptionist@lia.local / Receptionist123! (role: receptionist)");
    console.log("   patient@lia.local / Patient123! (role: patient)");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
