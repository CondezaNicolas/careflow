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
import { requestIdMiddleware } from "../common/middleware/request-id.middleware.js";
import { requestLoggingMiddleware } from "../common/middleware/request-logging.middleware.js";
import { DatabaseService } from "../db/database.service.js";
import { HealthController } from "../ops/health.controller.js";
import { OpsController } from "../ops/ops.controller.js";
import { OpsService } from "../ops/ops.service.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist";
  email: string;
}

describe("HTTP integration: ops hardening endpoints", () => {
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;

  beforeEach(async () => {
    ensureTestEnv();
    process.env.DATABASE_URL = await prepareTestDatabaseUrl(process.env.DATABASE_URL!);

    const principalsBySessionId: Record<string, MockPrincipal> = {
      "tenant-a-admin": {
        id: "usr-admin",
        tenantId: "tenant-demo",
        role: "admin",
        email: "admin@lia.local"
      },
      "tenant-a-receptionist": {
        id: "usr-2",
        tenantId: "tenant-demo",
        role: "receptionist",
        email: "reception@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [OpsController, HealthController],
      providers: [
        DatabaseService,
        OpsService,
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
    app.use(requestIdMiddleware);
    app.use(requestLoggingMiddleware);
    await app.init();

    const databaseService = moduleRef.get(DatabaseService);
    await applyMigrations(databaseService);
    await resetOpsTables(databaseService);
    await seedOpsData(databaseService);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("returns outbox health for admins", async () => {
    const response = await request(app!.getHttpServer())
      .get("/ops/outbox/health")
      .set("Cookie", ["lia_session=tenant-a-admin"])
      .expect(200);

    assert.equal(response.body.totals.pending, 1);
    assert.equal(response.body.totals.failed, 1);
    assert.equal(response.body.totals.deadLetters24h, 1);
    assert.equal(response.body.pendingByEventType[0].eventType, "notifications.exam.status.dispatch.requested");
  });

  it("exposes baseline api metrics and blocks non-admin access", async () => {
    await request(app!.getHttpServer())
      .get("/ops/metrics")
      .set("Cookie", ["lia_session=tenant-a-admin"])
      .expect(200);

    const blocked = await request(app!.getHttpServer())
      .get("/ops/metrics")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .expect(403);

    assert.equal(blocked.body.message, "Forbidden resource");
  });

  it("exposes release diagnostics for admins", async () => {
    const diagnostics = await request(app!.getHttpServer())
      .get("/ops/diagnostics")
      .set("Cookie", ["lia_session=tenant-a-admin"])
      .expect(200);

    assert.equal(diagnostics.body.env.nodeEnv, "test");
    assert.equal(diagnostics.body.migrations.latestFile, "012_backend_hardening_ops_audit.sql");
    assert.equal(diagnostics.body.readiness.status, "ready");
    assert.equal(diagnostics.body.preflight.status, "ready");
    assert.equal(diagnostics.body.preflight.requiredInCurrentEnv, false);
    assert.equal(diagnostics.body.preflight.integrations[0].integration, "oidc");
    assert.equal(diagnostics.body.preflight.integrations[0].status, "configured");
    assert.equal(diagnostics.body.preflight.integrations[1].integration, "google_calendar");
    assert.equal(diagnostics.body.preflight.integrations[1].status, "missing_config");
  });

  it("exposes liveness and readiness probes without auth", async () => {
    const live = await request(app!.getHttpServer()).get("/health/live").expect(200);
    assert.equal(live.body.status, "ok");

    const ready = await request(app!.getHttpServer()).get("/health/ready").expect(200);
    assert.equal(ready.body.status, "ready");
    assert.equal(ready.body.checks.database.status, "ok");
    assert.equal(ready.body.checks.preflight.status, "ready");
  });
});

const SUITE_DATABASE_SUFFIX = "integration_ops";

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

async function resetOpsTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query("TRUNCATE outbox_events CASCADE");
}

async function seedOpsData(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    `
      INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status, created_at)
      VALUES
        ('00000000-0000-4000-8000-000000000111', 'tenant-demo', 'notification', 'exam-1', 'notifications.exam.status.dispatch.requested', '{}'::jsonb, 'pending', NOW() - INTERVAL '2 minutes'),
        ('00000000-0000-4000-8000-000000000112', 'tenant-demo', 'appointment', 'appt-1', 'scheduling.appointment.google-calendar.sync.requested', '{}'::jsonb, 'failed', NOW() - INTERVAL '5 minutes')
    `
  );
  await databaseService.query(
    `
      INSERT INTO outbox_dead_letters (id, outbox_event_id, reason, payload)
      VALUES ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000112', 'terminal failure', '{}'::jsonb)
    `
  );
}
