import "reflect-metadata";

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import cookieParser from "cookie-parser";
import { UnauthorizedException, type INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { Client } from "pg";
import request from "supertest";

import { AssistantController } from "../assistant/assistant.controller.js";
import { AssistantRepository } from "../assistant/assistant.repository.js";
import { AssistantService } from "../assistant/assistant.service.js";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { SessionStore } from "../auth/session.store.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DatabaseService } from "../db/database.service.js";
import { ExamsRepository } from "../exams/exams.repository.js";
import { ExamsService } from "../exams/exams.service.js";
import { SchedulingRepository } from "../scheduling/scheduling.repository.js";
import { SchedulingService } from "../scheduling/scheduling.service.js";
import { APPOINTMENT_SYNC_STATUS } from "../scheduling/scheduling.types.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist" | "patient";
  email: string;
}

const TENANT_A_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_B_ID = "00000000-0000-4000-8000-000000000002";

describe("HTTP integration: L-IA MCP assistant tools", () => {
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;

  beforeEach(async () => {
    ensureTestEnv();
    process.env.DATABASE_URL = await prepareTestDatabaseUrl(process.env.DATABASE_URL!);

    const principalsBySessionId: Record<string, MockPrincipal> = {
      "tenant-a-admin": {
        id: "usr-admin",
        tenantId: TENANT_A_ID,
        role: "admin",
        email: "admin@lia.local"
      },
      "tenant-a-clinician": {
        id: "usr-1",
        tenantId: TENANT_A_ID,
        role: "clinician",
        email: "clinician@lia.local"
      },
      "tenant-a-receptionist": {
        id: "usr-2",
        tenantId: TENANT_A_ID,
        role: "receptionist",
        email: "reception@lia.local"
      },
      "tenant-a-patient": {
        id: "pt-1",
        tenantId: TENANT_A_ID,
        role: "patient",
        email: "patient@lia.local"
      },
      "tenant-b-clinician": {
        id: "usr-9",
        tenantId: TENANT_B_ID,
        role: "clinician",
        email: "other@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        DatabaseService,
        AuditRepository,
        SchedulingRepository,
        SchedulingService,
        ExamsRepository,
        ExamsService,
        AssistantRepository,
        AssistantService,
        AuthenticatedGuard,
        RolesGuard,
        Reflector,
        {
          provide: SessionStore,
          useValue: {
            async resolvePrincipal(sessionId: string) {
              const principal = principalsBySessionId[sessionId];
              if (!principal) {
                throw new UnauthorizedException("Invalid session");
              }

              return principal;
            }
          }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const databaseService = moduleRef.get(DatabaseService);
    const schedulingRepository = moduleRef.get(SchedulingRepository);
    await applyMigrations(databaseService);
    await resetAssistantTables(databaseService);

    await schedulingRepository.upsertAvailabilityWindow({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: TENANT_A_ID,
      specialistId: "usr-1",
      startAtIso: "2026-04-01T09:00:00.000Z",
      endAtIso: "2026-04-01T12:00:00.000Z"
    });

    await schedulingRepository.saveAppointment({
      id: "22222222-2222-4222-8222-222222222222",
      tenantId: TENANT_A_ID,
      patientId: "pt-other",
      specialistId: "usr-1",
      startAtIso: "2026-04-01T10:00:00.000Z",
      endAtIso: "2026-04-01T10:30:00.000Z",
      status: "scheduled",
      canceledAtIso: null,
      externalCalendarEventId: null,
      calendarSyncStatus: APPOINTMENT_SYNC_STATUS.PENDING,
      calendarSyncAttempts: 0,
      calendarLastError: null,
      calendarLastAttemptAtIso: null,
      calendarNextRetryAtIso: "2026-03-01T00:00:00.000Z",
      calendarLastSyncedAtIso: null,
      calendarSyncUpdatedAtIso: "2026-03-01T00:00:00.000Z",
      createdAtIso: "2026-03-01T00:00:00.000Z",
      updatedAtIso: "2026-03-01T00:00:00.000Z"
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("enforces role checks per tool invocation", async () => {
    const response = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/availability.search/invoke")
      .set("Cookie", ["lia_session=tenant-a-patient"])
      .send({
        input: {
          specialistId: "usr-1",
          fromIso: "2026-04-01T09:00:00.000Z",
          toIso: "2026-04-01T11:00:00.000Z",
          durationMinutes: 30
        }
      })
      .expect(201);

    assert.equal(response.body.status, "forbidden");
    assert.equal(response.body.error.code, "assistant.forbidden_role");
  });

  it("requires explicit confirmation before appointment create commit", async () => {
    const pending = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/appointments.create/invoke")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send({
        input: {
          patientId: "pt-1",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T09:00:00.000Z",
          endAtIso: "2026-04-01T09:30:00.000Z",
          idempotencyKey: "assistant-create-1"
        }
      })
      .expect(201);

    assert.equal(pending.body.status, "requires_confirmation");

    const databaseService = moduleRef!.get(DatabaseService);
    const before = await countAppointments(databaseService, TENANT_A_ID);
    assert.equal(before, 1);

    const confirmed = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/appointments.create/invoke")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send({
        input: {
          patientId: "pt-1",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T09:00:00.000Z",
          endAtIso: "2026-04-01T09:30:00.000Z",
          idempotencyKey: "assistant-create-1"
        },
        confirmation: {
          confirmed: true,
          token: pending.body.confirmation.token,
          reason: "patient requested by phone"
        }
      })
      .expect(201);

    assert.equal(confirmed.body.status, "success");

    const after = await countAppointments(databaseService, TENANT_A_ID);
    assert.equal(after, 2);

    const auditRows = await databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM assistant_tool_audit_logs WHERE tenant_id = $1 AND tool_name = $2",
      [TENANT_A_ID, "appointments.create"]
    );
    assert.equal(Number.parseInt(auditRows.rows[0]?.count ?? "0", 10), 2);

    const domainAuditRows = await databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM domain_audit_events WHERE tenant_id = $1 AND source = $2 AND action = $3",
      [TENANT_A_ID, "assistant", "scheduling.appointment.created"]
    );
    assert.equal(Number.parseInt(domainAuditRows.rows[0]?.count ?? "0", 10), 1);
  });

  it("returns deterministic conflict with alternatives for unavailable slots", async () => {
    const preview = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/appointments.create/invoke")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send({
        input: {
          patientId: "pt-7",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T10:00:00.000Z",
          endAtIso: "2026-04-01T10:30:00.000Z",
          idempotencyKey: "assistant-create-conflict"
        }
      })
      .expect(201);

    const response = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/appointments.create/invoke")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send({
        input: {
          patientId: "pt-7",
          specialistId: "usr-1",
          startAtIso: "2026-04-01T10:00:00.000Z",
          endAtIso: "2026-04-01T10:30:00.000Z",
          idempotencyKey: "assistant-create-conflict"
        },
        confirmation: {
          confirmed: true,
          token: preview.body.confirmation.token,
          reason: "retry request"
        }
      })
      .expect(201);

    assert.equal(response.body.status, "conflict");
    assert.equal(response.body.error.code, "scheduling.slot_unavailable");
    assert.ok(Array.isArray(response.body.alternatives));
    assert.ok(response.body.alternatives.length > 0);
  });

  it("does not hallucinate exam status when exam is unavailable", async () => {
    const response = await request(app!.getHttpServer())
      .post("/lia-assistant/tools/exams.status.get/invoke")
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({
        input: {
          examId: "33333333-3333-4333-8333-333333333333"
        }
      })
      .expect(201);

    assert.equal(response.body.status, "unavailable");
    assert.equal(response.body.result.available, false);
    assert.equal(response.body.result.status, null);
  });
});

