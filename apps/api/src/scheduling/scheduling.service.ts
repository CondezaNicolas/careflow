import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { AuditRepository } from "../audit/audit.repository.js";
import { AUDIT_ACTION, resolveMutationMeta, type MutationMeta } from "../audit/audit.types.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type { DatabaseTransaction } from "../db/database.service.js";
import type {
  AppointmentMutationResponse,
  CreateAppointmentRequest,
  CreateAvailabilityWindowRequest,
  RescheduleAppointmentRequest,
  SearchAvailabilityQuery,
  SearchAvailabilityResponse
} from "./scheduling.contracts.js";
import { SchedulingRepository } from "./scheduling.repository.js";
import {
  APPOINTMENT_OPERATION,
  APPOINTMENT_SYNC_STATUS,
  APPOINTMENT_STATUS,
  type Appointment,
  type AppointmentOperation,
  type IdempotencyStoredResponse
} from "./scheduling.types.js";

@Injectable()
export class SchedulingService {
  constructor(
    @Inject(SchedulingRepository) private readonly schedulingRepository: SchedulingRepository,
    @Inject(AuditRepository) private readonly auditRepository: AuditRepository
  ) {}

  async searchAvailability(
    principal: AuthPrincipal,
    query: SearchAvailabilityQuery
  ): Promise<SearchAvailabilityResponse> {
    const from = parseIso(query.fromIso, "from");
    const to = parseIso(query.toIso, "to");
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException("from must be before to");
    }

    if (!Number.isInteger(query.durationMinutes) || query.durationMinutes <= 0) {
      throw new BadRequestException("durationMinutes must be a positive integer");
    }

    const windows = await this.schedulingRepository.listAvailabilityWithinRange(
      principal,
      query.specialistId,
      query.fromIso,
      query.toIso
    );
    const appointments = await this.schedulingRepository.listActiveAppointmentsForSpecialist(
      principal,
      query.specialistId
    );

    const durationMs = query.durationMinutes * 60_000;
    const slots = windows.flatMap((window) => {
      const windowStart = Math.max(
        parseIso(window.startAtIso, "window.startAtIso").getTime(),
        from.getTime()
      );
      const windowEnd = Math.min(
        parseIso(window.endAtIso, "window.endAtIso").getTime(),
        to.getTime()
      );
      if (windowStart >= windowEnd) {
        return [];
      }

      const slotCandidates: SearchAvailabilityResponse["slots"] = [];
      for (let cursor = windowStart; cursor + durationMs <= windowEnd; cursor += durationMs) {
        const slotStart = new Date(cursor).toISOString();
        const slotEnd = new Date(cursor + durationMs).toISOString();
        const collides = appointments.some((appointment) =>
          rangesOverlap(slotStart, slotEnd, appointment.startAtIso, appointment.endAtIso)
        );
        if (!collides) {
          slotCandidates.push({
            specialistId: query.specialistId,
            startAtIso: slotStart,
            endAtIso: slotEnd
          });
        }
      }

      return slotCandidates;
    });

