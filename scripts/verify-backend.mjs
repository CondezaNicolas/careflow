import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const backendChecks = [
  "run typecheck -w @lia/api",
  "run test -w @lia/api",
  "run migration:check -w @lia/api",
  "run contract:lint",
  "run typecheck -w @lia/worker",
  "run test -w @lia/worker"
];

if (!process.env.DATABASE_URL) {
  console.error("verify:backend requires DATABASE_URL to be set");
  process.exit(1);
}

for (const commandArgs of backendChecks) {
  const args = commandArgs.split(" ");
  const label = `npm ${commandArgs}`;

  console.log(`\n==> ${label}`);
  const result = spawnSync(npmCommand, args, {
    stdio: "inherit",
    env: process.env,
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nBackend verification passed");
