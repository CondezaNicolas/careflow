import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { AuditRepository } from "../audit/audit.repository.js";
import { AUDIT_ACTION, resolveMutationMeta, type MutationMeta } from "../audit/audit.types.js";
import type {
  CreateExamRequest,
  ExamResponse,
  ExamsListResponse,
  ListPatientExamsQuery,
  TransitionExamStatusRequest,
  UpdateExamRequest
} from "./exams.contracts.js";
import { ExamsRepository } from "./exams.repository.js";
import { EXAM_LIST_VISIBILITY_SCOPE, EXAM_STATUS, type ExamListVisibilityScope, type ExamStatus } from "./exams.types.js";

@Injectable()
export class ExamsService {
  constructor(
    @Inject(ExamsRepository) private readonly examsRepository: ExamsRepository,
    @Inject(AuditRepository) private readonly auditRepository: AuditRepository
  ) {}

  async createExam(principal: AuthPrincipal, input: CreateExamRequest, meta?: MutationMeta): Promise<ExamResponse> {
    const normalized = normalizeCreateExamInput(input);
    const resolvedMeta = resolveMutationMeta(meta);

    return this.examsRepository.inSerializedTransaction(async (transaction) => {
      const nowIso = new Date().toISOString();
      const exam = await this.examsRepository.saveExam({
        id: randomUUID(),
        tenantId: principal.tenantId,
        patientId: normalized.patientId,
        requestedByProfessionalId: principal.id,
        examType: normalized.examType,
        status: EXAM_STATUS.PENDING,
        notes: normalized.notes,
        readyAtIso: null,
        deliveredAtIso: null,
        attachments: normalized.attachments,
        createdAtIso: nowIso,
        updatedAtIso: nowIso
      }, transaction);

      await this.auditRepository.saveDomainEvent(
        {
          id: randomUUID(),
          tenantId: principal.tenantId,
          actorId: principal.id,
          actorRole: principal.role,
          source: resolvedMeta.source,
          action: AUDIT_ACTION.EXAMS_CREATED,
          entityType: "exam",
          entityId: exam.id,
          requestId: resolvedMeta.requestId,
          traceId: resolvedMeta.traceId,
          metadata: {
            patientId: exam.patientId,
            status: exam.status
          }
        },
        transaction
      );

      return { exam };
    });
  }

  async updateExam(principal: AuthPrincipal, examId: string, input: UpdateExamRequest, meta?: MutationMeta): Promise<ExamResponse> {
    const normalized = normalizeUpdateExamInput(input);
    const resolvedMeta = resolveMutationMeta(meta);

    return this.examsRepository.inSerializedTransaction(async (transaction) => {
      const existing = await this.examsRepository.findExamWithinTenant(principal.tenantId, examId, transaction);
      if (!existing) {
        throw new NotFoundException("Exam not found");
      }

      const exam = await this.examsRepository.saveExam(
        {
          ...existing,
          examType: normalized.examType,
          notes: normalized.notes,
          attachments: normalized.attachments,
          updatedAtIso: new Date().toISOString()
        },
        transaction
      );

      await this.auditRepository.saveDomainEvent(
        {
          id: randomUUID(),
          tenantId: principal.tenantId,
          actorId: principal.id,
          actorRole: principal.role,
          source: resolvedMeta.source,
          action: AUDIT_ACTION.EXAMS_UPDATED,
          entityType: "exam",
          entityId: exam.id,
          requestId: resolvedMeta.requestId,
          traceId: resolvedMeta.traceId,
          metadata: {
            patientId: exam.patientId,
            status: exam.status
          }
        },
        transaction
      );

      return { exam };
    });
  }

  async transitionExamStatus(
    principal: AuthPrincipal,
    examId: string,
    input: TransitionExamStatusRequest,
    meta?: MutationMeta
  ): Promise<ExamResponse> {
    assertExamStatus(input.toStatus);
    const resolvedMeta = resolveMutationMeta(meta);

    return this.examsRepository.inSerializedTransaction(async (transaction) => {
      const existing = await this.examsRepository.findExamWithinTenant(principal.tenantId, examId, transaction);
      if (!existing) {
        throw new NotFoundException("Exam not found");
      }

      assertAllowedTransition(existing.status, input.toStatus);

      const nowIso = new Date().toISOString();
      const exam = await this.examsRepository.saveExam(
        {
          ...existing,
          status: input.toStatus,
          readyAtIso: input.toStatus === EXAM_STATUS.READY && existing.readyAtIso === null ? nowIso : existing.readyAtIso,
          deliveredAtIso:
            input.toStatus === EXAM_STATUS.DELIVERED && existing.deliveredAtIso === null ? nowIso : existing.deliveredAtIso,
          updatedAtIso: nowIso
        },
        transaction
      );

      if (existing.status !== exam.status && isNotifiableExamStatus(exam.status)) {
        await this.examsRepository.enqueueExamStatusNotificationOutboxEvent(
          {
            tenantId: principal.tenantId,
            patientId: exam.patientId,
            examId: exam.id,
            toStatus: exam.status,
            triggeredAtIso: nowIso
          },
          transaction
        );
      }

      if (existing.status !== exam.status) {
        await this.auditRepository.saveDomainEvent(
          {
            id: randomUUID(),
            tenantId: principal.tenantId,
            actorId: principal.id,
            actorRole: principal.role,
            source: resolvedMeta.source,
            action: AUDIT_ACTION.EXAMS_STATUS_TRANSITIONED,
            entityType: "exam",
            entityId: exam.id,
            requestId: resolvedMeta.requestId,
            traceId: resolvedMeta.traceId,
            metadata: {
              fromStatus: existing.status,
              toStatus: exam.status,
              patientId: exam.patientId
            }
          },
          transaction
        );
      }

      return { exam };
    });
  }

