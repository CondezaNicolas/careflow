import { createHmac, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { AUDIT_SOURCE, type MutationMeta } from "../audit/audit.types.js";
import { USER_ROLE, type UserRole } from "../common/constants/user-role.js";
import { getLogger, normalizeError } from "../common/observability/platform-logger.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { ExamsService } from "../exams/exams.service.js";
import {
  type CreateAppointmentRequest,
  type RescheduleAppointmentRequest,
  type SearchAvailabilityQuery
} from "../scheduling/scheduling.contracts.js";
import { SchedulingService } from "../scheduling/scheduling.service.js";
import {
  type AssistantInvokeToolRequest,
  type AssistantNewsItem,
  isAssistantToolName
} from "./assistant.contracts.js";
import { AssistantRepository } from "./assistant.repository.js";
import {
  ASSISTANT_INVOCATION_STATUS,
  ASSISTANT_TOOL_NAME,
  type AppointmentCancelInput,
  type AppointmentCreateInput,
  type AppointmentRescheduleInput,
  type AssistantAlternativeSlot,
  type AssistantAuditRecord,
  type AssistantToolName,
  type AssistantToolResponse,
  type AssistantWriteConfirmation,
  type AvailabilitySearchInput,
  type ExamStatusGetInput
} from "./assistant.types.js";

const WRITE_TOOLS = {
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE]: true,
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_RESCHEDULE]: true,
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_CANCEL]: true,
  [ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH]: false,
  [ASSISTANT_TOOL_NAME.EXAMS_STATUS_GET]: false,
  [ASSISTANT_TOOL_NAME.NEWS_LIST]: false
} as const;

const TOOL_ALLOWED_ROLES: Record<AssistantToolName, readonly UserRole[]> = {
  [ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST
  ],
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST
  ],
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_RESCHEDULE]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST
  ],
  [ASSISTANT_TOOL_NAME.APPOINTMENTS_CANCEL]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST
  ],
  [ASSISTANT_TOOL_NAME.EXAMS_STATUS_GET]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST
  ],
  [ASSISTANT_TOOL_NAME.NEWS_LIST]: [
    USER_ROLE.ADMIN,
    USER_ROLE.CLINICIAN,
    USER_ROLE.RECEPTIONIST,
    USER_ROLE.PATIENT
  ]
};

const DEFAULT_NEWS_ITEMS: AssistantNewsItem[] = [
  {
    id: "placeholder-1",
    title: "No clinic bulletins yet",
    summary:
      "This MVP placeholder confirms news.list wiring. Replace with CMS-backed feed in a later batch.",
    publishedAtIso: "2026-01-01T00:00:00.000Z"
  }
];

@Injectable()
export class AssistantService {
  constructor(
    @Inject(SchedulingService) private readonly schedulingService: SchedulingService,
    @Inject(ExamsService) private readonly examsService: ExamsService,
    @Inject(AssistantRepository) private readonly assistantRepository: AssistantRepository,
    @Inject(PlatformConfigService) private readonly platformConfig: PlatformConfigService
  ) {}

