import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidEnvironmentError, parseEnv, resolveRuntimeMode } from "./env.js";

const BASE_ENV = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://lia:lia@localhost:5432/lia_clinic",
  SESSION_SECRET: "dev-session-secret-please-override-in-production-32ch!"
} as const;

describe("env parsing", () => {
  it("allows local defaults outside production", () => {
    const env = parseEnv({ ...BASE_ENV });

    assert.equal(env.JWT_SECRET, "dev-jwt-secret-please-override-in-production-32ch!");
    assert.equal(resolveRuntimeMode(env.NODE_ENV), "local");
  });

  it("rejects production startup with default secrets", () => {
    assert.throws(
      () =>
        parseEnv({
          ...BASE_ENV,
          NODE_ENV: "production"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidEnvironmentError);
        assert.deepEqual(error.issues.map((issue) => issue.key).sort(), [
          "JWT_REFRESH_SECRET",
          "JWT_SECRET",
          "SESSION_SECRET"
        ]);
        return true;
      }
    );
  });

  it("rejects invalid allowed origins", () => {
    assert.throws(
      () =>
        parseEnv({
          ...BASE_ENV,
          ALLOWED_ORIGINS: "http://localhost:3310,notaurl"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidEnvironmentError);
        assert.equal(error.issues[0]?.key, "ALLOWED_ORIGINS");
        return true;
      }
    );
  });

  it("applies the default shutdown grace period", () => {
    const env = parseEnv({ ...BASE_ENV });

    assert.equal(env.SHUTDOWN_GRACE_PERIOD_MS, 10_000);
  });
});
