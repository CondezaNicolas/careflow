import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InvalidWorkerEnvironmentError,
  parseWorkerEnv,
  resolveWorkerRuntimeConfig,
  resolveWorkerRuntimeMode
} from "./env.js";

const BASE_ENV = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://lia:lia@localhost:5432/lia_clinic",
  GOOGLE_CALENDAR_PROVIDER_MODE: "noop",
  EMAIL_PROVIDER_MODE: "noop",
  WHATSAPP_PROVIDER_MODE: "noop"
} as const;

describe("worker env parsing", () => {
  it("applies runtime and retry defaults for explicit noop mode", () => {
    const env = parseWorkerEnv({ ...BASE_ENV });
    const runtimeConfig = resolveWorkerRuntimeConfig(env);

    assert.equal(resolveWorkerRuntimeMode(env.NODE_ENV), "local");
    assert.equal(env.WORKER_POLL_INTERVAL_MS, 30_000);
    assert.equal(env.WORKER_SHUTDOWN_GRACE_PERIOD_MS, 10_000);
    assert.equal(env.GOOGLE_CALENDAR_MAX_RETRIES, 5);
    assert.equal(env.GOOGLE_CALENDAR_BACKOFF_SECONDS, 30);
    assert.equal(env.NOTIFICATIONS_MAX_RETRIES, 4);
    assert.equal(env.NOTIFICATIONS_BACKOFF_SECONDS, 45);
    assert.deepEqual(runtimeConfig.providerModes, {
      googleCalendar: "noop",
      email: "noop",
      whatsapp: "noop"
    });
  });

  it("rejects invalid infrastructure protocols outside tests", () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          ...BASE_ENV,
          DATABASE_URL: "mysql://lia:lia@localhost:3306/lia_clinic"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidWorkerEnvironmentError);
        assert.deepEqual(error.issues.map((issue) => issue.key).sort(), ["DATABASE_URL"]);
        return true;
      }
    );
  });

  it("ignores REDIS_URL because worker runtime does not use Redis", () => {
    const env = parseWorkerEnv({
      ...BASE_ENV,
      REDIS_URL: "http://not-used-by-worker.invalid"
    });

    assert.equal(env.DATABASE_URL, BASE_ENV.DATABASE_URL);
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

  it("rejects noop providers in production", () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          ...BASE_ENV,
          NODE_ENV: "production"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidWorkerEnvironmentError);
        assert.deepEqual(error.issues.map((issue) => issue.key).sort(), [
          "EMAIL_PROVIDER_MODE",
          "GOOGLE_CALENDAR_PROVIDER_MODE",
          "WHATSAPP_PROVIDER_MODE"
        ]);
        return true;
      }
    );
  });

  it("requires provider credentials when provider mode is enabled", () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          ...BASE_ENV,
          GOOGLE_CALENDAR_PROVIDER_MODE: "provider"
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidWorkerEnvironmentError);
        assert.deepEqual(error.issues.map((issue) => issue.key).sort(), [
          "GOOGLE_CALENDAR_CALENDAR_ID",
          "GOOGLE_CALENDAR_CLIENT_ID",
          "GOOGLE_CALENDAR_CLIENT_SECRET",
          "GOOGLE_CALENDAR_REFRESH_TOKEN"
        ]);
        return true;
      }
    );
  });

  it("allows explicit noop only outside production", () => {
    const env = parseWorkerEnv({
      ...BASE_ENV,
      NODE_ENV: "test"
    });

    assert.equal(resolveWorkerRuntimeMode(env.NODE_ENV), "test");
    assert.equal(env.GOOGLE_CALENDAR_PROVIDER_MODE, "noop");
    assert.equal(env.EMAIL_PROVIDER_MODE, "noop");
    assert.equal(env.WHATSAPP_PROVIDER_MODE, "noop");
  });

  it("accepts production provider mode when all provider credentials are present", () => {
    const env = parseWorkerEnv({
      ...BASE_ENV,
      NODE_ENV: "production",
      GOOGLE_CALENDAR_PROVIDER_MODE: "provider",
      EMAIL_PROVIDER_MODE: "provider",
      WHATSAPP_PROVIDER_MODE: "provider",
      GOOGLE_CALENDAR_CLIENT_ID: "client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
      GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
      GOOGLE_CALENDAR_CALENDAR_ID: "calendar-id",
      EMAIL_PROVIDER_API_KEY: "email-api-key",
      EMAIL_PROVIDER_FROM: "ops@example.com",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "123456",
      WHATSAPP_BUSINESS_ACCOUNT_ID: "654321"
    });

    const runtimeConfig = resolveWorkerRuntimeConfig(env);

    assert.equal(resolveWorkerRuntimeMode(env.NODE_ENV), "production");
    assert.deepEqual(runtimeConfig.providerModes, {
      googleCalendar: "provider",
      email: "provider",
      whatsapp: "provider"
    });
  });
});
