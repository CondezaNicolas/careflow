import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import {
  NOTIFICATION_OUTBOX_EVENT_TYPE,
  type ExamStatusNotificationOutboxPayload
} from "../notifications/notifications.types.js";
import { EXAM_STATUS, type ExamAttachmentMetadata, type ExamListVisibilityScope, type ExamRecord, type ExamStatus } from "./exams.types.js";

type QueryExecutor = DatabaseService | DatabaseTransaction;

@Injectable()
export class ExamsRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  inSerializedTransaction<T>(action: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.databaseService.transaction(action, { isolationLevel: "SERIALIZABLE" });
  }

  async saveExam(exam: ExamRecord, transaction?: DatabaseTransaction): Promise<ExamRecord> {
    const result = await this.getExecutor(transaction).query<ExamRecordRow>(
      `
        INSERT INTO clinical_exams (
          id,
          tenant_id,
          patient_id,
          requested_by_professional_id,
          exam_type,
          status,
          notes,
          ready_at,
          delivered_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id)
        DO UPDATE
        SET exam_type = EXCLUDED.exam_type,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            ready_at = EXCLUDED.ready_at,
            delivered_at = EXCLUDED.delivered_at,
            updated_at = EXCLUDED.updated_at
        RETURNING id, tenant_id, patient_id, requested_by_professional_id, exam_type, status, notes,
                  ready_at, delivered_at, created_at, updated_at
      `,
      [
        exam.id,
        exam.tenantId,
        exam.patientId,
        exam.requestedByProfessionalId,
        exam.examType,
        exam.status,
        exam.notes,
        exam.readyAtIso,
        exam.deliveredAtIso,
        exam.createdAtIso,
        exam.updatedAtIso
      ]
    );

    await this.replaceExamAttachments(exam.id, exam.tenantId, exam.attachments, transaction);
    return {
      ...mapExamRow(result.rows[0]!),
      attachments: exam.attachments
    };
  }

  async findExamWithinTenant(tenantId: string, examId: string, transaction?: DatabaseTransaction): Promise<ExamRecord | null> {
    const result = await this.getExecutor(transaction).query<ExamRecordRow>(
      `
        SELECT id, tenant_id, patient_id, requested_by_professional_id, exam_type, status, notes,
               ready_at, delivered_at, created_at, updated_at
        FROM clinical_exams
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, examId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const attachments = await this.listExamAttachments(tenantId, row.id, transaction);
    return {
      ...mapExamRow(row),
      attachments
    };
  }

  async listPatientExams(
    tenantId: string,
    patientId: string,
    visibilityScope: ExamListVisibilityScope,
    transaction?: DatabaseTransaction
  ): Promise<ExamRecord[]> {
    const shouldRestrictVisibility = visibilityScope !== "all";
    const result = await this.getExecutor(transaction).query<ExamRecordRow>(
      `
        SELECT id, tenant_id, patient_id, requested_by_professional_id, exam_type, status, notes,
               ready_at, delivered_at, created_at, updated_at
        FROM clinical_exams
        WHERE tenant_id = $1
          AND patient_id = $2
          AND ($3::boolean = false OR status = $4)
        ORDER BY created_at DESC
      `,
      [tenantId, patientId, shouldRestrictVisibility, EXAM_STATUS.DELIVERED]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const examIds = result.rows.map((row) => row.id);
    const attachmentsByExamId = await this.listAttachmentsByExamIds(tenantId, examIds, transaction);

    return result.rows.map((row) => ({
      ...mapExamRow(row),
      attachments: attachmentsByExamId.get(row.id) ?? []
    }));
  }

  async enqueueExamStatusNotificationOutboxEvent(
    payload: ExamStatusNotificationOutboxPayload,
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
        payload.examId,
        NOTIFICATION_OUTBOX_EVENT_TYPE.EXAM_STATUS_REQUESTED,
        JSON.stringify(payload),
        "pending"
      ]
    );
  }

  private async replaceExamAttachments(
    examId: string,
    tenantId: string,
    attachments: ExamAttachmentMetadata[],
    transaction?: DatabaseTransaction
  ): Promise<void> {
    const executor = this.getExecutor(transaction);
    await executor.query(
      `
        DELETE FROM clinical_exam_attachments
        WHERE tenant_id = $1
          AND exam_id = $2
      `,
      [tenantId, examId]
    );

    for (const attachment of attachments) {
      await executor.query(
        `
          INSERT INTO clinical_exam_attachments (exam_id, tenant_id, attachment_id, file_name, mime_type, size_bytes)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [examId, tenantId, attachment.attachmentId, attachment.fileName, attachment.mimeType, attachment.sizeBytes]
      );
    }
  }

  private async listExamAttachments(
    tenantId: string,
    examId: string,
    transaction?: DatabaseTransaction
  ): Promise<ExamAttachmentMetadata[]> {
    const result = await this.getExecutor(transaction).query<ExamAttachmentRow>(
      `
        SELECT attachment_id, file_name, mime_type, size_bytes
        FROM clinical_exam_attachments
        WHERE tenant_id = $1
          AND exam_id = $2
        ORDER BY attachment_id ASC
      `,
      [tenantId, examId]
    );

    return result.rows.map((row) => mapAttachmentRow(row));
  }

  private async listAttachmentsByExamIds(
    tenantId: string,
    examIds: string[],
    transaction?: DatabaseTransaction
  ): Promise<Map<string, ExamAttachmentMetadata[]>> {
    const map = new Map<string, ExamAttachmentMetadata[]>();
    if (examIds.length === 0) {
      return map;
    }

    const result = await this.getExecutor(transaction).query<ExamAttachmentWithExamRow>(
      `
        SELECT exam_id, attachment_id, file_name, mime_type, size_bytes
        FROM clinical_exam_attachments
        WHERE tenant_id = $1
          AND exam_id = ANY($2::uuid[])
        ORDER BY exam_id ASC, attachment_id ASC
      `,
      [tenantId, examIds]
    );

    for (const row of result.rows) {
      const current = map.get(row.exam_id) ?? [];
      current.push(mapAttachmentRow(row));
      map.set(row.exam_id, current);
    }

    return map;
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return transaction ?? this.databaseService;
  }
}

interface ExamRecordRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  requested_by_professional_id: string;
  exam_type: string;
  status: ExamStatus;
  notes: string | null;
  ready_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ExamAttachmentRow {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string;
}

interface ExamAttachmentWithExamRow extends ExamAttachmentRow {
  exam_id: string;
}

function mapExamRow(row: ExamRecordRow): ExamRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    requestedByProfessionalId: row.requested_by_professional_id,
    examType: row.exam_type,
    status: row.status,
    notes: row.notes,
    readyAtIso: row.ready_at ? row.ready_at.toISOString() : null,
    deliveredAtIso: row.delivered_at ? row.delivered_at.toISOString() : null,
    attachments: [],
    createdAtIso: row.created_at.toISOString(),
    updatedAtIso: row.updated_at.toISOString()
  };
}

function mapAttachmentRow(row: ExamAttachmentRow): ExamAttachmentMetadata {
  return {
    attachmentId: row.attachment_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes)
  };
}
