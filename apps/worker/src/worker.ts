import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { z } from "zod";

const OUTBOX_EVENT_STATUS = {
  PENDING: "pending",
  PROCESSED: "processed",
  FAILED: "failed"
} as const;

const APPOINTMENT_SYNC_STATUS = {
  PENDING: "pending",
  SYNCED: "synced",
  FAILED: "failed"
} as const;

const APPOINTMENT_SYNC_EVENT_TYPE = {
  REQUESTED: "scheduling.appointment.google-calendar.sync.requested"
} as const;

const NOTIFICATION_OUTBOX_EVENT_TYPE = {
  APPOINTMENT_LIFECYCLE_REQUESTED: "notifications.appointment.lifecycle.dispatch.requested",
  EXAM_STATUS_REQUESTED: "notifications.exam.status.dispatch.requested"
} as const;

const NOTIFICATION_DELIVERY_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped"
} as const;

const NOTIFICATION_CHANNEL = {
  EMAIL: "email",
  WHATSAPP: "whatsapp"
} as const;

const APPOINTMENT_OPERATION = {
  CREATE: "create",
  RESCHEDULE: "reschedule",
  CANCEL: "cancel"
} as const;

interface AppointmentSyncOutboxPayload {
  tenantId: string;
  appointmentId: string;
  action: AppointmentOperation;
  triggeredAtIso: string;
}

interface AppointmentNotificationOutboxPayload {
  tenantId: string;
  patientId: string;
  appointmentId: string;
  action: AppointmentOperation;
  triggeredAtIso: string;
}

interface ExamStatusNotificationOutboxPayload {
  tenantId: string;
  patientId: string;
  examId: string;
  toStatus: "ready" | "delivered";
  triggeredAtIso: string;
}

type AppointmentOperation = (typeof APPOINTMENT_OPERATION)[keyof typeof APPOINTMENT_OPERATION];
type NotificationOutboxEventType =
  (typeof NOTIFICATION_OUTBOX_EVENT_TYPE)[keyof typeof NOTIFICATION_OUTBOX_EVENT_TYPE];
type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];
type NotificationOutboxPayload =
  | AppointmentNotificationOutboxPayload
  | ExamStatusNotificationOutboxPayload;

interface OutboxEvent {
  id: string;
  tenantId: string;
  payload: AppointmentSyncOutboxPayload;
  attempts: number;
}

interface NotificationOutboxEvent {
  id: string;
  tenantId: string;
  eventType: NotificationOutboxEventType;
  payload: NotificationOutboxPayload;
  attempts: number;
}

interface AppointmentRecord {
  id: string;
  tenantId: string;
  status: string;
  startAtIso: string;
  endAtIso: string;
  externalCalendarEventId: string | null;
}

interface GoogleCalendarSyncResult {
  externalCalendarEventId: string | null;
}

export interface GoogleCalendarGateway {
  upsertAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }): Promise<GoogleCalendarSyncResult>;
  cancelAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }): Promise<GoogleCalendarSyncResult>;
}

interface WorkerConfig {
  maxRetries: number;
  backoffSeconds: number;
}

interface NotificationProviderConfig {
  maxRetries: number;
  backoffSeconds: number;
}

interface NotificationRecipientProfile {
  tenantId: string;
  patientId: string;
  email: string | null;
  whatsappPhone: string | null;
  emailConsent: boolean;
  whatsappConsent: boolean;
  appointmentNotificationsEnabled: boolean;
  examReadyNotificationsEnabled: boolean;
  examDeliveredNotificationsEnabled: boolean;
}

interface NotificationSendResult {
  providerMessageId: string;
}

export interface NotificationChannelGateway {
  sendEmail(input: {
    tenantId: string;
    patientId: string;
    subject: string;
    body: string;
    toEmail: string;
  }): Promise<NotificationSendResult>;
  sendWhatsApp(input: {
    tenantId: string;
    patientId: string;
    body: string;
    toPhone: string;
  }): Promise<NotificationSendResult>;
}