  async invokeTool(
    principal: AuthPrincipal,
    toolNameValue: string,
    request: AssistantInvokeToolRequest,
    meta?: MutationMeta
  ): Promise<AssistantToolResponse> {
    if (!isAssistantToolName(toolNameValue)) {
      throw new BadRequestException("Unsupported assistant tool name");
    }

    const toolName = toolNameValue;
    const allowedRoles = TOOL_ALLOWED_ROLES[toolName];
    const isWriteAction = WRITE_TOOLS[toolName];
    const confirmation = normalizeConfirmation(request.confirmation);

    let response: AssistantToolResponse | null = null;
    try {
      if (!allowedRoles.includes(principal.role)) {
        response = {
          tool: toolName,
          status: ASSISTANT_INVOCATION_STATUS.FORBIDDEN,
          result: { allowedRoles },
          error: {
            code: "assistant.forbidden_role",
            message: `Role '${principal.role}' cannot invoke ${toolName}`
          },
          confirmation: {
            required: isWriteAction,
            provided: Boolean(confirmation?.confirmed),
            token: null
          },
          alternatives: []
        };
        return response;
      }

      if (isWriteAction) {
        const token = this.buildConfirmationToken(toolName, principal, request.input);
        if (!confirmation?.confirmed) {
          response = {
            tool: toolName,
            status: ASSISTANT_INVOCATION_STATUS.REQUIRES_CONFIRMATION,
            result: {
              message: "Explicit confirmation is required before write actions are committed"
            },
            error: null,
            confirmation: {
              required: true,
              provided: false,
              token
            },
            alternatives: []
          };
          return response;
        }

        if (confirmation.token !== token) {
          response = {
            tool: toolName,
            status: ASSISTANT_INVOCATION_STATUS.FAILED,
            result: null,
            error: {
              code: "assistant.confirmation_token_mismatch",
              message: "Confirmation token does not match requested payload"
            },
            confirmation: {
              required: true,
              provided: true,
              token
            },
            alternatives: []
          };
          return response;
        }
      }

      response = await this.invokeAuthorizedTool(
        principal,
        toolName,
        request.input,
        confirmation,
        meta
      );
      return response;
    } catch (error) {
      response = await this.mapRuntimeError(toolName, principal, request.input, error);
      return response;
    } finally {
      if (response) {
        await this.persistAudit(principal, toolName, isWriteAction, request, response);
      }
    }
  }

  private async invokeAuthorizedTool(
    principal: AuthPrincipal,
    toolName: AssistantToolName,
    input: unknown,
    confirmation: AssistantWriteConfirmation | null,
    meta?: MutationMeta
  ): Promise<AssistantToolResponse> {
    const assistantMeta: MutationMeta = {
      source: AUDIT_SOURCE.ASSISTANT,
      requestId: meta?.requestId,
      traceId: meta?.traceId
    };

    if (toolName === ASSISTANT_TOOL_NAME.AVAILABILITY_SEARCH) {
      const parsed = parseAvailabilityInput(input);
      const result = await this.schedulingService.searchAvailability(principal, parsed);
      return success(toolName, result, false, confirmation);
    }

    if (toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE) {
      const parsed = parseCreateInput(input);
      const command: CreateAppointmentRequest = {
        patientId: parsed.patientId,
        specialistId: parsed.specialistId,
        startAtIso: parsed.startAtIso,
        endAtIso: parsed.endAtIso
      };
      const result = await this.schedulingService.createAppointment(
        principal,
        command,
        parsed.idempotencyKey,
        assistantMeta
      );
      return success(toolName, result, true, confirmation);
    }

    if (toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_RESCHEDULE) {
      const parsed = parseRescheduleInput(input);
      const command: RescheduleAppointmentRequest = {
        specialistId: parsed.specialistId,
        startAtIso: parsed.startAtIso,
        endAtIso: parsed.endAtIso
      };
      const result = await this.schedulingService.rescheduleAppointment(
        principal,
        parsed.appointmentId,
        command,
        parsed.idempotencyKey,
        assistantMeta
      );
      return success(toolName, result, true, confirmation);
    }

    if (toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_CANCEL) {
      const parsed = parseCancelInput(input);
      const result = await this.schedulingService.cancelAppointment(
        principal,
        parsed.appointmentId,
        parsed.idempotencyKey,
        assistantMeta
      );
      return success(toolName, result, true, confirmation);
    }

    if (toolName === ASSISTANT_TOOL_NAME.EXAMS_STATUS_GET) {
      const parsed = parseExamStatusInput(input);
      try {
        const result = await this.examsService.getExamStatus(principal, parsed.examId);
        return success(toolName, result, false, confirmation);
      } catch (error) {
        if (error instanceof NotFoundException) {
          return {
            tool: toolName,
            status: ASSISTANT_INVOCATION_STATUS.UNAVAILABLE,
            result: {
              examId: parsed.examId,
              available: false,
              status: null,
              readyAtIso: null,
              deliveredAtIso: null
            },
            error: {
              code: "exams.status_unavailable",
              message: "Exam status is currently unavailable"
            },
            confirmation: {
              required: false,
              provided: false,
              token: null
            },
            alternatives: []
          };
        }

        throw error;
      }
    }

    return success(toolName, { items: DEFAULT_NEWS_ITEMS }, false, confirmation);
  }

