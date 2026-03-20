import { Inject, Injectable } from "@nestjs/common";

import {
  inSerializableTransaction,
  resolveQueryExecutor,
  type QueryExecutor
} from "../common/db/repository.utils.js";
import { tenantIdFromScope, type TenantScopeInput } from "../common/tenant/tenant-scope.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import type {
  ClinicalAttachmentMetadata,
  ClinicalEncounter,
  ClinicalNote,
  ClinicalNoteVisibility,
  ClinicalTimelineEntry,
  ClinicalTimelineVisibilityScope,
  ClinicalVitals
} from "./clinical.types.js";

@Injectable()
export class ClinicalRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  inSerializedTransaction<T>(action: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return inSerializableTransaction(this.databaseService, action);
  }

  async saveEncounter(
    encounter: ClinicalEncounter,
    transaction?: DatabaseTransaction
  ): Promise<ClinicalEncounter> {
    const result = await this.getExecutor(transaction).query<ClinicalEncounterRow>(
      `
        INSERT INTO clinical_encounters (
          id,
          tenant_id,
          patient_id,
          author_professional_id,
          started_at,
          ended_at,
          reason,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id)
        DO UPDATE
        SET started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at,
            reason = EXCLUDED.reason,
            updated_at = EXCLUDED.updated_at
        RETURNING id, tenant_id, patient_id, author_professional_id, started_at, ended_at, reason, created_at, updated_at
      `,
      [
        encounter.id,
        encounter.tenantId,
        encounter.patientId,
        encounter.authorProfessionalId,
        encounter.startedAtIso,
        encounter.endedAtIso,
        encounter.reason,
        encounter.createdAtIso,
        encounter.updatedAtIso
      ]
    );

    return mapEncounterRow(result.rows[0]!);
  }

  async findEncounterWithinTenant(
    scope: TenantScopeInput,
    encounterId: string,
    transaction?: DatabaseTransaction
  ): Promise<ClinicalEncounter | null> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<ClinicalEncounterRow>(
      `
        SELECT id, tenant_id, patient_id, author_professional_id, started_at, ended_at, reason, created_at, updated_at
        FROM clinical_encounters
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, encounterId]
    );

    const row = result.rows[0];
    return row ? mapEncounterRow(row) : null;
  }

  async saveNote(note: ClinicalNote, transaction?: DatabaseTransaction): Promise<ClinicalNote> {
    const result = await this.getExecutor(transaction).query<ClinicalNoteRow>(
      `
        INSERT INTO clinical_notes (
          id,
          tenant_id,
          encounter_id,
          patient_id,
          author_professional_id,
          visibility,
          subjective,
          objective,
          assessment,
          plan,
          vitals_json,
          medications_json,
          antecedentes_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
        ON CONFLICT (id)
        DO UPDATE
        SET visibility = EXCLUDED.visibility,
            subjective = EXCLUDED.subjective,
            objective = EXCLUDED.objective,
            assessment = EXCLUDED.assessment,
            plan = EXCLUDED.plan,
            vitals_json = EXCLUDED.vitals_json,
            medications_json = EXCLUDED.medications_json,
            antecedentes_json = EXCLUDED.antecedentes_json,
            updated_at = EXCLUDED.updated_at
        RETURNING id, tenant_id, encounter_id, patient_id, author_professional_id, visibility, subjective, objective,
                  assessment, plan, vitals_json, medications_json, antecedentes_json, created_at, updated_at
      `,
      [
        note.id,
        note.tenantId,
        note.encounterId,
        note.patientId,
        note.authorProfessionalId,
        note.visibility,
        note.subjective,
        note.objective,
        note.assessment,
        note.plan,
        JSON.stringify(note.vitals),
        JSON.stringify(note.medications),
        JSON.stringify(note.antecedentes),
        note.createdAtIso,
        note.updatedAtIso
      ]
    );

    await this.replaceNoteAttachments(note.id, note.tenantId, note.attachments, transaction);
    return {
      ...mapNoteRow(result.rows[0]!),
      attachments: note.attachments
    };
  }

  async findNoteWithinTenant(
    scope: TenantScopeInput,
    noteId: string,
    transaction?: DatabaseTransaction
  ): Promise<ClinicalNote | null> {
    const tenantId = tenantIdFromScope(scope);
    const result = await this.getExecutor(transaction).query<ClinicalNoteRow>(
      `
        SELECT id, tenant_id, encounter_id, patient_id, author_professional_id, visibility, subjective, objective,
               assessment, plan, vitals_json, medications_json, antecedentes_json, created_at, updated_at
        FROM clinical_notes
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, noteId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const attachments = await this.listNoteAttachments(tenantId, row.id, transaction);
    return {
      ...mapNoteRow(row),
      attachments
    };
  }

  async listPatientTimeline(
    scope: TenantScopeInput,
    patientId: string,
    visibilityScope: ClinicalTimelineVisibilityScope,
    limit: number,
    offset: number,
    transaction?: DatabaseTransaction
  ): Promise<{ entries: ClinicalTimelineEntry[]; total: number }> {
    const tenantId = tenantIdFromScope(scope);
    const shouldRestrictVisibility = visibilityScope !== "all";

    // Get total count first
    const countResult = await this.getExecutor(transaction).query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM clinical_notes n
        INNER JOIN clinical_encounters e
          ON e.id = n.encounter_id
         AND e.tenant_id = n.tenant_id
        WHERE n.tenant_id = $1
          AND n.patient_id = $2
          AND ($3::boolean = false OR n.visibility = $4)
      `,
      [tenantId, patientId, shouldRestrictVisibility, visibilityScope]
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const result = await this.getExecutor(transaction).query<TimelineRow>(
      `
        SELECT
          e.id AS encounter_id,
          e.tenant_id AS encounter_tenant_id,
          e.patient_id AS encounter_patient_id,
          e.author_professional_id AS encounter_author_professional_id,
          e.started_at AS encounter_started_at,
          e.ended_at AS encounter_ended_at,
          e.reason AS encounter_reason,
          e.created_at AS encounter_created_at,
          e.updated_at AS encounter_updated_at,
          n.id AS note_id,
          n.tenant_id AS note_tenant_id,
          n.encounter_id AS note_encounter_id,
          n.patient_id AS note_patient_id,
          n.author_professional_id AS note_author_professional_id,
          n.visibility AS note_visibility,
          n.subjective AS note_subjective,
          n.objective AS note_objective,
          n.assessment AS note_assessment,
          n.plan AS note_plan,
          n.vitals_json AS note_vitals_json,
          n.medications_json AS note_medications_json,
          n.antecedentes_json AS note_antecedentes_json,
          n.created_at AS note_created_at,
          n.updated_at AS note_updated_at
        FROM clinical_notes n
        INNER JOIN clinical_encounters e
          ON e.id = n.encounter_id
         AND e.tenant_id = n.tenant_id
        WHERE n.tenant_id = $1
          AND n.patient_id = $2
          AND ($3::boolean = false OR n.visibility = $4)
        ORDER BY e.started_at DESC, n.created_at DESC
        LIMIT $5 OFFSET $6
      `,
      [tenantId, patientId, shouldRestrictVisibility, visibilityScope, limit, offset]
    );

    if (result.rows.length === 0) {
      return { entries: [], total };
    }

    const noteIds = result.rows.map((row) => row.note_id);
    const attachmentsByNoteId = await this.listAttachmentsByNoteIds(tenantId, noteIds, transaction);

    const entries = result.rows.map((row) => ({
      encounter: {
        id: row.encounter_id,
        tenantId: row.encounter_tenant_id,
        patientId: row.encounter_patient_id,
        authorProfessionalId: row.encounter_author_professional_id,
        startedAtIso: row.encounter_started_at.toISOString(),
        endedAtIso: row.encounter_ended_at ? row.encounter_ended_at.toISOString() : null,
        reason: row.encounter_reason,
        createdAtIso: row.encounter_created_at.toISOString(),
        updatedAtIso: row.encounter_updated_at.toISOString()
      },
      note: {
        id: row.note_id,
        tenantId: row.note_tenant_id,
        encounterId: row.note_encounter_id,
        patientId: row.note_patient_id,
        authorProfessionalId: row.note_author_professional_id,
        visibility: row.note_visibility,
        subjective: row.note_subjective,
        objective: row.note_objective,
        assessment: row.note_assessment,
        plan: row.note_plan,
        vitals: row.note_vitals_json,
        medications: row.note_medications_json,
        antecedentes: row.note_antecedentes_json,
        createdAtIso: row.note_created_at.toISOString(),
        updatedAtIso: row.note_updated_at.toISOString(),
        attachments: attachmentsByNoteId.get(row.note_id) ?? []
      }
    }));

    return { entries, total };
  }

  private async replaceNoteAttachments(
    noteId: string,
    tenantId: string,
    attachments: ClinicalAttachmentMetadata[],
    transaction?: DatabaseTransaction
  ): Promise<void> {
    const executor = this.getExecutor(transaction);
    await executor.query(
      `
        DELETE FROM clinical_note_attachments
        WHERE tenant_id = $1
          AND note_id = $2
      `,
      [tenantId, noteId]
    );

    if (attachments.length === 0) {
      return;
    }

    // Batch insert using UNNEST for single DB round-trip
    const noteIds = attachments.map(() => noteId);
    const tenantIds = attachments.map(() => tenantId);
    const attachmentIds = attachments.map((a) => a.attachmentId);
    const fileNames = attachments.map((a) => a.fileName);
    const mimeTypes = attachments.map((a) => a.mimeType);
    const sizeBytes = attachments.map((a) => a.sizeBytes);

    await executor.query(
      `
        INSERT INTO clinical_note_attachments (note_id, tenant_id, attachment_id, file_name, mime_type, size_bytes)
        SELECT * FROM UNNEST(
          $1::uuid[],
          $2::uuid[],
          $3::uuid[],
          $4::text[],
          $5::text[],
          $6::bigint[]
        )
      `,
      [noteIds, tenantIds, attachmentIds, fileNames, mimeTypes, sizeBytes]
    );
  }

  private async listNoteAttachments(
    tenantId: string,
    noteId: string,
    transaction?: DatabaseTransaction
  ): Promise<ClinicalAttachmentMetadata[]> {
    const result = await this.getExecutor(transaction).query<ClinicalAttachmentRow>(
      `
        SELECT attachment_id, file_name, mime_type, size_bytes
        FROM clinical_note_attachments
        WHERE tenant_id = $1
          AND note_id = $2
        ORDER BY attachment_id ASC
      `,
      [tenantId, noteId]
    );

    return result.rows.map((row) => ({
      attachmentId: row.attachment_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes)
    }));
  }

  private async listAttachmentsByNoteIds(
    tenantId: string,
    noteIds: string[],
    transaction?: DatabaseTransaction
  ): Promise<Map<string, ClinicalAttachmentMetadata[]>> {
    const map = new Map<string, ClinicalAttachmentMetadata[]>();
    if (noteIds.length === 0) {
      return map;
    }

    const result = await this.getExecutor(transaction).query<ClinicalAttachmentWithNoteRow>(
      `
        SELECT note_id, attachment_id, file_name, mime_type, size_bytes
        FROM clinical_note_attachments
        WHERE tenant_id = $1
          AND note_id = ANY($2::uuid[])
        ORDER BY note_id ASC, attachment_id ASC
      `,
      [tenantId, noteIds]
    );

    for (const row of result.rows) {
      const current = map.get(row.note_id) ?? [];
      current.push({
        attachmentId: row.attachment_id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes)
      });
      map.set(row.note_id, current);
    }

    return map;
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}

interface ClinicalEncounterRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  author_professional_id: string;
  started_at: Date;
  ended_at: Date | null;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ClinicalNoteRow {
  id: string;
  tenant_id: string;
  encounter_id: string;
  patient_id: string;
  author_professional_id: string;
  visibility: ClinicalNoteVisibility;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals_json: ClinicalVitals;
  medications_json: ClinicalNote["medications"];
  antecedentes_json: ClinicalNote["antecedentes"];
  created_at: Date;
  updated_at: Date;
}

interface ClinicalAttachmentRow {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string;
}

interface ClinicalAttachmentWithNoteRow extends ClinicalAttachmentRow {
  note_id: string;
}

interface TimelineRow {
  encounter_id: string;
  encounter_tenant_id: string;
  encounter_patient_id: string;
  encounter_author_professional_id: string;
  encounter_started_at: Date;
  encounter_ended_at: Date | null;
  encounter_reason: string | null;
  encounter_created_at: Date;
  encounter_updated_at: Date;
  note_id: string;
  note_tenant_id: string;
  note_encounter_id: string;
  note_patient_id: string;
  note_author_professional_id: string;
  note_visibility: ClinicalNoteVisibility;
  note_subjective: string;
  note_objective: string;
  note_assessment: string;
  note_plan: string;
  note_vitals_json: ClinicalVitals;
  note_medications_json: ClinicalNote["medications"];
  note_antecedentes_json: ClinicalNote["antecedentes"];
  note_created_at: Date;
  note_updated_at: Date;
}

function mapEncounterRow(row: ClinicalEncounterRow): ClinicalEncounter {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    authorProfessionalId: row.author_professional_id,
    startedAtIso: row.started_at.toISOString(),
    endedAtIso: row.ended_at ? row.ended_at.toISOString() : null,
    reason: row.reason,
    createdAtIso: row.created_at.toISOString(),
    updatedAtIso: row.updated_at.toISOString()
  };
}

function mapNoteRow(row: ClinicalNoteRow): ClinicalNote {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    authorProfessionalId: row.author_professional_id,
    visibility: row.visibility,
    subjective: row.subjective,
    objective: row.objective,
    assessment: row.assessment,
    plan: row.plan,
    vitals: row.vitals_json,
    medications: row.medications_json,
    antecedentes: row.antecedentes_json,
    attachments: [],
    createdAtIso: row.created_at.toISOString(),
    updatedAtIso: row.updated_at.toISOString()
  };
}
