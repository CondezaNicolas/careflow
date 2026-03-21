import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { Client, Pool } from "pg";

import { WORKER_PROVIDER_MODE } from "./env.js";
import {
  GoogleCalendarOutboxWorker,
  NotificationOutboxWorker,
  RetryableNotificationError,
  RetryableSyncError,
  getWorkerMetricsSnapshot,
  resetWorkerMetricsSnapshot
} from "./main.js";
import {
  WORKER_WAIT_OUTCOME,
  createWorkerRuntime,
  createWorkerShutdownController,
  runWorkerLoop
} from "./runtime.js";

const TEST_TENANT = "00000000-0000-4000-8000-000000000001";
const TEST_APPOINTMENT = "11111111-1111-4111-8111-111111111111";
const TEST_OUTBOX = "22222222-2222-4222-8222-222222222222";
const TEST_NOTIFICATION_OUTBOX = "33333333-3333-4333-8333-333333333333";
const TEST_NOTIFICATION_OUTBOX_SECOND = "44444444-4444-4444-8444-444444444444";

describe("google calendar outbox worker", () => {
  let pool: Pool;

  before(async () => {
    ensureTestEnv();
    process.env.DATABASE_URL = await prepareTestDatabaseUrl(process.env.DATABASE_URL!);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await applyApiMigrations(pool);
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    resetWorkerMetricsSnapshot();
    await pool.query(
      "TRUNCATE notification_delivery_attempts, notification_deliveries, notification_recipients, outbox_dead_letters, job_attempts, outbox_events, scheduling_idempotency_keys, scheduling_appointments, scheduling_availability_windows RESTART IDENTITY"
    );
    await pool.query(
      `
        INSERT INTO scheduling_appointments (
          id,
          tenant_id,
          patient_id,
          specialist_id,
          start_at,
          end_at,
          status,
          canceled_at,
          external_calendar_event_id,
          calendar_sync_status,
          calendar_sync_attempts,
          calendar_last_error,
          calendar_last_attempt_at,
          calendar_next_retry_at,
          calendar_last_synced_at,
          calendar_sync_updated_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          'pt-1',
          'usr-1',
          '2026-04-01T10:00:00.000Z'::timestamptz,
          '2026-04-01T10:30:00.000Z'::timestamptz,
          'scheduled',
          NULL,
          NULL,
          'pending',
          0,
          NULL,
          NULL,
          NOW(),
          NULL,
          NOW(),
          NOW(),
          NOW()
        )
      `,
      [TEST_APPOINTMENT, TEST_TENANT]
    );
    await pool.query(
      `
        INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES (
          $1,
          $2,
          'appointment',
          $3,
          'scheduling.appointment.google-calendar.sync.requested',
          $4::jsonb,
          'pending'
        )
      `,
      [
        TEST_OUTBOX,
        TEST_TENANT,
        TEST_APPOINTMENT,
        JSON.stringify({
          tenantId: TEST_TENANT,
          appointmentId: TEST_APPOINTMENT,
          action: "create",
          triggeredAtIso: new Date().toISOString()
        })
      ]
    );
  });

  it("retries transient failures and eventually marks appointment as synced", async () => {
    let attempts = 0;
    const worker = new GoogleCalendarOutboxWorker(
      pool,
      {
        async upsertAppointmentEvent() {
          attempts += 1;
          if (attempts === 1) {
            throw new RetryableSyncError("temporary calendar timeout");
          }

          return { externalCalendarEventId: "gcal-event-1" };
        },
        async cancelAppointmentEvent() {
          return { externalCalendarEventId: null };
        }
      },
      {
        maxRetries: 3,
        backoffSeconds: 0
      }
    );

    const firstRun = await worker.processPending(10);
    assert.equal(firstRun.processed, 1);
    assert.equal(firstRun.retried, 1);

    const afterRetry = await pool.query<{
      calendar_sync_status: string;
      calendar_sync_attempts: number;
      calendar_last_error: string | null;
    }>(
      `
        SELECT calendar_sync_status, calendar_sync_attempts, calendar_last_error
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND id = $2
      `,
      [TEST_TENANT, TEST_APPOINTMENT]
    );

    assert.equal(afterRetry.rows[0]?.calendar_sync_status, "pending");
    assert.equal(afterRetry.rows[0]?.calendar_sync_attempts, 1);
    assert.equal(afterRetry.rows[0]?.calendar_last_error, "temporary calendar timeout");

    const secondRun = await worker.processPending(10);
    assert.equal(secondRun.processed, 1);
    assert.equal(secondRun.synced, 1);

    const afterSync = await pool.query<{
      calendar_sync_status: string;
      calendar_sync_attempts: number;
      external_calendar_event_id: string | null;
    }>(
      `
        SELECT calendar_sync_status, calendar_sync_attempts, external_calendar_event_id
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND id = $2
      `,
      [TEST_TENANT, TEST_APPOINTMENT]
    );

    assert.equal(afterSync.rows[0]?.calendar_sync_status, "synced");
    assert.equal(afterSync.rows[0]?.calendar_sync_attempts, 2);
    assert.equal(afterSync.rows[0]?.external_calendar_event_id, "gcal-event-1");

    const eventStatus = await pool.query<{ status: string }>(
      "SELECT status FROM outbox_events WHERE id = $1",
      [TEST_OUTBOX]
    );
    assert.equal(eventStatus.rows[0]?.status, "processed");

    const metrics = getWorkerMetricsSnapshot();
    assert.equal(metrics.runsTotal, 2);
    assert.equal(metrics.totalsByPipeline.google_calendar.processed, 2);
  });

  it("marks sync as failed and dead-letters event on non-retryable errors", async () => {
    const worker = new GoogleCalendarOutboxWorker(
      pool,
      {
        async upsertAppointmentEvent() {
          throw new Error("invalid google credentials");
        },
        async cancelAppointmentEvent() {
          return { externalCalendarEventId: null };
        }
      },
      {
        maxRetries: 3,
        backoffSeconds: 0
      }
    );

    const run = await worker.processPending(10);
    assert.equal(run.failed, 1);

    const appointment = await pool.query<{
      calendar_sync_status: string;
      calendar_sync_attempts: number;
      calendar_last_error: string | null;
    }>(
      `
        SELECT calendar_sync_status, calendar_sync_attempts, calendar_last_error
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND id = $2
      `,
      [TEST_TENANT, TEST_APPOINTMENT]
    );
    assert.equal(appointment.rows[0]?.calendar_sync_status, "failed");
    assert.equal(appointment.rows[0]?.calendar_sync_attempts, 1);
    assert.equal(appointment.rows[0]?.calendar_last_error, "invalid google credentials");

    const deadLetters = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM outbox_dead_letters WHERE outbox_event_id = $1",
      [TEST_OUTBOX]
    );
    assert.equal(deadLetters.rows[0]?.count, "1");
  });

  it("dispatches appointment lifecycle notifications and records delivery states", async () => {
    await pool.query(
      `
        INSERT INTO notification_recipients (
          tenant_id,
          patient_id,
          email,
          whatsapp_phone,
          email_consent,
          whatsapp_consent,
          appointment_notifications_enabled,
          exam_ready_notifications_enabled,
          exam_delivered_notifications_enabled
        )
        VALUES ($1, 'pt-1', 'patient@example.com', '+5491111111111', true, true, true, false, true)
      `,
      [TEST_TENANT]
    );
    await pool.query(
      `
        INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES (
          $1,
          $2,
          'notification',
          $3,
          'notifications.appointment.lifecycle.dispatch.requested',
          $4::jsonb,
          'pending'
        )
      `,
      [
        TEST_NOTIFICATION_OUTBOX,
        TEST_TENANT,
        TEST_APPOINTMENT,
        JSON.stringify({
          tenantId: TEST_TENANT,
          patientId: "pt-1",
          appointmentId: TEST_APPOINTMENT,
          action: "create",
          triggeredAtIso: new Date().toISOString()
        })
      ]
    );

    const worker = new NotificationOutboxWorker(
      pool,
      {
        async sendEmail() {
          return { providerMessageId: "email-msg-1" };
        },
        async sendWhatsApp() {
          return { providerMessageId: "wa-msg-1" };
        }
      },
      {
        maxRetries: 3,
        backoffSeconds: 0
      }
    );

    const result = await worker.processPending(10);
    assert.equal(result.processed, 1);
    assert.equal(result.synced, 1);

    const deliveries = await pool.query<{
      channel: string;
      status: string;
      attempts: number;
      provider_message_id: string | null;
    }>(
      `
        SELECT channel, status, attempts, provider_message_id
        FROM notification_deliveries
        WHERE outbox_event_id = $1
        ORDER BY channel ASC
      `,
      [TEST_NOTIFICATION_OUTBOX]
    );

    assert.equal(deliveries.rows.length, 2);
    assert.equal(deliveries.rows[0]?.channel, "email");
    assert.equal(deliveries.rows[0]?.status, "sent");
    assert.equal(deliveries.rows[0]?.provider_message_id, "email-msg-1");
    assert.equal(deliveries.rows[1]?.channel, "whatsapp");
    assert.equal(deliveries.rows[1]?.status, "sent");
    assert.equal(deliveries.rows[1]?.provider_message_id, "wa-msg-1");
  });

  it("retries notification delivery with backoff and dead-letters terminal failures", async () => {
    await pool.query(
      `
        INSERT INTO notification_recipients (
          tenant_id,
          patient_id,
          email,
          whatsapp_phone,
          email_consent,
          whatsapp_consent,
          appointment_notifications_enabled,
          exam_ready_notifications_enabled,
          exam_delivered_notifications_enabled
        )
        VALUES ($1, 'pt-1', 'patient@example.com', NULL, true, false, true, false, true)
      `,
      [TEST_TENANT]
    );
    await pool.query(
      `
        INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES (
          $1,
          $2,
          'notification',
          $3,
          'notifications.appointment.lifecycle.dispatch.requested',
          $4::jsonb,
          'pending'
        )
      `,
      [
        TEST_NOTIFICATION_OUTBOX_SECOND,
        TEST_TENANT,
        TEST_APPOINTMENT,
        JSON.stringify({
          tenantId: TEST_TENANT,
          patientId: "pt-1",
          appointmentId: TEST_APPOINTMENT,
          action: "cancel",
          triggeredAtIso: new Date().toISOString()
        })
      ]
    );

    let attempts = 0;
    const worker = new NotificationOutboxWorker(
      pool,
      {
        async sendEmail() {
          attempts += 1;
          if (attempts === 1) {
            throw new RetryableNotificationError("temporary smtp timeout");
          }

          throw new Error("invalid template configuration");
        },
        async sendWhatsApp() {
          return { providerMessageId: "unused" };
        }
      },
      {
        maxRetries: 3,
        backoffSeconds: 0
      }
    );

    const firstRun = await worker.processPending(10);
    assert.equal(firstRun.processed, 1);
    assert.equal(firstRun.retried, 1);

    const secondRun = await worker.processPending(10);
    assert.equal(secondRun.failed, 1);

    const outbox = await pool.query<{ status: string }>(
      "SELECT status FROM outbox_events WHERE id = $1",
      [TEST_NOTIFICATION_OUTBOX_SECOND]
    );
    assert.equal(outbox.rows[0]?.status, "failed");

    const attemptsStored = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM notification_delivery_attempts WHERE outbox_event_id = $1",
      [TEST_NOTIFICATION_OUTBOX_SECOND]
    );
    assert.equal(attemptsStored.rows[0]?.count, "2");

    const deadLetters = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM outbox_dead_letters WHERE outbox_event_id = $1",
      [TEST_NOTIFICATION_OUTBOX_SECOND]
    );
    assert.equal(deadLetters.rows[0]?.count, "1");
  });
});

