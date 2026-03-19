import type { UserRole } from "../common/constants/user-role.js";

export const AUDIT_SOURCE = {
  API: "api",
  ASSISTANT: "assistant"
} as const;

export const AUDIT_ACTION = {
  SCHEDULING_APPOINTMENT_CREATED: "scheduling.appointment.created",
  SCHEDULING_APPOINTMENT_RESCHEDULED: "scheduling.appointment.rescheduled",
  SCHEDULING_APPOINTMENT_CANCELED: "scheduling.appointment.canceled",
  EXAMS_CREATED: "exams.created",
  EXAMS_UPDATED: "exams.updated",
  EXAMS_STATUS_TRANSITIONED: "exams.status.transitioned"
} as const;

export type AuditSource = (typeof AUDIT_SOURCE)[keyof typeof AUDIT_SOURCE];
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export interface DomainAuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: UserRole;
  source: AuditSource;
  action: AuditAction;
  entityType: string;
  entityId: string;
  requestId: string | null;
  traceId: string | null;
  metadata: Record<string, unknown>;
}

export interface MutationMeta {
  source: AuditSource;
  requestId?: string;
  traceId?: string;
}

export interface ResolvedMutationMeta {
  source: AuditSource;
  requestId: string | null;
  traceId: string | null;
}

export function resolveMutationMeta(meta: MutationMeta | undefined): ResolvedMutationMeta {
  return {
    source: meta?.source ?? AUDIT_SOURCE.API,
    requestId: meta?.requestId ?? null,
    traceId: meta?.traceId ?? null
  };
}
