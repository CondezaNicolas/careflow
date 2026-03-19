import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/lia_clinic";
  
  console.log("🔄 Running migrations...");
  console.log("📦 Database:", databaseUrl);
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    // Get all migration files
    const migrationsDir = join(process.cwd(), "apps/api/src/db/migrations");
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    
    console.log(`📋 Found ${files.length} migration files`);
    
    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, "utf-8");
      
      console.log(`⬆️  Running: ${file}`);
      await pool.query(sql);
      console.log(`✅ Done: ${file}`);
    }
    
    console.log("\n🎉 All migrations completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
