import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import { PatientsService } from "./patients.service.js";

const TENANT_CLINICIAN = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.CLINICIAN,
  email: "clinician@lia.local"
} as const;

function createMockPatientRepository(
  overrides: Partial<{
    findByIdWithinTenant: (patientId: string, scope: unknown) => unknown;
  }> = {}
) {
  return {
    findByIdWithinTenant: overrides.findByIdWithinTenant ?? (() => null)
  } as unknown as import("./patient.repository.js").PatientRepository;
}

describe("PatientsService", () => {
  let patientsService: PatientsService;

  beforeEach(() => {
    const mockRepo = createMockPatientRepository();
    patientsService = new PatientsService(mockRepo);
  });

  describe("getChart", () => {
    it("returns patient chart when found within tenant scope", async () => {
      const fakePatient = {
        id: "pt-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-01",
        medicalRecordNumber: "MRN-001"
      };

      const mockRepo = createMockPatientRepository({
        findByIdWithinTenant: () => fakePatient
      });
      patientsService = new PatientsService(mockRepo);

      const result = patientsService.getChart(TENANT_CLINICIAN, "pt-1");

      assert.equal(result.id, "pt-1");
      assert.equal(result.tenantId, TENANT_CLINICIAN.tenantId);
    });

    it("throws NotFoundException when patient does not exist", async () => {
      const mockRepo = createMockPatientRepository({
        findByIdWithinTenant: () => null
      });
      patientsService = new PatientsService(mockRepo);

      assert.throws(
        () => patientsService.getChart(TENANT_CLINICIAN, "nonexistent"),
        /Patient not found/
      );
    });
  });
});