  private async mapRuntimeError(
    toolName: AssistantToolName,
    principal: AuthPrincipal,
    input: unknown,
    error: unknown
  ): Promise<AssistantToolResponse> {
    if (error instanceof ConflictException) {
      return {
        tool: toolName,
        status: ASSISTANT_INVOCATION_STATUS.CONFLICT,
        result: {
          reason: "Requested operation conflicts with current scheduling state"
        },
        error: {
          code: "scheduling.slot_unavailable",
          message: error.message
        },
        confirmation: {
          required: WRITE_TOOLS[toolName],
          provided: true,
          token: null
        },
        alternatives: await this.resolveAlternatives(toolName, principal, input)
      };
    }

    if (error instanceof ForbiddenException) {
      return {
        tool: toolName,
        status: ASSISTANT_INVOCATION_STATUS.FORBIDDEN,
        result: null,
        error: {
          code: "assistant.forbidden",
          message: error.message
        },
        confirmation: {
          required: WRITE_TOOLS[toolName],
          provided: true,
          token: null
        },
        alternatives: []
      };
    }

    if (error instanceof NotFoundException) {
      return {
        tool: toolName,
        status: ASSISTANT_INVOCATION_STATUS.UNAVAILABLE,
        result: null,
        error: {
          code: "assistant.resource_unavailable",
          message: error.message
        },
        confirmation: {
          required: WRITE_TOOLS[toolName],
          provided: true,
          token: null
        },
        alternatives: []
      };
    }

    getLogger({ component: AssistantService.name }).error({
      event: "assistant.tool_invocation.failed",
      error: normalizeError(error)
    });

    return {
      tool: toolName,
      status: ASSISTANT_INVOCATION_STATUS.FAILED,
      result: null,
      error: {
        code: "assistant.runtime_failure",
        message: "Assistant tool invocation failed"
      },
      confirmation: {
        required: WRITE_TOOLS[toolName],
        provided: true,
        token: null
      },
      alternatives: []
    };
  }

  private async resolveAlternatives(
    toolName: AssistantToolName,
    principal: AuthPrincipal,
    input: unknown
  ): Promise<AssistantAlternativeSlot[]> {
    if (
      toolName !== ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE &&
      toolName !== ASSISTANT_TOOL_NAME.APPOINTMENTS_RESCHEDULE
    ) {
      return [];
    }

    const specialistId =
      toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE
        ? parseCreateInput(input).specialistId
        : parseRescheduleInput(input).specialistId;
    const startAtIso =
      toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE
        ? parseCreateInput(input).startAtIso
        : parseRescheduleInput(input).startAtIso;
    const endAtIso =
      toolName === ASSISTANT_TOOL_NAME.APPOINTMENTS_CREATE
        ? parseCreateInput(input).endAtIso
        : parseRescheduleInput(input).endAtIso;

    const start = new Date(startAtIso);
    const end = new Date(endAtIso);
    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));

    const from = new Date(start.getTime() - 60 * 60 * 1000).toISOString();
    const to = new Date(end.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const query: SearchAvailabilityQuery = {
      specialistId,
      fromIso: from,
      toIso: to,
      durationMinutes
    };

    try {
      const search = await this.schedulingService.searchAvailability(principal, query);
      return search.slots.slice(0, 3);
    } catch {
      return [];
    }
  }

  private async persistAudit(
    principal: AuthPrincipal,
    toolName: AssistantToolName,
    isWriteAction: boolean,
    request: AssistantInvokeToolRequest,
    response: AssistantToolResponse
  ): Promise<void> {
    const record: AssistantAuditRecord = {
      id: randomUUID(),
      tenantId: principal.tenantId,
      actorId: principal.id,
      actorRole: principal.role,
      toolName,
      isWriteAction,
      confirmationRequired: isWriteAction,
      confirmationProvided: Boolean(request.confirmation?.confirmed),
      confirmationToken: request.confirmation?.token ?? null,
      outcome: response.status,
      request,
      response
    };
    await this.assistantRepository.saveAuditRecord(record);
  }

  private buildConfirmationToken(
    toolName: AssistantToolName,
    principal: AuthPrincipal,
    input: unknown
  ): string {
    const payload = JSON.stringify({
      tenantId: principal.tenantId,
      actorId: principal.id,
      toolName,
      input
    });

    return createHmac("sha256", this.platformConfig.cookies.sessionSecret)
      .update(payload)
      .digest("hex")
      .slice(0, 24);
  }
}

