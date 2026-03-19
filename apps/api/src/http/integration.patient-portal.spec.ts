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
import { CLINICAL_NOTE_VISIBILITY, type ClinicalNote } from "../clinical/clinical.types.js";
import { ClinicalRepository } from "../clinical/clinical.repository.js";
import { DatabaseService } from "../db/database.service.js";
import { EXAM_STATUS } from "../exams/exams.types.js";
import { ExamsRepository } from "../exams/exams.repository.js";
import { PatientPortalController } from "../patient-portal/patient-portal.controller.js";
import { PatientPortalService } from "../patient-portal/patient-portal.service.js";
import { APPOINTMENT_STATUS, APPOINTMENT_SYNC_STATUS, type Appointment } from "../scheduling/scheduling.types.js";
import { SchedulingRepository } from "../scheduling/scheduling.repository.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist" | "patient";
  email: string;
}

describe("HTTP integration: patient portal visibility and leakage prevention", () => {
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;

  beforeEach(async () => {
    ensureTestEnv();
    process.env.DATABASE_URL = await prepareTestDatabaseUrl(process.env.DATABASE_URL!);

    const principalsBySessionId: Record<string, MockPrincipal> = {
      "tenant-a-patient-1": {
        id: "pt-portal-1",
        tenantId: "tenant-demo",
        role: "patient",
        email: "patient1@lia.local"
      },
      "tenant-a-patient-2": {
        id: "pt-portal-2",
        tenantId: "tenant-demo",
        role: "patient",
        email: "patient2@lia.local"
      },
      "tenant-a-receptionist": {
        id: "usr-2",
        tenantId: "tenant-demo",
        role: "receptionist",
        email: "reception@lia.local"
      },
      "tenant-b-same-patient-subject": {
        id: "pt-portal-1",
        tenantId: "tenant-other",
        role: "patient",
        email: "tenant-b-patient@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [PatientPortalController],
      providers: [
        DatabaseService,
        SchedulingRepository,
        ExamsRepository,
        ClinicalRepository,
        PatientPortalService,
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
    await resetPortalTables(databaseService);
    await seedPortalData(moduleRef.get(SchedulingRepository), moduleRef.get(ExamsRepository), moduleRef.get(ClinicalRepository));
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    moduleRef = undefined;
  });

  it("returns upcoming/history appointments, delivered exams, and patient-shared notes", async () => {
    const response = await request(app!.getHttpServer())
      .get("/patient-portal/me/overview")
      .set("Cookie", ["lia_session=tenant-a-patient-1"])
      .expect(200);

    assert.equal(response.body.overview.patientId, "pt-portal-1");
    assert.equal(response.body.overview.appointments.upcoming.length, 1);
    assert.equal(response.body.overview.appointments.history.length, 2);
    assert.equal(response.body.overview.releasedExams.length, 1);
    assert.equal(response.body.overview.releasedExams[0].status, EXAM_STATUS.DELIVERED);
    assert.equal(response.body.overview.sharedNotes.length, 1);
    assert.equal(response.body.overview.sharedNotes[0].note.visibility, CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED);
  });

  it("blocks patient subject from reading another patient portal overview", async () => {
    const response = await request(app!.getHttpServer())
      .get("/patient-portal/patients/pt-portal-2/overview")
      .set("Cookie", ["lia_session=tenant-a-patient-1"])
      .expect(403);

    assert.equal(response.body.message, "Patient can only access own portal data");
  });

  it("enforces tenant scope for same patient subject", async () => {
    const response = await request(app!.getHttpServer())
      .get("/patient-portal/me/overview")
      .set("Cookie", ["lia_session=tenant-b-same-patient-subject"])
      .expect(200);

    assert.equal(response.body.overview.patientId, "pt-portal-1");
    assert.equal(response.body.overview.appointments.upcoming.length, 1);
    assert.equal(response.body.overview.appointments.history.length, 0);
    assert.equal(response.body.overview.releasedExams.length, 1);
    assert.equal(response.body.overview.sharedNotes.length, 1);
  });

  it("allows staff read path but still filters to patient-visible contracts", async () => {
    const response = await request(app!.getHttpServer())
      .get("/patient-portal/patients/pt-portal-1/overview")
      .set("Cookie", ["lia_session=tenant-a-receptionist"])
      .expect(200);

    assert.equal(response.body.overview.releasedExams.length, 1);
    assert.equal(response.body.overview.sharedNotes.length, 1);
    assert.equal(response.body.overview.sharedNotes[0].note.visibility, CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED);
  });
});

const SUITE_DATABASE_SUFFIX = "integration_patient_portal";

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

async function resetPortalTables(databaseService: DatabaseService): Promise<void> {
  await databaseService.query(
    "TRUNCATE clinical_note_attachments, clinical_exam_attachments, clinical_notes, clinical_exams, clinical_encounters, scheduling_appointments RESTART IDENTITY"
  );
}

async function seedPortalData(
  schedulingRepository: SchedulingRepository,
  examsRepository: ExamsRepository,
  clinicalRepository: ClinicalRepository
): Promise<void> {
  const nowIso = new Date().toISOString();

  await schedulingRepository.saveAppointment(buildAppointment(nowIso, {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    specialistId: "usr-1",
    startAtIso: "2099-04-01T10:00:00.000Z",
    endAtIso: "2099-04-01T10:30:00.000Z",
    status: APPOINTMENT_STATUS.SCHEDULED,
    canceledAtIso: null
  }));

  await schedulingRepository.saveAppointment(buildAppointment(nowIso, {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    specialistId: "usr-1",
    startAtIso: "2020-04-01T10:00:00.000Z",
    endAtIso: "2020-04-01T10:30:00.000Z",
    status: APPOINTMENT_STATUS.SCHEDULED,
    canceledAtIso: null
  }));

  await schedulingRepository.saveAppointment(buildAppointment(nowIso, {
    id: "33333333-3333-4333-8333-333333333333",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    specialistId: "usr-1",
    startAtIso: "2099-04-02T10:00:00.000Z",
    endAtIso: "2099-04-02T10:30:00.000Z",
    status: APPOINTMENT_STATUS.CANCELED,
    canceledAtIso: nowIso
  }));

  await schedulingRepository.saveAppointment(buildAppointment(nowIso, {
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: "tenant-demo",
    patientId: "pt-portal-2",
    specialistId: "usr-1",
    startAtIso: "2099-04-01T11:00:00.000Z",
    endAtIso: "2099-04-01T11:30:00.000Z",
    status: APPOINTMENT_STATUS.SCHEDULED,
    canceledAtIso: null
  }));

  await schedulingRepository.saveAppointment(buildAppointment(nowIso, {
    id: "55555555-5555-4555-8555-555555555555",
    tenantId: "tenant-other",
    patientId: "pt-portal-1",
    specialistId: "usr-9",
    startAtIso: "2099-04-10T09:00:00.000Z",
    endAtIso: "2099-04-10T09:30:00.000Z",
    status: APPOINTMENT_STATUS.SCHEDULED,
    canceledAtIso: null
  }));

  await examsRepository.saveExam({
    id: "66666666-6666-4666-8666-666666666666",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    requestedByProfessionalId: "usr-1",
    examType: "Complete blood count",
    status: EXAM_STATUS.DELIVERED,
    notes: "Released to patient",
    readyAtIso: nowIso,
    deliveredAtIso: nowIso,
    attachments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await examsRepository.saveExam({
    id: "77777777-7777-4777-8777-777777777777",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    requestedByProfessionalId: "usr-1",
    examType: "Pending renal profile",
    status: EXAM_STATUS.PENDING,
    notes: "Not yet released",
    readyAtIso: null,
    deliveredAtIso: null,
    attachments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await examsRepository.saveExam({
    id: "88888888-8888-4888-8888-888888888888",
    tenantId: "tenant-demo",
    patientId: "pt-portal-2",
    requestedByProfessionalId: "usr-1",
    examType: "Liver panel",
    status: EXAM_STATUS.DELIVERED,
    notes: "Other patient",
    readyAtIso: nowIso,
    deliveredAtIso: nowIso,
    attachments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await examsRepository.saveExam({
    id: "99999999-9999-4999-8999-999999999999",
    tenantId: "tenant-other",
    patientId: "pt-portal-1",
    requestedByProfessionalId: "usr-9",
    examType: "Tenant B released exam",
    status: EXAM_STATUS.DELIVERED,
    notes: "Tenant other",
    readyAtIso: nowIso,
    deliveredAtIso: nowIso,
    attachments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  const encounterTenantA = await clinicalRepository.saveEncounter({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tenantId: "tenant-demo",
    patientId: "pt-portal-1",
    authorProfessionalId: "usr-1",
    startedAtIso: "2026-04-01T10:00:00.000Z",
    endedAtIso: null,
    reason: "Portal visibility test",
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await clinicalRepository.saveNote(
    buildNote(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      encounterTenantA.id,
      "tenant-demo",
      "pt-portal-1",
      CLINICAL_NOTE_VISIBILITY.INTERNAL,
      nowIso
    )
  );
  await clinicalRepository.saveNote(
    buildNote(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      encounterTenantA.id,
      "tenant-demo",
      "pt-portal-1",
      CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED,
      nowIso
    )
  );

  const encounterTenantB = await clinicalRepository.saveEncounter({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    tenantId: "tenant-other",
    patientId: "pt-portal-1",
    authorProfessionalId: "usr-9",
    startedAtIso: "2026-04-03T10:00:00.000Z",
    endedAtIso: null,
    reason: "Tenant B portal test",
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await clinicalRepository.saveNote(
    buildNote(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      encounterTenantB.id,
      "tenant-other",
      "pt-portal-1",
      CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED,
      nowIso
    )
  );
}

function buildNote(
  noteId: string,
  encounterId: string,
  tenantId: string,
  patientId: string,
  visibility: ClinicalNote["visibility"],
  nowIso: string
): ClinicalNote {
  return {
    id: noteId,
    tenantId,
    encounterId,
    patientId,
    authorProfessionalId: "usr-1",
    visibility,
    subjective: "Subjective findings",
    objective: "Objective findings",
    assessment: "Assessment",
    plan: "Plan",
    vitals: {
      systolicBpMmHg: 120,
      diastolicBpMmHg: 80,
      heartRateBpm: 72,
      respiratoryRateBpm: 14,
      oxygenSaturationPct: 98,
      temperatureC: 36.5,
      weightKg: 70,
      heightCm: 170
    },
    medications: [],
    antecedentes: [],
    attachments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  };
}

function buildAppointment(
  nowIso: string,
  appointment: Pick<Appointment, "id" | "tenantId" | "patientId" | "specialistId" | "startAtIso" | "endAtIso" | "status" | "canceledAtIso">
): Appointment {
  return {
    ...appointment,
    externalCalendarEventId: null,
    calendarSyncStatus: APPOINTMENT_SYNC_STATUS.PENDING,
    calendarSyncAttempts: 0,
    calendarLastError: null,
    calendarLastAttemptAtIso: null,
    calendarNextRetryAtIso: nowIso,
    calendarLastSyncedAtIso: null,
    calendarSyncUpdatedAtIso: nowIso,
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  };
}
