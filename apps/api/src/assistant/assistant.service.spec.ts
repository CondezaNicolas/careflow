import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { AssistantService } from "./assistant.service.js";
import { ASSISTANT_INVOCATION_STATUS, ASSISTANT_TOOL_NAME } from "./assistant.types.js";

const CLINICIAN_PRINCIPAL = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.CLINICIAN,
  email: "clinician@lia.local"
} as const;

const PATIENT_PRINCIPAL = {
  id: "pt-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: USER_ROLE.PATIENT,
  email: "patient@lia.local"
} as const;

function createMockSchedulingService(
  overrides: Partial<{
    searchAvailability: (principal: unknown, query: unknown) => Promise<unknown>;
    createAppointment: (
      principal: unknown,
      input: unknown,
      idempotencyKey: string,
      meta: unknown
    ) => Promise<unknown>;
    cancelAppointment: (
      principal: unknown,
      id: string,
      idempotencyKey: string,
      meta: unknown
    ) => Promise<unknown>;
  }> = {}
) {
  return {
    searchAvailability: overrides.searchAvailability ?? (async () => ({ slots: [] })),
    createAppointment:
      overrides.createAppointment ?? (async () => ({ action: "create", appointment: {} })),
    cancelAppointment: overrides.cancelAppointment ?? (async () => ({ action: "cancel" })),
    rescheduleAppointment: async () => ({ action: "reschedule", appointment: {} })
  } as unknown as import("../scheduling/scheduling.service.js").SchedulingService;
}

function createMockExamsService(
  overrides: Partial<{
    getExamStatus: (principal: unknown, examId: string) => Promise<unknown>;
  }> = {}
) {
  return {
    getExamStatus:
      overrides.getExamStatus ??
      (async () => ({ examId: "exam-1", status: "ready", readyAtIso: null, deliveredAtIso: null }))
  } as unknown as import("../exams/exams.service.js").ExamsService;
}

function createMockAssistantRepository() {
  return {
    saveAuditRecord: async () => {}
  } as unknown as import("./assistant.repository.js").AssistantRepository;
}

function createMockPlatformConfigService() {
  return {
    cookies: {
      sessionSecret: "test-session-secret-32-characters!!"
    }
  } as PlatformConfigService;
}

describe("AssistantService", () => {
  let assistantService: AssistantService;

  beforeEach(() => {
    const mockScheduling = createMockSchedulingService();
    const mockExams = createMockExamsService();
    const mockRepo = createMockAssistantRepository();
    const mockPlatformConfig = createMockPlatformConfigService();
    assistantService = new AssistantService(
      mockScheduling,
      mockExams,
      mockRepo,
      mockPlatformConfig
    );
  });

  describe("role enforcement", () => {
    it("denies patient role access to availability.search", async () => {
      const result = await assistantService.invokeTool(
        PATIENT_PRINCIPAL,
        ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH,
        {
          input: {
            specialistId: "usr-1",
            fromIso: "2026-04-01T00:00:00Z",
            toIso: "2026-04-02T00:00:00Z",
            durationMinutes: 30
          }
        }
      );

      assert.equal(result.status, ASSISTANT_INVOCATION_STATUS.FORBIDDEN);
      assert.equal(result.error?.code, "assistant.forbidden_role");
    });

    it("allows clinician to access availability.search", async () => {
      const mockScheduling = createMockSchedulingService({
        searchAvailability: async () => ({ slots: [] })
      });
      const mockExams = createMockExamsService();
      const mockRepo = createMockAssistantRepository();
      const mockPlatformConfig = createMockPlatformConfigService();
      assistantService = new AssistantService(
        mockScheduling,
        mockExams,
        mockRepo,
        mockPlatformConfig
      );

      const result = await assistantService.invokeTool(
        CLINICIAN_PRINCIPAL,
        ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH,
        {
          input: {
            specialistId: "usr-1",
            fromIso: "2026-04-01T00:00:00Z",
            toIso: "2026-04-02T00:00:00Z",
            durationMinutes: 30
          }
        }
      );

      assert.equal(result.status, ASSISTANT_INVOCATION_STATUS.SUCCESS);
      assert.equal(result.tool, ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH);
    });

    it("allows patient to access news.list", async () => {
      const result = await assistantService.invokeTool(
        PATIENT_PRINCIPAL,
        ASSISTANT_TOOL_NAME.NEWS_LIST,
        { input: {} }
      );

      assert.equal(result.status, ASSISTANT_INVOCATION_STATUS.SUCCESS);
      assert.equal(result.tool, ASSISTANT_TOOL_NAME.NEWS_LIST);
    });
  });

  describe("confirmation token for write actions", () => {
    it("requires confirmation for appointments.create", async () => {
      const result = await assistantService.invokeTool(
        CLINICIAN_PRINCIPAL,
        ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE,
        {
          input: {
            patientId: "pt-1",
            specialistId: "usr-1",
            startAtIso: "2026-04-01T09:00:00Z",
            endAtIso: "2026-04-01T09:30:00Z",
            idempotencyKey: "idem-1"
          },
          confirmation: { confirmed: false, token: null, reason: null }
        }
      );

      assert.equal(result.status, ASSISTANT_INVOCATION_STATUS.REQUIRES_CONFIRMATION);
      assert.equal(result.confirmation?.required, true);
      assert.ok(result.confirmation?.token !== null);
    });

    it("rejects mismatched confirmation token", async () => {
      const result = await assistantService.invokeTool(
        CLINICIAN_PRINCIPAL,
        ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE,
        {
          input: {
            patientId: "pt-1",
            specialistId: "usr-1",
            startAtIso: "2026-04-01T09:00:00Z",
            endAtIso: "2026-04-01T09:30:00Z",
            idempotencyKey: "idem-1"
          },
          confirmation: { confirmed: true, token: "wrong-token", reason: null }
        }
      );

      assert.equal(result.status, ASSISTANT_INVOCATION_STATUS.FAILED);
      assert.equal(result.error?.code, "assistant.confirmation_token_mismatch");
    });
  });

  describe("invalid tool name", () => {
    it("throws BadRequestException for unsupported tool name", async () => {
      await assert.rejects(
        () =>
          assistantService.invokeTool(CLINICIAN_PRINCIPAL, "nonexistent.tool" as never, {
            input: {}
          }),
        /Unsupported assistant tool name/
      );
    });
  });
});