interface ProcessResult {
  processed: number;
  synced: number;
  failed: number;
  retried: number;
}

const WORKER_PIPELINE = {
  GOOGLE_CALENDAR: "google_calendar",
  NOTIFICATIONS: "notifications"
} as const;

type WorkerPipeline = (typeof WORKER_PIPELINE)[keyof typeof WORKER_PIPELINE];

interface WorkerMetricsSnapshot {
  runsTotal: number;
  totalsByPipeline: Record<WorkerPipeline, ProcessResult>;
}

const initialProcessResult: ProcessResult = {
  processed: 0,
  synced: 0,
  failed: 0,
  retried: 0
};

const workerMetrics: WorkerMetricsSnapshot = {
  runsTotal: 0,
  totalsByPipeline: {
    [WORKER_PIPELINE.GOOGLE_CALENDAR]: { ...initialProcessResult },
    [WORKER_PIPELINE.NOTIFICATIONS]: { ...initialProcessResult }
  }
};

export class RetryableSyncError extends Error {}
export class RetryableNotificationError extends Error {}

export function getWorkerMetricsSnapshot(): WorkerMetricsSnapshot {
  return {
    runsTotal: workerMetrics.runsTotal,
    totalsByPipeline: {
      [WORKER_PIPELINE.GOOGLE_CALENDAR]: {
        ...workerMetrics.totalsByPipeline[WORKER_PIPELINE.GOOGLE_CALENDAR]
      },
      [WORKER_PIPELINE.NOTIFICATIONS]: {
        ...workerMetrics.totalsByPipeline[WORKER_PIPELINE.NOTIFICATIONS]
      }
    }
  };
}

export function resetWorkerMetricsSnapshot(): void {
  workerMetrics.runsTotal = 0;
  workerMetrics.totalsByPipeline[WORKER_PIPELINE.GOOGLE_CALENDAR] = { ...initialProcessResult };
  workerMetrics.totalsByPipeline[WORKER_PIPELINE.NOTIFICATIONS] = { ...initialProcessResult };
}

function recordWorkerProcessResult(pipeline: WorkerPipeline, result: ProcessResult): void {
  workerMetrics.runsTotal += 1;
  workerMetrics.totalsByPipeline[pipeline].processed += result.processed;
  workerMetrics.totalsByPipeline[pipeline].synced += result.synced;
  workerMetrics.totalsByPipeline[pipeline].failed += result.failed;
  workerMetrics.totalsByPipeline[pipeline].retried += result.retried;
}

