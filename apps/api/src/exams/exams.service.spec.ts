import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import { ExamsService } from "./exams.service.js";
import { EXAM_STATUS } from "./exams.types.js";

const TENANT_CLINICIAN = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.CLINICIAN,
  email: "clinician@lia.local"
} as const;

function createMockExamsRepository(
  overrides: Partial<{
    saveExam: (data: unknown) => Promise<unknown>;
    findExamWithinTenant: (tenantId: string, examId: string, tx?: unknown) => Promise<unknown>;
    listPatientExams: (
      tenantId: string,
      patientId: string,
      visibility: string
    ) => Promise<unknown[]>;
    enqueueExamStatusNotificationOutboxEvent: (data: unknown, tx?: unknown) => Promise<void>;
    inSerializedTransaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  }> = {}
) {
  return {
    saveExam: overrides.saveExam ?? (async () => ({})),
    findExamWithinTenant: overrides.findExamWithinTenant ?? (async () => null),
    listPatientExams: overrides.listPatientExams ?? (async () => []),
    enqueueExamStatusNotificationOutboxEvent:
      overrides.enqueueExamStatusNotificationOutboxEvent ?? (async () => {}),
    inSerializedTransaction: overrides.inSerializedTransaction ?? (async (fn) => fn({}))
  } as unknown as import("./exams.repository.js").ExamsRepository;
}

function createMockAuditRepository() {
  return {
    saveDomainEvent: async () => {}
  } as unknown as import("../audit/audit.repository.js").AuditRepository;
}

