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
import { ExamsController } from "../exams/exams.controller.js";
import { ExamsRepository } from "../exams/exams.repository.js";
import { ExamsService } from "../exams/exams.service.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist";
  email: string;
}

describe("HTTP integration: exams/documents workflow", () => {
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
      "tenant-a-clinician": {
        id: "usr-1",
        tenantId: "tenant-demo",
        role: "clinician",
        email: "clinician@lia.local"
      },
      "tenant-a-receptionist": {
        id: "usr-2",
        tenantId: "tenant-demo",
        role: "receptionist",
        email: "reception@lia.local"
      },
      "tenant-b-clinician": {
        id: "usr-9",
        tenantId: "tenant-other",
        role: "clinician",
        email: "other@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [
        DatabaseService,
        AuditRepository,
        ExamsRepository,
        ExamsService,
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
    await applyMigrations(databaseService);
    await resetExamsTables(databaseService);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("enforces status transitions pending -> ready -> delivered", async () => {
    const created = await createExam(app!, "tenant-a-clinician", "pt-1", "Complete blood count");

    const blocked = await request(app!.getHttpServer())
      .post(`/exams/${created.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({ toStatus: "delivered" })
      .expect(409);

    assert.equal(blocked.body.message, "Exam transition 'pending' -> 'delivered' is not allowed");

    const ready = await request(app!.getHttpServer())
      .post(`/exams/${created.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({ toStatus: "ready" })
      .expect(200);

    assert.equal(ready.body.exam.status, "ready");
    assert.equal(typeof ready.body.exam.readyAtIso, "string");
    assert.equal(ready.body.exam.deliveredAtIso, null);

    const delivered = await request(app!.getHttpServer())
      .post(`/exams/${created.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({ toStatus: "delivered" })
      .expect(200);

    assert.equal(delivered.body.exam.status, "delivered");
    assert.equal(typeof delivered.body.exam.readyAtIso, "string");
    assert.equal(typeof delivered.body.exam.deliveredAtIso, "string");
  });

  it("allows staff and professionals to manage exam workflow", async () => {
    const createdByReception = await request(app!.getHttpServer())
      .post("/exams")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send(buildExamPayload("pt-2", "Chest x-ray"))
      .expect(201);

    assert.equal(createdByReception.body.exam.status, "pending");

    const updatedByClinician = await request(app!.getHttpServer())
      .patch(`/exams/${createdByReception.body.exam.id}`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({
        examType: "Chest x-ray - PA/lateral",
        notes: "Check follow-up infiltrates",
        attachments: [
          {
            attachmentId: "exam-file-2",
            fileName: "followup-order.pdf",
            mimeType: "application/pdf",
            sizeBytes: 555
          }
        ]
      })
      .expect(200);

    assert.equal(updatedByClinician.body.exam.examType, "Chest x-ray - PA/lateral");

    const transitionedByAdmin = await request(app!.getHttpServer())
      .post(`/exams/${createdByReception.body.exam.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-admin"])
      .send({ toStatus: "ready" })
      .expect(200);

    assert.equal(transitionedByAdmin.body.exam.status, "ready");

    const databaseService = moduleRef!.get(DatabaseService);
    const notificationsOutbox = await databaseService.query<{
      status: string;
      event_type: string;
      payload: {
        examId: string;
        toStatus: string;
      };
    }>(
      `
        SELECT status, event_type, payload
        FROM outbox_events
        WHERE aggregate_type = 'notification'
          AND aggregate_id = $1
        ORDER BY created_at DESC
      `,
      [createdByReception.body.exam.id]
    );

    assert.equal(notificationsOutbox.rows.length, 1);
    assert.equal(notificationsOutbox.rows[0]?.status, "pending");
    assert.equal(notificationsOutbox.rows[0]?.event_type, "notifications.exam.status.dispatch.requested");
    assert.equal(notificationsOutbox.rows[0]?.payload.examId, createdByReception.body.exam.id);
    assert.equal(notificationsOutbox.rows[0]?.payload.toStatus, "ready");

    const auditRows = await databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM domain_audit_events WHERE tenant_id = $1 AND action = $2 AND entity_id = $3",
      ["tenant-demo", "exams.status.transitioned", createdByReception.body.exam.id]
    );
    assert.equal(Number.parseInt(auditRows.rows[0]?.count ?? "0", 10), 1);
  });

  it("enforces tenant isolation for exam updates and patient lists", async () => {
    const created = await createExam(app!, "tenant-a-clinician", "pt-4", "Renal profile");

    const crossTenantPatch = await request(app!.getHttpServer())
      .patch(`/exams/${created.id}`)
      .set("Cookie", ["lia_session=tenant-b-clinician"])
      .send(buildExamPayload("pt-4", "Renal profile updated"))
      .expect(404);

    assert.equal(crossTenantPatch.body.message, "Exam not found");

    const crossTenantList = await request(app!.getHttpServer())
      .get("/exams/patients/pt-4")
      .set("Cookie", ["lia_session=tenant-b-clinician"])
      .expect(200);

    assert.equal(crossTenantList.body.exams.length, 0);
  });

  it("exposes only delivered exams for patient-visible listing", async () => {
    const pending = await createExam(app!, "tenant-a-clinician", "pt-5", "Metabolic panel");
    const delivered = await createExam(app!, "tenant-a-clinician", "pt-5", "Liver panel");

    await request(app!.getHttpServer())
      .post(`/exams/${delivered.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({ toStatus: "ready" })
      .expect(200);

    await request(app!.getHttpServer())
      .post(`/exams/${delivered.id}/status`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send({ toStatus: "delivered" })
      .expect(200);

    const all = await request(app!.getHttpServer())
      .get("/exams/patients/pt-5")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .query({ visibility: "all" })
      .expect(200);

    assert.equal(all.body.exams.length, 2);

    const patientVisible = await request(app!.getHttpServer())
      .get("/exams/patients/pt-5")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .query({ visibility: "patient_visible" })
      .expect(200);

    assert.equal(patientVisible.body.visibilityScope, "patient_visible");
    assert.equal(patientVisible.body.exams.length, 1);
    assert.equal(patientVisible.body.exams[0].id, delivered.id);
    assert.equal(patientVisible.body.exams[0].status, "delivered");
    assert.notEqual(patientVisible.body.exams[0].id, pending.id);
  });
});

const SUITE_DATABASE_SUFFIX = "integration_exams";

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

async function resetExamsTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    "TRUNCATE domain_audit_events, notification_delivery_attempts, notification_deliveries, notification_recipients, outbox_dead_letters, job_attempts, outbox_events, clinical_note_attachments, clinical_exam_attachments, clinical_notes, clinical_exams, clinical_encounters, scheduling_appointments RESTART IDENTITY"
  );
}

async function createExam(app: INestApplication, sessionId: string, patientId: string, examType: string) {
  const response = await request(app.getHttpServer())
    .post("/exams")
    .set("Cookie", [`lia_session=${sessionId}`])
    .send(buildExamPayload(patientId, examType))
    .expect(201);

  return response.body.exam as { id: string };
}

function buildExamPayload(patientId: string, examType: string) {
  return {
    patientId,
    examType,
    notes: "Manual workflow requested",
    attachments: [
      {
        attachmentId: "exam-file-1",
        fileName: "exam-order.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1234
      }
    ]
  };
}
