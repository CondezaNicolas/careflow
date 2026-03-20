import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import { APPOINTMENT_STATUS } from "../scheduling/scheduling.types.js";
import { PatientPortalService } from "./patient-portal.service.js";

const TENANT_CLINICIAN = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.CLINICIAN,
  email: "clinician@lia.local"
} as const;

const TENANT_PATIENT = {
  id: "pt-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.PATIENT,
  email: "patient@lia.local"
} as const;

function createMockSchedulingRepository(
  overrides: Partial<{
    listAppointmentsForPatient: (tenantId: string, patientId: string) => Promise<unknown[]>;
  }> = {}
) {
  return {
    listAppointmentsForPatient: overrides.listAppointmentsForPatient ?? (async () => [])
  } as unknown as import("../scheduling/scheduling.repository.js").SchedulingRepository;
}

function createMockExamsRepository(
  overrides: Partial<{
    listPatientExams: (
      tenantId: string,
      patientId: string,
      visibility: string
    ) => Promise<unknown[]>;
  }> = {}
) {
  return {
    listPatientExams: overrides.listPatientExams ?? (async () => [])
  } as unknown as import("../exams/exams.repository.js").ExamsRepository;
}

function createMockClinicalRepository(
  overrides: Partial<{
    listPatientTimeline: (
      tenantId: string,
      patientId: string,
      visibility: string,
      limit: number,
      offset: number
    ) => Promise<{ entries: unknown[] }>;
  }> = {}
) {
  return {
    listPatientTimeline: overrides.listPatientTimeline ?? (async () => ({ entries: [] }))
  } as unknown as import("../clinical/clinical.repository.js").ClinicalRepository;
}

describe("PatientPortalService", () => {
  let patientPortalService: PatientPortalService;

  beforeEach(() => {
    const mockScheduling = createMockSchedulingRepository();
    const mockExams = createMockExamsRepository();
    const mockClinical = createMockClinicalRepository();
    patientPortalService = new PatientPortalService(mockScheduling, mockExams, mockClinical);
  });

  describe("getOverview", () => {
    it("returns overview with upcoming and history appointments partitioned", async () => {
      const now = Date.now();
      const pastAppointment = {
        id: "apt-past",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        specialistId: "usr-1",
        status: APPOINTMENT_STATUS.SCHEDULED,
        startAtIso: new Date(now - 3_600_000).toISOString(), // 1h ago
        endAtIso: new Date(now - 3_600_000 + 1_800_000).toISOString()
      };
      const futureAppointment = {
        id: "apt-future",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        specialistId: "usr-1",
        status: APPOINTMENT_STATUS.SCHEDULED,
        startAtIso: new Date(now + 3_600_000).toISOString(), // 1h from now
        endAtIso: new Date(now + 3_600_000 + 1_800_000).toISOString()
      };

      const mockScheduling = createMockSchedulingRepository({
        listAppointmentsForPatient: async () => [pastAppointment, futureAppointment]
      });
      const mockExams = createMockExamsRepository({ listPatientExams: async () => [] });
      const mockClinical = createMockClinicalRepository({
        listPatientTimeline: async () => ({ entries: [] })
      });
      patientPortalService = new PatientPortalService(mockScheduling, mockExams, mockClinical);

      const result = await patientPortalService.getOverview(TENANT_CLINICIAN, "pt-1");

      assert.equal(result.overview.patientId, "pt-1");
      assert.equal(result.overview.appointments.upcoming.length, 1);
      assert.equal(result.overview.appointments.history.length, 1);
      assert.equal(result.overview.appointments.upcoming[0]?.id, "apt-future");
      assert.equal(result.overview.appointments.history[0]?.id, "apt-past");
    });

    it("throws BadRequestException for empty patientId", async () => {
      await assert.rejects(
        () => patientPortalService.getOverview(TENANT_CLINICIAN, "   "),
        /patientId is required/
      );
    });

    it("throws ForbiddenException when patient tries to access another patient's portal", async () => {
      await assert.rejects(
        () => patientPortalService.getOverview(TENANT_PATIENT, "pt-999"),
        /Patient can only access own portal data/
      );
    });

    it("allows patient to access own portal data", async () => {
      const mockScheduling = createMockSchedulingRepository({
        listAppointmentsForPatient: async () => []
      });
      const mockExams = createMockExamsRepository({ listPatientExams: async () => [] });
      const mockClinical = createMockClinicalRepository({
        listPatientTimeline: async () => ({ entries: [] })
      });
      patientPortalService = new PatientPortalService(mockScheduling, mockExams, mockClinical);

      const result = await patientPortalService.getOverview(TENANT_PATIENT, "pt-1");

      assert.equal(result.overview.patientId, "pt-1");
    });
  });
});
