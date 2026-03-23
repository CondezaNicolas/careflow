import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3310;
const HOST = "127.0.0.1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`;
const API_URL = process.env.PLAYWRIGHT_API_URL ?? BASE_URL;
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: {
    command: `npx next dev --hostname ${HOST} --port ${PORT}`,
    cwd: PROJECT_ROOT,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    url: BASE_URL,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXT_PUBLIC_DEV_LOGIN_ENABLED: "true"
    }
  }
});
