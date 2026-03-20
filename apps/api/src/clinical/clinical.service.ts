import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { USER_ROLE } from "../common/constants/user-role.js";
import { requireClinicalWritePermission } from "../common/rbac/permissions.js";
import type {
  ClinicalEncounterResponse,
  ClinicalNoteResponse,
  ClinicalTimelineQuery,
  ClinicalTimelineResponse,
  CreateClinicalEncounterRequest,
  CreateClinicalNoteRequest,
  UpdateClinicalEncounterRequest,
  UpdateClinicalNoteRequest
} from "./clinical.contracts.js";
import { ClinicalRepository } from "./clinical.repository.js";
import {
  CLINICAL_NOTE_VISIBILITY,
  CLINICAL_TIMELINE_VISIBILITY_SCOPE,
  type ClinicalTimelineVisibilityScope
} from "./clinical.types.js";

@Injectable()
export class ClinicalService {
  constructor(
    @Inject(ClinicalRepository) private readonly clinicalRepository: ClinicalRepository
  ) {}

  async createEncounter(
    principal: AuthPrincipal,
    input: CreateClinicalEncounterRequest
  ): Promise<ClinicalEncounterResponse> {
    requireClinicalWritePermission(principal.role);
    const normalized = normalizeCreateEncounterInput(input);
    const nowIso = new Date().toISOString();

    const encounter = await this.clinicalRepository.saveEncounter({
      id: randomUUID(),
      tenantId: principal.tenantId,
      patientId: normalized.patientId,
      authorProfessionalId: principal.id,
      startedAtIso: normalized.startedAtIso,
      endedAtIso: normalized.endedAtIso,
      reason: normalized.reason,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    });

    return { encounter };
  }

  async updateEncounter(
    principal: AuthPrincipal,
    encounterId: string,
    input: UpdateClinicalEncounterRequest
  ): Promise<ClinicalEncounterResponse> {
    requireClinicalWritePermission(principal.role);
    const normalized = normalizeUpdateEncounterInput(input);

    return this.clinicalRepository.inSerializedTransaction(async (transaction) => {
      const existing = await this.clinicalRepository.findEncounterWithinTenant(
        principal,
        encounterId,
        transaction
      );
      if (!existing) {
        throw new NotFoundException("Encounter not found");
      }

      const encounter = await this.clinicalRepository.saveEncounter(
        {
          ...existing,
          startedAtIso: normalized.startedAtIso,
          endedAtIso: normalized.endedAtIso,
          reason: normalized.reason,
          updatedAtIso: new Date().toISOString()
        },
        transaction
      );

      return { encounter };
    });
  }

  async createEncounterNote(
    principal: AuthPrincipal,
    encounterId: string,
    input: CreateClinicalNoteRequest
  ): Promise<ClinicalNoteResponse> {
    requireClinicalWritePermission(principal.role);
    const normalized = normalizeCreateNoteInput(input);

    return this.clinicalRepository.inSerializedTransaction(async (transaction) => {
      const encounter = await this.clinicalRepository.findEncounterWithinTenant(
        principal,
        encounterId,
        transaction
      );
      if (!encounter) {
        throw new NotFoundException("Encounter not found");
      }

      if (encounter.patientId !== normalized.patientId) {
        throw new BadRequestException("Note patientId must match encounter patientId");
      }

      const nowIso = new Date().toISOString();
      const note = await this.clinicalRepository.saveNote(
        {
          id: randomUUID(),
          tenantId: principal.tenantId,
          encounterId,
          patientId: normalized.patientId,
          authorProfessionalId: principal.id,
          visibility: normalized.visibility,
          subjective: normalized.subjective,
          objective: normalized.objective,
          assessment: normalized.assessment,
          plan: normalized.plan,
          vitals: normalized.vitals,
          medications: normalized.medications,
          antecedentes: normalized.antecedentes,
          attachments: normalized.attachments,
          createdAtIso: nowIso,
          updatedAtIso: nowIso
        },
        transaction
      );

      return { note };
    });
  }

  async updateNote(
    principal: AuthPrincipal,
    noteId: string,
    input: UpdateClinicalNoteRequest
  ): Promise<ClinicalNoteResponse> {
    requireClinicalWritePermission(principal.role);
    const normalized = normalizeUpdateNoteInput(input);

    return this.clinicalRepository.inSerializedTransaction(async (transaction) => {
      const existing = await this.clinicalRepository.findNoteWithinTenant(
        principal,
        noteId,
        transaction
      );
      if (!existing) {
        throw new NotFoundException("Clinical note not found");
      }

      if (
        principal.role === USER_ROLE.CLINICIAN &&
        existing.authorProfessionalId !== principal.id
      ) {
        throw new ForbiddenException("Clinicians can only edit their own clinical notes");
      }

      const note = await this.clinicalRepository.saveNote(
        {
          ...existing,
          visibility: normalized.visibility,
          subjective: normalized.subjective,
          objective: normalized.objective,
          assessment: normalized.assessment,
          plan: normalized.plan,
          vitals: normalized.vitals,
          medications: normalized.medications,
          antecedentes: normalized.antecedentes,
          attachments: normalized.attachments,
          updatedAtIso: new Date().toISOString()
        },
        transaction
      );

      return { note };
    });
  }