const SUITE_DATABASE_SUFFIX = "integration_assistant";

function ensureTestEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://lia:lia@localhost:5432/lia_clinic";
  process.env.OIDC_ISSUER = "https://issuer.example.test";
  process.env.OIDC_CLIENT_ID = "client-id";
  process.env.OIDC_CLIENT_SECRET = "client-secret";
  process.env.OIDC_REDIRECT_URI = "https://api.example.test/auth/callback";
  process.env.OIDC_AUDIENCE = "client-id";
  process.env.OIDC_TENANT_CLAIM = "tenant_id";
  process.env.OIDC_ROLE_CLAIM = "role";
  process.env.SESSION_COOKIE_NAME = "lia_session";
  process.env.SESSION_TTL_MINUTES = "60";
}

async function prepareTestDatabaseUrl(baseDatabaseUrl: string): Promise<string> {
  const baseUrl = new URL(baseDatabaseUrl);
  const baseDatabaseName = baseUrl.pathname.replace(/^\//, "") || "lia_clinic";
  const testDatabaseName = `${sanitizeDatabaseName(baseDatabaseName)}_test_${SUITE_DATABASE_SUFFIX}`;

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

function sanitizeDatabaseName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
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

async function resetAssistantTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    "TRUNCATE domain_audit_events, assistant_tool_audit_logs, scheduling_idempotency_keys, scheduling_appointments, scheduling_availability_windows, clinical_exam_attachments, clinical_exams RESTART IDENTITY"
  );
}

async function countAppointments(databaseService: DatabaseService, tenantId: string): Promise<number> {
  const result = await databaseService.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM scheduling_appointments WHERE tenant_id = $1",
    [tenantId]
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}