  async listPatientExams(principal: AuthPrincipal, patientId: string, query: ListPatientExamsQuery): Promise<ExamsListResponse> {
    const normalizedPatientId = patientId.trim();
    if (!normalizedPatientId) {
      throw new BadRequestException("patientId is required");
    }

    const visibilityScope = normalizeVisibilityScope(query.visibilityScope);
    const exams = await this.examsRepository.listPatientExams(principal.tenantId, normalizedPatientId, visibilityScope);
    return {
      patientId: normalizedPatientId,
      visibilityScope,
      exams
    };
  }

  async getExamStatus(principal: AuthPrincipal, examId: string): Promise<{ examId: string; status: ExamStatus; readyAtIso: string | null; deliveredAtIso: string | null }> {
    const normalizedExamId = examId.trim();
    if (!normalizedExamId) {
      throw new BadRequestException("examId is required");
    }

    const exam = await this.examsRepository.findExamWithinTenant(principal.tenantId, normalizedExamId);
    if (!exam) {
      throw new NotFoundException("Exam not found");
    }

    return {
      examId: exam.id,
      status: exam.status,
      readyAtIso: exam.readyAtIso,
      deliveredAtIso: exam.deliveredAtIso
    };
  }
}

function normalizeCreateExamInput(input: CreateExamRequest): CreateExamRequest {
  const patientId = input.patientId.trim();
  if (!patientId) {
    throw new BadRequestException("patientId is required");
  }

  return {
    ...normalizeUpdateExamInput(input),
    patientId
  };
}

function normalizeUpdateExamInput<T extends CreateExamRequest | UpdateExamRequest>(input: T): T {
  const examType = input.examType.trim();
  if (!examType) {
    throw new BadRequestException("examType is required");
  }

  return {
    ...input,
    examType,
    notes: normalizeNullableText(input.notes),
    attachments: normalizeAttachments(input.attachments)
  };
}

function normalizeAttachments(attachments: CreateExamRequest["attachments"]): CreateExamRequest["attachments"] {
  return attachments.map((attachment) => {
    if (!attachment.attachmentId) {
      throw new BadRequestException("attachments.attachmentId is required");
    }

    if (!attachment.fileName) {
      throw new BadRequestException("attachments.fileName is required");
    }

    if (!attachment.mimeType) {
      throw new BadRequestException("attachments.mimeType is required");
    }

    if (!Number.isInteger(attachment.sizeBytes) || attachment.sizeBytes < 0) {
      throw new BadRequestException("attachments.sizeBytes must be a non-negative integer");
    }

    return {
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes
    };
  });
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeVisibilityScope(value: string): ExamListVisibilityScope {
  if (value === EXAM_LIST_VISIBILITY_SCOPE.ALL || value === EXAM_LIST_VISIBILITY_SCOPE.PATIENT_VISIBLE) {
    return value;
  }

  return EXAM_LIST_VISIBILITY_SCOPE.ALL;
}

function assertExamStatus(value: string): asserts value is ExamStatus {
  if (value === EXAM_STATUS.PENDING || value === EXAM_STATUS.READY || value === EXAM_STATUS.DELIVERED) {
    return;
  }

  throw new BadRequestException("toStatus must be 'pending', 'ready', or 'delivered'");
}

function assertAllowedTransition(fromStatus: ExamStatus, toStatus: ExamStatus): void {
  if (fromStatus === toStatus) {
    return;
  }

  if (fromStatus === EXAM_STATUS.PENDING && toStatus === EXAM_STATUS.READY) {
    return;
  }

  if (fromStatus === EXAM_STATUS.READY && toStatus === EXAM_STATUS.DELIVERED) {
    return;
  }

  throw new ConflictException(`Exam transition '${fromStatus}' -> '${toStatus}' is not allowed`);
}

function isNotifiableExamStatus(value: ExamStatus): value is "ready" | "delivered" {
  return value === EXAM_STATUS.READY || value === EXAM_STATUS.DELIVERED;
}
