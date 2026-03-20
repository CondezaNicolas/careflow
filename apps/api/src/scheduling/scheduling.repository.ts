import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  inSerializableTransaction,
  resolveQueryExecutor,
  type QueryExecutor
} from "../common/db/repository.utils.js";
import { tenantIdFromScope, type TenantScopeInput } from "../common/tenant/tenant-scope.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import {
  NOTIFICATION_OUTBOX_EVENT_TYPE,
  type AppointmentNotificationOutboxPayload
} from "../notifications/notifications.types.js";
import {
  APPOINTMENT_SYNC_EVENT_TYPE,
  APPOINTMENT_STATUS,
  type Appointment,
  type AppointmentSyncOutboxPayload,
  type AppointmentSyncStatus,
  type AvailabilityWindow,
  type IdempotencyRecord
} from "./scheduling.types.js";

@Injectable()
export class SchedulingRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  inSerializedTransaction<T>(action: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return inSerializableTransaction(this.databaseService, action);
  }

  async acquireIdempotencyLock(
    scope: TenantScopeInput,
    operation: IdempotencyRecord["operation"],
    key: string,
    transaction: DatabaseTransaction
  ): Promise<void> {
    const tenantId = tenantIdFromScope(scope);
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      tenantId,
      `${operation}:${key}`
    ]);
  }

  async acquireSpecialistLocks(
    scope: TenantScopeInput,
    specialistIds: readonly string[],
    transaction: DatabaseTransaction
  ): Promise<void> {
    const tenantId = tenantIdFromScope(scope);
    const uniqueSortedSpecialists = [...new Set(specialistIds)].sort();
    for (const specialistId of uniqueSortedSpecialists) {
      await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        tenantId,
        specialistId
      ]);
    }
  }

  async upsertAvailabilityWindow(
    window: AvailabilityWindow,
    transaction?: DatabaseTransaction
  ): Promise<AvailabilityWindow> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO scheduling_availability_windows (id, tenant_id, specialist_id, start_at, end_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id)
        DO UPDATE
        SET specialist_id = EXCLUDED.specialist_id,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at
      `,
      [window.id, window.tenantId, window.specialistId, window.startAtIso, window.endAtIso]
    );

    return window;
  }

  async listAvailabilityWithinRange(
    scope: TenantScopeInput,
    specialistId: string,
    fromIso: string,
    toIso: string,
    transaction?: DatabaseTransaction
  ): Promise<AvailabilityWindow[]> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<AvailabilityWindowRow>(
      `
        SELECT id, tenant_id, specialist_id, start_at, end_at
        FROM scheduling_availability_windows
        WHERE tenant_id = $1
          AND specialist_id = $2
          AND start_at < $4::timestamptz
          AND $3::timestamptz < end_at
        ORDER BY start_at ASC
      `,
      [tenantId, specialistId, fromIso, toIso]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      specialistId: row.specialist_id,
      startAtIso: row.start_at.toISOString(),
      endAtIso: row.end_at.toISOString()
    }));
  }

  async listActiveAppointmentsForSpecialist(
    scope: TenantScopeInput,
    specialistId: string,
    transaction?: DatabaseTransaction
  ): Promise<Appointment[]> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<AppointmentRow>(
      `
        SELECT id, tenant_id, patient_id, specialist_id, start_at, end_at, status, canceled_at,
               external_calendar_event_id, calendar_sync_status, calendar_sync_attempts,
               calendar_last_error, calendar_last_attempt_at, calendar_next_retry_at,
               calendar_last_synced_at, calendar_sync_updated_at, created_at, updated_at
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND specialist_id = $2
          AND status = $3
        ORDER BY start_at ASC
      `,
      [tenantId, specialistId, APPOINTMENT_STATUS.SCHEDULED]
    );

    return result.rows.map(mapAppointmentRow);
  }

  async saveAppointment(
    appointment: Appointment,
    transaction?: DatabaseTransaction
  ): Promise<Appointment> {
    const result = await this.getExecutor(transaction).query<AppointmentRow>(
      `
        INSERT INTO scheduling_appointments (
          id,
          tenant_id,
          patient_id,
          specialist_id,
          start_at,
          end_at,
          status,
          canceled_at,
          external_calendar_event_id,
          calendar_sync_status,
          calendar_sync_attempts,
          calendar_last_error,
          calendar_last_attempt_at,
          calendar_next_retry_at,
          calendar_last_synced_at,
          calendar_sync_updated_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id)
        DO UPDATE
        SET patient_id = EXCLUDED.patient_id,
            specialist_id = EXCLUDED.specialist_id,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at,
            status = EXCLUDED.status,
            canceled_at = EXCLUDED.canceled_at,
            external_calendar_event_id = EXCLUDED.external_calendar_event_id,
            calendar_sync_status = EXCLUDED.calendar_sync_status,
            calendar_sync_attempts = EXCLUDED.calendar_sync_attempts,
            calendar_last_error = EXCLUDED.calendar_last_error,
            calendar_last_attempt_at = EXCLUDED.calendar_last_attempt_at,
            calendar_next_retry_at = EXCLUDED.calendar_next_retry_at,
            calendar_last_synced_at = EXCLUDED.calendar_last_synced_at,
            calendar_sync_updated_at = EXCLUDED.calendar_sync_updated_at,
            updated_at = EXCLUDED.updated_at
        RETURNING id, tenant_id, patient_id, specialist_id, start_at, end_at, status, canceled_at,
                  external_calendar_event_id, calendar_sync_status, calendar_sync_attempts,
                  calendar_last_error, calendar_last_attempt_at, calendar_next_retry_at,
                  calendar_last_synced_at, calendar_sync_updated_at, created_at, updated_at
      `,
      [
        appointment.id,
        appointment.tenantId,
        appointment.patientId,
        appointment.specialistId,
        appointment.startAtIso,
        appointment.endAtIso,
        appointment.status,
        appointment.canceledAtIso,
        appointment.externalCalendarEventId,
        appointment.calendarSyncStatus,
        appointment.calendarSyncAttempts,
        appointment.calendarLastError,
        appointment.calendarLastAttemptAtIso,
        appointment.calendarNextRetryAtIso,
        appointment.calendarLastSyncedAtIso,
        appointment.calendarSyncUpdatedAtIso,
        appointment.createdAtIso,
        appointment.updatedAtIso
      ]
    );

    return mapAppointmentRow(result.rows[0]!);
  }

  async findAppointmentWithinTenant(
    scope: TenantScopeInput,
    appointmentId: string,
    transaction?: DatabaseTransaction
  ): Promise<Appointment | null> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<AppointmentRow>(
      `
        SELECT id, tenant_id, patient_id, specialist_id, start_at, end_at, status, canceled_at,
               external_calendar_event_id, calendar_sync_status, calendar_sync_attempts,
               calendar_last_error, calendar_last_attempt_at, calendar_next_retry_at,
               calendar_last_synced_at, calendar_sync_updated_at, created_at, updated_at
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, appointmentId]
    );

    const row = result.rows[0];
    return row ? mapAppointmentRow(row) : null;
  }

  async listAppointmentsForPatient(
    scope: TenantScopeInput,
    patientId: string,
    transaction?: DatabaseTransaction
  ): Promise<Appointment[]> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<AppointmentRow>(
      `
        SELECT id, tenant_id, patient_id, specialist_id, start_at, end_at, status, canceled_at,
               external_calendar_event_id, calendar_sync_status, calendar_sync_attempts,
               calendar_last_error, calendar_last_attempt_at, calendar_next_retry_at,
               calendar_last_synced_at, calendar_sync_updated_at, created_at, updated_at
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND patient_id = $2
        ORDER BY start_at DESC
      `,
      [tenantId, patientId]
    );

    return result.rows.map(mapAppointmentRow);
  }

  async enqueueAppointmentSyncOutboxEvent(
    payload: AppointmentSyncOutboxPayload,
    transaction: DatabaseTransaction
  ): Promise<void> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        randomUUID(),
        payload.tenantId,
        "appointment",
        payload.appointmentId,
        APPOINTMENT_SYNC_EVENT_TYPE.REQUESTED,
        JSON.stringify(payload),
        "pending"
      ]
    );
  }

  async enqueueAppointmentNotificationOutboxEvent(
    payload: AppointmentNotificationOutboxPayload,
    transaction: DatabaseTransaction
  ): Promise<void> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        randomUUID(),
        payload.tenantId,
        "notification",
        payload.appointmentId,
        NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED,
        JSON.stringify(payload),
        "pending"
      ]
    );
  }

  async markCalendarSyncResult(
    scope: TenantScopeInput,
    appointmentId: string,
    input: {
      status: AppointmentSyncStatus;
      attempts: number;
      error: string | null;
      lastAttemptAtIso: string;
      nextRetryAtIso: string | null;
      lastSyncedAtIso: string | null;
      externalCalendarEventId: string | null;
    },
    transaction?: DatabaseTransaction
  ): Promise<void> {
    const tenantId = tenantIdFromScope(scope);
    await this.getExecutor(transaction).query(
      `
        UPDATE scheduling_appointments
        SET calendar_sync_status = $3,
            calendar_sync_attempts = $4,
            calendar_last_error = $5,
            calendar_last_attempt_at = $6,
            calendar_next_retry_at = $7,
            calendar_last_synced_at = $8,
            external_calendar_event_id = $9,
            calendar_sync_updated_at = NOW(),
            updated_at = GREATEST(updated_at, NOW())
        WHERE tenant_id = $1
          AND id = $2
      `,
      [
        tenantId,
        appointmentId,
        input.status,
        input.attempts,
        input.error,
        input.lastAttemptAtIso,
        input.nextRetryAtIso,
        input.lastSyncedAtIso,
        input.externalCalendarEventId
      ]
    );
  }

  async findIdempotencyRecord(
    scope: TenantScopeInput,
    key: string,
    operation: IdempotencyRecord["operation"],
    transaction?: DatabaseTransaction
  ): Promise<IdempotencyRecord | null> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<IdempotencyRecordRow>(
      `
        SELECT tenant_id, operation, idempotency_key, fingerprint, response_json
        FROM scheduling_idempotency_keys
        WHERE tenant_id = $1
          AND operation = $2
          AND idempotency_key = $3
      `,
      [tenantId, operation, key]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      tenantId: row.tenant_id,
      operation: row.operation,
      key: row.idempotency_key,
      fingerprint: row.fingerprint,
      response: row.response_json
    };
  }

  async saveIdempotencyRecord(
    record: IdempotencyRecord,
    transaction?: DatabaseTransaction
  ): Promise<IdempotencyRecord> {
    await this.getExecutor(transaction).query(
      `
        INSERT INTO scheduling_idempotency_keys (tenant_id, operation, idempotency_key, fingerprint, response_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (tenant_id, operation, idempotency_key)
        DO UPDATE
        SET fingerprint = EXCLUDED.fingerprint,
            response_json = EXCLUDED.response_json
      `,
      [
        record.tenantId,
        record.operation,
        record.key,
        record.fingerprint,
        JSON.stringify(record.response)
      ]
    );

    return record;
  }

  async countAppointmentsWithinTenant(scope: TenantScopeInput): Promise<number> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.databaseService.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM scheduling_appointments
        WHERE tenant_id = $1
      `,
      [tenantId]
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}

interface AvailabilityWindowRow {
  id: string;
  tenant_id: string;
  specialist_id: string;
  start_at: Date;
  end_at: Date;
}

interface AppointmentRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  specialist_id: string;
  start_at: Date;
  end_at: Date;
  status: Appointment["status"];
  canceled_at: Date | null;
  external_calendar_event_id: string | null;
  calendar_sync_status: Appointment["calendarSyncStatus"];
  calendar_sync_attempts: number;
  calendar_last_error: string | null;
  calendar_last_attempt_at: Date | null;
  calendar_next_retry_at: Date | null;
  calendar_last_synced_at: Date | null;
  calendar_sync_updated_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface IdempotencyRecordRow {
  tenant_id: string;
  operation: IdempotencyRecord["operation"];
  idempotency_key: string;
  fingerprint: string;
  response_json: IdempotencyRecord["response"];
}

function mapAppointmentRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    specialistId: row.specialist_id,
    startAtIso: row.start_at.toISOString(),
    endAtIso: row.end_at.toISOString(),
    status: row.status,
    canceledAtIso: row.canceled_at ? row.canceled_at.toISOString() : null,
    externalCalendarEventId: row.external_calendar_event_id,
    calendarSyncStatus: row.calendar_sync_status,
    calendarSyncAttempts: row.calendar_sync_attempts,
    calendarLastError: row.calendar_last_error,
    calendarLastAttemptAtIso: row.calendar_last_attempt_at?.toISOString() ?? null,
    calendarNextRetryAtIso: row.calendar_next_retry_at?.toISOString() ?? null,
    calendarLastSyncedAtIso: row.calendar_last_synced_at?.toISOString() ?? null,
    calendarSyncUpdatedAtIso: row.calendar_sync_updated_at.toISOString(),
    createdAtIso: row.created_at.toISOString(),
    updatedAtIso: row.updated_at.toISOString()
  };
}