export function logStructured(event: string, payload: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      component: "outbox.worker",
      event,
      timestampIso: new Date().toISOString(),
      ...payload
    })}\n`
  );
}

export class GoogleCalendarOutboxWorker {
  constructor(
    private readonly pool: Pool,
    private readonly gateway: GoogleCalendarGateway,
    private readonly config: WorkerConfig
  ) {}

  async processPending(limit = 20): Promise<ProcessResult> {
    const events = await this.loadDueEvents(limit);
    let synced = 0;
    let failed = 0;
    let retried = 0;

    for (const event of events) {
      const outcome = await this.processEvent(event);
      if (outcome === APPOINTMENT_SYNC_STATUS.SYNCED) {
        synced += 1;
      } else if (outcome === APPOINTMENT_SYNC_STATUS.FAILED) {
        failed += 1;
      } else {
        retried += 1;
      }
    }

    const result = {
      processed: events.length,
      synced,
      failed,
      retried
    };

    recordWorkerProcessResult(WORKER_PIPELINE.GOOGLE_CALENDAR, result);
    return result;
  }

  private async loadDueEvents(limit: number): Promise<OutboxEvent[]> {
    const result = await this.pool.query<OutboxEventRow>(
      `
        WITH attempt_stats AS (
          SELECT
            outbox_event_id,
            MAX(attempt_number) AS attempts,
            MAX(created_at) AS last_attempt_at
          FROM job_attempts
          GROUP BY outbox_event_id
        )
        SELECT
          outbox.id,
          outbox.tenant_id,
          outbox.payload,
          COALESCE(attempts.attempts, 0) AS attempts,
          attempts.last_attempt_at
        FROM outbox_events AS outbox
        LEFT JOIN attempt_stats AS attempts ON attempts.outbox_event_id = outbox.id
        WHERE outbox.event_type = $1
          AND outbox.status = $2
          AND (
            attempts.last_attempt_at IS NULL OR
            attempts.last_attempt_at + make_interval(secs => $3 * CAST(POWER(2, GREATEST(attempts.attempts - 1, 0)) AS INT)) <= NOW()
          )
        ORDER BY outbox.created_at ASC
        LIMIT $4
      `,
      [
        APPOINTMENT_SYNC_EVENT_TYPE.REQUESTED,
        OUTBOX_EVENT_STATUS.PENDING,
        this.config.backoffSeconds,
        limit
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      payload: parsePayload(row.payload),
      attempts: row.attempts
    }));
  }

  private async processEvent(
    event: OutboxEvent
  ): Promise<(typeof APPOINTMENT_SYNC_STATUS)[keyof typeof APPOINTMENT_SYNC_STATUS]> {
    const client = await this.pool.connect();
    const nextAttempt = event.attempts + 1;
    const nowIso = new Date().toISOString();
    let transactionOpen = false;

    try {
      const appointment = await this.findAppointment(
        client,
        event.tenantId,
        event.payload.appointmentId
      );
      if (!appointment) {
        await this.markEventDeadLetter(
          client,
          event,
          nextAttempt,
          "Appointment not found for tenant scope"
        );
        return APPOINTMENT_SYNC_STATUS.FAILED;
      }

      const result = await this.syncOutbound(event.payload.action, appointment);

      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        `
          UPDATE scheduling_appointments
          SET calendar_sync_status = $3,
              calendar_sync_attempts = $4,
              calendar_last_error = NULL,
              calendar_last_attempt_at = $5,
              calendar_next_retry_at = NULL,
              calendar_last_synced_at = $5,
              calendar_sync_updated_at = NOW(),
              external_calendar_event_id = $6,
              updated_at = GREATEST(updated_at, NOW())
          WHERE tenant_id = $1
            AND id = $2
        `,
        [
          event.tenantId,
          appointment.id,
          APPOINTMENT_SYNC_STATUS.SYNCED,
          nextAttempt,
          nowIso,
          result.externalCalendarEventId
        ]
      );
      await client.query(
        `
          UPDATE outbox_events
          SET status = $2,
              processed_at = $3
          WHERE id = $1
        `,
        [event.id, OUTBOX_EVENT_STATUS.PROCESSED, nowIso]
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return APPOINTMENT_SYNC_STATUS.SYNCED;
    } catch (error) {
      if (transactionOpen) {
        await client.query("ROLLBACK");
        transactionOpen = false;
      }

      const message = normalizeErrorMessage(error);
      const isRetryable = error instanceof RetryableSyncError;
      const shouldRetry = isRetryable && nextAttempt < this.config.maxRetries;
      const nextRetryAtIso = shouldRetry
        ? new Date(
            Date.now() + this.config.backoffSeconds * 1000 * 2 ** Math.max(nextAttempt - 1, 0)
          ).toISOString()
        : null;

      try {
        await client.query("BEGIN");
        transactionOpen = true;
        await client.query(
          `
            INSERT INTO job_attempts (id, outbox_event_id, attempt_number, error_message)
            VALUES ($1, $2, $3, $4)
          `,
          [randomUUID(), event.id, nextAttempt, message]
        );
        await client.query(
          `
            UPDATE scheduling_appointments
            SET calendar_sync_status = $3,
                calendar_sync_attempts = $4,
                calendar_last_error = $5,
                calendar_last_attempt_at = $6,
                calendar_next_retry_at = $7,
                calendar_last_synced_at = CASE WHEN $3 = 'synced' THEN $6 ELSE calendar_last_synced_at END,
                calendar_sync_updated_at = NOW(),
                updated_at = GREATEST(updated_at, NOW())
            WHERE tenant_id = $1
              AND id = $2
          `,
          [
            event.tenantId,
            event.payload.appointmentId,
            shouldRetry ? APPOINTMENT_SYNC_STATUS.PENDING : APPOINTMENT_SYNC_STATUS.FAILED,
            nextAttempt,
            message,
            nowIso,
            nextRetryAtIso
          ]
        );

        if (shouldRetry) {
          await client.query(
            `
              UPDATE outbox_events
              SET status = $2,
                  processed_at = NULL
              WHERE id = $1
            `,
            [event.id, OUTBOX_EVENT_STATUS.PENDING]
          );
        } else {
          await client.query(
            `
              INSERT INTO outbox_dead_letters (id, outbox_event_id, reason, payload)
              VALUES ($1, $2, $3, $4::jsonb)
            `,
            [randomUUID(), event.id, message, JSON.stringify(event.payload)]
          );
          await client.query(
            `
              UPDATE outbox_events
              SET status = $2,
                  processed_at = $3
              WHERE id = $1
            `,
            [event.id, OUTBOX_EVENT_STATUS.FAILED, nowIso]
          );
        }

        await client.query("COMMIT");
        transactionOpen = false;
        return shouldRetry ? APPOINTMENT_SYNC_STATUS.PENDING : APPOINTMENT_SYNC_STATUS.FAILED;
      } catch (persistenceError) {
        if (transactionOpen) {
          await client.query("ROLLBACK");
        }
        throw persistenceError;
      }
    } finally {
      client.release();
    }
  }

  private async findAppointment(
    client: PoolClient,
    tenantId: string,
    appointmentId: string
  ): Promise<AppointmentRecord | null> {
    const result = await client.query<AppointmentRow>(
      `
        SELECT id, tenant_id, status, start_at, end_at, external_calendar_event_id
        FROM scheduling_appointments
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, appointmentId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      status: row.status,
      startAtIso: row.start_at.toISOString(),
      endAtIso: row.end_at.toISOString(),
      externalCalendarEventId: row.external_calendar_event_id
    };
  }

  private async markEventDeadLetter(
    client: PoolClient,
    event: OutboxEvent,
    attempt: number,
    reason: string
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO job_attempts (id, outbox_event_id, attempt_number, error_message)
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), event.id, attempt, reason]
    );
    await client.query(
      `
        INSERT INTO outbox_dead_letters (id, outbox_event_id, reason, payload)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [randomUUID(), event.id, reason, JSON.stringify(event.payload)]
    );
    await client.query(
      `
        UPDATE outbox_events
        SET status = $2,
            processed_at = $3
        WHERE id = $1
      `,
      [event.id, OUTBOX_EVENT_STATUS.FAILED, nowIso]
    );
    await client.query("COMMIT");
  }

  private syncOutbound(
    action: AppointmentOperation,
    appointment: AppointmentRecord
  ): Promise<GoogleCalendarSyncResult> {
    if (action === APPOINTMENT_OPERATION.CANCEL || appointment.status === "canceled") {
      return this.gateway.cancelAppointmentEvent({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        externalCalendarEventId: appointment.externalCalendarEventId,
        startAtIso: appointment.startAtIso,
        endAtIso: appointment.endAtIso
      });
    }

    return this.gateway.upsertAppointmentEvent({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      externalCalendarEventId: appointment.externalCalendarEventId,
      startAtIso: appointment.startAtIso,
      endAtIso: appointment.endAtIso
    });
  }
}

export class NotificationOutboxWorker {
  constructor(
    private readonly pool: Pool,
    private readonly gateway: NotificationChannelGateway,
    private readonly config: NotificationProviderConfig
  ) {}

  async processPending(limit = 20): Promise<ProcessResult> {
    const events = await this.loadDueEvents(limit);
    let synced = 0;
    let failed = 0;
    let retried = 0;

    for (const event of events) {
      const outcome = await this.processEvent(event);
      if (outcome === OUTBOX_EVENT_STATUS.PROCESSED) {
        synced += 1;
      } else if (outcome === OUTBOX_EVENT_STATUS.FAILED) {
        failed += 1;
      } else {
        retried += 1;
      }
    }

    const result = {
      processed: events.length,
      synced,
      failed,
      retried
    };

    recordWorkerProcessResult(WORKER_PIPELINE.NOTIFICATIONS, result);
    return result;
  }

  private async loadDueEvents(limit: number): Promise<NotificationOutboxEvent[]> {
    const result = await this.pool.query<NotificationOutboxEventRow>(
      `
        WITH attempt_stats AS (
          SELECT
            outbox_event_id,
            MAX(attempt_number) AS attempts,
            MAX(created_at) AS last_attempt_at
          FROM job_attempts
          GROUP BY outbox_event_id
        )
        SELECT
          outbox.id,
          outbox.tenant_id,
          outbox.event_type,
          outbox.payload,
          COALESCE(attempts.attempts, 0) AS attempts,
          attempts.last_attempt_at
        FROM outbox_events AS outbox
        LEFT JOIN attempt_stats AS attempts ON attempts.outbox_event_id = outbox.id
        WHERE outbox.status = $1
          AND outbox.event_type = ANY($2::text[])
          AND (
            attempts.last_attempt_at IS NULL OR
            attempts.last_attempt_at + make_interval(secs => $3 * CAST(POWER(2, GREATEST(attempts.attempts - 1, 0)) AS INT)) <= NOW()
          )
        ORDER BY outbox.created_at ASC
        LIMIT $4
      `,
      [
        OUTBOX_EVENT_STATUS.PENDING,
        [
          NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED,
          NOTIFICATION_OUTBOX_EVENT_TYPE.EXAM_STATUS_REQUESTED
        ],
        this.config.backoffSeconds,
        limit
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      eventType: parseNotificationOutboxEventType(row.event_type),
      payload: parseNotificationPayload(row.event_type, row.payload),
      attempts: row.attempts
    }));
  }

  private async processEvent(
    event: NotificationOutboxEvent
  ): Promise<(typeof OUTBOX_EVENT_STATUS)[keyof typeof OUTBOX_EVENT_STATUS]> {
    const client = await this.pool.connect();
    const attemptNumber = event.attempts + 1;
    const nowIso = new Date().toISOString();
    let transactionOpen = false;

    try {
      const recipient = await this.loadRecipientProfile(
        client,
        event.tenantId,
        event.payload.patientId
      );

      const channels: NotificationChannel[] = [
        NOTIFICATION_CHANNEL.EMAIL,
        NOTIFICATION_CHANNEL.WHATSAPP
      ];
      for (const channel of channels) {
        const delivery = await this.ensureDelivery(client, event, channel);
        if (
          delivery.status === NOTIFICATION_DELIVERY_STATUS.SENT ||
          delivery.status === NOTIFICATION_DELIVERY_STATUS.SKIPPED
        ) {
          continue;
        }

        const eligibility = resolveChannelEligibility(channel, event, recipient);
        if (!eligibility.shouldSend) {
          await this.markDeliverySkipped(client, delivery.id, eligibility.reason, nowIso);
          continue;
        }

        const message = buildNotificationMessage(event);

        try {
          const result =
            channel === NOTIFICATION_CHANNEL.EMAIL
              ? await this.gateway.sendEmail({
                  tenantId: event.tenantId,
                  patientId: event.payload.patientId,
                  subject: message.subject,
                  body: message.body,
                  toEmail: recipient.email!
                })
              : await this.gateway.sendWhatsApp({
                  tenantId: event.tenantId,
                  patientId: event.payload.patientId,
                  body: message.body,
                  toPhone: recipient.whatsappPhone!
                });

          await this.markDeliverySent(
            client,
            delivery.id,
            attemptNumber,
            result.providerMessageId,
            nowIso
          );
        } catch (error) {
          const errorMessage = normalizeErrorMessage(error);
          const retryable = error instanceof RetryableNotificationError;
          const shouldRetry = retryable && attemptNumber < this.config.maxRetries;
          const nextRetryAtIso = shouldRetry
            ? new Date(
                Date.now() + this.config.backoffSeconds * 1000 * 2 ** Math.max(attemptNumber - 1, 0)
              ).toISOString()
            : null;

          await this.recordDeliveryAttempt(
            client,
            delivery.id,
            event.id,
            attemptNumber,
            errorMessage,
            nowIso
          );
          await this.markDeliveryFailure(
            client,
            delivery.id,
            attemptNumber,
            errorMessage,
            nextRetryAtIso,
            nowIso,
            shouldRetry
          );
          await client.query(
            `
              INSERT INTO job_attempts (id, outbox_event_id, attempt_number, error_message)
              VALUES ($1, $2, $3, $4)
            `,
            [randomUUID(), event.id, attemptNumber, errorMessage]
          );

          if (!shouldRetry) {
            await client.query("BEGIN");
            transactionOpen = true;
            await client.query(
              `
                INSERT INTO outbox_dead_letters (id, outbox_event_id, reason, payload)
                VALUES ($1, $2, $3, $4::jsonb)
              `,
              [randomUUID(), event.id, errorMessage, JSON.stringify(event.payload)]
            );
            await client.query(
              `
                UPDATE outbox_events
                SET status = $2,
                    processed_at = $3
                WHERE id = $1
              `,
              [event.id, OUTBOX_EVENT_STATUS.FAILED, nowIso]
            );
            await client.query("COMMIT");
            transactionOpen = false;
            return OUTBOX_EVENT_STATUS.FAILED;
          }
          return OUTBOX_EVENT_STATUS.PENDING;
        }
      }

      await client.query(
        `
          UPDATE outbox_events
          SET status = $2,
              processed_at = $3
          WHERE id = $1
        `,
        [event.id, OUTBOX_EVENT_STATUS.PROCESSED, nowIso]
      );
      return OUTBOX_EVENT_STATUS.PROCESSED;
    } catch (error) {
      if (transactionOpen) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadRecipientProfile(
    client: PoolClient,
    tenantId: string,
    patientId: string
  ): Promise<NotificationRecipientProfile> {
    const result = await client.query<NotificationRecipientRow>(
      `
        SELECT tenant_id, patient_id, email, whatsapp_phone,
               email_consent, whatsapp_consent,
               appointment_notifications_enabled,
               exam_ready_notifications_enabled,
               exam_delivered_notifications_enabled
        FROM notification_recipients
        WHERE tenant_id = $1
          AND patient_id = $2
      `,
      [tenantId, patientId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        tenantId,
        patientId,
        email: null,
        whatsappPhone: null,
        emailConsent: false,
        whatsappConsent: false,
        appointmentNotificationsEnabled: false,
        examReadyNotificationsEnabled: false,
        examDeliveredNotificationsEnabled: false
      };
    }

    return {
      tenantId: row.tenant_id,
      patientId: row.patient_id,
      email: row.email,
      whatsappPhone: row.whatsapp_phone,
      emailConsent: row.email_consent,
      whatsappConsent: row.whatsapp_consent,
      appointmentNotificationsEnabled: row.appointment_notifications_enabled,
      examReadyNotificationsEnabled: row.exam_ready_notifications_enabled,
      examDeliveredNotificationsEnabled: row.exam_delivered_notifications_enabled
    };
  }

  private async ensureDelivery(
    client: PoolClient,
    event: NotificationOutboxEvent,
    channel: NotificationChannel
  ): Promise<NotificationDeliveryRow> {
    const result = await client.query<NotificationDeliveryRow>(
      `
        INSERT INTO notification_deliveries (
          id,
          outbox_event_id,
          tenant_id,
          patient_id,
          channel,
          status,
          attempts,
          max_attempts,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8::jsonb)
        ON CONFLICT (outbox_event_id, channel)
        DO UPDATE SET updated_at = NOW()
        RETURNING id, outbox_event_id, tenant_id, patient_id, channel, status, attempts, max_attempts
      `,
      [
        randomUUID(),
        event.id,
        event.tenantId,
        event.payload.patientId,
        channel,
        NOTIFICATION_DELIVERY_STATUS.PENDING,
        this.config.maxRetries,
        JSON.stringify(event.payload)
      ]
    );

    return result.rows[0]!;
  }

  private async markDeliverySkipped(
    client: PoolClient,
    deliveryId: string,
    reason: string,
    nowIso: string
  ): Promise<void> {
    await client.query(
      `
        UPDATE notification_deliveries
        SET status = $2,
            attempts = attempts + 1,
            last_error = $3,
            last_attempt_at = $4,
            next_retry_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [deliveryId, NOTIFICATION_DELIVERY_STATUS.SKIPPED, reason, nowIso]
    );
  }

  private async markDeliverySent(
    client: PoolClient,
    deliveryId: string,
    attemptNumber: number,
    providerMessageId: string,
    nowIso: string
  ): Promise<void> {
    await client.query(
      `
        UPDATE notification_deliveries
        SET status = $2,
            attempts = $3,
            provider_message_id = $4,
            last_error = NULL,
            last_attempt_at = $5,
            next_retry_at = NULL,
            delivered_at = $5,
            updated_at = NOW()
        WHERE id = $1
      `,
      [deliveryId, NOTIFICATION_DELIVERY_STATUS.SENT, attemptNumber, providerMessageId, nowIso]
    );
  }

  private async recordDeliveryAttempt(
    client: PoolClient,
    deliveryId: string,
    outboxEventId: string,
    attemptNumber: number,
    errorMessage: string,
    nowIso: string
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO notification_delivery_attempts (id, delivery_id, outbox_event_id, attempt_number, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), deliveryId, outboxEventId, attemptNumber, errorMessage, nowIso]
    );
  }

  private async markDeliveryFailure(
    client: PoolClient,
    deliveryId: string,
    attempts: number,
    errorMessage: string,
    nextRetryAtIso: string | null,
    nowIso: string,
    shouldRetry: boolean
  ): Promise<void> {
    await client.query(
      `
        UPDATE notification_deliveries
        SET status = $2,
            attempts = $3,
            last_error = $4,
            last_attempt_at = $5,
            next_retry_at = $6,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        deliveryId,
        shouldRetry ? NOTIFICATION_DELIVERY_STATUS.PENDING : NOTIFICATION_DELIVERY_STATUS.FAILED,
        attempts,
        errorMessage,
        nowIso,
        nextRetryAtIso
      ]
    );
  }
}

interface OutboxEventRow {
  id: string;
  tenant_id: string;
  payload: unknown;
  attempts: number;
}

interface AppointmentRow {
  id: string;
  tenant_id: string;
  status: string;
  start_at: Date;
  end_at: Date;
  external_calendar_event_id: string | null;
}

interface NotificationOutboxEventRow {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

interface NotificationRecipientRow {
  tenant_id: string;
  patient_id: string;
  email: string | null;
  whatsapp_phone: string | null;
  email_consent: boolean;
  whatsapp_consent: boolean;
  appointment_notifications_enabled: boolean;
  exam_ready_notifications_enabled: boolean;
  exam_delivered_notifications_enabled: boolean;
}

interface NotificationDeliveryRow {
  id: string;
  outbox_event_id: string;
  tenant_id: string;
  patient_id: string;
  channel: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

function parsePayload(payload: unknown): AppointmentSyncOutboxPayload {
  const schema = z.object({
    tenantId: z.string().min(1),
    appointmentId: z.string().min(1),
    action: z.enum([
      APPOINTMENT_OPERATION.CREATE,
      APPOINTMENT_OPERATION.RESCHEDULE,
      APPOINTMENT_OPERATION.CANCEL
    ]),
    triggeredAtIso: z.string().min(1)
  });
  return schema.parse(payload);
}

function parseNotificationOutboxEventType(value: string): NotificationOutboxEventType {
  const schema = z.enum([
    NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED,
    NOTIFICATION_OUTBOX_EVENT_TYPE.EXAM_STATUS_REQUESTED
  ]);
  return schema.parse(value);
}

function parseNotificationPayload(eventType: string, payload: unknown): NotificationOutboxPayload {
  if (eventType === NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED) {
    return z
      .object({
        tenantId: z.string().min(1),
        patientId: z.string().min(1),
        appointmentId: z.string().min(1),
        action: z.enum([
          APPOINTMENT_OPERATION.CREATE,
          APPOINTMENT_OPERATION.RESCHEDULE,
          APPOINTMENT_OPERATION.CANCEL
        ]),
        triggeredAtIso: z.string().min(1)
      })
      .parse(payload);
  }

  return z
    .object({
      tenantId: z.string().min(1),
      patientId: z.string().min(1),
      examId: z.string().min(1),
      toStatus: z.enum(["ready", "delivered"]),
      triggeredAtIso: z.string().min(1)
    })
    .parse(payload);
}

function resolveChannelEligibility(
  channel: NotificationChannel,
  event: NotificationOutboxEvent,
  recipient: NotificationRecipientProfile
): { shouldSend: boolean; reason: string } {
  if (event.eventType === NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED) {
    if (!recipient.appointmentNotificationsEnabled) {
      return { shouldSend: false, reason: "Appointment notifications disabled" };
    }
  }

  if (event.eventType === NOTIFICATION_OUTBOX_EVENT_TYPE.EXAM_STATUS_REQUESTED) {
    const examPayload = event.payload as ExamStatusNotificationOutboxPayload;
    if (examPayload.toStatus === "ready" && !recipient.examReadyNotificationsEnabled) {
      return { shouldSend: false, reason: "Exam ready notification is not visible for patient" };
    }

    if (examPayload.toStatus === "delivered" && !recipient.examDeliveredNotificationsEnabled) {
      return { shouldSend: false, reason: "Exam delivered notifications disabled" };
    }
  }

  if (channel === NOTIFICATION_CHANNEL.EMAIL) {
    if (!recipient.emailConsent) {
      return { shouldSend: false, reason: "Email consent not granted" };
    }

    if (!recipient.email) {
      return { shouldSend: false, reason: "Email destination missing" };
    }

    return { shouldSend: true, reason: "ok" };
  }

  if (!recipient.whatsappConsent) {
    return { shouldSend: false, reason: "WhatsApp consent not granted" };
  }

  if (!recipient.whatsappPhone) {
    return { shouldSend: false, reason: "WhatsApp destination missing" };
  }

  return { shouldSend: true, reason: "ok" };
}

function buildNotificationMessage(event: NotificationOutboxEvent): {
  subject: string;
  body: string;
} {
  if (event.eventType === NOTIFICATION_OUTBOX_EVENT_TYPE.APPOINTMENT_LIFECYCLE_REQUESTED) {
    const payload = event.payload as AppointmentNotificationOutboxPayload;
    const actionLabel =
      payload.action === "create"
        ? "created"
        : payload.action === "reschedule"
          ? "rescheduled"
          : "canceled";
    return {
      subject: "Appointment update",
      body: `Your appointment (${payload.appointmentId}) was ${actionLabel}.`
    };
  }

  const payload = event.payload as ExamStatusNotificationOutboxPayload;
  const label = payload.toStatus === "ready" ? "ready" : "delivered";
  return {
    subject: "Exam status update",
    body: `Your exam (${payload.examId}) is now ${label}.`
  };
}

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown outbound calendar synchronization error";
}
