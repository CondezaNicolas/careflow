import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const migrationDir = resolve("src/db/migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

  if (files.length < 3) {
    throw new Error("Expected at least three migration files for B0/B1");
  }

  if (!files[0]?.startsWith("001") || !files[1]?.startsWith("002")) {
    throw new Error("Migrations must start with 001 and 002 baseline files");
  }

  console.log("migration check passed", files.length);
}

void main();
