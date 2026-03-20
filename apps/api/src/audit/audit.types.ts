import type { UserRole } from "../common/constants/user-role.js";
import { getRequestContext } from "../common/observability/request-context.js";

export const AUDIT_SOURCE = {
  API: "api",
  ASSISTANT: "assistant"
} as const;

export const AUDIT_ACTION = {
  AUTH_REGISTERED: "auth.registered",
  AUTH_LOGIN_SUCCEEDED: "auth.login.succeeded",
  AUTH_REFRESH_ROTATED: "auth.refresh.rotated",
  AUTH_LOGOUT_COMPLETED: "auth.logout.completed",
  AUTH_DEV_LOGIN_ISSUED: "auth.dev_login.issued",
  OPS_OUTBOX_HEALTH_VIEWED: "ops.outbox_health.viewed",
  OPS_METRICS_VIEWED: "ops.metrics.viewed",
  OPS_DIAGNOSTICS_VIEWED: "ops.diagnostics.viewed",
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
  const requestContext = getRequestContext();

  return {
    source: meta?.source ?? AUDIT_SOURCE.API,
    requestId: meta?.requestId ?? requestContext?.requestId ?? null,
    traceId: meta?.traceId ?? requestContext?.traceId ?? null
  };
}