  async getPatientTimeline(
    principal: AuthPrincipal,
    patientId: string,
    query: ClinicalTimelineQuery
  ): Promise<ClinicalTimelineResponse> {
    const visibilityScope = resolveTimelineVisibilityScope(principal, query.visibilityScope);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const { entries, total } = await this.clinicalRepository.listPatientTimeline(
      principal,
      patientId,
      visibilityScope,
      limit,
      offset
    );
    return {
      patientId,
      visibilityScope,
      entries,
      total
    };
  }
}

function normalizeCreateEncounterInput(
  input: CreateClinicalEncounterRequest
): CreateClinicalEncounterRequest {
  const patientId = input.patientId.trim();
  if (!patientId) {
    throw new BadRequestException("patientId is required");
  }

  const normalized = normalizeUpdateEncounterInput(input);
  return {
    ...normalized,
    patientId
  };
}

function normalizeUpdateEncounterInput(
  input: UpdateClinicalEncounterRequest
): UpdateClinicalEncounterRequest {
  const startedAt = parseIso(input.startedAtIso, "startedAtIso");
  const endedAt = input.endedAtIso ? parseIso(input.endedAtIso, "endedAtIso") : null;
  if (endedAt && startedAt.getTime() > endedAt.getTime()) {
    throw new BadRequestException("startedAtIso must be before endedAtIso");
  }

  return {
    ...input,
    startedAtIso: startedAt.toISOString(),
    endedAtIso: endedAt ? endedAt.toISOString() : null,
    reason: normalizeNullableText(input.reason)
  };
}

function normalizeCreateNoteInput(input: CreateClinicalNoteRequest): CreateClinicalNoteRequest {
  const patientId = input.patientId.trim();
  if (!patientId) {
    throw new BadRequestException("patientId is required");
  }

  return {
    ...normalizeUpdateNoteInput(input),
    patientId
  };
}

function normalizeUpdateNoteInput<T extends CreateClinicalNoteRequest | UpdateClinicalNoteRequest>(
  input: T
): T {
  assertVisibility(input.visibility);
  assertVitals(input.vitals);

  return {
    ...input,
    subjective: normalizeText(input.subjective, "subjective"),
    objective: normalizeText(input.objective, "objective"),
    assessment: normalizeText(input.assessment, "assessment"),
    plan: normalizeText(input.plan, "plan"),
    medications: input.medications.map((medication) => ({
      name: normalizeText(medication.name, "medications.name"),
      dose: normalizeText(medication.dose, "medications.dose"),
      frequency: normalizeText(medication.frequency, "medications.frequency"),
      route: normalizeText(medication.route, "medications.route"),
      instructions: normalizeText(medication.instructions, "medications.instructions")
    })),
    antecedentes: input.antecedentes.map((antecedent) => ({
      category: normalizeText(antecedent.category, "antecedentes.category"),
      description: normalizeText(antecedent.description, "antecedentes.description")
    })),
    attachments: input.attachments.map((attachment) => {
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
    })
  };
}

function assertVisibility(value: string): asserts value is "internal" | "patient_shared" {
  if (
    value !== CLINICAL_NOTE_VISIBILITY.INTERNAL &&
    value !== CLINICAL_NOTE_VISIBILITY.PATIENT_SHARED
  ) {
    throw new BadRequestException("visibility must be 'internal' or 'patient_shared'");
  }
}

function assertVitals(vitals: CreateClinicalNoteRequest["vitals"]): void {
  for (const [key, value] of Object.entries(vitals)) {
    if (value === null) {
      continue;
    }

    if (!Number.isFinite(value)) {
      throw new BadRequestException(`vitals.${key} must be a finite number`);
    }
  }
}

function normalizeText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseIso(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO datetime`);
  }

  return parsed;
}

function resolveTimelineVisibilityScope(
  principal: AuthPrincipal,
  requestedScope: ClinicalTimelineVisibilityScope
): ClinicalTimelineVisibilityScope {
  if (principal.role === USER_ROLE.RECEPTIONIST) {
    return CLINICAL_TIMELINE_VISIBILITY_SCOPE.PATIENT_SHARED;
  }

  if (
    requestedScope === CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL ||
    requestedScope === CLINICAL_TIMELINE_VISIBILITY_SCOPE.INTERNAL ||
    requestedScope === CLINICAL_TIMELINE_VISIBILITY_SCOPE.PATIENT_SHARED
  ) {
    return requestedScope;
  }

  return CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL;
}
