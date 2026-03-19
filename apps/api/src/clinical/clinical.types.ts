export const CLINICAL_NOTE_VISIBILITY = {
  INTERNAL: "internal",
  PATIENT_SHARED: "patient_shared"
} as const;

export type ClinicalNoteVisibility = (typeof CLINICAL_NOTE_VISIBILITY)[keyof typeof CLINICAL_NOTE_VISIBILITY];

export interface ClinicalVitals {
  systolicBpMmHg: number | null;
  diastolicBpMmHg: number | null;
  heartRateBpm: number | null;
  respiratoryRateBpm: number | null;
  oxygenSaturationPct: number | null;
  temperatureC: number | null;
  weightKg: number | null;
  heightCm: number | null;
}

export interface ClinicalMedication {
  name: string;
  dose: string;
  frequency: string;
  route: string;
  instructions: string;
}

export interface ClinicalAntecedent {
  category: string;
  description: string;
}

export interface ClinicalAttachmentMetadata {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ClinicalEncounter {
  id: string;
  tenantId: string;
  patientId: string;
  authorProfessionalId: string;
  startedAtIso: string;
  endedAtIso: string | null;
  reason: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ClinicalNote {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  authorProfessionalId: string;
  visibility: ClinicalNoteVisibility;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  medications: ClinicalMedication[];
  antecedentes: ClinicalAntecedent[];
  attachments: ClinicalAttachmentMetadata[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ClinicalTimelineEntry {
  encounter: ClinicalEncounter;
  note: ClinicalNote;
}

export const CLINICAL_TIMELINE_VISIBILITY_SCOPE = {
  ALL: "all",
  INTERNAL: "internal",
  PATIENT_SHARED: "patient_shared"
} as const;

export type ClinicalTimelineVisibilityScope =
  (typeof CLINICAL_TIMELINE_VISIBILITY_SCOPE)[keyof typeof CLINICAL_TIMELINE_VISIBILITY_SCOPE];

export interface ClinicalTimelineFilter {
  visibilityScope: ClinicalTimelineVisibilityScope;
}