    return {
      specialistId: query.specialistId,
      slots
    };
  }

  async createAvailabilityWindow(
    principal: AuthPrincipal,
    input: CreateAvailabilityWindowRequest
  ): Promise<CreateAvailabilityWindowRequest & { id: string; tenantId: string }> {
    const start = parseIso(input.startAtIso, "startAtIso");
    const end = parseIso(input.endAtIso, "endAtIso");
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException("Availability window startAtIso must be before endAtIso");
    }

    if (principal.role === USER_ROLE.CLINICIAN && principal.id !== input.specialistId) {
      throw new ForbiddenException("Clinicians can only manage their own availability");
    }

    const window = {
      id: randomUUID(),
      tenantId: principal.tenantId,
      specialistId: input.specialistId,
      startAtIso: start.toISOString(),
      endAtIso: end.toISOString()
    };
    await this.schedulingRepository.upsertAvailabilityWindow(window);
    return window;
  }

  async createAppointment(
    principal: AuthPrincipal,
    input: CreateAppointmentRequest,
    idempotencyKey: string,
    meta?: MutationMeta
  ): Promise<AppointmentMutationResponse> {
    const normalized = normalizeAppointmentInput(input);
    try {
      return await this.schedulingRepository.inSerializedTransaction(async (transaction) => {
        await this.schedulingRepository.acquireIdempotencyLock(
          principal,
          APPOINTMENT_OPERATION.CREATE,
          idempotencyKey,
          transaction
        );

        const replay = await this.resolveReplay(
          principal.tenantId,
          APPOINTMENT_OPERATION.CREATE,
          idempotencyKey,
          fingerprintCreate(normalized),
          transaction
        );
        if (replay) {
          return replay;
        }

        await this.schedulingRepository.acquireSpecialistLocks(
          principal,
          [normalized.specialistId],
          transaction
        );

        await this.assertSlotIsAvailable(
          principal.tenantId,
          normalized.specialistId,
          normalized.startAtIso,
          normalized.endAtIso,
          undefined,
          transaction
        );

        const nowIso = new Date().toISOString();
        const appointment: Appointment = {
          id: randomUUID(),
          tenantId: principal.tenantId,
          patientId: normalized.patientId,
          specialistId: normalized.specialistId,
          startAtIso: normalized.startAtIso,
          endAtIso: normalized.endAtIso,
          status: APPOINTMENT_STATUS.SCHEDULED,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
          canceledAtIso: null,
          externalCalendarEventId: null,
          calendarSyncStatus: APPOINTMENT_SYNC_STATUS.PENDING,
          calendarSyncAttempts: 0,
          calendarLastError: null,
          calendarLastAttemptAtIso: null,
          calendarNextRetryAtIso: nowIso,
          calendarLastSyncedAtIso: null,
          calendarSyncUpdatedAtIso: nowIso
        };
        const savedAppointment = await this.schedulingRepository.saveAppointment(
          appointment,
          transaction
        );

        return this.persistMutationAndRespond(
          principal,
          principal.tenantId,
          APPOINTMENT_OPERATION.CREATE,
          idempotencyKey,
          fingerprintCreate(normalized),
          {
            action: APPOINTMENT_OPERATION.CREATE,
            appointment: savedAppointment
          },
          meta,
          transaction
        );
      });
    } catch (error) {
      throw mapSchedulingPersistenceError(error);
    }
  }

  async rescheduleAppointment(
    principal: AuthPrincipal,
    appointmentId: string,
    input: RescheduleAppointmentRequest,
    idempotencyKey: string,
    meta?: MutationMeta
  ): Promise<AppointmentMutationResponse> {
    const normalized = normalizeRescheduleInput(input);
    try {
      return await this.schedulingRepository.inSerializedTransaction(async (transaction) => {
        await this.schedulingRepository.acquireIdempotencyLock(
          principal,
          APPOINTMENT_OPERATION.RESCHEDULE,
          idempotencyKey,
          transaction
        );

        const replay = await this.resolveReplay(
          principal.tenantId,
          APPOINTMENT_OPERATION.RESCHEDULE,
          idempotencyKey,
          fingerprintReschedule(appointmentId, normalized),
          transaction
        );
        if (replay) {
          return replay;
        }

        const existing = await this.schedulingRepository.findAppointmentWithinTenant(
          principal,
          appointmentId,
          transaction
        );
        if (!existing) {
          throw new NotFoundException("Appointment not found");
        }

        if (existing.status === APPOINTMENT_STATUS.CANCELED) {
          throw new ConflictException("Canceled appointment cannot be rescheduled");
        }

        await this.schedulingRepository.acquireSpecialistLocks(
          principal,
          [existing.specialistId, normalized.specialistId],
          transaction
        );

        await this.assertSlotIsAvailable(
          principal.tenantId,
          normalized.specialistId,
          normalized.startAtIso,
          normalized.endAtIso,
          existing.id,
          transaction
        );

        const updated: Appointment = {
          ...existing,
          specialistId: normalized.specialistId,
          startAtIso: normalized.startAtIso,
          endAtIso: normalized.endAtIso,
          updatedAtIso: new Date().toISOString(),
          calendarSyncStatus: APPOINTMENT_SYNC_STATUS.PENDING,
          calendarSyncAttempts: 0,
          calendarLastError: null,
          calendarLastAttemptAtIso: null,
          calendarNextRetryAtIso: new Date().toISOString(),
          calendarLastSyncedAtIso: null,
          calendarSyncUpdatedAtIso: new Date().toISOString()
        };
        const savedAppointment = await this.schedulingRepository.saveAppointment(
          updated,
          transaction
        );

        return this.persistMutationAndRespond(
          principal,
          principal.tenantId,
          APPOINTMENT_OPERATION.RESCHEDULE,
          idempotencyKey,
          fingerprintReschedule(appointmentId, normalized),
          {
            action: APPOINTMENT_OPERATION.RESCHEDULE,
            appointment: savedAppointment
          },
          meta,
          transaction
        );
      });
    } catch (error) {
      throw mapSchedulingPersistenceError(error);
    }
  }

  async cancelAppointment(
    principal: AuthPrincipal,
    appointmentId: string,
    idempotencyKey: string,
    meta?: MutationMeta
  ): Promise<AppointmentMutationResponse> {
    try {
      return await this.schedulingRepository.inSerializedTransaction(async (transaction) => {
        await this.schedulingRepository.acquireIdempotencyLock(
          principal,
          APPOINTMENT_OPERATION.CANCEL,
          idempotencyKey,
          transaction
        );

        const replay = await this.resolveReplay(
          principal.tenantId,
          APPOINTMENT_OPERATION.CANCEL,
          idempotencyKey,
          fingerprintCancel(appointmentId),
          transaction
        );
        if (replay) {
          return replay;
        }

        const existing = await this.schedulingRepository.findAppointmentWithinTenant(
          principal,
          appointmentId,
          transaction
        );
        if (!existing) {
          throw new NotFoundException("Appointment not found");
        }

        await this.schedulingRepository.acquireSpecialistLocks(
          principal,
          [existing.specialistId],
          transaction
        );

        const canceledAt = existing.canceledAtIso ?? new Date().toISOString();
        const canceled: Appointment = {
          ...existing,
          status: APPOINTMENT_STATUS.CANCELED,
          canceledAtIso: canceledAt,
          updatedAtIso: new Date().toISOString(),
          calendarSyncStatus: APPOINTMENT_SYNC_STATUS.PENDING,
          calendarSyncAttempts: 0,
          calendarLastError: null,
          calendarLastAttemptAtIso: null,
          calendarNextRetryAtIso: new Date().toISOString(),
          calendarLastSyncedAtIso: null,
          calendarSyncUpdatedAtIso: new Date().toISOString()
        };
        const savedAppointment = await this.schedulingRepository.saveAppointment(
          canceled,
          transaction
        );

        return this.persistMutationAndRespond(
          principal,
          principal.tenantId,
          APPOINTMENT_OPERATION.CANCEL,
          idempotencyKey,
          fingerprintCancel(appointmentId),
          {
            action: APPOINTMENT_OPERATION.CANCEL,
            appointment: savedAppointment
          },
          meta,
          transaction
        );
      });
    } catch (error) {
      throw mapSchedulingPersistenceError(error);
    }
  }

  private async assertSlotIsAvailable(
    tenantId: string,
    specialistId: string,
    startAtIso: string,
    endAtIso: string,
    ignoreAppointmentId?: string,
    transaction?: DatabaseTransaction
  ): Promise<void> {
    const windows = await this.schedulingRepository.listAvailabilityWithinRange(
      { tenantId },
      specialistId,
      startAtIso,
      endAtIso,
      transaction
    );
    const isInsideAvailability = windows.some((window) =>
      rangeContains(window.startAtIso, window.endAtIso, startAtIso, endAtIso)
    );
    if (!isInsideAvailability) {
      throw new ConflictException("Requested slot is outside specialist availability");
    }

    const appointments = await this.schedulingRepository.listActiveAppointmentsForSpecialist(
      { tenantId },
      specialistId,
      transaction
    );
    const hasConflict = appointments.some((appointment) => {
      if (ignoreAppointmentId && appointment.id === ignoreAppointmentId) {
        return false;
      }

      return rangesOverlap(startAtIso, endAtIso, appointment.startAtIso, appointment.endAtIso);
    });

    if (hasConflict) {
      throw new ConflictException("Requested slot conflicts with an existing appointment");
    }
  }

  private async resolveReplay(
    tenantId: string,
    operation: AppointmentOperation,
    idempotencyKey: string,
    fingerprint: string,
    transaction: DatabaseTransaction
  ): Promise<AppointmentMutationResponse | null> {
    const existing = await this.schedulingRepository.findIdempotencyRecord(
      { tenantId },
      idempotencyKey,
      operation,
      transaction
    );
    if (!existing) {
      return null;
    }

    if (existing.fingerprint !== fingerprint) {
      throw new ConflictException("Idempotency key already used with different payload");
    }

    return {
      ...existing.response,
      idempotencyReplay: true
    };
  }

  private persistMutationAndRespond(
    principal: AuthPrincipal,
    tenantId: string,
    operation: AppointmentOperation,
    idempotencyKey: string,
    fingerprint: string,
    response: IdempotencyStoredResponse,
    meta: MutationMeta | undefined,
    transaction: DatabaseTransaction
  ): Promise<AppointmentMutationResponse> {
    const resolvedMeta = resolveMutationMeta(meta);
    return this.schedulingRepository
      .saveIdempotencyRecord(
        {
          tenantId,
          operation,
          key: idempotencyKey,
          fingerprint,
          response
        },
        transaction
      )
      .then(() =>
        this.schedulingRepository.enqueueAppointmentSyncOutboxEvent(
          {
            tenantId,
            appointmentId: response.appointment.id,
            action: operation,
            triggeredAtIso: new Date().toISOString()
          },
          transaction
        )
      )
      .then(() =>
        this.schedulingRepository.enqueueAppointmentNotificationOutboxEvent(
          {
            tenantId,
            patientId: response.appointment.patientId,
            appointmentId: response.appointment.id,
            action: operation,
            triggeredAtIso: new Date().toISOString()
          },
          transaction
        )
      )
      .then(() =>
        this.auditRepository.saveDomainEvent(
          {
            id: randomUUID(),
            tenantId,
            actorId: principal.id,
            actorRole: principal.role,
            source: resolvedMeta.source,
            action:
              operation === APPOINTMENT_OPERATION.CREATE
                ? AUDIT_ACTION.SCHEDULING_APPOINTMENT_CREATED
                : operation === APPOINTMENT_OPERATION.RESCHEDULE
                  ? AUDIT_ACTION.SCHEDULING_APPOINTMENT_RESCHEDULED
                  : AUDIT_ACTION.SCHEDULING_APPOINTMENT_CANCELED,
            entityType: "appointment",
            entityId: response.appointment.id,
            requestId: resolvedMeta.requestId,
            traceId: resolvedMeta.traceId,
            metadata: {
              idempotencyKey,
              operation,
              patientId: response.appointment.patientId,
              specialistId: response.appointment.specialistId,
              calendarSyncStatus: response.appointment.calendarSyncStatus
            }
          },
          transaction
        )
      )
      .then(() => ({
        ...response,
        idempotencyReplay: false
      }));
  }
}