describe("worker runtime integration", () => {
  beforeEach(() => {
    resetWorkerMetricsSnapshot();
  });

  it("keeps configured provider resolution visible during runtime wiring", async () => {
    const runtime = createWorkerRuntime({
      envSource: createWorkerRuntimeEnv(),
      pool: createMockPool()
    });

    runtime.googleCalendarWorker.processPending = async () => ({
      processed: 1,
      synced: 1,
      failed: 0,
      retried: 0
    });
    runtime.notificationsWorker.processPending = async () => ({
      processed: 1,
      synced: 1,
      failed: 0,
      retried: 0
    });

    const result = await runtime.runSingleCycle("resolved-provider-run");

    assert.deepEqual(runtime.providerResolution, {
      googleCalendar: {
        mode: WORKER_PROVIDER_MODE.PROVIDER,
        provider: "google_calendar_configured",
        providerPath: "google_calendar.provider.configured"
      },
      notifications: {
        email: {
          mode: WORKER_PROVIDER_MODE.PROVIDER,
          provider: "configured",
          providerPath: "notifications.email.provider.configured"
        },
        whatsapp: {
          mode: WORKER_PROVIDER_MODE.PROVIDER,
          provider: "configured",
          providerPath: "notifications.whatsapp.provider.configured"
        }
      }
    });
    assert.deepEqual(result, {
      runId: "resolved-provider-run",
      googleCalendar: {
        processed: 1,
        synced: 1,
        failed: 0,
        retried: 0
      },
      notifications: {
        processed: 1,
        synced: 1,
        failed: 0,
        retried: 0
      },
      idle: false
    });

    await runtime.close();
  });

  it("logs attention when a resolved runtime cycle reports failures", async () => {
    const runtime = createWorkerRuntime({
      envSource: createWorkerRuntimeEnv(),
      pool: createMockPool()
    });
    const shutdownController = createWorkerShutdownController({
      shutdownGracePeriodMs: 50
    });

    runtime.googleCalendarWorker.processPending = async () => ({
      processed: 1,
      synced: 0,
      failed: 1,
      retried: 0
    });
    runtime.notificationsWorker.processPending = async () => ({
      processed: 1,
      synced: 1,
      failed: 0,
      retried: 0
    });

    const logs = await captureStructuredLogs(async () => {
      await runWorkerLoop(runtime, {
        shutdownController,
        waitForNextCycle: async () => {
          shutdownController.requestShutdown("after-attention-cycle");
          return WORKER_WAIT_OUTCOME.SHUTDOWN;
        }
      });
    });

    const startupLog = findStructuredEvent(logs, "worker.runtime.started")[0];
    assert.ok(startupLog);
    assert.deepEqual(startupLog?.providerResolution, runtime.providerResolution);

    const attentionLog = findStructuredEvent(logs, "worker.cycle.requires_attention")[0];
    assert.ok(attentionLog);
    assert.equal(attentionLog?.failedCalendarEvents, 1);
    assert.equal(attentionLog?.failedNotificationEvents, 0);

    const stoppedLog = findStructuredEvent(logs, "worker.runtime.stopped")[0];
    assert.ok(stoppedLog);
    assert.equal(stoppedLog?.reason, "after-attention-cycle");
  });
});

function ensureTestEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lia_clinic";
}

async function prepareTestDatabaseUrl(baseDatabaseUrl: string): Promise<string> {
  const baseUrl = new URL(baseDatabaseUrl);
  const baseDatabaseName = baseUrl.pathname.replace(/^\//, "") || "lia_clinic";
  const testDatabaseName = `${baseDatabaseName}_test`;

  const adminUrl = new URL(baseUrl.toString());
  adminUrl.pathname = "/postgres";

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  try {
    const exists = await adminClient.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [testDatabaseName]
    );

    if (!exists.rows[0]?.exists) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(testDatabaseName)}`);
    }
  } finally {
    await adminClient.end();
  }

  baseUrl.pathname = `/${testDatabaseName}`;
  return baseUrl.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function applyApiMigrations(pool: Pool): Promise<void> {
  const migrationsDirectory = resolve(process.cwd(), "../api/src/db/migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = await readFile(join(migrationsDirectory, file), "utf8");
    await pool.query(sql);
  }
}

function createWorkerRuntimeEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/lia_clinic",
    REDIS_URL: "redis://localhost:6379",
    WORKER_POLL_INTERVAL_MS: "25",
    WORKER_SHUTDOWN_GRACE_PERIOD_MS: "50",
    GOOGLE_CALENDAR_PROVIDER_MODE: WORKER_PROVIDER_MODE.PROVIDER,
    EMAIL_PROVIDER_MODE: WORKER_PROVIDER_MODE.PROVIDER,
    WHATSAPP_PROVIDER_MODE: WORKER_PROVIDER_MODE.PROVIDER,
    GOOGLE_CALENDAR_CLIENT_ID: "client-id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
    GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
    GOOGLE_CALENDAR_CALENDAR_ID: "calendar-id",
    EMAIL_PROVIDER_API_KEY: "email-api-key",
    EMAIL_PROVIDER_FROM: "ops@example.com",
    WHATSAPP_ACCESS_TOKEN: "wa-token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-number-id",
    WHATSAPP_BUSINESS_ACCOUNT_ID: "business-account-id",
    ...overrides
  };
}

function createMockPool(): Pool {
  return {
    end: async () => undefined
  } as unknown as Pool;
}

async function captureStructuredLogs<T>(
  callback: () => Promise<T>
): Promise<Array<Record<string, unknown>>> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const lines: string[] = [];

  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await callback();
  } finally {
    process.stdout.write = originalWrite;
  }

  return lines
    .flatMap((line) => line.split("\n"))
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function findStructuredEvent(
  logs: Array<Record<string, unknown>>,
  event: string
): Array<Record<string, unknown>> {
  return logs.filter((log) => log.event === event);
}
