import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_TABLE = "schema_migrations";
// Resolve from project root, not from cwd (which is apps/api when run via -w)
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const MIGRATIONS_DIR = join(PROJECT_ROOT, "apps/api/src/db/migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://lia:lia@localhost:5433/lia_clinic";

  console.log("🔄 Running migrations...");
  console.log("📦 Database:", databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Ensure schema_migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✅ schema_migrations table ready");

    // Get all migration files sorted
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log(`📋 Found ${files.length} migration files`);

    let executed = 0;
    let skipped = 0;

    for (const file of files) {
      // Check if already executed
      const result = await pool.query(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE version = $1`, [
        file
      ]);

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping already executed: ${file}`);
        skipped++;
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, "utf-8");

      console.log(`⬆️  Running: ${file}`);
      await pool.query(sql);

      // Record migration
      await pool.query(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1)`, [file]);

      console.log(`✅ Done: ${file}`);
      executed++;
    }

    console.log(`\n🎉 Migrations complete! Executed: ${executed}, Skipped: ${skipped}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
