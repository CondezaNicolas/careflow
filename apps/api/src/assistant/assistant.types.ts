import type { UserRole } from "../common/constants/user-role.js";

export const ASSISTANT_TOOL_NAME = {
  AVAILABILITY_SEARCH: "availability.search",
  APPOINTMENTS_CREATE: "appointments.create",
  APPOINTMENTS_RESCHEDULE: "appointments.reschedule",
  APPOINTMENTS_CANCEL: "appointments.cancel",
  EXAMS_STATUS_GET: "exams.status.get",
  NEWS_LIST: "news.list"
} as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAME)[keyof typeof ASSISTANT_TOOL_NAME];

export const ASSISTANT_INVOCATION_STATUS = {
  SUCCESS: "success",
  REQUIRES_CONFIRMATION: "requires_confirmation",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  UNAVAILABLE: "unavailable",
  FAILED: "failed"
} as const;

export type AssistantInvocationStatus = (typeof ASSISTANT_INVOCATION_STATUS)[keyof typeof ASSISTANT_INVOCATION_STATUS];

export interface AssistantWriteConfirmation {
  confirmed: boolean;
  token: string | null;
  reason: string | null;
}

export interface AssistantAlternativeSlot {
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface AssistantToolError {
  code: string;
  message: string;
}

export interface AssistantConfirmationRequirement {
  required: boolean;
  provided: boolean;
  token: string | null;
}

export interface AssistantToolResponse {
  tool: AssistantToolName;
  status: AssistantInvocationStatus;
  result: unknown;
  error: AssistantToolError | null;
  confirmation: AssistantConfirmationRequirement;
  alternatives: AssistantAlternativeSlot[];
}

export interface AssistantAuditRecord {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: UserRole;
  toolName: AssistantToolName;
  isWriteAction: boolean;
  confirmationRequired: boolean;
  confirmationProvided: boolean;
  confirmationToken: string | null;
  outcome: AssistantInvocationStatus;
  request: unknown;
  response: AssistantToolResponse;
}

export interface AvailabilitySearchInput {
  specialistId: string;
  fromIso: string;
  toIso: string;
  durationMinutes: number;
}

export interface AppointmentCreateInput {
  patientId: string;
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
  idempotencyKey: string;
}

export interface AppointmentRescheduleInput {
  appointmentId: string;
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
  idempotencyKey: string;
}

export interface AppointmentCancelInput {
  appointmentId: string;
  idempotencyKey: string;
}

export interface ExamStatusGetInput {
  examId: string;
}