function mapSchedulingPersistenceError(error: unknown): Error {
  if (isPostgresError(error) && (error.code === "23P01" || error.code === "40001")) {
    return new ConflictException("Requested slot conflicts with an existing appointment");
  }

  return error as Error;
}

function isPostgresError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function parseIso(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO datetime`);
  }

  return parsed;
}

function normalizeAppointmentInput(input: CreateAppointmentRequest): CreateAppointmentRequest {
  if (!input.patientId || !input.specialistId) {
    throw new BadRequestException("patientId and specialistId are required");
  }

  const start = parseIso(input.startAtIso, "startAtIso");
  const end = parseIso(input.endAtIso, "endAtIso");
  if (start.getTime() >= end.getTime()) {
    throw new BadRequestException("startAtIso must be before endAtIso");
  }

  return {
    patientId: input.patientId,
    specialistId: input.specialistId,
    startAtIso: start.toISOString(),
    endAtIso: end.toISOString()
  };
}

function normalizeRescheduleInput(
  input: RescheduleAppointmentRequest
): RescheduleAppointmentRequest {
  if (!input.specialistId) {
    throw new BadRequestException("specialistId is required");
  }

  const start = parseIso(input.startAtIso, "startAtIso");
  const end = parseIso(input.endAtIso, "endAtIso");
  if (start.getTime() >= end.getTime()) {
    throw new BadRequestException("startAtIso must be before endAtIso");
  }

  return {
    specialistId: input.specialistId,
    startAtIso: start.toISOString(),
    endAtIso: end.toISOString()
  };
}

function rangeContains(
  containerStartIso: string,
  containerEndIso: string,
  targetStartIso: string,
  targetEndIso: string
): boolean {
  const containerStart = new Date(containerStartIso).getTime();
  const containerEnd = new Date(containerEndIso).getTime();
  const targetStart = new Date(targetStartIso).getTime();
  const targetEnd = new Date(targetEndIso).getTime();
  return containerStart <= targetStart && targetEnd <= containerEnd;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function fingerprintCreate(input: CreateAppointmentRequest): string {
  return `${input.patientId}|${input.specialistId}|${input.startAtIso}|${input.endAtIso}`;
}

function fingerprintReschedule(appointmentId: string, input: RescheduleAppointmentRequest): string {
  return `${appointmentId}|${input.specialistId}|${input.startAtIso}|${input.endAtIso}`;
}

function fingerprintCancel(appointmentId: string): string {
  return appointmentId;
}
