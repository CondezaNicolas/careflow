import type { ExamStatus } from "../exams/exams.types.js";
import type { AppointmentOperation } from "../scheduling/scheduling.types.js";

export const NOTIFICATION_OUTBOX_EVENT_TYPE = {
  APPOINTMENT_LIFECYCLE_REQUESTED: "notifications.appointment.lifecycle.dispatch.requested",
  EXAM_STATUS_REQUESTED: "notifications.exam.status.dispatch.requested"
} as const;

export type NotificationOutboxEventType =
  (typeof NOTIFICATION_OUTBOX_EVENT_TYPE)[keyof typeof NOTIFICATION_OUTBOX_EVENT_TYPE];

export const NOTIFICATION_CHANNEL = {
  EMAIL: "email",
  WHATSAPP: "whatsapp"
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export interface AppointmentNotificationOutboxPayload {
  tenantId: string;
  patientId: string;
  appointmentId: string;
  action: AppointmentOperation;
  triggeredAtIso: string;
}

export interface ExamStatusNotificationOutboxPayload {
  tenantId: string;
  patientId: string;
  examId: string;
  toStatus: Extract<ExamStatus, "ready" | "delivered">;
  triggeredAtIso: string;
}