describe("ExamsService", () => {
  let examsService: ExamsService;

  beforeEach(() => {
    const mockRepo = createMockExamsRepository();
    const mockAudit = createMockAuditRepository();
    examsService = new ExamsService(mockRepo, mockAudit);
  });

  describe("createExam", () => {
    it("creates exam with pending status", async () => {
      const fakeExam = {
        id: "exam-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        requestedByProfessionalId: TENANT_CLINICIAN.id,
        examType: "blood_test",
        status: EXAM_STATUS.PENDING,
        notes: null,
        readyAtIso: null,
        deliveredAtIso: null,
        attachments: [],
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z"
      };

      const mockRepo = createMockExamsRepository({
        saveExam: async () => fakeExam,
        inSerializedTransaction: async (fn) => fn({})
      });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      const result = await examsService.createExam(TENANT_CLINICIAN, {
        patientId: "pt-1",
        examType: "blood_test",
        attachments: [],
        notes: null
      });

      assert.equal(result.exam.id, "exam-1");
      assert.equal(result.exam.status, EXAM_STATUS.PENDING);
    });

    it("throws BadRequestException when patientId is empty", async () => {
      await assert.rejects(
        () =>
          examsService.createExam(TENANT_CLINICIAN, {
            patientId: "  ",
            examType: "blood_test",
            attachments: [],
            notes: null
          }),
        /patientId is required/
      );
    });

    it("throws BadRequestException when examType is empty", async () => {
      await assert.rejects(
        () =>
          examsService.createExam(TENANT_CLINICIAN, {
            patientId: "pt-1",
            examType: "  ",
            attachments: [],
            notes: null
          }),
        /examType is required/
      );
    });

    it("throws BadRequestException when attachment is missing required fields", async () => {
      await assert.rejects(
        () =>
          examsService.createExam(TENANT_CLINICIAN, {
            patientId: "pt-1",
            examType: "blood_test",
            attachments: [
              { attachmentId: "", fileName: "", mimeType: "image/png", sizeBytes: 100 }
            ],
            notes: null
          }),
        /attachments.attachmentId is required/
      );
    });
  });

  describe("transitionExamStatus", () => {
    it("transitions pending -> ready and sets readyAtIso", async () => {
      const fakeExam = {
        id: "exam-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        requestedByProfessionalId: TENANT_CLINICIAN.id,
        examType: "blood_test",
        status: EXAM_STATUS.PENDING,
        notes: null,
        readyAtIso: null,
        deliveredAtIso: null,
        attachments: [],
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z"
      };

      const mockRepo = createMockExamsRepository({
        findExamWithinTenant: async () => fakeExam,
        // @ts-ignore - simplified mock
        saveExam: async (data) => ({ ...fakeExam, ...data }),
        enqueueExamStatusNotificationOutboxEvent: async () => {},
        inSerializedTransaction: async (fn) => fn({})
      });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      const result = await examsService.transitionExamStatus(TENANT_CLINICIAN, "exam-1", {
        toStatus: "ready"
      });

      assert.equal(result.exam.status, EXAM_STATUS.READY);
      assert.ok(result.exam.readyAtIso !== null);
    });

    it("throws ConflictException for invalid transition pending -> delivered", async () => {
      const fakeExam = {
        id: "exam-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        requestedByProfessionalId: TENANT_CLINICIAN.id,
        examType: "blood_test",
        status: EXAM_STATUS.PENDING,
        notes: null,
        readyAtIso: null,
        deliveredAtIso: null,
        attachments: [],
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z"
      };

      const mockRepo = createMockExamsRepository({
        findExamWithinTenant: async () => fakeExam,
        inSerializedTransaction: async (fn) => fn({})
      });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      await assert.rejects(
        () =>
          examsService.transitionExamStatus(TENANT_CLINICIAN, "exam-1", { toStatus: "delivered" }),
        /not allowed/
      );
    });

    it("throws NotFoundException when exam does not exist", async () => {
      const mockRepo = createMockExamsRepository({
        findExamWithinTenant: async () => null,
        inSerializedTransaction: async (fn) => fn({})
      });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      await assert.rejects(
        () =>
          examsService.transitionExamStatus(TENANT_CLINICIAN, "nonexistent", { toStatus: "ready" }),
        /Exam not found/
      );
    });

    it("allows same-status transition READY -> READY as no-op", async () => {
      const fakeExam = {
        id: "exam-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        requestedByProfessionalId: TENANT_CLINICIAN.id,
        examType: "blood_test",
        status: EXAM_STATUS.READY,
        notes: null,
        readyAtIso: "2026-01-01T10:00:00.000Z",
        deliveredAtIso: null,
        attachments: [],
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z"
      };

      const mockRepo = createMockExamsRepository({
        findExamWithinTenant: async () => fakeExam,
        // @ts-ignore - simplified mock
        saveExam: async (data) => ({ ...fakeExam, ...data }),
        inSerializedTransaction: async (fn) => fn({})
      });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      const result = await examsService.transitionExamStatus(TENANT_CLINICIAN, "exam-1", {
        toStatus: "ready"
      });
      assert.equal(result.exam.status, EXAM_STATUS.READY);
    });
  });

  describe("listPatientExams", () => {
    it("returns normalized patient id and default visibility scope", async () => {
      const mockRepo = createMockExamsRepository({ listPatientExams: async () => [] });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      const result = await examsService.listPatientExams(TENANT_CLINICIAN, "  pt-1  ", {
        visibilityScope: "all"
      });

      assert.equal(result.patientId, "pt-1");
      assert.equal(result.visibilityScope, "all");
    });

    it("throws BadRequestException for empty patientId", async () => {
      await assert.rejects(
        () => examsService.listPatientExams(TENANT_CLINICIAN, "   ", { visibilityScope: "all" }),
        /patientId is required/
      );
    });
  });

  describe("getExamStatus", () => {
    it("returns exam status when found", async () => {
      const fakeExam = {
        id: "exam-1",
        tenantId: TENANT_CLINICIAN.tenantId,
        patientId: "pt-1",
        requestedByProfessionalId: TENANT_CLINICIAN.id,
        examType: "blood_test",
        status: EXAM_STATUS.READY,
        notes: null,
        readyAtIso: "2026-01-01T10:00:00.000Z",
        deliveredAtIso: null,
        attachments: [],
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z"
      };

      const mockRepo = createMockExamsRepository({ findExamWithinTenant: async () => fakeExam });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      const result = await examsService.getExamStatus(TENANT_CLINICIAN, "exam-1");

      assert.equal(result.examId, "exam-1");
      assert.equal(result.status, EXAM_STATUS.READY);
    });

    it("throws NotFoundException when exam not found", async () => {
      const mockRepo = createMockExamsRepository({ findExamWithinTenant: async () => null });
      const mockAudit = createMockAuditRepository();
      examsService = new ExamsService(mockRepo, mockAudit);

      await assert.rejects(
        () => examsService.getExamStatus(TENANT_CLINICIAN, "nonexistent"),
        /Exam not found/
      );
    });

    it("throws BadRequestException for empty examId", async () => {
      await assert.rejects(
        () => examsService.getExamStatus(TENANT_CLINICIAN, "  "),
        /examId is required/
      );
    });
  });
});
