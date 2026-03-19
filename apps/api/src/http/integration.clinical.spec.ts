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
import { ClinicalController } from "../clinical/clinical.controller.js";
import { ClinicalRepository } from "../clinical/clinical.repository.js";
import { ClinicalService } from "../clinical/clinical.service.js";
import { CLINICAL_NOTE_VISIBILITY } from "../clinical/clinical.types.js";
import { DatabaseService } from "../db/database.service.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist";
  email: string;
}

describe("HTTP integration: clinical longitudinal record", () => {
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
      controllers: [ClinicalController],
      providers: [
        DatabaseService,
        ClinicalRepository,
        ClinicalService,
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
    await resetClinicalTables(databaseService);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("blocks receptionist from writing clinical notes", async () => {
    const encounter = await createEncounter(app!, "tenant-a-clinician", "pt-1");

    const blocked = await request(app!.getHttpServer())
      .post(`/clinical/encounters/${encounter.id}/notes`)
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .send(buildNotePayload("pt-1", CLINICAL_NOTE_VISIBILITY.INTERNAL))
      .expect(403);

    assert.equal(blocked.body.message, "Role cannot modify clinical content");
  });

  it("returns patient-shared notes only for receptionist timeline", async () => {
    const encounter = await createEncounter(app!, "tenant-a-clinician", "pt-1");

    await request(app!.getHttpServer())
      .post(`/clinical/encounters/${encounter.id}/notes`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send(buildNotePayload("pt-1", CLINICAL_NOTE_VISIBILITY.INTERNAL))
      .expect(201);

    const sharedCreated = await request(app!.getHttpServer())
      .post(`/clinical/encounters/${encounter.id}/notes`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send(buildNotePayload("pt-1", CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED))
      .expect(201);

    const receptionistTimeline = await request(app!.getHttpServer())
      .get("/clinical/patients/pt-1/timeline")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .query({ visibility: "all" })
      .expect(200);

    assert.equal(receptionistTimeline.body.visibilityScope, "patient_shared");
    assert.equal(receptionistTimeline.body.entries.length, 1);
    assert.equal(receptionistTimeline.body.entries[0].note.visibility, "patient_shared");

    const clinicianTimeline = await request(app!.getHttpServer())
      .get("/clinical/patients/pt-1/timeline")
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .query({ visibility: "all" })
      .expect(200);

    assert.equal(clinicianTimeline.body.entries.length, 2);
    assert.equal(clinicianTimeline.body.entries[0].note.id, sharedCreated.body.note.id);
    assert.equal(clinicianTimeline.body.entries[0].note.subjective, "Subjective findings");
    assert.equal(clinicianTimeline.body.entries[0].note.vitals.heartRateBpm, 78);
    assert.equal(clinicianTimeline.body.entries[0].note.medications[0].name, "Ibuprofen");
    assert.equal(clinicianTimeline.body.entries[0].note.antecedentes[0].category, "allergy");
    assert.equal(clinicianTimeline.body.entries[0].note.attachments[0].attachmentId, "file-1");
  });

  it("enforces tenant boundaries for note updates", async () => {
    const encounter = await createEncounter(app!, "tenant-a-clinician", "pt-1");

    const created = await request(app!.getHttpServer())
      .post(`/clinical/encounters/${encounter.id}/notes`)
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .send(buildNotePayload("pt-1", CLINICAL_NOTE_VISIBILITY.INTERNAL))
      .expect(201);

    const crossTenant = await request(app!.getHttpServer())
      .patch(`/clinical/notes/${created.body.note.id}`)
      .set("Cookie", ["lia_session=tenant-b-clinician"])
      .send(buildNotePayload("pt-1", CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED))
      .expect(404);

    assert.equal(crossTenant.body.message, "Clinical note not found");
  });
});

const SUITE_DATABASE_SUFFIX = "integration_clinical";

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

async function resetClinicalTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    "TRUNCATE clinical_note_attachments, clinical_exam_attachments, clinical_notes, clinical_exams, clinical_encounters, scheduling_appointments RESTART IDENTITY"
  );
}

async function createEncounter(app: INestApplication, sessionId: string, patientId: string) {
  const response = await request(app.getHttpServer())
    .post("/clinical/encounters")
    .set("Cookie", [`lia_session=${sessionId}`])
    .send({
      patientId,
      startedAtIso: "2026-04-01T10:00:00.000Z",
      endedAtIso: null,
      reason: "Control consultation"
    })
    .expect(201);

  return response.body.encounter as { id: string };
}

function buildNotePayload(patientId: string, visibility: "internal" | "patient_shared") {
  return {
    patientId,
    visibility,
    subjective: "Subjective findings",
    objective: "Objective findings",
    assessment: "Clinical assessment",
    plan: "Clinical plan",
    vitals: {
      systolicBpMmHg: 120,
      diastolicBpMmHg: 80,
      heartRateBpm: 78,
      respiratoryRateBpm: 15,
      oxygenSaturationPct: 97,
      temperatureC: 36.7,
      weightKg: 74.4,
      heightCm: 176
    },
    medications: [
      {
        name: "Ibuprofen",
        dose: "400mg",
        frequency: "q8h",
        route: "oral",
        instructions: "After meals"
      }
    ],
    antecedentes: [
      {
        category: "allergy",
        description: "Penicillin"
      }
    ],
    attachments: [
      {
        attachmentId: "file-1",
        fileName: "lab-result.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345
      }
    ]
  };
}
