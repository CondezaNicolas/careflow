import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidWorkerEnvironmentError, parseWorkerEnv } from "./env.js";

const BASE_ENV = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://lia:lia@localhost:5432/lia_clinic",
  REDIS_URL: "redis://localhost:6379"
} as const;

describe("worker env parsing", () => {
  it("applies retry/backoff defaults", () => {
    const env = parseWorkerEnv({ ...BASE_ENV });

    assert.equal(env.GOOGLE_CALENDAR_MAX_RETRIES, 5);
    assert.equal(env.GOOGLE_CALENDAR_BACKOFF_SECONDS, 30);
    assert.equal(env.NOTIFICATIONS_MAX_RETRIES, 4);
    assert.equal(env.NOTIFICATIONS_BACKOFF_SECONDS, 45);
  });

  it("rejects invalid infrastructure protocols outside tests", () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          ...BASE_ENV,
          DATABASE_URL: "mysql://lia:lia@localhost:3306/lia_clinic",
          REDIS_URL: "http://localhost:6379"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidWorkerEnvironmentError);
        assert.deepEqual(error.issues.map((issue) => issue.key).sort(), [
          "DATABASE_URL",
          "REDIS_URL"
        ]);
        return true;
      }
    );
  });

  it("rejects excessive retry budgets", () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          ...BASE_ENV,
          GOOGLE_CALENDAR_MAX_RETRIES: "11"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidWorkerEnvironmentError);
        assert.equal(error.issues[0]?.key, "GOOGLE_CALENDAR_MAX_RETRIES");
        return true;
      }
    );
  });
});
