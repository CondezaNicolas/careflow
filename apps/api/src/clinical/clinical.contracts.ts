import type {
  ClinicalAntecedent,
  ClinicalAttachmentMetadata,
  ClinicalEncounter,
  ClinicalMedication,
  ClinicalNote,
  ClinicalNoteVisibility,
  ClinicalTimelineEntry,
  ClinicalTimelineVisibilityScope,
  ClinicalVitals
} from "./clinical.types.js";

export interface CreateClinicalEncounterRequest {
  patientId: string;
  startedAtIso: string;
  endedAtIso: string | null;
  reason: string | null;
}

export interface UpdateClinicalEncounterRequest {
  startedAtIso: string;
  endedAtIso: string | null;
  reason: string | null;
}

export interface CreateClinicalNoteRequest {
  patientId: string;
  visibility: ClinicalNoteVisibility;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  medications: ClinicalMedication[];
  antecedentes: ClinicalAntecedent[];
  attachments: ClinicalAttachmentMetadata[];
}

export interface UpdateClinicalNoteRequest {
  visibility: ClinicalNoteVisibility;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  medications: ClinicalMedication[];
  antecedentes: ClinicalAntecedent[];
  attachments: ClinicalAttachmentMetadata[];
}

export interface ClinicalTimelineQuery {
  visibilityScope: ClinicalTimelineVisibilityScope;
}

export interface ClinicalTimelineResponse {
  patientId: string;
  visibilityScope: ClinicalTimelineVisibilityScope;
  entries: ClinicalTimelineEntry[];
}

export interface ClinicalEncounterResponse {
  encounter: ClinicalEncounter;
}

export interface ClinicalNoteResponse {
  note: ClinicalNote;
}
