import type { Appointment, AppointmentOperation, AvailableSlot } from "./scheduling.types.js";

export interface SearchAvailabilityQuery {
  specialistId: string;
  fromIso: string;
  toIso: string;
  durationMinutes: number;
}

export interface CreateAvailabilityWindowRequest {
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface CreateAppointmentRequest {
  patientId: string;
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface RescheduleAppointmentRequest {
  specialistId: string;
  startAtIso: string;
  endAtIso: string;
}

export interface AppointmentMutationResponse {
  action: AppointmentOperation;
  appointment: Appointment;
  idempotencyReplay: boolean;
}

export interface SearchAvailabilityResponse {
  specialistId: string;
  slots: AvailableSlot[];
}
