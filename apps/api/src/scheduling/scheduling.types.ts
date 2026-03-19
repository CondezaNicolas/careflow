export const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  CANCELED: "canceled"
} as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

export const APPOINTMENT_OPERATION = {
  CREATE: "create",
  RESCHEDULE: "reschedule",
  CANCEL: "cancel"
} as const;

export type AppointmentOperation = (typeof APPOINTMENT_OPERATION)[keyof typeof APPOINTMENT_OPERATION];

export const APPOINTMENT_SYNC_STATUS = {
  PENDING: "pending",
  SYNCED: "synced",
  FAILED: "failed"
} as const;

export type AppointmentSyncStatus = (typeof APPOINTMENT_SYNC_STATUS)[keyof typeof APPOINTMENT_SYNC_STATUS];

export const APPOINTMENT_SYNC_EVENT_TYPE = {
  REQUESTED: "scheduling.appointment.google-calendar.sync.requested"
} as const;

export type AppointmentSyncEventType = (typeof APPOINTMENT_SYNC_EVENT_TYPE)[keyof typeof APPOINTMENT_SYNC_EVENT_TYPE];

export interface AvailabilityWindow {
  id: string;
  tenantId: string;
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
  status: AppointmentStatus;
  createdAtIso: string;
  updatedAtIso: string;
  canceledAtIso: string | null;
  externalCalendarEventId: string | null;
  calendarSyncStatus: AppointmentSyncStatus;
  calendarSyncAttempts: number;
  calendarLastError: string | null;
  calendarLastAttemptAtIso: string | null;
  calendarNextRetryAtIso: string | null;
  calendarLastSyncedAtIso: string | null;
  calendarSyncUpdatedAtIso: string;
}

export interface AvailableSlot {
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface IdempotencyStoredResponse {
  action: AppointmentOperation;
  appointment: Appointment;
}

export interface IdempotencyRecord {
  tenantId: string;
  key: string;
  operation: AppointmentOperation;
  fingerprint: string;
  response: IdempotencyStoredResponse;
}

export interface AppointmentSyncOutboxPayload {
  tenantId: string;
  appointmentId: string;
  action: AppointmentOperation;
  triggeredAtIso: string;
}
