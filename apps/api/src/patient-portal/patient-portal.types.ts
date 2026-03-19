import type { ClinicalNote } from "../clinical/clinical.types.js";
import type { ExamRecord } from "../exams/exams.types.js";
import type { Appointment } from "../scheduling/scheduling.types.js";

export interface PatientPortalAppointments {
  upcoming: Appointment[];
  history: Appointment[];
}

export interface PatientPortalSharedNote {
  encounterId: string;
  note: ClinicalNote;
  encounterStartedAtIso: string;
}

export interface PatientPortalOverview {
  patientId: string;
  appointments: PatientPortalAppointments;
  releasedExams: ExamRecord[];
  sharedNotes: PatientPortalSharedNote[];
}
