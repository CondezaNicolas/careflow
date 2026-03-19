import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { Client } from "pg";
import { AuditRepository } from "../audit/audit.repository.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { DatabaseService } from "../db/database.service.js";
import { SchedulingRepository } from "./scheduling.repository.js";
import { SchedulingService } from "./scheduling.service.js";

const TENANT_A_CLINICIAN = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.CLINICIAN,
  email: "clinician@lia.local"
} as const;

describe("scheduling service", () => {
  let databaseService: DatabaseService;
  let repository: SchedulingRepository;
  let service: SchedulingService;
  let auditRepository: Pick<AuditRepository, "saveDomainEvent">;

  before(async () => {
    ensureTestEnv();
    process.env.DATABASE_URL = await prepareTestDatabaseUrl(process.env.DATABASE_URL!);
    databaseService = new DatabaseService();
    repository = new SchedulingRepository(databaseService);
    auditRepository = {
      async saveDomainEvent() {
        return;
      }
    };
    service = new SchedulingService(repository, auditRepository as AuditRepository);
    await applyMigrations(databaseService);
  });

  after(async () => {
    await databaseService.onModuleDestroy();
  });

  beforeEach(async () => {
    await resetSchedulingTables(databaseService);
    await repository.upsertAvailabilityWindow({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: TENANT_A_CLINICIAN.tenantId,
      specialistId: "usr-1",
      startAtIso: "2026-04-01T09:00:00.000Z",
      endAtIso: "2026-04-01T17:00:00.000Z"
    });
  });

  it("creates appointment only on valid available slots", async () => {
    const created = await service.createAppointment(
      TENANT_A_CLINICIAN,
      {
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:00:00.000Z",
        endAtIso: "2026-04-01T09:30:00.000Z"
      },
      "idem-create-1"
    );

    assert.equal(created.action, "create");
    assert.equal(created.appointment.specialistId, "usr-1");
    assert.equal(created.idempotencyReplay, false);

    await assert.rejects(
      () =>
        service.createAppointment(
          TENANT_A_CLINICIAN,
          {
            patientId: "pt-2",
            specialistId: "usr-1",
            startAtIso: "2026-04-01T18:00:00.000Z",
            endAtIso: "2026-04-01T18:30:00.000Z"
          },
          "idem-create-2"
        ),
      /outside specialist availability/
    );
  });

  it("prevents race conflicts by revalidating inside serialized transaction", async () => {
    const [a, b] = await Promise.allSettled([
      service.createAppointment(
        TENANT_A_CLINICIAN,
        {
          patientId: "pt-1",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T10:00:00.000Z",
          endAtIso: "2026-04-01T10:30:00.000Z"
        },
        "idem-race-1"
      ),
      service.createAppointment(
        TENANT_A_CLINICIAN,
        {
          patientId: "pt-2",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T10:00:00.000Z",
          endAtIso: "2026-04-01T10:30:00.000Z"
        },
        "idem-race-2"
      )
    ]);

    const fulfilledCount = [a, b].filter((result) => result.status === "fulfilled").length;
    const rejectedCount = [a, b].filter((result) => result.status === "rejected").length;

    assert.equal(fulfilledCount, 1);
    assert.equal(rejectedCount, 1);
    assert.equal(await repository.countAppointmentsWithinTenant(TENANT_A_CLINICIAN.tenantId), 1);
  });

  it("supports idempotent replay for appointment writes", async () => {
    const first = await service.createAppointment(
      TENANT_A_CLINICIAN,
      {
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T11:00:00.000Z",
        endAtIso: "2026-04-01T11:30:00.000Z"
      },
      "idem-replay"
    );

    const replay = await service.createAppointment(
      TENANT_A_CLINICIAN,
      {
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T11:00:00.000Z",
        endAtIso: "2026-04-01T11:30:00.000Z"
      },
      "idem-replay"
    );

    assert.equal(replay.idempotencyReplay, true);
    assert.equal(first.appointment.id, replay.appointment.id);
    assert.equal(await repository.countAppointmentsWithinTenant(TENANT_A_CLINICIAN.tenantId), 1);

    await assert.rejects(
      () =>
        service.createAppointment(
          TENANT_A_CLINICIAN,
          {
            patientId: "pt-2",
            specialistId: "usr-1",
            startAtIso: "2026-04-01T11:00:00.000Z",
            endAtIso: "2026-04-01T11:30:00.000Z"
          },
          "idem-replay"
        ),
      /different payload/
    );
  });

  it("records outbound google calendar sync as pending without blocking booking commit", async () => {
    const created = await service.createAppointment(
      TENANT_A_CLINICIAN,
      {
        patientId: "pt-9",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T12:00:00.000Z",
        endAtIso: "2026-04-01T12:30:00.000Z"
      },
      "idem-calendar-sync-1"
    );

    assert.equal(created.action, "create");
    assert.equal(created.appointment.calendarSyncStatus, "pending");
    assert.equal(created.appointment.calendarSyncAttempts, 0);
    assert.equal(created.appointment.externalCalendarEventId, null);

    const outbox = await databaseService.query<{
      event_type: string;
      status: string;
      aggregate_id: string;
      payload: {
        action: string;
        appointmentId: string;
        tenantId: string;
      };
    }>(
      `
        SELECT event_type, status, aggregate_id, payload
        FROM outbox_events
        WHERE aggregate_type = 'appointment'
          AND aggregate_id = $1
          AND event_type = 'scheduling.appointment.google-calendar.sync.requested'
      `,
      [created.appointment.id]
    );

    assert.equal(outbox.rows.length, 1);
    assert.equal(outbox.rows[0]?.status, "pending");
    assert.equal(outbox.rows[0]?.event_type, "scheduling.appointment.google-calendar.sync.requested");
    assert.equal(outbox.rows[0]?.payload.appointmentId, created.appointment.id);
    assert.equal(outbox.rows[0]?.payload.action, "create");
    assert.equal(outbox.rows[0]?.payload.tenantId, TENANT_A_CLINICIAN.tenantId);
  });
});

function ensureTestEnv(): void {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://lia:lia@localhost:5432/lia_clinic";
  process.env.OIDC_ISSUER = process.env.OIDC_ISSUER ?? "https://issuer.example.test";
  process.env.OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? "client-id";
  process.env.OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET ?? "client-secret";
  process.env.OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI ?? "https://api.example.test/auth/callback";
  process.env.OIDC_AUDIENCE = process.env.OIDC_AUDIENCE ?? "client-id";
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

async function applyMigrations(databaseService: DatabaseService): Promise<void> {
  const migrationsDirectory = resolve(process.cwd(), "src/db/migrations");
  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const sql = await readFile(join(migrationsDirectory, file), "utf8");
    await databaseService.query(sql);
  }
}

async function resetSchedulingTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    "TRUNCATE domain_audit_events, notification_delivery_attempts, notification_deliveries, notification_recipients, outbox_dead_letters, job_attempts, outbox_events, scheduling_idempotency_keys, scheduling_appointments, scheduling_availability_windows RESTART IDENTITY"
  );
}
