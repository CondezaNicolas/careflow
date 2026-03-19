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

import { AuthenticatedGuard } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { SessionStore } from "../auth/session.store.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DatabaseService } from "../db/database.service.js";
import { SchedulingController } from "../scheduling/scheduling.controller.js";
import { SchedulingRepository } from "../scheduling/scheduling.repository.js";
import { SchedulingService } from "../scheduling/scheduling.service.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist";
  email: string;
}

const TENANT_A_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_B_ID = "00000000-0000-4000-8000-000000000002";

describe("HTTP integration: scheduling and availability", () => {
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
      "tenant-b-clinician": {
        id: "usr-9",
        tenantId: TENANT_B_ID,
        role: "clinician",
        email: "other@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [SchedulingController],
      providers: [
        DatabaseService,
        AuditRepository,
        SchedulingRepository,
        SchedulingService,
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
    await resetSchedulingTables(databaseService);
    await schedulingRepository.upsertAvailabilityWindow({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: TENANT_A_ID,
      specialistId: "usr-1",
      startAtIso: "2026-04-01T09:00:00.000Z",
      endAtIso: "2026-04-01T17:00:00.000Z"
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("allows clinician to manage own availability but blocks other specialists", async () => {
    const ownWindow = await request(app!.getHttpServer())
      .post("/scheduling/availability/windows")
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({
        specialistId: "usr-1",
        startAtIso: "2026-04-01T12:00:00.000Z",
        endAtIso: "2026-04-01T13:00:00.000Z"
      })
      .expect(201);

    assert.equal(ownWindow.body.tenantId, TENANT_A_ID);

    const blocked = await request(app!.getHttpServer())
      .post("/scheduling/availability/windows")
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({
        specialistId: "usr-admin",
        startAtIso: "2026-04-01T13:00:00.000Z",
        endAtIso: "2026-04-01T14:00:00.000Z"
      })
      .expect(403);

    assert.equal(blocked.body.message, "Clinicians can only manage their own availability");
  });

  it("enforces idempotency for appointment creation", async () => {
    const first = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .set("idempotency-key", "idem-http-1")
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:30:00.000Z",
        endAtIso: "2026-04-01T10:00:00.000Z"
      })
      .expect(201);

    const replay = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .set("idempotency-key", "idem-http-1")
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:30:00.000Z",
        endAtIso: "2026-04-01T10:00:00.000Z"
      })
      .expect(201);

    assert.equal(first.body.appointment.id, replay.body.appointment.id);
    assert.equal(replay.body.idempotencyReplay, true);

    const databaseService = moduleRef!.get(DatabaseService);
    const auditRows = await databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM domain_audit_events WHERE tenant_id = $1 AND action = $2",
      [TENANT_A_ID, "scheduling.appointment.created"]
    );
    assert.equal(Number.parseInt(auditRows.rows[0]?.count ?? "0", 10), 1);
  });

  it("rejects appointment writes when idempotency key header is invalid", async () => {
    const missing = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:30:00.000Z",
        endAtIso: "2026-04-01T10:00:00.000Z"
      })
      .expect(400);

    assert.equal(missing.body.message, "idempotency-key header is required");

    const invalidChars = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .set("idempotency-key", "bad key")
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:30:00.000Z",
        endAtIso: "2026-04-01T10:00:00.000Z"
      })
      .expect(400);

    assert.equal(invalidChars.body.message, "idempotency-key header contains invalid characters");

    const tooLong = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .set("idempotency-key", "k".repeat(129))
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T09:30:00.000Z",
        endAtIso: "2026-04-01T10:00:00.000Z"
      })
      .expect(400);

    assert.equal(tooLong.body.message, "idempotency-key header exceeds 128 characters");

    const databaseService = moduleRef!.get(DatabaseService);
    const appointmentCount = await databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM scheduling_appointments WHERE tenant_id = $1",
      [TENANT_A_ID]
    );
    assert.equal(Number.parseInt(appointmentCount.rows[0]?.count ?? "0", 10), 0);
  });

  it("enforces tenant scope for appointment write operations", async () => {
    const created = await request(app!.getHttpServer())
      .post("/scheduling/appointments")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .set("idempotency-key", "idem-http-2")
      .send({
        patientId: "pt-1",
        specialistId: "usr-1",
        startAtIso: "2026-04-01T10:30:00.000Z",
        endAtIso: "2026-04-01T11:00:00.000Z"
      })
      .expect(201);

    const crossTenant = await request(app!.getHttpServer())
      .post(`/scheduling/appointments/${created.body.appointment.id}/cancel`)
      .set("Cookie", ["lia_session=tenant-b-clinician"])
      .set("idempotency-key", "idem-http-3")
      .expect(404);

    assert.equal(crossTenant.body.message, "Appointment not found");
  });

  it("returns available slots for authenticated tenant user", async () => {
    const response = await request(app!.getHttpServer())
      .get("/scheduling/availability")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .query({
        specialistId: "usr-1",
        from: "2026-04-01T09:00:00.000Z",
        to: "2026-04-01T11:00:00.000Z",
        durationMinutes: "30"
      })
      .expect(200);

    assert.equal(response.body.specialistId, "usr-1");
    assert.ok(Array.isArray(response.body.slots));
    assert.ok(response.body.slots.length > 0);
  });
});

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