function success(
  tool: AssistantToolName,
  result: unknown,
  isWriteAction: boolean,
  confirmation: AssistantWriteConfirmation | null
): AssistantToolResponse {
  return {
    tool,
    status: ASSISTANT_INVOCATION_STATUS.SUCCESS,
    result,
    error: null,
    confirmation: {
      required: isWriteAction,
      provided: Boolean(confirmation?.confirmed),
      token: confirmation?.token ?? null
    },
    alternatives: []
  };
}

function normalizeConfirmation(
  value: AssistantWriteConfirmation | undefined
): AssistantWriteConfirmation | null {
  if (!value) {
    return null;
  }

  return {
    confirmed: Boolean(value.confirmed),
    token: normalizeOptionalText(value.token),
    reason: normalizeOptionalText(value.reason)
  };
}

function parseAvailabilityInput(input: unknown): AvailabilitySearchInput {
  const value = asRecord(input);
  return {
    specialistId: requireText(value.specialistId, "input.specialistId"),
    fromIso: requireText(value.fromIso, "input.fromIso"),
    toIso: requireText(value.toIso, "input.toIso"),
    durationMinutes: requirePositiveInteger(value.durationMinutes, "input.durationMinutes")
  };
}

function parseCreateInput(input: unknown): AppointmentCreateInput {
  const value = asRecord(input);
  return {
    patientId: requireText(value.patientId, "input.patientId"),
    specialistId: requireText(value.specialistId, "input.specialistId"),
    startAtIso: requireText(value.startAtIso, "input.startAtIso"),
    endAtIso: requireText(value.endAtIso, "input.endAtIso"),
    idempotencyKey: requireText(value.idempotencyKey, "input.idempotencyKey")
  };
}

function parseRescheduleInput(input: unknown): AppointmentRescheduleInput {
  const value = asRecord(input);
  return {
    appointmentId: requireText(value.appointmentId, "input.appointmentId"),
    specialistId: requireText(value.specialistId, "input.specialistId"),
    startAtIso: requireText(value.startAtIso, "input.startAtIso"),
    endAtIso: requireText(value.endAtIso, "input.endAtIso"),
    idempotencyKey: requireText(value.idempotencyKey, "input.idempotencyKey")
  };
}

function parseCancelInput(input: unknown): AppointmentCancelInput {
  const value = asRecord(input);
  return {
    appointmentId: requireText(value.appointmentId, "input.appointmentId"),
    idempotencyKey: requireText(value.idempotencyKey, "input.idempotencyKey")
  };
}

function parseExamStatusInput(input: unknown): ExamStatusGetInput {
  const value = asRecord(input);
  return {
    examId: requireText(value.examId, "input.examId")
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException("input must be an object");
  }

  return value as Record<string, unknown>;
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return normalized;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}
